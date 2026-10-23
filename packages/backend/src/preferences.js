import express from "express";
import { authenticate } from "./auth/index.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validUnits = new Set(["kg", "lb"]);

async function readPreference(pool, userId, exerciseId) {
  const { rows } = await pool.query(
    `SELECT exercises.id, profiles.default_unit,
            exercise_preferences.unit_override
     FROM exercises
     JOIN profiles ON profiles.user_id = $2
     LEFT JOIN exercise_preferences
       ON exercise_preferences.user_id = profiles.user_id
      AND exercise_preferences.exercise_id = exercises.id
     WHERE exercises.id = $1`,
    [exerciseId, userId],
  );
  if (rows.length !== 1) return null;
  const row = rows[0];
  return {
    exerciseId: row.id,
    unit: row.unit_override ?? row.default_unit,
    unitOverride: row.unit_override,
  };
}

export function createPreferencesRouter({ pool }) {
  const router = express.Router();
  const requireSignIn = authenticate({ pool });

  router.get(
    "/exercises/:exerciseId/preferences",
    requireSignIn,
    async (request, response) => {
      if (!uuidPattern.test(request.params.exerciseId)) {
        response.status(400).json({ error: "Valid exercise ID required" });
        return;
      }
      const preference = await readPreference(
        pool,
        request.auth.userId,
        request.params.exerciseId,
      );
      if (!preference) {
        response.status(404).json({ error: "Exercise not found" });
        return;
      }
      response.json(preference);
    },
  );

  router.put(
    "/exercises/:exerciseId/preferences",
    requireSignIn,
    async (request, response) => {
      if (
        !uuidPattern.test(request.params.exerciseId) ||
        !request.body ||
        typeof request.body !== "object" ||
        Array.isArray(request.body) ||
        !Object.hasOwn(request.body, "unitOverride") ||
        (request.body.unitOverride !== null &&
          !validUnits.has(request.body.unitOverride))
      ) {
        response.status(400).json({ error: "Valid unit override required" });
        return;
      }

      const current = await readPreference(
        pool,
        request.auth.userId,
        request.params.exerciseId,
      );
      if (!current) {
        response.status(404).json({ error: "Exercise not found" });
        return;
      }

      if (request.body.unitOverride === null) {
        await pool.query(
          `DELETE FROM exercise_preferences
           WHERE user_id = $1 AND exercise_id = $2`,
          [request.auth.userId, request.params.exerciseId],
        );
      } else {
        await pool.query(
          `INSERT INTO exercise_preferences (user_id, exercise_id, unit_override)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, exercise_id)
           DO UPDATE SET unit_override = EXCLUDED.unit_override,
                         updated_at = now()`,
          [
            request.auth.userId,
            request.params.exerciseId,
            request.body.unitOverride,
          ],
        );
      }

      response.json(
        await readPreference(
          pool,
          request.auth.userId,
          request.params.exerciseId,
        ),
      );
    },
  );

  return router;
}
