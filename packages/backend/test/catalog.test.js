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

describe("WT-008 shared exercise catalog", () => {
  let database;
  let pool;
  let app;
  let member;
  let admin;

  beforeEach(async () => {
    database = new PGlite();
    pool = {
      async connect() {
        return {
          async query(statement, parameters) {
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
    member = await createAccount("member@example.test", "member");
    admin = await createAccount("admin@example.test", "admin");
    app = createApp({ pool, allowedOrigins: [origin], cookieSecure: false });
  });

  afterEach(async () => {
    await database.close();
  });

  async function createAccount(email, role) {
    const id = randomUUID();
    await database.query(
      "INSERT INTO users (id, email, role, password_hash) VALUES ($1, $2, $3, $4)",
      [id, email, role, await hashPassword("CorrectHorse!23")],
    );
    await database.query(
      "INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)",
      [id, email.split("@")[0]],
    );
    return { id, email, password: "CorrectHorse!23" };
  }

  async function signIn(account) {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({ email: account.email, password: account.password });
    return response.headers["set-cookie"][0].split(";")[0];
  }

  function catalogEntry(overrides = {}) {
    return {
      name: "Barbell squat",
      equipment: "barbell",
      image: {
        url: "https://assets.example.test/squat.jpg",
        altText: "Development placeholder for a barbell squat",
        credit: "Unverified development placeholder",
        license: "Unverified development placeholder",
      },
      muscles: {
        primary: ["quadriceps"],
        secondary: ["gluteus maximus"],
        tertiary: [],
      },
      loadType: "external",
      restCategory: "lower_compound",
      dumbbellCount: null,
      sideCount: 2,
      bodyweightFactor: null,
      assistanceRatio: null,
      ...overrides,
    };
  }

  test("requires admin authorization to create catalog entries", async () => {
    const unauthenticated = await request(app)
      .post("/api/admin/catalog/exercises")
      .set("Origin", origin)
      .send(catalogEntry());
    expect(unauthenticated.status).toBe(401);

    const memberCookie = await signIn(member);
    const denied = await request(app)
      .post("/api/admin/catalog/exercises")
      .set("Origin", origin)
      .set("Cookie", memberCookie)
      .send(catalogEntry());
    expect(denied.status).toBe(403);
  });

  test("creates and reads validated catalog metadata without inventing factors", async () => {
    const adminCookie = await signIn(admin);
    const created = await request(app)
      .post("/api/admin/catalog/exercises")
      .set("Origin", origin)
      .set("Cookie", adminCookie)
      .send(catalogEntry());

    expect(created.status).toBe(201);
    expect(created.body).toEqual({
      id: expect.any(String),
      ...catalogEntry(),
    });

    const memberCookie = await signIn(member);
    const listed = await request(app)
      .get("/api/catalog/exercises")
      .set("Cookie", memberCookie);
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual([created.body]);
    expect(listed.body[0].bodyweightFactor).toBeNull();
    expect(listed.body[0].assistanceRatio).toBeNull();
  });

  test("rejects invalid metadata and duplicate names instead of merging variants", async () => {
    const adminCookie = await signIn(admin);
    const invalid = await request(app)
      .post("/api/admin/catalog/exercises")
      .set("Origin", origin)
      .set("Cookie", adminCookie)
      .send(catalogEntry({ loadType: "machine" }));
    expect(invalid.status).toBe(400);

    const first = await request(app)
      .post("/api/admin/catalog/exercises")
      .set("Origin", origin)
      .set("Cookie", adminCookie)
      .send(catalogEntry());
    const duplicate = await request(app)
      .post("/api/admin/catalog/exercises")
      .set("Origin", origin)
      .set("Cookie", adminCookie)
      .send(catalogEntry({ name: "barbell squat" }));
    expect(first.status).toBe(201);
    expect(duplicate.status).toBe(409);
  });

  test("matches exact names and preserves linked snapshots on catalog edits", async () => {
    const adminCookie = await signIn(admin);
    const created = await request(app)
      .post("/api/admin/catalog/exercises")
      .set("Origin", origin)
      .set("Cookie", adminCookie)
      .send(catalogEntry());
    const memberCookie = await signIn(member);
    const templateId = randomUUID();
    const weekId = randomUUID();
    const dayId = randomUUID();
    const programExerciseId = randomUUID();
    const sessionId = randomUUID();
    const sessionExerciseId = randomUUID();
    const programSnapshot = {
      sets: [{ type: "standard", repMin: 5, repMax: 8, targetRir: 2 }],
    };
    const exerciseSnapshot = {
      name: "Barbell squat",
      equipment: "barbell",
      loadType: "external",
    };
    const sessionPrescriptionSnapshot = {
      sets: [{ type: "standard", repMin: 5, repMax: 8, targetRir: 2 }],
    };

    expect(created.status).toBe(201);
    await database.query(
      "INSERT INTO program_templates (id, user_id, name) VALUES ($1, $2, 'Snapshot test')",
      [templateId, member.id],
    );
    await database.query(
      `INSERT INTO program_weeks (id, user_id, template_id, week_number, week_type)
       VALUES ($1, $2, $3, 1, 'training')`,
      [weekId, member.id, templateId],
    );
    await database.query(
      `INSERT INTO program_days (id, user_id, week_id, slot_number, day_type)
       VALUES ($1, $2, $3, 1, 'workout')`,
      [dayId, member.id, weekId],
    );
    await database.query(
      `INSERT INTO program_day_exercises
         (id, user_id, day_id, exercise_id, sort_order, prescription_snapshot)
       VALUES ($1, $2, $3, $4, 1, $5)`,
      [programExerciseId, member.id, dayId, created.body.id, programSnapshot],
    );
    await database.query(
      `INSERT INTO workout_sessions (id, user_id, started_local_date)
       VALUES ($1, $2, '2026-10-20')`,
      [sessionId, member.id],
    );
    await database.query(
      `INSERT INTO session_exercises
         (id, user_id, session_id, exercise_id, name_snapshot,
          exercise_snapshot, prescription_snapshot)
       VALUES ($1, $2, $3, $4, 'Barbell squat', $5, $6)`,
      [
        sessionExerciseId,
        member.id,
        sessionId,
        created.body.id,
        exerciseSnapshot,
        sessionPrescriptionSnapshot,
      ],
    );

    async function readSnapshots() {
      const program = await database.query(
        "SELECT prescription_snapshot FROM program_day_exercises WHERE id = $1",
        [programExerciseId],
      );
      const session = await database.query(
        `SELECT name_snapshot, exercise_snapshot, prescription_snapshot
         FROM session_exercises WHERE id = $1`,
        [sessionExerciseId],
      );
      return { program: program.rows, session: session.rows };
    }

    const snapshotsBefore = await readSnapshots();

    const exact = await request(app)
      .get("/api/catalog/exercises/match")
      .query({ name: "Barbell squat" })
      .set("Cookie", memberCookie);
    const variant = await request(app)
      .get("/api/catalog/exercises/match")
      .query({ name: "Barbell back squat" })
      .set("Cookie", memberCookie);
    expect(exact.status).toBe(200);
    expect(exact.body.id).toBe(created.body.id);
    expect(variant.status).toBe(404);

    const updated = await request(app)
      .patch(`/api/admin/catalog/exercises/${created.body.id}`)
      .set("Origin", origin)
      .set("Cookie", adminCookie)
      .send(catalogEntry({ name: "High-bar barbell squat" }));
    expect(updated.status).toBe(200);
    expect(updated.body.id).toBe(created.body.id);
    const { rows } = await database.query(
      "SELECT id, name FROM exercises WHERE id = $1",
      [created.body.id],
    );
    expect(rows).toEqual([
      { id: created.body.id, name: "High-bar barbell squat" },
    ]);
    expect(await readSnapshots()).toEqual(snapshotsBefore);
  });
});
