const safeDatabaseNames = new Set([
  "/workout_tracker_dev",
  "/workout_tracker_test",
]);

export function assertSafeSeedDatabaseUrl(databaseUrl, applicationDatabaseUrl) {
  let seedUrl;
  try {
    seedUrl = new URL(databaseUrl);
  } catch {
    throw new Error("Seed database URL must be a valid PostgreSQL URL");
  }

  if (
    !["postgres:", "postgresql:"].includes(seedUrl.protocol) ||
    !safeDatabaseNames.has(seedUrl.pathname)
  ) {
    throw new Error(
      "Seeds are restricted to workout_tracker_dev or workout_tracker_test",
    );
  }

  if (applicationDatabaseUrl) {
    let applicationUrl;
    try {
      applicationUrl = new URL(applicationDatabaseUrl);
    } catch {
      throw new Error(
        "Application database URL must be a valid PostgreSQL URL",
      );
    }

    if (
      !["postgres:", "postgresql:"].includes(applicationUrl.protocol) ||
      applicationUrl.pathname === seedUrl.pathname
    ) {
      throw new Error("Seed and application databases must be different");
    }
  }

  return seedUrl;
}

export async function runSeeds({ pool, databaseUrl, applicationDatabaseUrl }) {
  assertSafeSeedDatabaseUrl(databaseUrl, applicationDatabaseUrl);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO exercises (id, name, load_type, is_test_fixture)
       VALUES ('00000000-0000-4000-8000-000000000003',
               'Development fixture: external load exercise',
               'external', true)
       ON CONFLICT (id) DO NOTHING`,
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
