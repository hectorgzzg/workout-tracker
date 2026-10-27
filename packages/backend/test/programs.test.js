import { randomUUID } from "node:crypto";
import request from "supertest";
import { PGlite } from "@electric-sql/pglite";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/auth/index.js";
import { runMigrations } from "../src/persistence/migrate.js";
import {
  recheckWorkoutSessionEligibility,
  resolveProgramRunWorkout,
} from "../src/programs.js";

const migrationsDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);
const origin = "https://workout.example";

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function makeCsv({
  invalidRange = "5-3",
  firstRange = "5-8",
  unknownExercise = false,
  sourceSkipMarker = false,
} = {}) {
  const rows = [
    ["Program Name", "Import fixture"],
    ["Workout", "Exercise", "Set 1 Type", "Set 1 Rep Range", "Set 1 RIR"],
    ["Cycle 1"],
    ...(sourceSkipMarker ? [["Skipped"]] : []),
    [
      "Workout A",
      unknownExercise ? "Unknown lift" : "Known lift",
      "Standard Set",
      firstRange,
      "2",
    ],
    ["", "Mystery lift", "Standard Set", invalidRange, "2"],
    ["Rest"],
    ["Workout B", "Known lift", "Failure Set", "8+", "0"],
    ["Rest"],
    ["Rest"],
    ["Rest"],
    ["Rest"],
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function makeFiveWeekMacroFactorCsv() {
  const rows = [
    ["Program: Integration fixture", "Cycles: 5"],
    [
      "Cycle 1",
      "Exercise",
      "Skipped",
      "Notes",
      "Set 1 Type",
      "Set 1 Rep Range",
      "Set 1 RIR",
      "Set 1 Rest",
    ],
  ];

  for (let cycle = 1; cycle <= 5; cycle += 1) {
    if (cycle > 1) {
      rows.push([
        `Cycle ${cycle}`,
        "Exercise",
        "Skipped",
        "Notes",
        "Set 1 Type",
        "Set 1 Rep Range",
        "Set 1 RIR",
        "Set 1 Rest",
      ]);
    }
    rows.push(
      ["Workout A", "Known lift", "No", "", "Standard Set", "5-8", "2", "120"],
      ["Rest"],
      ["Rest"],
      ["Rest"],
      ["Workout B", "Known lift", "No", "", "Failure Set", "8+", "0", "90"],
      ["Rest"],
      ["Rest"],
    );
  }

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

describe("WT-012 program import", () => {
  let database;
  let pool;
  let app;
  let member;
  let knownExerciseId;
  let failProgramSetInsert;

  beforeEach(async () => {
    database = new PGlite();
    failProgramSetInsert = false;
    pool = {
      async connect() {
        return {
          async query(statement, parameters) {
            if (
              failProgramSetInsert &&
              statement.startsWith("INSERT INTO program_sets")
            ) {
              throw new Error("Injected program set persistence failure");
            }
            if (
              statement.startsWith("CREATE TABLE users (") ||
              statement.startsWith("ALTER TABLE users") ||
              statement.startsWith("CREATE TABLE registration_invitations")
            ) {
              await database.exec(statement);
              return { rows: [] };
            }
            return database.query(statement, parameters);
          },
          release() {},
        };
      },
      query: (statement, parameters) => database.query(statement, parameters),
    };
    await runMigrations({ pool, migrationsDirectory });
    member = await createAccount("member@example.test");
    knownExerciseId = randomUUID();
    await database.query(
      `INSERT INTO exercises (id, name, equipment, load_type)
       VALUES ($1, 'Known lift', 'barbell', 'external')`,
      [knownExerciseId],
    );
    app = createApp({ pool, allowedOrigins: [origin], cookieSecure: false });
  });

  afterEach(async () => {
    await database.close();
  });

  async function createAccount(email) {
    const id = randomUUID();
    const password = "CorrectHorse!23";
    await database.query(
      "INSERT INTO users (id, email, role, password_hash) VALUES ($1, $2, 'member', $3)",
      [id, email, await hashPassword(password)],
    );
    await database.query(
      "INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)",
      [id, email.split("@")[0]],
    );
    return { id, email, password };
  }

  async function signIn(account = member) {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({ email: account.email, password: account.password });
    return response.headers["set-cookie"][0].split(";")[0];
  }

  function importPayload(overrides = {}) {
    return {
      source: makeCsv(),
      name: "Imported strength plan",
      confirmed: true,
      skipRowNumbers: [5],
      acknowledgedSkipRows: [],
      mappings: { "Known lift": knownExerciseId },
      ...overrides,
    };
  }

  async function createImportedProgram(cookie) {
    const response = await request(app)
      .post("/api/programs/import")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .set("Idempotency-Key", randomUUID())
      .send(importPayload());
    expect(response.status).toBe(201);
    return response.body.id;
  }

  async function createReadyProgram(cookie) {
    const templateId = await createImportedProgram(cookie);
    const deload = await request(app)
      .post(`/api/programs/${templateId}/deload`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ days: makeDeloadDays() });
    expect(deload.status).toBe(201);
    const activated = await request(app)
      .post(`/api/programs/${templateId}/activate`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ confirmed: true });
    expect(activated.status).toBe(201);
    return { templateId, runId: activated.body.id };
  }

  async function resolveWorkoutSlot(runId, runDayId, outcome = "completed") {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await resolveProgramRunWorkout(client, {
        userId: member.id,
        runId,
        runDayId,
        outcome,
      });
      if (result.statusCode === 200) await client.query("COMMIT");
      else await client.query("ROLLBACK");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function resolveWeek(cookie, runId, weekNumber) {
    const { rows } = await database.query(
      `SELECT id, day_type FROM program_run_days
       WHERE run_id = $1 AND week_number = $2 ORDER BY slot_number`,
      [runId, weekNumber],
    );
    for (const day of rows) {
      if (day.day_type === "workout") {
        const result = await resolveWorkoutSlot(runId, day.id);
        expect(result.statusCode).toBe(200);
      } else {
        const response = await request(app)
          .post(`/api/program-runs/${runId}/days/${day.id}/rest`)
          .set("Origin", origin)
          .set("Cookie", cookie)
          .send({ checked: true });
        expect(response.status).toBe(200);
      }
    }
  }

  function makeDeloadDays(slotCount = 7) {
    return Array.from({ length: slotCount }, (_, index) =>
      index === 0 || index === 3
        ? {
            type: "workout",
            name: `Deload workout ${index + 1}`,
            exercises: [
              {
                exerciseId: knownExerciseId,
                notes: "Reduced volume",
                sets: [
                  {
                    type: "standard",
                    repMin: 8,
                    repMax: 10,
                    rir: 3,
                  },
                ],
              },
            ],
          }
        : { type: "rest", name: "Rest", exercises: [] },
    );
  }

  async function createExistingTemplate() {
    const id = randomUUID();
    await database.query(
      "INSERT INTO program_templates (id, user_id, name) VALUES ($1, $2, 'Existing template')",
      [id, member.id],
    );
    return id;
  }

  test("previews parsed slots, exact catalog matches, and row-level skip choices", async () => {
    const cookie = await signIn();
    const response = await request(app)
      .post("/api/programs/import/preview")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ source: makeCsv() });

    expect(response.status).toBe(200);
    expect(response.body.weeks[0].days).toHaveLength(7);
    expect(response.body.weeks[0].days[0].exercises[0]).toMatchObject({
      name: "Known lift",
      sets: [{ type: "standard", repMin: 5, repMax: 8, rir: 2 }],
    });
    expect(response.body.rowErrors).toEqual([
      expect.objectContaining({ rowNumber: 5, code: "invalid_rep_range" }),
    ]);
    expect(response.body.mappings).toContainEqual({
      sourceName: "Known lift",
      exerciseId: knownExerciseId,
      exactMatch: true,
    });
    expect(response.body.structuralErrors).toEqual([]);
  });

  test("previews a five-week MacroFactor-format CSV as complete weeks", async () => {
    const cookie = await signIn();
    const response = await request(app)
      .post("/api/programs/import/preview")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ source: makeFiveWeekMacroFactorCsv() });

    expect(response.status).toBe(200);
    expect(response.body.weeks).toHaveLength(5);
    expect(response.body.weeks.every((week) => week.days.length === 7)).toBe(
      true,
    );
    expect(response.body.rowErrors).toEqual([]);
    expect(response.body.structuralErrors).toEqual([]);
    expect(response.body.weekErrors).toEqual([]);
  });

  test("requires acknowledgement for source skip markers and stores the decision", async () => {
    const cookie = await signIn();
    const payload = importPayload({
      source: makeCsv({ sourceSkipMarker: true }),
      skipRowNumbers: [6],
    });
    const key = randomUUID();
    const unacknowledged = await request(app)
      .post("/api/programs/import")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .set("Idempotency-Key", key)
      .send(payload);

    expect(unacknowledged.status).toBe(400);
    expect(unacknowledged.body.error).toMatch(/source skip marker/i);

    const acknowledged = await request(app)
      .post("/api/programs/import")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .set("Idempotency-Key", key)
      .send({ ...payload, acknowledgedSkipRows: [4] });

    expect(acknowledged.status).toBe(201);
    const { rows } = await database.query(
      "SELECT source_metadata FROM program_templates WHERE id = $1",
      [acknowledged.body.id],
    );
    expect(rows[0].source_metadata).toMatchObject({
      acknowledgedSkipRows: [4],
      skippedRowNumbers: [6],
    });
  });

  test("lists only the signed-in user's saved programs", async () => {
    const cookie = await signIn();
    await createExistingTemplate();
    const otherAccount = await createAccount("other@example.test");
    const otherTemplateId = randomUUID();
    await database.query(
      "INSERT INTO program_templates (id, user_id, name) VALUES ($1, $2, 'Private template')",
      [otherTemplateId, otherAccount.id],
    );

    const response = await request(app)
      .get("/api/programs")
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      name: "Existing template",
      weekCount: 0,
    });
    expect(response.body[0].id).not.toBe(otherTemplateId);
  });

  test("requires explicit confirmation, skips invalid rows, and preserves old templates and active drafts", async () => {
    const cookie = await signIn();
    const previousTemplateId = await createExistingTemplate();
    const activeSessionId = randomUUID();
    await database.query(
      `INSERT INTO workout_sessions (id, user_id, started_local_date)
       VALUES ($1, $2, '2026-10-22')`,
      [activeSessionId, member.id],
    );

    const unconfirmed = await request(app)
      .post("/api/programs/import")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .set("Idempotency-Key", randomUUID())
      .send(importPayload({ confirmed: false }));
    expect(unconfirmed.status).toBe(400);

    const key = randomUUID();
    const created = await request(app)
      .post("/api/programs/import")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .set("Idempotency-Key", key)
      .send(importPayload());

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      id: expect.any(String),
      name: "Imported strength plan",
      status: "draft",
    });
    const duplicate = await request(app)
      .post("/api/programs/import")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .set("Idempotency-Key", key)
      .send(importPayload());
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.id).toBe(created.body.id);
    const conflictingReplay = await request(app)
      .post("/api/programs/import")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .set("Idempotency-Key", key)
      .send(importPayload({ name: "Different import" }));
    expect(conflictingReplay.status).toBe(409);

    const templates = await database.query(
      "SELECT id, name FROM program_templates WHERE user_id = $1 ORDER BY name",
      [member.id],
    );
    expect(templates.rows).toEqual([
      { id: previousTemplateId, name: "Existing template" },
      { id: created.body.id, name: "Imported strength plan" },
    ]);
    const session = await database.query(
      "SELECT status FROM workout_sessions WHERE id = $1",
      [activeSessionId],
    );
    expect(session.rows).toEqual([{ status: "draft" }]);

    const imported = await database.query(
      `SELECT weeks.week_number, days.slot_number, days.day_type,
              exercises.exercise_id, exercises.prescription_snapshot,
              sets.set_type, sets.rep_min, sets.rep_max, sets.target_rir
       FROM program_weeks AS weeks
       JOIN program_days AS days ON days.user_id = weeks.user_id AND days.week_id = weeks.id
       LEFT JOIN program_day_exercises AS exercises
         ON exercises.user_id = days.user_id AND exercises.day_id = days.id
       LEFT JOIN program_sets AS sets
         ON sets.user_id = exercises.user_id AND sets.day_exercise_id = exercises.id
       WHERE weeks.template_id = $1
       ORDER BY days.slot_number, exercises.sort_order, sets.set_number`,
      [created.body.id],
    );
    expect(imported.rows).toHaveLength(7);
    expect(imported.rows[0]).toMatchObject({
      week_number: 1,
      slot_number: 1,
      day_type: "workout",
      exercise_id: knownExerciseId,
      set_type: "standard",
      rep_min: 5,
      rep_max: 8,
      target_rir: 2,
    });
    expect(imported.rows[0].prescription_snapshot).toMatchObject({
      notes: "",
      sourceRowNumber: 4,
    });
    expect(imported.rows[1]).toMatchObject({
      slot_number: 2,
      day_type: "rest",
    });
  });

  test("rejects unsafe structure, unresolved mappings, and empty workouts without writing", async () => {
    const cookie = await signIn();
    const unsafe = await request(app)
      .post("/api/programs/import")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .set("Idempotency-Key", randomUUID())
      .send(
        importPayload({
          source: makeCsv({ invalidRange: "5-8" })
            .split("\n")
            .slice(0, -1)
            .join("\n"),
        }),
      );
    expect(unsafe.status).toBe(400);
    expect(unsafe.body.errors.weekErrors).toEqual([
      expect.objectContaining({ code: "week_must_have_seven_slots" }),
    ]);

    const unresolved = await request(app)
      .post("/api/programs/import")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .set("Idempotency-Key", randomUUID())
      .send(
        importPayload({
          source: makeCsv({ unknownExercise: true, invalidRange: "5-8" }),
          skipRowNumbers: [],
          mappings: {},
        }),
      );
    expect(unresolved.status).toBe(400);
    expect(unresolved.body.error).toMatch(/mapping/i);

    const emptyAfterSkip = await request(app)
      .post("/api/programs/import")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .set("Idempotency-Key", randomUUID())
      .send(
        importPayload({
          source: makeCsv({ firstRange: "5-3" }),
          skipRowNumbers: [4, 5],
          mappings: { "Known lift": knownExerciseId },
        }),
      );
    expect(emptyAfterSkip.status).toBe(400);
    expect(emptyAfterSkip.body.errors.weekErrors).toEqual([
      expect.objectContaining({ code: "empty_workout" }),
    ]);

    const templates = await database.query(
      "SELECT id FROM program_templates WHERE user_id = $1",
      [member.id],
    );
    expect(templates.rows).toEqual([]);
  });

  test("rolls back all template rows when persistence fails", async () => {
    const cookie = await signIn();
    failProgramSetInsert = true;
    const failed = await request(app)
      .post("/api/programs/import")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .set("Idempotency-Key", randomUUID())
      .send(importPayload());

    expect(failed.status).toBe(500);
    const counts = await database.query(
      `SELECT
         (SELECT count(*)::int FROM program_templates WHERE user_id = $1) AS templates,
         (SELECT count(*)::int FROM program_weeks WHERE user_id = $1) AS weeks,
         (SELECT count(*)::int FROM program_days WHERE user_id = $1) AS days,
         (SELECT count(*)::int FROM program_import_requests WHERE user_id = $1) AS requests`,
      [member.id],
    );
    expect(counts.rows[0]).toEqual({
      templates: 0,
      weeks: 0,
      days: 0,
      requests: 0,
    });
  });

  test("requires one appended seven-slot deload before activating a program", async () => {
    const cookie = await signIn();
    const templateId = await createImportedProgram(cookie);

    const blocked = await request(app)
      .post(`/api/programs/${templateId}/activate`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ confirmed: true });
    expect(blocked.status).toBe(400);
    expect(blocked.body.errors).toMatchObject({ deload: "required" });

    for (const slotCount of [6, 8]) {
      const rejected = await request(app)
        .post(`/api/programs/${templateId}/deload`)
        .set("Origin", origin)
        .set("Cookie", cookie)
        .send({ days: makeDeloadDays(slotCount) });
      expect(rejected.status).toBe(400);
      expect(rejected.body.errors).toMatchObject({
        days: "exactly_seven_required",
      });
    }

    const allRest = await request(app)
      .post(`/api/programs/${templateId}/deload`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({
        days: Array.from({ length: 7 }, () => ({
          type: "rest",
          name: "Rest",
          exercises: [],
        })),
      });
    expect(allRest.status).toBe(400);
    expect(allRest.body.errors).toMatchObject({
      workouts: "at_least_one_required",
    });

    const unmappedDays = makeDeloadDays();
    unmappedDays[0].exercises[0].exerciseId = randomUUID();
    const unmapped = await request(app)
      .post(`/api/programs/${templateId}/deload`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ days: unmappedDays });
    expect(unmapped.status).toBe(400);
    expect(unmapped.body.errors.unresolvedMappings).toHaveLength(1);

    const configured = await request(app)
      .post(`/api/programs/${templateId}/deload`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ days: makeDeloadDays() });
    expect(configured.status).toBe(201);
    expect(configured.body).toMatchObject({
      weekNumber: 2,
      weekType: "deload",
    });
    const savedDeloadSet = await database.query(
      `SELECT sets.set_type, sets.rep_min, sets.rep_max, sets.target_rir
       FROM program_weeks AS weeks
       JOIN program_days AS days
         ON days.user_id = weeks.user_id AND days.week_id = weeks.id
       JOIN program_day_exercises AS exercises
         ON exercises.user_id = days.user_id AND exercises.day_id = days.id
       JOIN program_sets AS sets
         ON sets.user_id = exercises.user_id AND sets.day_exercise_id = exercises.id
       WHERE weeks.id = $1 AND days.slot_number = 1
       ORDER BY sets.set_number`,
      [configured.body.id],
    );
    expect(savedDeloadSet.rows).toEqual([
      { set_type: "standard", rep_min: 8, rep_max: 10, target_rir: 3 },
    ]);

    const activated = await request(app)
      .post(`/api/programs/${templateId}/activate`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ confirmed: true });
    expect(activated.status).toBe(201);
    expect(activated.body).toMatchObject({
      templateId,
      status: "active",
    });
    const runDays = await database.query(
      `SELECT weeks.week_number, weeks.week_type, count(days.id)::int AS slots
       FROM program_run_days AS run_days
       JOIN program_days AS days
         ON days.user_id = run_days.user_id AND days.id = run_days.template_day_id
       JOIN program_weeks AS weeks
         ON weeks.user_id = days.user_id AND weeks.id = days.week_id
       WHERE run_days.run_id = $1
       GROUP BY weeks.week_number, weeks.week_type
       ORDER BY weeks.week_number`,
      [activated.body.id],
    );
    expect(runDays.rows).toEqual([
      { week_number: 1, week_type: "training", slots: 7 },
      { week_number: 2, week_type: "deload", slots: 7 },
    ]);
  });

  test("edits unresolved future days without changing resolved or in-session days", async () => {
    const cookie = await signIn();
    const templateId = await createImportedProgram(cookie);
    const deload = await request(app)
      .post(`/api/programs/${templateId}/deload`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ days: makeDeloadDays() });
    expect(deload.status).toBe(201);

    const detail = await request(app)
      .get(`/api/programs/${templateId}`)
      .set("Cookie", cookie);
    expect(detail.status).toBe(200);
    const trainingDay = detail.body.weeks[0].days[0];
    const futureEdit = {
      type: "workout",
      name: trainingDay.name,
      exercises: [
        {
          exerciseId: knownExerciseId,
          notes: "Updated future prescription",
          sets: [
            { type: "standard", repMin: 6, repMax: 8, rir: 2 },
            { type: "warmup", repMin: 3, repMax: 3, rir: 4 },
          ],
        },
      ],
    };
    const changedDay = await request(app)
      .put(`/api/programs/${templateId}/days/${trainingDay.id}`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send(futureEdit);
    expect(changedDay.status).toBe(200);
    expect(changedDay.body.exercises[0].sets).toMatchObject([
      { type: "standard", repMin: 6, repMax: 8, rir: 2 },
      { type: "warmup", repMin: 3, repMax: 3, rir: 4 },
    ]);

    const activated = await request(app)
      .post(`/api/programs/${templateId}/activate`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ confirmed: true });
    expect(activated.status).toBe(201);
    await database.query(
      `UPDATE program_run_days SET status = 'completed', resolved_at = now()
       WHERE run_id = $1 AND week_number = 1 AND slot_number = 1`,
      [activated.body.id],
    );

    const resolvedEdit = await request(app)
      .put(`/api/programs/${templateId}/days/${trainingDay.id}`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send(futureEdit);
    expect(resolvedEdit.status).toBe(409);
    expect(resolvedEdit.body.error).toMatch(/future program days/i);

    const inProgressDay = await database.query(
      "SELECT id FROM program_run_days WHERE run_id = $1 AND slot_number = 4",
      [activated.body.id],
    );
    const sessionId = randomUUID();
    const sessionExerciseId = randomUUID();
    await database.query(
      `INSERT INTO workout_sessions
         (id, user_id, program_run_id, program_run_day_id, started_local_date)
       VALUES ($1, $2, $3, $4, '2026-10-22')`,
      [sessionId, member.id, activated.body.id, inProgressDay.rows[0].id],
    );
    await database.query(
      `INSERT INTO session_exercises
         (id, user_id, session_id, exercise_id, name_snapshot, prescription_snapshot)
       VALUES ($1, $2, $3, $4, 'Known lift', $5::jsonb)`,
      [
        sessionExerciseId,
        member.id,
        sessionId,
        knownExerciseId,
        JSON.stringify({ sets: [{ repMin: 5, repMax: 8, rir: 2 }] }),
      ],
    );
    const inProgressEdit = await request(app)
      .put(
        `/api/programs/${templateId}/days/${detail.body.weeks[0].days[3].id}`,
      )
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send(futureEdit);
    expect(inProgressEdit.status).toBe(409);
    const snapshot = await database.query(
      "SELECT prescription_snapshot FROM session_exercises WHERE id = $1",
      [sessionExerciseId],
    );
    expect(snapshot.rows[0].prescription_snapshot).toEqual({
      sets: [{ repMin: 5, repMax: 8, rir: 2 }],
    });
  });

  test("blocks activation when a week has no workouts", async () => {
    const cookie = await signIn();
    const templateId = await createImportedProgram(cookie);
    const deload = await request(app)
      .post(`/api/programs/${templateId}/deload`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ days: makeDeloadDays() });
    expect(deload.status).toBe(201);
    await database.query(
      `UPDATE program_days SET day_type = 'rest', name = 'Rest'
       WHERE week_id IN (SELECT id FROM program_weeks WHERE template_id = $1)`,
      [templateId],
    );

    const activated = await request(app)
      .post(`/api/programs/${templateId}/activate`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ confirmed: true });
    expect(activated.status).toBe(400);
    expect(activated.body.errors).toMatchObject({
      workouts: "at_least_one_required",
    });
    const runs = await database.query(
      "SELECT id FROM program_runs WHERE user_id = $1",
      [member.id],
    );
    expect(runs.rows).toEqual([]);
  });

  test("returns the user's active run and its flexible slot state", async () => {
    const cookie = await signIn();
    const { templateId, runId } = await createReadyProgram(cookie);

    const current = await request(app)
      .get("/api/program-runs/current")
      .set("Cookie", cookie);

    expect(current.status).toBe(200);
    expect(current.body).toMatchObject({
      id: runId,
      templateId,
      status: "active",
      currentWeekNumber: 1,
    });
    expect(current.body.week.weekNumber).toBe(1);
    expect(current.body.week.weekType).toBe("training");
    expect(current.body.week.days).toHaveLength(7);
    expect(current.body.week.days[0]).toMatchObject({
      slotNumber: 1,
      type: "workout",
      status: "pending",
    });
    expect(current.body.week.days[1]).toMatchObject({
      slotNumber: 2,
      type: "rest",
      status: "pending",
    });
  });

  test("serves every API response required to open an active workout detail", async () => {
    const cookie = await signIn();
    const { templateId, runId } = await createReadyProgram(cookie);

    const [current, program, catalog] = await Promise.all([
      request(app).get("/api/program-runs/current").set("Cookie", cookie),
      request(app).get(`/api/programs/${templateId}`).set("Cookie", cookie),
      request(app).get("/api/catalog/exercises").set("Cookie", cookie),
    ]);

    expect(current.status).toBe(200);
    expect(current.body).toMatchObject({ id: runId, templateId });
    expect(program.status).toBe(200);
    const currentWorkout = program.body.weeks
      .flatMap((week) => week.days)
      .find((day) => day.id === current.body.week.days[0].templateDayId);
    expect(currentWorkout).toMatchObject({
      type: "workout",
      exercises: [
        {
          name: "Known lift",
          sets: [{ type: "standard", repMin: 5, repMax: 8, rir: 2 }],
        },
      ],
    });
    expect(catalog.status).toBe(200);
    expect(catalog.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: knownExerciseId }),
      ]),
    );
  });

  test("starts and replays one timezone-stamped session with prescription snapshots", async () => {
    const cookie = await signIn();
    const { runId } = await createReadyProgram(cookie);
    const {
      rows: [clock],
    } = await database.query(
      `SELECT extract(hour FROM now() AT TIME ZONE 'UTC')::int AS utc_hour`,
    );
    const timezone = clock.utc_hour < 10 ? "Etc/GMT+12" : "Pacific/Kiritimati";
    await database.query(
      "UPDATE profiles SET timezone = $2 WHERE user_id = $1",
      [member.id, timezone],
    );
    const {
      rows: [day],
    } = await database.query(
      `SELECT id FROM program_run_days
       WHERE user_id = $1 AND run_id = $2 AND day_type = 'workout'
         AND status = 'pending' ORDER BY week_number, slot_number LIMIT 1`,
      [member.id, runId],
    );
    const key = randomUUID();
    const start = () =>
      request(app)
        .post("/api/workout-sessions/start")
        .set("Origin", origin)
        .set("Cookie", cookie)
        .set("Idempotency-Key", key)
        .send({ runId, runDayId: day.id });

    const first = await start();
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      status: "draft",
      version: 1,
      startedTimezone: timezone,
      exercises: [
        {
          name: "Known lift",
          prescription: {
            sets: [{ type: "standard", repMin: 5, repMax: 8, targetRir: 2 }],
          },
        },
      ],
    });

    const replay = await start();
    expect(replay.status).toBe(200);
    expect(replay.body.id).toBe(first.body.id);
    expect(replay.body.replayed).toBe(true);
    const persisted = await database.query(
      `SELECT sessions.started_timezone, sessions.started_local_date,
              count(DISTINCT exercises.id)::int AS exercise_count,
              count(sets.id)::int AS set_count
       FROM workout_sessions AS sessions
       LEFT JOIN session_exercises AS exercises
         ON exercises.user_id = sessions.user_id AND exercises.session_id = sessions.id
       LEFT JOIN session_sets AS sets
         ON sets.user_id = exercises.user_id AND sets.session_exercise_id = exercises.id
       WHERE sessions.id = $1
       GROUP BY sessions.id`,
      [first.body.id],
    );
    expect(persisted.rows[0]).toMatchObject({
      started_timezone: timezone,
      exercise_count: 1,
      set_count: 1,
    });
    const {
      rows: [expectedDate],
    } = await database.query(
      `SELECT to_char((now() AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS local_date,
              to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS utc_date`,
      [timezone],
    );
    expect(first.body.startedLocalDate).toBe(expectedDate.local_date);
    expect(first.body.startedLocalDate).not.toBe(expectedDate.utc_date);
  });

  test("snapshots repeated catalog exercises as separate ordered positions", async () => {
    const cookie = await signIn();
    const { runId } = await createReadyProgram(cookie);
    const {
      rows: [day],
    } = await database.query(
      `SELECT run_days.id, run_days.template_day_id
       FROM program_run_days AS run_days
       WHERE run_days.user_id = $1 AND run_days.run_id = $2
         AND run_days.day_type = 'workout'
       ORDER BY run_days.week_number, run_days.slot_number LIMIT 1`,
      [member.id, runId],
    );
    const {
      rows: [original],
    } = await database.query(
      `SELECT id, exercise_id, prescription_snapshot
       FROM program_day_exercises
       WHERE user_id = $1 AND day_id = $2 ORDER BY sort_order LIMIT 1`,
      [member.id, day.template_day_id],
    );
    const duplicateExerciseId = randomUUID();
    await database.query(
      `INSERT INTO program_day_exercises
         (id, user_id, day_id, exercise_id, sort_order, prescription_snapshot)
       VALUES ($1, $2, $3, $4, 2, $5)`,
      [
        duplicateExerciseId,
        member.id,
        day.template_day_id,
        original.exercise_id,
        original.prescription_snapshot,
      ],
    );
    await database.query(
      `INSERT INTO program_sets
         (user_id, day_exercise_id, set_number, set_type, rep_min, rep_max, target_rir)
       SELECT user_id, $1, set_number, set_type, rep_min, rep_max, target_rir
       FROM program_sets WHERE user_id = $2 AND day_exercise_id = $3`,
      [duplicateExerciseId, member.id, original.id],
    );
    const started = await request(app)
      .post("/api/workout-sessions/start")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .set("Idempotency-Key", randomUUID())
      .send({ runId, runDayId: day.id });

    expect(started.status).toBe(201);
    expect(started.body.exercises).toHaveLength(2);
    expect(
      started.body.exercises.map((exercise) => exercise.snapshot.sortOrder),
    ).toEqual([1, 2]);
    expect(
      started.body.exercises.map((exercise) => exercise.sets),
    ).toHaveLength(2);
    expect(started.body.exercises.map((exercise) => exercise.sets)).toEqual([
      [expect.objectContaining({ setNumber: 1 })],
      [expect.objectContaining({ setNumber: 1 })],
    ]);
  });

  test("blocks starting or finalizing a second performance on the local start date", async () => {
    const cookie = await signIn();
    const { runId } = await createReadyProgram(cookie);
    const {
      rows: [workoutDay],
    } = await database.query(
      `SELECT id FROM program_run_days
       WHERE user_id = $1 AND run_id = $2 AND day_type = 'workout'
         AND status = 'pending' ORDER BY week_number, slot_number LIMIT 1`,
      [member.id, runId],
    );
    await database.query(
      `INSERT INTO workout_sessions
         (user_id, status, has_performance, started_timezone, started_local_date,
          finished_at)
       SELECT $1, 'completed', true, profiles.timezone,
              (now() AT TIME ZONE profiles.timezone)::date, now()
       FROM profiles WHERE profiles.user_id = $1`,
      [member.id],
    );

    const blockedStart = await request(app)
      .post("/api/workout-sessions/start")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .set("Idempotency-Key", randomUUID())
      .send({ runId, runDayId: workoutDay.id });
    expect(blockedStart.status).toBe(409);

    await database.query(
      `DELETE FROM workout_sessions
       WHERE user_id = $1 AND status = 'completed' AND has_performance`,
      [member.id],
    );
    const started = await request(app)
      .post("/api/workout-sessions/start")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .set("Idempotency-Key", randomUUID())
      .send({ runId, runDayId: workoutDay.id });
    expect(started.status).toBe(201);
    await database.query(
      `INSERT INTO workout_sessions
         (user_id, status, has_performance, started_timezone, started_local_date,
          finished_at)
       SELECT $1, 'partial', true, $2, started_local_date, now()
       FROM workout_sessions WHERE id = $3`,
      [member.id, started.body.startedTimezone, started.body.id],
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const eligibility = await recheckWorkoutSessionEligibility(client, {
        userId: member.id,
        sessionId: started.body.id,
      });
      expect(eligibility.statusCode).toBe(409);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  test("serializes concurrent starts and resumes the same active draft", async () => {
    const cookie = await signIn();
    const { runId } = await createReadyProgram(cookie);
    const {
      rows: [day],
    } = await database.query(
      `SELECT id FROM program_run_days
       WHERE user_id = $1 AND run_id = $2 AND day_type = 'workout'
         AND status = 'pending' ORDER BY week_number, slot_number LIMIT 1`,
      [member.id, runId],
    );
    const start = (key) =>
      request(app)
        .post("/api/workout-sessions/start")
        .set("Origin", origin)
        .set("Cookie", cookie)
        .set("Idempotency-Key", key)
        .send({ runId, runDayId: day.id });

    const [first, second] = await Promise.all([
      start(randomUUID()),
      start(randomUUID()),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 201]);
    expect(first.body.id).toBe(second.body.id);
    expect(second.body.status).toBe("draft");
    const sessions = await database.query(
      "SELECT id FROM workout_sessions WHERE user_id = $1 AND status = 'draft'",
      [member.id],
    );
    expect(sessions.rows).toHaveLength(1);
  });

  test("replays acknowledged set saves, rejects stale versions, and excludes finished drafts", async () => {
    const cookie = await signIn();
    const { runId } = await createReadyProgram(cookie);
    const {
      rows: [day],
    } = await database.query(
      `SELECT id FROM program_run_days
       WHERE user_id = $1 AND run_id = $2 AND day_type = 'workout'
         AND status = 'pending' ORDER BY week_number, slot_number LIMIT 1`,
      [member.id, runId],
    );
    const started = await request(app)
      .post("/api/workout-sessions/start")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .set("Idempotency-Key", randomUUID())
      .send({ runId, runDayId: day.id });
    expect(started.status).toBe(201);
    const setId = started.body.exercises[0].sets[0].id;
    const saveBody = {
      version: 1,
      sets: [{ id: setId, actualLoadKg: 42.5, actualReps: 6, actualRir: 2 }],
    };
    const saveKey = randomUUID();
    const save = () =>
      request(app)
        .put(`/api/workout-sessions/${started.body.id}`)
        .set("Origin", origin)
        .set("Cookie", cookie)
        .set("Idempotency-Key", saveKey)
        .send(saveBody);

    const acknowledged = await save();
    expect(acknowledged.status).toBe(200);
    expect(acknowledged.body).toMatchObject({
      version: 2,
      exercises: [
        {
          sets: [
            {
              actualLoadKg: "42.500",
              actualReps: 6,
              actualRir: 2,
              checked: true,
            },
          ],
        },
      ],
    });
    const replay = await save();
    expect(replay.status).toBe(200);
    expect(replay.body.version).toBe(2);
    expect(replay.body.replayed).toBe(true);

    const stale = await request(app)
      .put(`/api/workout-sessions/${started.body.id}`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .set("Idempotency-Key", randomUUID())
      .send({ ...saveBody, version: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.currentVersion).toBe(2);

    const changedReplay = await request(app)
      .put(`/api/workout-sessions/${started.body.id}`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .set("Idempotency-Key", saveKey)
      .send({
        ...saveBody,
        sets: [{ ...saveBody.sets[0], actualReps: 7 }],
      });
    expect(changedReplay.status).toBe(409);

    const recovered = await request(app)
      .get("/api/workout-sessions/active")
      .set("Cookie", cookie);
    expect(recovered.status).toBe(200);
    expect(recovered.body.id).toBe(started.body.id);
    expect(recovered.body.exercises[0].sets[0].actualReps).toBe(6);

    await database.query(
      `UPDATE workout_sessions
       SET status = 'completed', has_performance = true, finished_at = now()
       WHERE user_id = $1 AND id = $2`,
      [member.id, started.body.id],
    );
    const noLongerActive = await request(app)
      .get("/api/workout-sessions/active")
      .set("Cookie", cookie);
    expect(noLongerActive.body).toBeNull();
    const finishedDraft = await request(app)
      .get(`/api/workout-sessions/${started.body.id}`)
      .set("Cookie", cookie);
    expect(finishedDraft.status).toBe(404);

    const other = await createAccount("other@example.test");
    const otherCookie = await signIn(other);
    const hidden = await request(app)
      .get(`/api/workout-sessions/${started.body.id}`)
      .set("Cookie", otherCookie);
    expect(hidden.status).toBe(404);
  });

  test("supports explicit check state and set type edits while enforcing failure RIR", async () => {
    const cookie = await signIn();
    const { runId } = await createReadyProgram(cookie);
    const {
      rows: [day],
    } = await database.query(
      `SELECT id FROM program_run_days
       WHERE user_id = $1 AND run_id = $2 AND day_type = 'workout'
         AND status = 'pending' ORDER BY week_number, slot_number LIMIT 1`,
      [member.id, runId],
    );
    const started = await request(app)
      .post("/api/workout-sessions/start")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .set("Idempotency-Key", randomUUID())
      .send({ runId, runDayId: day.id });
    expect(started.status).toBe(201);
    const setId = started.body.exercises[0].sets[0].id;

    const unchecked = await request(app)
      .put(`/api/workout-sessions/${started.body.id}`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .set("Idempotency-Key", randomUUID())
      .send({
        version: 1,
        sets: [
          {
            id: setId,
            type: "warmup",
            actualLoadKg: 35,
            actualReps: 8,
            actualRir: 4,
            checked: false,
          },
        ],
      });
    expect(unchecked.status).toBe(200);
    expect(unchecked.body.exercises[0].sets[0]).toMatchObject({
      type: "warmup",
      checked: false,
      actualLoadKg: "35.000",
      actualReps: 8,
      actualRir: 4,
    });

    const checkedFailure = await request(app)
      .put(`/api/workout-sessions/${started.body.id}`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .set("Idempotency-Key", randomUUID())
      .send({
        version: 2,
        sets: [
          {
            id: setId,
            type: "failure",
            actualLoadKg: 40,
            actualReps: 10,
            actualRir: 0,
            checked: true,
          },
        ],
      });
    expect(checkedFailure.status).toBe(200);
    expect(checkedFailure.body.exercises[0].sets[0]).toMatchObject({
      type: "failure",
      checked: true,
      actualLoadKg: "40.000",
      actualReps: 10,
      actualRir: 0,
    });

    const invalidFailure = await request(app)
      .put(`/api/workout-sessions/${started.body.id}`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .set("Idempotency-Key", randomUUID())
      .send({
        version: 3,
        sets: [
          {
            id: setId,
            type: "failure",
            actualLoadKg: 42.5,
            actualReps: 8,
            actualRir: 1,
            checked: true,
          },
        ],
      });
    expect(invalidFailure.status).toBe(400);
    expect(invalidFailure.body.error).toMatch(
      /failure sets require actual rir 0/i,
    );
  });

  test("persists skipped exercise state independently from set rows", async () => {
    const cookie = await signIn();
    const { runId } = await createReadyProgram(cookie);
    const {
      rows: [day],
    } = await database.query(
      `SELECT id FROM program_run_days
       WHERE user_id = $1 AND run_id = $2 AND day_type = 'workout'
         AND status = 'pending' ORDER BY week_number, slot_number LIMIT 1`,
      [member.id, runId],
    );
    const started = await request(app)
      .post("/api/workout-sessions/start")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .set("Idempotency-Key", randomUUID())
      .send({ runId, runDayId: day.id });
    expect(started.status).toBe(201);
    const setId = started.body.exercises[0].sets[0].id;
    const firstExerciseId = started.body.exercises[0].id;

    const skipped = await request(app)
      .put(`/api/workout-sessions/${started.body.id}`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .set("Idempotency-Key", randomUUID())
      .send({
        version: 1,
        sets: [
          {
            id: setId,
            type: "standard",
            actualLoadKg: 40,
            actualReps: 6,
            actualRir: 2,
            checked: true,
          },
        ],
        exerciseStates: [{ id: firstExerciseId, skipped: true }],
      });

    expect(skipped.status).toBe(200);
    expect(skipped.body.exercises[0]).toMatchObject({ skipped: true });

    const restored = await request(app)
      .put(`/api/workout-sessions/${started.body.id}`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .set("Idempotency-Key", randomUUID())
      .send({
        version: 2,
        sets: [
          {
            id: setId,
            type: "standard",
            actualLoadKg: 40,
            actualReps: 6,
            actualRir: 2,
            checked: true,
          },
        ],
        exerciseStates: [{ id: firstExerciseId, skipped: false }],
      });
    expect(restored.status).toBe(200);
    expect(restored.body.exercises[0]).toMatchObject({ skipped: false });
  });

  test("rejects ineligible run slots and rechecks eligibility for finalization", async () => {
    const cookie = await signIn();
    const { runId } = await createReadyProgram(cookie);
    const {
      rows: [workoutDay],
    } = await database.query(
      `SELECT id FROM program_run_days
       WHERE user_id = $1 AND run_id = $2 AND day_type = 'workout'
         AND status = 'pending' ORDER BY week_number, slot_number LIMIT 1`,
      [member.id, runId],
    );
    const {
      rows: [restDay],
    } = await database.query(
      `SELECT id FROM program_run_days
       WHERE user_id = $1 AND run_id = $2 AND day_type = 'rest'
         AND status = 'pending' ORDER BY week_number, slot_number LIMIT 1`,
      [member.id, runId],
    );
    const ineligible = await request(app)
      .post("/api/workout-sessions/start")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .set("Idempotency-Key", randomUUID())
      .send({ runId, runDayId: restDay.id });
    expect(ineligible.status).toBe(409);

    const started = await request(app)
      .post("/api/workout-sessions/start")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .set("Idempotency-Key", randomUUID())
      .send({ runId, runDayId: workoutDay.id });
    expect(started.status).toBe(201);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const eligible = await recheckWorkoutSessionEligibility(client, {
        userId: member.id,
        sessionId: started.body.id,
      });
      expect(eligible.statusCode).toBe(200);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    await database.query(
      "UPDATE program_run_days SET status = 'completed' WHERE id = $1",
      [workoutDay.id],
    );
    const staleClient = await pool.connect();
    try {
      await staleClient.query("BEGIN");
      const staleEligibility = await recheckWorkoutSessionEligibility(
        staleClient,
        {
          userId: member.id,
          sessionId: started.body.id,
        },
      );
      expect(staleEligibility.statusCode).toBe(409);
      await staleClient.query("ROLLBACK");
    } finally {
      staleClient.release();
    }
  });

  test("keeps pending run slots aligned with future day-type edits", async () => {
    const cookie = await signIn();
    const { templateId, runId } = await createReadyProgram(cookie);
    const program = await request(app)
      .get(`/api/programs/${templateId}`)
      .set("Cookie", cookie);
    const restDay = program.body.weeks[0].days[1];
    const changedDay = await request(app)
      .put(`/api/programs/${templateId}/days/${restDay.id}`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({
        type: "workout",
        name: "Added workout",
        exercises: [
          {
            exerciseId: knownExerciseId,
            sets: [{ type: "standard", repMin: 5, repMax: 8, rir: 2 }],
          },
        ],
      });
    expect(changedDay.status).toBe(200);

    const current = await request(app)
      .get("/api/program-runs/current")
      .set("Cookie", cookie);
    expect(current.body.week.days[1].type).toBe("workout");
    expect(
      (await resolveWorkoutSlot(runId, current.body.week.days[1].id))
        .statusCode,
    ).toBe(200);
  });

  test("resolves current-week slots out of order and prevents repeat or rewind", async () => {
    const cookie = await signIn();
    const { runId } = await createReadyProgram(cookie);
    const current = await request(app)
      .get("/api/program-runs/current")
      .set("Cookie", cookie);
    const slots = current.body.week.days;
    const resolveRest = (day, checked) =>
      request(app)
        .post(`/api/program-runs/${runId}/days/${day.id}/rest`)
        .set("Origin", origin)
        .set("Cookie", cookie)
        .send({ checked });

    const concurrentResolutions = await Promise.all([
      resolveRest(slots[6], true),
      resolveRest(slots[6], true),
    ]);
    expect(concurrentResolutions.map(({ status }) => status).sort()).toEqual([
      200, 409,
    ]);
    expect((await resolveRest(slots[1], true)).status).toBe(200);
    expect((await resolveRest(slots[1], false)).status).toBe(200);
    expect((await resolveRest(slots[1], true)).status).toBe(200);
    expect(
      (await resolveWorkoutSlot(runId, slots[2].id, "partial")).statusCode,
    ).toBe(200);
    expect(
      (await resolveWorkoutSlot(runId, slots[0].id, "completed")).statusCode,
    ).toBe(200);
    expect((await resolveRest(slots[1], true)).status).toBe(409);
    for (const slot of slots.slice(3, 6)) {
      expect((await resolveRest(slot, true)).status).toBe(200);
    }

    const advanced = await request(app)
      .get("/api/program-runs/current")
      .set("Cookie", cookie);
    expect(advanced.body.currentWeekNumber).toBe(2);
    expect(advanced.body.week.weekType).toBe("deload");
    expect(advanced.body.week.days).toHaveLength(7);
    expect(
      advanced.body.week.days.every((day) => day.status === "pending"),
    ).toBe(true);
    expect((await resolveRest(slots[6], false)).status).toBe(409);
  });

  test.each([1, 2, 3, 4, 5, 6, 7])(
    "advances when slot %i is the final resolved slot",
    async (finalSlotNumber) => {
      const cookie = await signIn();
      const { runId } = await createReadyProgram(cookie);
      const current = await request(app)
        .get("/api/program-runs/current")
        .set("Cookie", cookie);
      const days = current.body.week.days;
      const finalDay = days.find((day) => day.slotNumber === finalSlotNumber);

      for (const day of days.filter(({ id }) => id !== finalDay.id)) {
        if (day.type === "workout") {
          expect(
            (await resolveWorkoutSlot(runId, day.id, "partial")).statusCode,
          ).toBe(200);
        } else {
          const resolved = await request(app)
            .post(`/api/program-runs/${runId}/days/${day.id}/rest`)
            .set("Origin", origin)
            .set("Cookie", cookie)
            .send({ checked: true });
          expect(resolved.status).toBe(200);
        }
      }

      if (finalDay.type === "workout") {
        expect(
          (await resolveWorkoutSlot(runId, finalDay.id, "completed"))
            .statusCode,
        ).toBe(200);
      } else {
        const resolved = await request(app)
          .post(`/api/program-runs/${runId}/days/${finalDay.id}/rest`)
          .set("Origin", origin)
          .set("Cookie", cookie)
          .send({ checked: true });
        expect(resolved.status).toBe(200);
      }
      const advanced = await request(app)
        .get("/api/program-runs/current")
        .set("Cookie", cookie);
      expect(advanced.body.currentWeekNumber).toBe(2);
    },
  );

  test("finishes after the final deload and restarts as fresh preserved runs", async () => {
    const cookie = await signIn();
    const { runId } = await createReadyProgram(cookie);
    await resolveWeek(cookie, runId, 1);
    await resolveWeek(cookie, runId, 2);

    const finished = await database.query(
      "SELECT status, ended_at FROM program_runs WHERE id = $1",
      [runId],
    );
    expect(finished.rows[0].status).toBe("completed");
    expect(finished.rows[0].ended_at).not.toBeNull();
    const current = await request(app)
      .get("/api/program-runs/current")
      .set("Cookie", cookie);
    expect(current.body).toBeNull();

    let previousRunId = runId;
    for (let index = 0; index < 2; index += 1) {
      const restarted = await request(app)
        .post(`/api/program-runs/${previousRunId}/restart`)
        .set("Origin", origin)
        .set("Cookie", cookie)
        .send({ confirmed: true });
      expect(restarted.status).toBe(201);
      expect(restarted.body.id).not.toBe(previousRunId);
      const freshDays = await database.query(
        `SELECT week_number, status FROM program_run_days
         WHERE run_id = $1 ORDER BY week_number, slot_number`,
        [restarted.body.id],
      );
      expect(freshDays.rows).toHaveLength(14);
      expect(freshDays.rows.every((day) => day.status === "pending")).toBe(
        true,
      );
      const originalDays = await database.query(
        "SELECT count(*)::int AS count FROM program_run_days WHERE run_id = $1",
        [runId],
      );
      expect(originalDays.rows[0].count).toBe(14);
      previousRunId = restarted.body.id;
      await resolveWeek(cookie, previousRunId, 1);
      await resolveWeek(cookie, previousRunId, 2);
    }
    const runCount = await database.query(
      "SELECT count(*)::int AS count FROM program_runs WHERE user_id = $1",
      [member.id],
    );
    expect(runCount.rows[0].count).toBe(3);
  });

  test("stops a program without losing prior run state and permits restart edits", async () => {
    const cookie = await signIn();
    const { templateId, runId } = await createReadyProgram(cookie);
    const unconfirmed = await request(app)
      .post(`/api/program-runs/${runId}/stop`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({});
    expect(unconfirmed.status).toBe(400);

    const stopped = await request(app)
      .post(`/api/program-runs/${runId}/stop`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ confirmed: true });
    expect(stopped.status).toBe(200);
    const retained = await database.query(
      `SELECT runs.status, count(days.id)::int AS slot_count
       FROM program_runs AS runs JOIN program_run_days AS days
         ON days.user_id = runs.user_id AND days.run_id = runs.id
       WHERE runs.id = $1 GROUP BY runs.status`,
      [runId],
    );
    expect(retained.rows).toEqual([{ status: "stopped", slot_count: 14 }]);

    const restarted = await request(app)
      .post(`/api/program-runs/${runId}/restart`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ confirmed: true });
    expect(restarted.status).toBe(201);

    const program = await request(app)
      .get(`/api/programs/${templateId}`)
      .set("Cookie", cookie);
    const restDay = program.body.weeks[0].days[1];
    const changedRest = await request(app)
      .put(`/api/programs/${templateId}/days/${restDay.id}`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({
        type: "workout",
        name: "Changed after stop",
        exercises: [
          {
            exerciseId: knownExerciseId,
            sets: [{ type: "standard", repMin: 5, repMax: 8, rir: 2 }],
          },
        ],
      });
    expect(changedRest.status).toBe(200);
    const priorDay = await database.query(
      `SELECT day_type, status FROM program_run_days
       WHERE run_id = $1 AND week_number = 1 AND slot_number = 2`,
      [runId],
    );
    expect(priorDay.rows).toEqual([{ day_type: "rest", status: "pending" }]);
    const restartedDay = await database.query(
      `SELECT day_type, status FROM program_run_days
       WHERE run_id = $1 AND week_number = 1 AND slot_number = 2`,
      [restarted.body.id],
    );
    expect(restartedDay.rows).toEqual([
      { day_type: "workout", status: "pending" },
    ]);
  });

  test("replaces an active run only explicitly and preserves its progression", async () => {
    const cookie = await signIn();
    const previous = await createReadyProgram(cookie);
    const nextTemplateId = await createImportedProgram(cookie);
    const deload = await request(app)
      .post(`/api/programs/${nextTemplateId}/deload`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ days: makeDeloadDays() });
    expect(deload.status).toBe(201);
    const previousCurrent = await request(app)
      .get("/api/program-runs/current")
      .set("Cookie", cookie);
    const firstRest = previousCurrent.body.week.days[1];
    const resolved = await request(app)
      .post(`/api/program-runs/${previous.runId}/days/${firstRest.id}/rest`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ checked: true });
    expect(resolved.status).toBe(200);

    const activeDraft = await database.query(
      `INSERT INTO workout_sessions (user_id, started_local_date)
       VALUES ($1, '2026-10-23') RETURNING id`,
      [member.id],
    );

    const unconfirmed = await request(app)
      .post(`/api/programs/${nextTemplateId}/activate`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ confirmed: true });
    expect(unconfirmed.status).toBe(409);
    const replacement = await request(app)
      .post(`/api/programs/${nextTemplateId}/activate`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ confirmed: true, replaceActive: true });
    expect(replacement.status).toBe(409);
    await database.query(
      "UPDATE workout_sessions SET status = 'discarded' WHERE id = $1",
      [activeDraft.rows[0].id],
    );
    const replaced = await request(app)
      .post(`/api/programs/${nextTemplateId}/activate`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ confirmed: true, replaceActive: true });
    expect(replaced.status).toBe(201);
    expect(replaced.body.templateId).toBe(nextTemplateId);
    const previousState = await database.query(
      `SELECT runs.status, days.status AS day_status,
              count(all_days.id)::int AS total_days
       FROM program_runs AS runs
       JOIN program_run_days AS days
         ON days.run_id = runs.id AND days.week_number = 1 AND days.slot_number = 2
       JOIN program_run_days AS all_days ON all_days.run_id = runs.id
       WHERE runs.id = $1 GROUP BY runs.status, days.status`,
      [previous.runId],
    );
    expect(previousState.rows).toEqual([
      { status: "stopped", day_status: "rest_done", total_days: 14 },
    ]);
  });
});
