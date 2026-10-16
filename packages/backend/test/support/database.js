export async function runTestDatabaseCleanup({ env = process.env, cleanup }) {
  if (typeof cleanup !== "function") {
    throw new TypeError("Test database cleanup must be a function");
  }

  if (!env.TEST_DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL must target workout_tracker_test");
  }

  let testDatabaseUrl;
  try {
    testDatabaseUrl = new URL(env.TEST_DATABASE_URL);
  } catch {
    throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL");
  }

  if (
    !["postgres:", "postgresql:"].includes(testDatabaseUrl.protocol) ||
    testDatabaseUrl.pathname !== "/workout_tracker_test"
  ) {
    throw new Error("TEST_DATABASE_URL must target workout_tracker_test");
  }

  if (env.DATABASE_URL) {
    const applicationDatabaseUrl = new URL(env.DATABASE_URL);
    const sameTarget =
      applicationDatabaseUrl.pathname === testDatabaseUrl.pathname;

    if (sameTarget) {
      throw new Error("Test and application databases must be different");
    }
  }

  return cleanup(testDatabaseUrl);
}
