import { runMigrations } from "./migrate.js";
import { createDatabasePool } from "./pool.js";
import { assertSafeSeedDatabaseUrl, runSeeds } from "./seed.js";
import { bootstrapInitialAdmin } from "../auth/bootstrap.js";

async function main() {
  const command = process.argv[2];
  if (!["migrate", "seed", "bootstrap-admin"].includes(command)) {
    throw new Error("Choose migrate, seed, or bootstrap-admin");
  }

  const databaseUrl =
    command === "bootstrap-admin"
      ? process.env.DATABASE_URL
      : (process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);
  if (!databaseUrl) {
    throw new Error(
      command === "bootstrap-admin"
        ? "DATABASE_URL must be configured for admin bootstrap"
        : "DATABASE_URL or TEST_DATABASE_URL must be configured",
    );
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
    } else if (command === "bootstrap-admin") {
      await bootstrapInitialAdmin(pool, {
        email: process.env.INITIAL_ADMIN_EMAIL,
        password: process.env.INITIAL_ADMIN_PASSWORD,
        displayName: process.env.INITIAL_ADMIN_DISPLAY_NAME,
      });
      process.stdout.write("Initial admin provisioned.\n");
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
