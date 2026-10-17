import { assertSafeSeedDatabaseUrl } from "../../src/persistence/seed.js";

describe("development and test seed safety", () => {
  test.each([
    "postgresql://localhost/workout_tracker_dev",
    "postgresql://localhost/workout_tracker_test",
  ])("allows the isolated database %s", (databaseUrl) => {
    expect(assertSafeSeedDatabaseUrl(databaseUrl).pathname).toMatch(
      /^\/workout_tracker_(dev|test)$/,
    );
  });

  test("rejects production or personal database names", () => {
    expect(() =>
      assertSafeSeedDatabaseUrl("postgresql://localhost/workout_tracker"),
    ).toThrow(
      "Seeds are restricted to workout_tracker_dev or workout_tracker_test",
    );
  });

  test("rejects the application database even when its host differs", () => {
    expect(() =>
      assertSafeSeedDatabaseUrl(
        "postgresql://test-db/workout_tracker_test",
        "postgresql://production-db/workout_tracker_test",
      ),
    ).toThrow("Seed and application databases must be different");
  });
});
