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

describe("WT-009 profile and gym settings", () => {
  let database;
  let pool;
  let app;
  let member;
  let otherMember;

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
    member = await createAccount("member@example.test");
    otherMember = await createAccount("other@example.test");
    app = createApp({ pool, allowedOrigins: [origin], cookieSecure: false });
  });

  afterEach(async () => {
    await database.close();
  });

  async function createAccount(email) {
    const id = randomUUID();
    await database.query(
      "INSERT INTO users (id, email, role, password_hash) VALUES ($1, $2, 'member', $3)",
      [id, email, await hashPassword("CorrectHorse!23")],
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

  function settings(overrides = {}) {
    return {
      profile: {
        displayName: "Member One",
        email: member.email,
        timezone: "America/Los_Angeles",
        bodyweightKg: 72.5,
        defaultUnit: "lb",
        restDurationsSeconds: {
          upper_compound: 135,
          lower_compound: 180,
          upper_isolation: 90,
          lower_isolation: 90,
          core: 75,
        },
      },
      gym: {
        name: "North Gym",
        equipment: [
          {
            name: "Cable stack",
            loadType: "external",
            minLoadKg: 2.5,
            maxLoadKg: 100,
            incrementKg: 2.5,
            availableLoadsKg: [2.5, 5, 7.5],
          },
          {
            name: "Dumbbells",
            loadType: "dumbbell",
            minLoadKg: 2,
            maxLoadKg: 40,
            incrementKg: 2,
            availableLoadsKg: [2, 4, 6, 8],
          },
        ],
        bars: [{ name: "Olympic bar", weightKg: 20 }],
        plates: [{ weightKg: 2.5, quantity: 4 }],
      },
      ...overrides,
    };
  }

  test("returns defaults and saves/reloads the authenticated user's profile and gym", async () => {
    const cookie = await signIn(member);
    const initial = await request(app)
      .get("/api/settings")
      .set("Cookie", cookie);

    expect(initial.status).toBe(200);
    expect(initial.body.profile).toMatchObject({
      email: member.email,
      displayName: "member",
      timezone: "UTC",
      bodyweightKg: null,
      defaultUnit: "kg",
      restDurationsSeconds: {
        upper_compound: 120,
        lower_compound: 180,
        upper_isolation: 90,
        lower_isolation: 90,
        core: 60,
      },
    });
    expect(initial.body.gym).toEqual({
      name: "",
      equipment: [],
      bars: [],
      plates: [],
    });

    const created = await request(app)
      .put("/api/settings")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send(settings());

    expect(created.status).toBe(200);
    expect(created.body).toMatchObject(settings());
    expect(created.body.profile.id).toBe(member.id);
    expect(created.body.gym.id).toEqual(expect.any(String));

    const reloaded = await request(app)
      .get("/api/settings")
      .set("Cookie", cookie);
    expect(reloaded.body).toMatchObject(created.body);
  });

  test("rejects invalid timezone, units, rest durations, and gym quantities", async () => {
    const cookie = await signIn(member);
    const invalidPayloads = [
      settings({
        profile: { ...settings().profile, timezone: "Mars/Olympus" },
      }),
      settings({ profile: { ...settings().profile, defaultUnit: "stone" } }),
      settings({
        profile: {
          ...settings().profile,
          restDurationsSeconds: {
            ...settings().profile.restDurationsSeconds,
            core: 1.5,
          },
        },
      }),
      settings({
        gym: {
          ...settings().gym,
          equipment: [
            {
              ...settings().gym.equipment[0],
              incrementKg: 0,
            },
          ],
        },
      }),
      settings({
        gym: {
          ...settings().gym,
          plates: [{ weightKg: 2.5, quantity: -1 }],
        },
      }),
    ];

    for (const payload of invalidPayloads) {
      const response = await request(app)
        .put("/api/settings")
        .set("Origin", origin)
        .set("Cookie", cookie)
        .send(payload);
      expect(response.status).toBe(400);
    }
  });

  test("isolates settings by account and leaves existing session snapshots unchanged", async () => {
    const firstCookie = await signIn(member);
    const otherCookie = await signIn(otherMember);
    const sessionId = randomUUID();
    const exerciseId = randomUUID();
    const snapshot = { bodyweightKg: 68, unit: "kg", equipment: "old gym" };
    await database.query(
      "INSERT INTO exercises (id, name, load_type) VALUES ($1, 'Squat', 'external')",
      [exerciseId],
    );
    await database.query(
      `INSERT INTO workout_sessions
         (id, user_id, started_timezone, started_local_date)
       VALUES ($1, $2, 'UTC', '2026-10-20')`,
      [sessionId, member.id],
    );
    await database.query(
      `INSERT INTO session_exercises
         (id, user_id, session_id, exercise_id, name_snapshot, exercise_snapshot)
       VALUES ($1, $2, $3, $4, 'Squat', $5)`,
      [exerciseId, member.id, sessionId, exerciseId, snapshot],
    );

    const saved = await request(app)
      .put("/api/settings")
      .set("Origin", origin)
      .set("Cookie", firstCookie)
      .send(
        settings({
          profile: { ...settings().profile, email: "updated@example.test" },
        }),
      );
    expect(saved.status).toBe(200);

    const own = await request(app)
      .get("/api/settings?userId=" + otherMember.id)
      .set("Cookie", firstCookie);
    const other = await request(app)
      .get("/api/settings")
      .set("Cookie", otherCookie);
    expect(own.body.profile).toMatchObject({
      id: member.id,
      email: "updated@example.test",
    });
    expect(other.body.profile).toMatchObject({
      id: otherMember.id,
      email: otherMember.email,
      displayName: "other",
    });
    expect(other.body.gym.name).toBe("");

    const { rows } = await database.query(
      "SELECT exercise_snapshot FROM session_exercises WHERE id = $1",
      [exerciseId],
    );
    expect(rows[0].exercise_snapshot).toEqual(snapshot);
  });
});
