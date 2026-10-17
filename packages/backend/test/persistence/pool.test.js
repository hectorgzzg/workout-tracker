import { createDatabasePool } from "../../src/persistence/pool.js";

describe("PostgreSQL connection pool", () => {
  test("requires an explicit database URL", () => {
    expect(() => createDatabasePool({ connectionString: "" })).toThrow(
      "DATABASE_URL must be a valid PostgreSQL URL",
    );
  });

  test("rejects non-PostgreSQL connection URLs", () => {
    expect(() =>
      createDatabasePool({ connectionString: "https://example.test/database" }),
    ).toThrow("DATABASE_URL must be a valid PostgreSQL URL");
  });

  test("creates a pool for an explicit PostgreSQL URL", async () => {
    const connectionString = "postgresql://localhost:5432/workout_tracker_test";
    const pool = createDatabasePool({ connectionString });

    expect(pool.options.connectionString).toBe(connectionString);
    await pool.end();
  });
});
