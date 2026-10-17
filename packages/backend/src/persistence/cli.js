import { runMigrations } from "./migrate.js";
import { createDatabasePool } from "./pool.js";
import { assertSafeSeedDatabaseUrl, runSeeds } from "./seed.js";

async function main() {
  const command = process.argv[2];
  if (!["migrate", "seed"].includes(command)) {
    throw new Error("Choose either the migrate or seed command");
  }

  const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL or TEST_DATABASE_URL must be configured");
  }

  const applicationDatabaseUrl = process.env.TEST_DATABASE_URL
    ? process.env.DATABASE_URL
    : undefined;
  if (process.env.TEST_DATABASE_URL || command === "seed") {
    assertSafeSeedDatabaseUrl(databaseUrl, applicationDatabaseUrl);
  }

  const pool = createDatabasePool({ connectionString: databaseUrl });
  try {
    await runMigrations({ pool });
    if (command === "seed") {
      await runSeeds({ pool, databaseUrl, applicationDatabaseUrl });
    }
  } finally {
    await pool.end();
  }

  process.stdout.write(`Database ${command} completed.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
