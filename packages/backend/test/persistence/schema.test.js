import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { runMigrations } from "../../src/persistence/migrate.js";
import { runSeeds } from "../../src/persistence/seed.js";

const migrationsDirectory = fileURLToPath(
  new URL("../../migrations/", import.meta.url),
);

describe("WT-003 persistence schema", () => {
  let database;
  let pool;

  beforeEach(async () => {
    database = new PGlite();
    pool = {
      async connect() {
        return {
          async query(statement, parameters) {
            if (
              statement.startsWith("CREATE TABLE users (") ||
              statement.startsWith("ALTER TABLE users")
            ) {
              await database.exec(statement);
              return { rows: [] };
            }

            return database.query(statement, parameters);
          },
          release() {},
        };
      },
    };
    await runMigrations({ pool, migrationsDirectory });
    await runSeeds({
      pool,
      databaseUrl: "postgresql://localhost/workout_tracker_test",
    });
  });

  afterEach(async () => {
    await database.close();
  });

  test("migrations and development seeds are repeatable", async () => {
    await runMigrations({ pool, migrationsDirectory });
    await runSeeds({
      pool,
      databaseUrl: "postgresql://localhost/workout_tracker_test",
    });
    await runSeeds({
      pool,
      databaseUrl: "postgresql://localhost/workout_tracker_test",
    });

    const { rows } = await database.query(
      "SELECT count(*)::integer AS count FROM exercises WHERE is_test_fixture",
    );
    expect(rows[0].count).toBe(1);
  });

  test("foreign keys prevent one user's equipment from referencing another user's gym", async () => {
    const firstUserId = randomUUID();
    const secondUserId = randomUUID();
    const firstGymId = randomUUID();
    const secondGymId = randomUUID();

    await database.query(
      "INSERT INTO users (id, email) VALUES ($1, $2), ($3, $4)",
      [
        firstUserId,
        `${firstUserId}@example.test`,
        secondUserId,
        `${secondUserId}@example.test`,
      ],
    );
    await database.query(
      "INSERT INTO gyms (id, user_id, name) VALUES ($1, $2, 'First'), ($3, $4, 'Second')",
      [firstGymId, firstUserId, secondGymId, secondUserId],
    );

    await expect(
      database.query(
        `INSERT INTO gym_equipment
          (id, user_id, gym_id, name, load_type, min_load_kg, max_load_kg, increment_kg)
         VALUES ($1, $2, $3, 'barbell', 'external', 0, 200, 2.5)`,
        [randomUUID(), firstUserId, secondGymId],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  test("stores corrections separately from immutable original set values", async () => {
    const userId = randomUUID();
    const sessionId = randomUUID();
    const exerciseId = "00000000-0000-4000-8000-000000000003";
    const sessionExerciseId = randomUUID();
    const setId = randomUUID();

    await database.query("INSERT INTO users (id, email) VALUES ($1, $2)", [
      userId,
      `${userId}@example.test`,
    ]);
    await database.query(
      `INSERT INTO workout_sessions (id, user_id, started_local_date)
       VALUES ($1, $2, '2026-10-16')`,
      [sessionId, userId],
    );
    await database.query(
      `INSERT INTO session_exercises (id, user_id, session_id, exercise_id, name_snapshot)
       VALUES ($1, $2, $3, $4, 'Development fixture')`,
      [sessionExerciseId, userId, sessionId, exerciseId],
    );
    await database.query(
      `INSERT INTO session_sets
        (id, user_id, session_exercise_id, set_number, set_type,
         actual_load_kg, effective_load_kg, actual_reps, actual_rir, checked_at)
       VALUES ($1, $2, $3, 1, 'standard', 80, 80, 5, 2, now())`,
      [setId, userId, sessionExerciseId],
    );
    await database.query(
      `INSERT INTO session_set_corrections
        (id, user_id, session_set_id, corrected_load_kg, corrected_reps)
       VALUES ($1, $2, $3, 85, 5)`,
      [randomUUID(), userId, setId],
    );

    const { rows } = await database.query(
      `SELECT sets.actual_load_kg, corrections.corrected_load_kg
       FROM session_sets AS sets
       JOIN session_set_corrections AS corrections
         ON corrections.user_id = sets.user_id
        AND corrections.session_set_id = sets.id
       WHERE sets.id = $1`,
      [setId],
    );

    expect(rows).toEqual([
      { actual_load_kg: "80.000", corrected_load_kg: "85.000" },
    ]);
  });

  test("run slots have identity separate from reusable program template slots", async () => {
    const userId = randomUUID();
    const templateId = randomUUID();
    const weekId = randomUUID();
    const templateDayId = randomUUID();
    const runId = randomUUID();
    const runDayId = randomUUID();

    await database.query("INSERT INTO users (id, email) VALUES ($1, $2)", [
      userId,
      `${userId}@example.test`,
    ]);
    await database.query(
      "INSERT INTO program_templates (id, user_id, name) VALUES ($1, $2, 'Template')",
      [templateId, userId],
    );
    await database.query(
      `INSERT INTO program_weeks (id, user_id, template_id, week_number, week_type)
       VALUES ($1, $2, $3, 1, 'training')`,
      [weekId, userId, templateId],
    );
    await database.query(
      `INSERT INTO program_days (id, user_id, week_id, slot_number, day_type)
       VALUES ($1, $2, $3, 1, 'rest')`,
      [templateDayId, userId, weekId],
    );
    await database.query(
      `INSERT INTO program_runs (id, user_id, template_id, status)
       VALUES ($1, $2, $3, 'active')`,
      [runId, userId, templateId],
    );
    await database.query(
      `INSERT INTO program_run_days
        (id, user_id, run_id, template_day_id, week_number, slot_number, day_type)
       VALUES ($1, $2, $3, $4, 1, 1, 'rest')`,
      [runDayId, userId, runId, templateDayId],
    );

    const { rows } = await database.query(
      `SELECT run_day.id AS run_day_id, template_day.id AS template_day_id
       FROM program_run_days AS run_day
       JOIN program_days AS template_day
         ON template_day.user_id = run_day.user_id
        AND template_day.id = run_day.template_day_id
       WHERE run_day.id = $1`,
      [runDayId],
    );

    expect(rows).toEqual([
      { run_day_id: runDayId, template_day_id: templateDayId },
    ]);
    expect(rows[0].run_day_id).not.toBe(rows[0].template_day_id);
  });

  test("a workout cannot reference a day slot from a different run", async () => {
    const userId = randomUUID();
    const templateId = randomUUID();
    const weekId = randomUUID();
    const templateDayId = randomUUID();
    const firstRunId = randomUUID();
    const secondRunId = randomUUID();
    const runDayId = randomUUID();

    await database.query("INSERT INTO users (id, email) VALUES ($1, $2)", [
      userId,
      `${userId}@example.test`,
    ]);
    await database.query(
      "INSERT INTO program_templates (id, user_id, name) VALUES ($1, $2, 'Template')",
      [templateId, userId],
    );
    await database.query(
      `INSERT INTO program_weeks (id, user_id, template_id, week_number, week_type)
       VALUES ($1, $2, $3, 1, 'training')`,
      [weekId, userId, templateId],
    );
    await database.query(
      `INSERT INTO program_days (id, user_id, week_id, slot_number, day_type)
       VALUES ($1, $2, $3, 1, 'rest')`,
      [templateDayId, userId, weekId],
    );
    await database.query(
      `INSERT INTO program_runs (id, user_id, template_id, status)
       VALUES ($1, $2, $3, 'active'), ($4, $2, $3, 'stopped')`,
      [firstRunId, userId, templateId, secondRunId],
    );
    await database.query(
      `INSERT INTO program_run_days
        (id, user_id, run_id, template_day_id, week_number, slot_number, day_type)
       VALUES ($1, $2, $3, $4, 1, 1, 'rest')`,
      [runDayId, userId, firstRunId, templateDayId],
    );

    await expect(
      database.query(
        `INSERT INTO workout_sessions
          (user_id, program_run_id, program_run_day_id, started_local_date)
         VALUES ($1, $2, $3, '2026-10-16')`,
        [userId, secondRunId, runDayId],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  test("finished session set values cannot be changed in place", async () => {
    const userId = randomUUID();
    const sessionId = randomUUID();
    const sessionExerciseId = randomUUID();
    const setId = randomUUID();

    await database.query("INSERT INTO users (id, email) VALUES ($1, $2)", [
      userId,
      `${userId}@example.test`,
    ]);
    await database.query(
      `INSERT INTO workout_sessions
        (id, user_id, status, has_performance, started_local_date)
       VALUES ($1, $2, 'completed', true, '2026-10-16')`,
      [sessionId, userId],
    );
    await database.query(
      `INSERT INTO session_exercises (id, user_id, session_id, exercise_id, name_snapshot)
       VALUES ($1, $2, $3, '00000000-0000-4000-8000-000000000003', 'Fixture')`,
      [sessionExerciseId, userId, sessionId],
    );
    await database.query(
      `INSERT INTO session_sets
        (id, user_id, session_exercise_id, set_number, set_type,
         actual_load_kg, effective_load_kg, actual_reps, actual_rir, checked_at)
       VALUES ($1, $2, $3, 1, 'standard', 80, 80, 5, 2, now())`,
      [setId, userId, sessionExerciseId],
    );

    await expect(
      database.query(
        "UPDATE session_sets SET actual_load_kg = 90 WHERE id = $1",
        [setId],
      ),
    ).rejects.toMatchObject({ code: "55000" });
  });

  test("stores a unit override per user and exercise", async () => {
    const userId = randomUUID();
    const exerciseId = "00000000-0000-4000-8000-000000000003";

    await database.query("INSERT INTO users (id, email) VALUES ($1, $2)", [
      userId,
      `${userId}@example.test`,
    ]);
    await database.query(
      `INSERT INTO exercise_preferences (user_id, exercise_id, unit_override)
       VALUES ($1, $2, 'lb')`,
      [userId, exerciseId],
    );

    const { rows } = await database.query(
      "SELECT unit_override FROM exercise_preferences WHERE user_id = $1 AND exercise_id = $2",
      [userId, exerciseId],
    );
    expect(rows).toEqual([{ unit_override: "lb" }]);
  });

  test("limits retained performance to one workout per local start date", async () => {
    const userId = randomUUID();

    await database.query("INSERT INTO users (id, email) VALUES ($1, $2)", [
      userId,
      `${userId}@example.test`,
    ]);
    await database.query(
      `INSERT INTO workout_sessions
        (user_id, status, has_performance, started_local_date)
       VALUES ($1, 'partial', false, '2026-10-16')`,
      [userId],
    );
    await database.query(
      `INSERT INTO workout_sessions
        (user_id, status, has_performance, started_local_date)
       VALUES ($1, 'completed', true, '2026-10-16')`,
      [userId],
    );

    await expect(
      database.query(
        `INSERT INTO workout_sessions
          (user_id, status, has_performance, started_local_date)
         VALUES ($1, 'partial', true, '2026-10-16')`,
        [userId],
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });
});
