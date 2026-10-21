import express from "express";
import { authenticate } from "./auth/index.js";

const restCategories = [
  "upper_compound",
  "lower_compound",
  "upper_isolation",
  "lower_isolation",
  "core",
];
const loadTypes = new Set(["external", "dumbbell", "bodyweight", "assisted"]);
const decimalLimit = 99999.999;

function validLoad(value, { allowZero = true } = {}) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= (allowZero ? 0 : Number.MIN_VALUE) &&
    value <= decimalLimit &&
    Number.isInteger(value * 1000)
  );
}

function validTimezone(value) {
  if (typeof value !== "string" || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function normalizeSettings(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const profile = body.profile;
  const gym = body.gym;
  if (
    !profile ||
    typeof profile !== "object" ||
    Array.isArray(profile) ||
    !gym ||
    typeof gym !== "object" ||
    Array.isArray(gym)
  ) {
    return null;
  }

  const email =
    typeof profile.email === "string" ? profile.email.trim().toLowerCase() : "";
  const displayName =
    typeof profile.displayName === "string" ? profile.displayName.trim() : "";
  const restDurationsSeconds = profile.restDurationsSeconds;
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    displayName.length < 1 ||
    displayName.length > 80 ||
    !validTimezone(profile.timezone) ||
    !["kg", "lb"].includes(profile.defaultUnit) ||
    !(profile.bodyweightKg === null || validLoad(profile.bodyweightKg)) ||
    !restDurationsSeconds ||
    typeof restDurationsSeconds !== "object" ||
    Array.isArray(restDurationsSeconds) ||
    restCategories.some(
      (category) =>
        !Number.isInteger(restDurationsSeconds[category]) ||
        restDurationsSeconds[category] < 1 ||
        restDurationsSeconds[category] > 86400,
    )
  ) {
    return null;
  }

  const gymName = typeof gym.name === "string" ? gym.name.trim() : "";
  if (
    gymName.length < 1 ||
    gymName.length > 100 ||
    !Array.isArray(gym.equipment) ||
    gym.equipment.length > 100 ||
    !Array.isArray(gym.bars) ||
    gym.bars.length > 100 ||
    !Array.isArray(gym.plates) ||
    gym.plates.length > 100
  ) {
    return null;
  }

  const equipmentNames = new Set();
  const equipment = [];
  for (const item of gym.equipment) {
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    const nameKey = name.toLowerCase();
    if (
      name.length < 1 ||
      name.length > 80 ||
      equipmentNames.has(nameKey) ||
      !loadTypes.has(item.loadType) ||
      !validLoad(item.minLoadKg) ||
      !validLoad(item.maxLoadKg) ||
      !validLoad(item.incrementKg, { allowZero: false }) ||
      item.maxLoadKg < item.minLoadKg ||
      !Array.isArray(item.availableLoadsKg) ||
      item.availableLoadsKg.length > 500 ||
      item.availableLoadsKg.some(
        (load) =>
          !validLoad(load) || load < item.minLoadKg || load > item.maxLoadKg,
      )
    ) {
      return null;
    }
    equipmentNames.add(nameKey);
    equipment.push({
      name,
      loadType: item.loadType,
      minLoadKg: item.minLoadKg,
      maxLoadKg: item.maxLoadKg,
      incrementKg: item.incrementKg,
      availableLoadsKg: item.availableLoadsKg,
    });
  }

  const bars = [];
  const barNames = new Set();
  for (const bar of gym.bars) {
    const name = typeof bar?.name === "string" ? bar.name.trim() : "";
    if (
      name.length < 1 ||
      name.length > 80 ||
      barNames.has(name.toLowerCase()) ||
      !validLoad(bar.weightKg, { allowZero: false })
    ) {
      return null;
    }
    barNames.add(name.toLowerCase());
    bars.push({ name, weightKg: bar.weightKg });
  }

  const plates = [];
  const plateWeights = new Set();
  for (const plate of gym.plates) {
    if (
      !validLoad(plate?.weightKg, { allowZero: false }) ||
      plateWeights.has(plate.weightKg) ||
      !Number.isInteger(plate.quantity) ||
      plate.quantity < 0 ||
      plate.quantity > 1000
    ) {
      return null;
    }
    plateWeights.add(plate.weightKg);
    plates.push({ weightKg: plate.weightKg, quantity: plate.quantity });
  }

  return {
    profile: {
      email,
      displayName,
      timezone: profile.timezone,
      bodyweightKg: profile.bodyweightKg,
      defaultUnit: profile.defaultUnit,
      restDurationsSeconds: Object.fromEntries(
        restCategories.map((category) => [
          category,
          restDurationsSeconds[category],
        ]),
      ),
    },
    gym: { name: gymName, equipment, bars, plates },
  };
}

async function readSettings(pool, userId) {
  const { rows: profiles } = await pool.query(
    `SELECT users.id, users.email, users.role, profiles.display_name,
            profiles.timezone, profiles.bodyweight_kg, profiles.default_unit,
            profiles.rest_durations_seconds
     FROM users
     JOIN profiles ON profiles.user_id = users.id
     WHERE users.id = $1`,
    [userId],
  );
  if (profiles.length !== 1) return null;

  const { rows: gyms } = await pool.query(
    "SELECT id, name FROM gyms WHERE user_id = $1",
    [userId],
  );
  const gym = gyms[0];
  if (!gym) {
    return {
      profile: profileFromRow(profiles[0]),
      gym: { name: "", equipment: [], bars: [], plates: [] },
    };
  }

  const [equipmentResult, barsResult, platesResult] = await Promise.all([
    pool.query(
      `SELECT name, load_type, min_load_kg, max_load_kg, increment_kg,
              available_loads_kg
       FROM gym_equipment WHERE user_id = $1 AND gym_id = $2 ORDER BY lower(name)`,
      [userId, gym.id],
    ),
    pool.query(
      "SELECT name, weight_kg FROM gym_bars WHERE user_id = $1 AND gym_id = $2 ORDER BY lower(name)",
      [userId, gym.id],
    ),
    pool.query(
      "SELECT weight_kg, quantity FROM gym_plates WHERE user_id = $1 AND gym_id = $2 ORDER BY weight_kg",
      [userId, gym.id],
    ),
  ]);

  return {
    profile: profileFromRow(profiles[0]),
    gym: {
      id: gym.id,
      name: gym.name,
      equipment: equipmentResult.rows.map((item) => ({
        name: item.name,
        loadType: item.load_type,
        minLoadKg: Number(item.min_load_kg),
        maxLoadKg: Number(item.max_load_kg),
        incrementKg: Number(item.increment_kg),
        availableLoadsKg: item.available_loads_kg.map(Number),
      })),
      bars: barsResult.rows.map((bar) => ({
        name: bar.name,
        weightKg: Number(bar.weight_kg),
      })),
      plates: platesResult.rows.map((plate) => ({
        weightKg: Number(plate.weight_kg),
        quantity: plate.quantity,
      })),
    },
  };
}

function profileFromRow(row) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    displayName: row.display_name,
    timezone: row.timezone,
    bodyweightKg: row.bodyweight_kg === null ? null : Number(row.bodyweight_kg),
    defaultUnit: row.default_unit,
    restDurationsSeconds: row.rest_durations_seconds,
  };
}

