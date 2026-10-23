import { createHash } from "node:crypto";
import express from "express";
import { authenticate } from "./auth/index.js";
import { parseWorkoutCsv } from "./import.js";

const maximumSourceBytes = 512 * 1024;
const idempotencyKeyPattern = /^[A-Za-z0-9._:-]{8,128}$/;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validSource(value) {
  return (
    typeof value === "string" &&
    Buffer.byteLength(value, "utf8") > 0 &&
    Buffer.byteLength(value, "utf8") <= maximumSourceBytes
  );
}

function listExercises(weeks) {
  return weeks.flatMap((week) =>
    week.days.flatMap((day) => day.exercises ?? []),
  );
}

async function buildPreview(source, pool) {
  const parsed = parseWorkoutCsv(source);
  for (const exercise of listExercises(parsed.weeks)) {
    if (
      exercise.sets.length === 0 &&
      !parsed.rowErrors.some((error) => error.rowNumber === exercise.rowNumber)
    ) {
      parsed.rowErrors.push({
        rowNumber: exercise.rowNumber,
        code: "exercise_has_no_sets",
        message: "An exercise row must contain at least one valid set.",
        exerciseName: exercise.name,
      });
    }
  }
  if (parsed.rowErrors.length > 0) parsed.canActivate = false;

  const { rows: catalogExercises } = await pool.query(
    "SELECT id, name FROM exercises ORDER BY lower(name), id",
  );
  const catalogByName = new Map(
    catalogExercises.map((exercise) => [exercise.name, exercise]),
  );
  const sourceNames = [
    ...new Set(listExercises(parsed.weeks).map(({ name }) => name)),
  ];
  return {
    ...parsed,
    mappings: sourceNames.map((sourceName) => ({
      sourceName,
      exerciseId: catalogByName.get(sourceName)?.id ?? null,
      exactMatch: catalogByName.has(sourceName),
    })),
    catalogExercises,
  };
}

function normalizedNumbers(value) {
  if (
    !Array.isArray(value) ||
    value.some((number) => !Number.isInteger(number) || number < 1)
  ) {
    return null;
  }
  return [...new Set(value)].sort((left, right) => left - right);
}

