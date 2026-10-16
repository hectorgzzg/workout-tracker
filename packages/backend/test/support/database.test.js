import { jest } from "@jest/globals";
import { runTestDatabaseCleanup } from "./database.js";

describe("test database cleanup guard", () => {
  test("does not run cleanup without a dedicated test database", async () => {
    const cleanup = jest.fn();

    await expect(runTestDatabaseCleanup({ env: {}, cleanup })).rejects.toThrow(
      "TEST_DATABASE_URL must target workout_tracker_test",
    );

    expect(cleanup).not.toHaveBeenCalled();
  });

  test("does not run cleanup when the test URL is the application database", async () => {
    const databaseUrl = "postgresql://localhost/workout_tracker_test";
    const cleanup = jest.fn();

    await expect(
      runTestDatabaseCleanup({
        env: {
          TEST_DATABASE_URL: databaseUrl,
          DATABASE_URL: databaseUrl,
        },
        cleanup,
      }),
    ).rejects.toThrow("Test and application databases must be different");

    expect(cleanup).not.toHaveBeenCalled();
  });

  test("recognizes PostgreSQL URL aliases and default ports as the same database", async () => {
    const cleanup = jest.fn();

    await expect(
      runTestDatabaseCleanup({
        env: {
          TEST_DATABASE_URL: "postgresql://localhost:5432/workout_tracker_test",
          DATABASE_URL: "postgres://localhost/workout_tracker_test",
        },
        cleanup,
      }),
    ).rejects.toThrow("Test and application databases must be different");

    expect(cleanup).not.toHaveBeenCalled();
  });

  test("rejects the application database name even when hosts differ", async () => {
    const cleanup = jest.fn();

    await expect(
      runTestDatabaseCleanup({
        env: {
          TEST_DATABASE_URL:
            "postgresql://test-db.internal:5432/workout_tracker_test",
          DATABASE_URL:
            "postgresql://production-db.internal:5432/workout_tracker_test",
        },
        cleanup,
      }),
    ).rejects.toThrow("Test and application databases must be different");

    expect(cleanup).not.toHaveBeenCalled();
  });

  test("passes the dedicated test URL to cleanup", async () => {
    const databaseUrl = "postgresql://localhost/workout_tracker_test";
    const cleanup = jest.fn().mockResolvedValue(undefined);

    await runTestDatabaseCleanup({
      env: { TEST_DATABASE_URL: databaseUrl },
      cleanup,
    });

    expect(cleanup).toHaveBeenCalledWith(new URL(databaseUrl));
  });
});