async function writeSettings(client, userId, settings) {
  const { profile, gym } = settings;
  await client.query(`UPDATE users SET email = $2 WHERE id = $1`, [
    userId,
    profile.email,
  ]);
  await client.query(
    `UPDATE profiles
     SET display_name = $2, timezone = $3, bodyweight_kg = $4,
         default_unit = $5, rest_durations_seconds = $6, updated_at = now()
     WHERE user_id = $1`,
    [
      userId,
      profile.displayName,
      profile.timezone,
      profile.bodyweightKg,
      profile.defaultUnit,
      profile.restDurationsSeconds,
    ],
  );
  const { rows } = await client.query(
    `INSERT INTO gyms (user_id, name) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [userId, gym.name],
  );
  const gymId = rows[0].id;
  await client.query(
    "DELETE FROM gym_equipment WHERE user_id = $1 AND gym_id = $2",
    [userId, gymId],
  );
  await client.query(
    "DELETE FROM gym_bars WHERE user_id = $1 AND gym_id = $2",
    [userId, gymId],
  );
  await client.query(
    "DELETE FROM gym_plates WHERE user_id = $1 AND gym_id = $2",
    [userId, gymId],
  );
  for (const item of gym.equipment) {
    await client.query(
      `INSERT INTO gym_equipment
         (user_id, gym_id, name, load_type, min_load_kg, max_load_kg,
          increment_kg, available_loads_kg)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId,
        gymId,
        item.name,
        item.loadType,
        item.minLoadKg,
        item.maxLoadKg,
        item.incrementKg,
        item.availableLoadsKg,
      ],
    );
  }
  for (const bar of gym.bars) {
    await client.query(
      "INSERT INTO gym_bars (user_id, gym_id, name, weight_kg) VALUES ($1, $2, $3, $4)",
      [userId, gymId, bar.name, bar.weightKg],
    );
  }
  for (const plate of gym.plates) {
    await client.query(
      "INSERT INTO gym_plates (user_id, gym_id, weight_kg, quantity) VALUES ($1, $2, $3, $4)",
      [userId, gymId, plate.weightKg, plate.quantity],
    );
  }
}

export function createSettingsRouter({ pool }) {
  const router = express.Router();
  const requireSignIn = authenticate({ pool });

  router.get("/settings", requireSignIn, async (request, response) => {
    const settings = await readSettings(pool, request.auth.userId);
    if (!settings) {
      response.status(404).json({ error: "Profile not found" });
      return;
    }
    response.json(settings);
  });

  router.put("/settings", requireSignIn, async (request, response) => {
    const settings = normalizeSettings(request.body);
    if (!settings) {
      response
        .status(400)
        .json({ error: "Valid profile and gym settings required" });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await writeSettings(client, request.auth.userId, settings);
      await client.query("COMMIT");
      response.json(await readSettings(pool, request.auth.userId));
    } catch (error) {
      await client.query("ROLLBACK");
      if (error.code === "23505") {
        response.status(409).json({ error: "Email is already registered" });
        return;
      }
      throw error;
    } finally {
      client.release();
    }
  });

  return router;
}