function requestHash({
  source,
  name,
  skipRowNumbers,
  acknowledgedSkipRows,
  mappings,
}) {
  const normalized = {
    source,
    name,
    skipRowNumbers,
    acknowledgedSkipRows,
    mappings: Object.entries(mappings).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function responseProgram(row, replayed = false) {
  return {
    id: row.id,
    name: row.name,
    status: "draft",
    ...(replayed ? { replayed: true } : {}),
  };
}

function validationError(response, error, errors = {}) {
  response.status(400).json({ error, errors });
}

export function createProgramsRouter({ pool }) {
  const router = express.Router();
  const requireSignIn = authenticate({ pool });

  router.get("/programs", requireSignIn, async (request, response) => {
    const { rows } = await pool.query(
      `SELECT templates.id, templates.name, templates.created_at,
              count(DISTINCT weeks.id)::int AS week_count
       FROM program_templates AS templates
       LEFT JOIN program_weeks AS weeks
         ON weeks.user_id = templates.user_id AND weeks.template_id = templates.id
       WHERE templates.user_id = $1
       GROUP BY templates.id
       ORDER BY templates.created_at DESC, templates.id`,
      [request.auth.userId],
    );
    response.json(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
        weekCount: row.week_count,
      })),
    );
  });

  router.post(
    "/programs/import/preview",
    requireSignIn,
    async (request, response) => {
      if (!validSource(request.body?.source)) {
        validationError(
          response,
          "CSV data is required and must be under 512 KB.",
        );
        return;
      }
      response.json(await buildPreview(request.body.source, pool));
    },
  );

  router.post("/programs/import", requireSignIn, async (request, response) => {
    const body = request.body;
    const idempotencyKey = request.get("Idempotency-Key")?.trim();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (
      !validSource(body?.source) ||
      name.length === 0 ||
      name.length > 120 ||
      body.confirmed !== true ||
      !idempotencyKeyPattern.test(idempotencyKey ?? "") ||
      !isRecord(body.mappings)
    ) {
      validationError(
        response,
        "A valid CSV, program name, explicit confirmation, mappings, and idempotency key are required.",
      );
      return;
    }

    const skipRowNumbers = normalizedNumbers(body.skipRowNumbers);
    const acknowledgedSkipRows = normalizedNumbers(body.acknowledgedSkipRows);
    if (!skipRowNumbers || !acknowledgedSkipRows) {
      validationError(
        response,
        "Row decisions must be arrays of positive row numbers.",
      );
      return;
    }

    const mappings = Object.fromEntries(
      Object.entries(body.mappings).map(([sourceName, exerciseId]) => [
        sourceName,
        typeof exerciseId === "string" ? exerciseId : "",
      ]),
    );
    const fingerprint = requestHash({
      source: body.source,
      name,
      skipRowNumbers,
      acknowledgedSkipRows,
      mappings,
    });
    const key = idempotencyKey.toLowerCase();
    const userId = request.auth.userId;

    const existing = await pool.query(
      `SELECT imports.request_hash, templates.id, templates.name
       FROM program_import_requests AS imports
       JOIN program_templates AS templates
         ON templates.user_id = imports.user_id AND templates.id = imports.template_id
       WHERE imports.user_id = $1 AND imports.idempotency_key = $2`,
      [userId, key],
    );
    if (existing.rows.length > 0) {
      if (existing.rows[0].request_hash !== fingerprint) {
        response
          .status(409)
          .json({ error: "This import key was used for different data." });
        return;
      }
      response.status(200).json(responseProgram(existing.rows[0], true));
      return;
    }

    const preview = await buildPreview(body.source, pool);
    const errors = {
      rowErrors: preview.rowErrors,
      structuralErrors: preview.structuralErrors,
      weekErrors: [...preview.weekErrors],
      unresolvedMappings: [],
      sourceSkipMarkers: preview.sourceSkipMarkers,
    };
    if (errors.structuralErrors.length > 0) {
      validationError(
        response,
        "The CSV structure cannot be imported safely.",
        errors,
      );
      return;
    }
    if (errors.weekErrors.length > 0) {
      validationError(
        response,
        "Every week must contain seven slots and each workout must contain exercises.",
        errors,
      );
      return;
    }

    const requiredSkipRows = [
      ...new Set(preview.rowErrors.map(({ rowNumber }) => rowNumber)),
    ].sort((left, right) => left - right);
    if (
      requiredSkipRows.some((rowNumber) => !skipRowNumbers.includes(rowNumber))
    ) {
      validationError(
        response,
        "Confirm skipping each invalid row or correct the CSV and preview again.",
        errors,
      );
      return;
    }
    if (
      skipRowNumbers.some((rowNumber) => !requiredSkipRows.includes(rowNumber))
    ) {
      validationError(
        response,
        "Only rows with preview errors can be skipped.",
        errors,
      );
      return;
    }

    const requiredAcknowledgements = preview.sourceSkipMarkers
      .map(({ rowNumber }) => rowNumber)
      .sort((left, right) => left - right);
    if (
      requiredAcknowledgements.some(
        (rowNumber) => !acknowledgedSkipRows.includes(rowNumber),
      ) ||
      acknowledgedSkipRows.some(
        (rowNumber) => !requiredAcknowledgements.includes(rowNumber),
      )
    ) {
      validationError(
        response,
        "Acknowledge each source skip marker before importing.",
        errors,
      );
      return;
    }

    const catalogById = new Map(
      preview.catalogExercises.map((exercise) => [exercise.id, exercise]),
    );
    const catalogByName = new Map(
      preview.catalogExercises.map((exercise) => [exercise.name, exercise]),
    );
    const includedNames = new Set();
    for (const exercise of listExercises(preview.weeks)) {
      if (!skipRowNumbers.includes(exercise.rowNumber)) {
        includedNames.add(exercise.name);
      }
    }
    for (const sourceName of includedNames) {
      const exerciseId = mappings[sourceName];
      const target = catalogById.get(exerciseId);
      const exact = catalogByName.get(sourceName);
      if (!target || (exact && exact.id !== target.id)) {
        errors.unresolvedMappings.push(sourceName);
      }
    }
    if (errors.unresolvedMappings.length > 0) {
      validationError(
        response,
        "Resolve every included exercise catalog mapping.",
        errors,
      );
      return;
    }

    const importedWeeks = preview.weeks.map((week) => ({
      ...week,
      days: week.days.map((day) => ({
        ...day,
        exercises: day.exercises.filter(
          (exercise) => !skipRowNumbers.includes(exercise.rowNumber),
        ),
      })),
    }));
    importedWeeks.forEach((week) =>
      week.days.forEach((day) => {
        if (day.type === "workout" && day.exercises.length === 0) {
          errors.weekErrors.push({
            code: "empty_workout",
            cycle: week.cycle,
            day: day.name,
            rowNumber: day.rowNumber,
            actualSlots: week.days.length,
            message: `Workout ${day.name} has no included exercise rows.`,
          });
        }
      }),
    );
    if (errors.weekErrors.length > 0) {
      validationError(
        response,
        "Skipping these rows would leave an empty workout.",
        errors,
      );
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const templateResult = await client.query(
        `INSERT INTO program_templates (user_id, name, source_metadata)
         VALUES ($1, $2, $3::jsonb) RETURNING id, name`,
        [
          userId,
          name,
          JSON.stringify({
            importedFrom: "csv",
            metadata: preview.metadata,
            sourceCycleNumbers: preview.weeks.map(({ cycle }) => cycle),
            skippedRowNumbers: skipRowNumbers,
            acknowledgedSkipRows,
          }),
        ],
      );
      const template = templateResult.rows[0];

      for (const [weekIndex, week] of importedWeeks.entries()) {
        const weekResult = await client.query(
          `INSERT INTO program_weeks (user_id, template_id, week_number, week_type)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [userId, template.id, weekIndex + 1, week.type],
        );
        for (const [dayIndex, day] of week.days.entries()) {
          const dayResult = await client.query(
            `INSERT INTO program_days (user_id, week_id, slot_number, day_type, name)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [userId, weekResult.rows[0].id, dayIndex + 1, day.type, day.name],
          );
          for (const [exerciseIndex, exercise] of day.exercises.entries()) {
            const prescriptionSnapshot = {
              notes: exercise.notes,
              sourceRowNumber: exercise.rowNumber,
              sets: exercise.sets.map((set) => ({
                type: set.type,
                repMin: set.repMin,
                repMax: set.repMax,
                targetRir: set.rir,
              })),
            };
            const exerciseResult = await client.query(
              `INSERT INTO program_day_exercises
                 (user_id, day_id, exercise_id, sort_order, prescription_snapshot)
               VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id`,
              [
                userId,
                dayResult.rows[0].id,
                mappings[exercise.name],
                exerciseIndex + 1,
                JSON.stringify(prescriptionSnapshot),
              ],
            );
            for (const [setIndex, set] of exercise.sets.entries()) {
              await client.query(
                `INSERT INTO program_sets
                   (user_id, day_exercise_id, set_number, set_type, rep_min, rep_max, target_rir)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                  userId,
                  exerciseResult.rows[0].id,
                  setIndex + 1,
                  set.type,
                  set.repMin,
                  set.repMax,
                  set.rir,
                ],
              );
            }
          }
        }
      }

      await client.query(
        `INSERT INTO program_import_requests
           (user_id, idempotency_key, request_hash, template_id)
         VALUES ($1, $2, $3, $4)`,
        [userId, key, fingerprint, template.id],
      );
      await client.query("COMMIT");
      response.status(201).json(responseProgram(template));
    } catch (error) {
      await client.query("ROLLBACK");
      if (error.code === "23505") {
        const duplicate = await pool.query(
          `SELECT imports.request_hash, templates.id, templates.name
           FROM program_import_requests AS imports
           JOIN program_templates AS templates
             ON templates.user_id = imports.user_id AND templates.id = imports.template_id
           WHERE imports.user_id = $1 AND imports.idempotency_key = $2`,
          [userId, key],
        );
        if (duplicate.rows.length > 0) {
          if (duplicate.rows[0].request_hash !== fingerprint) {
            response
              .status(409)
              .json({ error: "This import key was used for different data." });
            return;
          }
          response.status(200).json(responseProgram(duplicate.rows[0], true));
          return;
        }
      }
      throw error;
    } finally {
      client.release();
    }
  });

  return router;
}
