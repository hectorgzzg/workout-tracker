import express from "express";
import { authenticate, requireRole } from "./auth/index.js";

const loadTypes = new Set(["external", "dumbbell", "bodyweight", "assisted"]);
const restCategories = new Set([
  "upper_compound",
  "lower_compound",
  "upper_isolation",
  "lower_isolation",
  "core",
]);
const muscleRoles = ["primary", "secondary", "tertiary"];

function optionalText(value, maxLength) {
  return (
    value === null ||
    (typeof value === "string" && value.trim().length <= maxLength)
  );
}

function validPositiveNumber(value) {
  return (
    value === null ||
    (typeof value === "number" && Number.isFinite(value) && value > 0)
  );
}

function normalizeEntry(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const equipment =
    typeof body.equipment === "string" ? body.equipment.trim() : "";
  const image = body.image;
  const imageValid =
    image === null ||
    (image &&
      typeof image === "object" &&
      !Array.isArray(image) &&
      optionalText(image.altText, 300) &&
      optionalText(image.credit, 200) &&
      optionalText(image.license, 200) &&
      (image.url === null ||
        (typeof image.url === "string" &&
          image.url.length <= 2048 &&
          (() => {
            try {
              return new URL(image.url).protocol === "https:";
            } catch {
              return false;
            }
          })())));
  const muscles = body.muscles;
  const musclesValid =
    muscles &&
    typeof muscles === "object" &&
    !Array.isArray(muscles) &&
    muscleRoles.every(
      (role) =>
        Array.isArray(muscles[role]) &&
        muscles[role].length <= 20 &&
        muscles[role].every(
          (muscle) =>
            typeof muscle === "string" &&
            muscle.trim().length > 0 &&
            muscle.trim().length <= 80,
        ),
    ) &&
    new Set(
      muscleRoles.flatMap((role) =>
        muscles[role].map((item) => item.trim().toLowerCase()),
      ),
    ).size ===
      muscleRoles.reduce((total, role) => total + muscles[role].length, 0);
  const dumbbellCount = body.dumbbellCount;
  const sideCount = body.sideCount;
  const bodyweightFactor = body.bodyweightFactor;
  const assistanceRatio = body.assistanceRatio;

  if (
    name.length === 0 ||
    name.length > 120 ||
    equipment.length === 0 ||
    equipment.length > 80 ||
    !imageValid ||
    !musclesValid ||
    !loadTypes.has(body.loadType) ||
    !(body.restCategory === null || restCategories.has(body.restCategory)) ||
    !(dumbbellCount === null || dumbbellCount === 1 || dumbbellCount === 2) ||
    (body.loadType === "dumbbell") !== (dumbbellCount !== null) ||
    !(sideCount === null || sideCount === 1 || sideCount === 2) ||
    !validPositiveNumber(bodyweightFactor) ||
    !validPositiveNumber(assistanceRatio) ||
    (body.loadType !== "bodyweight" && bodyweightFactor !== null) ||
    (body.loadType !== "assisted" && assistanceRatio !== null)
  ) {
    return null;
  }

  return {
    name,
    equipment,
    image: image
      ? {
          url: image.url,
          altText: image.altText.trim(),
          credit: image.credit.trim(),
          license: image.license.trim(),
        }
      : null,
    muscles: Object.fromEntries(
      muscleRoles.map((role) => [
        role,
        muscles[role].map((muscle) => muscle.trim()),
      ]),
    ),
    loadType: body.loadType,
    restCategory: body.restCategory,
    dumbbellCount,
    sideCount,
    bodyweightFactor,
    assistanceRatio,
  };
}

function entryFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    equipment: row.equipment,
    image:
      row.image_url === null
        ? null
        : {
            url: row.image_url,
            altText: row.image_alt_text,
            credit: row.image_credit,
            license: row.image_license,
          },
    muscles: { primary: [], secondary: [], tertiary: [] },
    loadType: row.load_type,
    restCategory: row.rest_category,
    dumbbellCount: row.dumbbell_count,
    sideCount: row.side_count,
    bodyweightFactor:
      row.bodyweight_factor === null ? null : Number(row.bodyweight_factor),
    assistanceRatio:
      row.assistance_ratio === null ? null : Number(row.assistance_ratio),
  };
}

async function findEntries(pool, name) {
  const parameters = name === undefined ? [] : [name];
  const filter = name === undefined ? "" : "WHERE exercises.name = $1";
  const { rows } = await pool.query(
    `SELECT exercises.id, exercises.name, exercises.equipment,
            exercises.image_url, exercises.image_alt_text,
            exercises.image_credit, exercises.image_license,
            exercises.load_type, exercises.rest_category,
            exercises.dumbbell_count, exercises.side_count,
            exercises.bodyweight_factor, exercises.assistance_ratio,
            exercise_muscles.role, exercise_muscles.muscle
     FROM exercises
     LEFT JOIN exercise_muscles ON exercise_muscles.exercise_id = exercises.id
     ${filter}
     ORDER BY lower(exercises.name), exercises.id,
              exercise_muscles.role, exercise_muscles.muscle`,
    parameters,
  );
  const entries = new Map();
  for (const row of rows) {
    if (!entries.has(row.id)) entries.set(row.id, entryFromRow(row));
    if (row.role) entries.get(row.id).muscles[row.role].push(row.muscle);
  }
  return [...entries.values()];
}

