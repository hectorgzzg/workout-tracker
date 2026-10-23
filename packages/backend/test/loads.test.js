import { randomUUID } from "node:crypto";
import request from "supertest";
import { PGlite } from "@electric-sql/pglite";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/auth/index.js";
import {
  convertLoad,
  createExerciseSnapshot,
  createLoadInterpretation,
  roundLoadForDisplay,
} from "../src/loads.js";
import { runMigrations } from "../src/persistence/migrate.js";

const migrationsDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);
const origin = "https://workout.example";

describe("WT-010 canonical loads and snapshots", () => {
  test("converts canonical loads without losing precision and rounds display values", () => {
    expect(convertLoad(20, "kg", "lb")).toBeCloseTo(44.0924524, 6);
    expect(convertLoad(44.0924524, "lb", "kg")).toBeCloseTo(20, 6);
    expect(convertLoad(20, "kg", "kg")).toBe(20);
    expect(roundLoadForDisplay(20, "kg")).toBe(20);
    expect(roundLoadForDisplay(20, "lb")).toBe(44.09);
    expect(roundLoadForDisplay(1.005, "kg")).toBe(1.01);
    expect(() => convertLoad(-1, "kg", "lb")).toThrow(
      "Load must be a finite nonnegative number",
    );
  });

  test("validates load interpretations and creates immutable complete snapshots", () => {
    const loadInterpretation = createLoadInterpretation({
      loadType: "dumbbell",
      unit: "lb",
      dumbbellCount: 2,
      sideCount: 1,
      bodyweightFactor: null,
      assistanceRatio: null,
    });
    const prescription = {
      sets: [{ type: "standard", repMin: 8, repMax: 12, targetRir: 2 }],
    };
    const equipment = {
      name: "North Gym",
      equipment: [
        {
          name: "Dumbbells",
          loadType: "dumbbell",
          minLoadKg: 2,
          maxLoadKg: 40,
          incrementKg: 2,
          availableLoadsKg: [2, 4, 6],
        },
      ],
      bars: [{ name: "Olympic bar", weightKg: 20 }],
      plates: [{ weightKg: 2.5, quantity: 4 }],
    };
    const snapshot = createExerciseSnapshot({
      name: "Dumbbell row",
      exerciseEquipment: "dumbbell",
      loadInterpretation,
      prescription,
      bodyweightKg: 72.5,
      equipment,
    });

    expect(snapshot).toEqual({
      name: "Dumbbell row",
      exerciseEquipment: "dumbbell",
      ...loadInterpretation,
      prescription,
      bodyweightKg: 72.5,
      equipment,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.prescription.sets[0])).toBe(true);
    expect(Object.isFrozen(snapshot.equipment.equipment[0])).toBe(true);
    expect(() => {
      snapshot.prescription.sets[0].repMin = 100;
    }).toThrow();

    prescription.sets[0].repMin = 5;
    equipment.plates[0].quantity = 0;
    expect(snapshot.prescription.sets[0].repMin).toBe(8);
    expect(snapshot.equipment.plates[0].quantity).toBe(4);

    for (const dumbbellCount of [1, 2]) {
      expect(
        createLoadInterpretation({
          loadType: "dumbbell",
          unit: "kg",
          dumbbellCount,
          sideCount: 2,
        }),
      ).toMatchObject({ dumbbellCount, sideCount: 2 });
    }

    const unconfiguredBodyweight = createLoadInterpretation({
      loadType: "bodyweight",
      unit: "kg",
    });
    expect(unconfiguredBodyweight.bodyweightFactor).toBeNull();
    expect(
      createLoadInterpretation({ loadType: "assisted", unit: "kg" })
        .assistanceRatio,
    ).toBeNull();
    expect(
      createExerciseSnapshot({
        name: "Bodyweight squat",
        exerciseEquipment: "bodyweight",
        loadInterpretation: unconfiguredBodyweight,
        prescription: { sets: [] },
        bodyweightKg: 1.005,
        equipment: null,
      }).bodyweightKg,
    ).toBe(1.005);
    expect(() =>
      createLoadInterpretation({
        loadType: "bodyweight",
        unit: "kg",
        bodyweightFactor: 0,
      }),
    ).toThrow("Bodyweight factor must be positive or null");
    expect(() =>
      createLoadInterpretation({
        loadType: "dumbbell",
        unit: "kg",
        dumbbellCount: 0,
      }),
    ).toThrow("Dumbbell count must be one or two");
    expect(() =>
      createLoadInterpretation({ loadType: "machine", unit: "kg" }),
    ).toThrow("Unsupported load type");
  });
});

describe("WT-010 exercise unit overrides", () => {
  let database;
  let pool;
  let app;
  let member;
  let otherMember;
  let exerciseId;

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
    exerciseId = randomUUID();
    await database.query(
      "INSERT INTO exercises (id, name, load_type) VALUES ($1, 'Barbell squat', 'external')",
      [exerciseId],
    );
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

  test("persists per-user overrides independently from profile defaults", async () => {
    const memberCookie = await signIn(member);
    const otherCookie = await signIn(otherMember);

    const initial = await request(app)
      .get(`/api/exercises/${exerciseId}/preferences`)
      .set("Cookie", memberCookie);
    expect(initial.status).toBe(200);
    expect(initial.body).toEqual({
      exerciseId,
      unit: "kg",
      unitOverride: null,
    });

    const saved = await request(app)
      .put(`/api/exercises/${exerciseId}/preferences`)
      .set("Origin", origin)
      .set("Cookie", memberCookie)
      .send({ unitOverride: "lb" });
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({ exerciseId, unit: "lb", unitOverride: "lb" });

    await database.query(
      "UPDATE profiles SET default_unit = 'lb' WHERE user_id = $1",
      [member.id],
    );
    const afterDefaultChange = await request(app)
      .get(`/api/exercises/${exerciseId}/preferences`)
      .set("Cookie", memberCookie);
    expect(afterDefaultChange.body.unit).toBe("lb");
    expect(afterDefaultChange.body.unitOverride).toBe("lb");

    const other = await request(app)
      .get(`/api/exercises/${exerciseId}/preferences`)
      .set("Cookie", otherCookie);
    expect(other.body).toEqual({ exerciseId, unit: "kg", unitOverride: null });

    const cleared = await request(app)
      .put(`/api/exercises/${exerciseId}/preferences`)
      .set("Origin", origin)
      .set("Cookie", memberCookie)
      .send({ unitOverride: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body).toEqual({
      exerciseId,
      unit: "lb",
      unitOverride: null,
    });
  });

  test("requires authentication and validates override and exercise identity", async () => {
    const unauthenticated = await request(app).get(
      `/api/exercises/${exerciseId}/preferences`,
    );
    expect(unauthenticated.status).toBe(401);

    const cookie = await signIn(member);
    const invalid = await request(app)
      .put(`/api/exercises/${exerciseId}/preferences`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ unitOverride: "stone" });
    expect(invalid.status).toBe(400);

    const missing = await request(app)
      .get(`/api/exercises/${randomUUID()}/preferences`)
      .set("Cookie", cookie);
    expect(missing.status).toBe(404);
  });
});
