import { randomUUID } from "node:crypto";
import request from "supertest";
import { PGlite } from "@electric-sql/pglite";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/auth/index.js";
import { runMigrations } from "../src/persistence/migrate.js";

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
});