async function writeEntry(client, entry, id) {
  if (id) {
    const { rows } = await client.query(
      `UPDATE exercises SET name = $2, equipment = $3, image_url = $4,
         image_alt_text = $5, image_credit = $6, image_license = $7,
         load_type = $8, rest_category = $9, dumbbell_count = $10,
         side_count = $11, bodyweight_factor = $12, assistance_ratio = $13
       WHERE id = $1 RETURNING id`,
      [
        id,
        entry.name,
        entry.equipment,
        entry.image?.url ?? null,
        entry.image?.altText ?? null,
        entry.image?.credit ?? null,
        entry.image?.license ?? null,
        entry.loadType,
        entry.restCategory,
        entry.dumbbellCount,
        entry.sideCount,
        entry.bodyweightFactor,
        entry.assistanceRatio,
      ],
    );
    if (rows.length === 0) return null;
    await client.query("DELETE FROM exercise_muscles WHERE exercise_id = $1", [
      id,
    ]);
  } else {
    const { rows } = await client.query(
      `INSERT INTO exercises
         (name, equipment, image_url, image_alt_text, image_credit,
          image_license, load_type, rest_category, dumbbell_count, side_count,
          bodyweight_factor, assistance_ratio)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        entry.name,
        entry.equipment,
        entry.image?.url ?? null,
        entry.image?.altText ?? null,
        entry.image?.credit ?? null,
        entry.image?.license ?? null,
        entry.loadType,
        entry.restCategory,
        entry.dumbbellCount,
        entry.sideCount,
        entry.bodyweightFactor,
        entry.assistanceRatio,
      ],
    );
    id = rows[0].id;
  }

  for (const role of muscleRoles) {
    for (const muscle of entry.muscles[role]) {
      await client.query(
        "INSERT INTO exercise_muscles (exercise_id, role, muscle) VALUES ($1, $2, $3)",
        [id, role, muscle],
      );
    }
  }
  return id;
}

export function createCatalogRouter({ pool }) {
  const router = express.Router();
  const requireSignIn = authenticate({ pool });
  const requireAdmin = requireRole("admin");

  router.get(
    "/catalog/exercises",
    requireSignIn,
    async (_request, response) => {
      response.json(await findEntries(pool));
    },
  );

  router.get(
    "/catalog/exercises/match",
    requireSignIn,
    async (request, response) => {
      const name = request.query.name;
      if (typeof name !== "string" || name.length === 0 || name.length > 120) {
        response
          .status(400)
          .json({ error: "An exact exercise name is required" });
        return;
      }
      const [entry] = await findEntries(pool, name);
      if (!entry) {
        response.status(404).json({ error: "Exercise mapping not found" });
        return;
      }
      response.json(entry);
    },
  );

  router.post(
    "/admin/catalog/exercises",
    requireSignIn,
    requireAdmin,
    async (request, response) => {
      const entry = normalizeEntry(request.body);
      if (!entry) {
        response
          .status(400)
          .json({ error: "Valid exercise metadata required" });
        return;
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const id = await writeEntry(client, entry);
        await client.query("COMMIT");
        const [created] = await findEntries(pool, entry.name);
        response.status(201).json({ ...created, id });
      } catch (error) {
        await client.query("ROLLBACK");
        if (error.code === "23505") {
          response.status(409).json({ error: "Exercise name already exists" });
          return;
        }
        throw error;
      } finally {
        client.release();
      }
    },
  );

  router.patch(
    "/admin/catalog/exercises/:id",
    requireSignIn,
    requireAdmin,
    async (request, response) => {
      const entry = normalizeEntry(request.body);
      if (!entry) {
        response
          .status(400)
          .json({ error: "Valid exercise metadata required" });
        return;
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const id = await writeEntry(client, entry, request.params.id);
        if (!id) {
          await client.query("ROLLBACK");
          response.status(404).json({ error: "Exercise not found" });
          return;
        }
        await client.query("COMMIT");
        const [updated] = await findEntries(pool, entry.name);
        response.json({ ...updated, id });
      } catch (error) {
        await client.query("ROLLBACK");
        if (error.code === "23505") {
          response.status(409).json({ error: "Exercise name already exists" });
          return;
        }
        throw error;
      } finally {
        client.release();
      }
    },
  );

  return router;
}
