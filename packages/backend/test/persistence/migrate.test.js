import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrations } from "../../src/persistence/migrate.js";

describe("database migrations", () => {
  let migrationsDirectory;
  let appliedMigrations;
  let executedStatements;

  beforeEach(async () => {
    migrationsDirectory = await mkdtemp(join(tmpdir(), "workout-migrations-"));
    await writeFile(
      join(migrationsDirectory, "001_initial.sql"),
      "CREATE TABLE migration_fixture (id integer PRIMARY KEY);",
    );
    appliedMigrations = new Set();
    executedStatements = [];
  });

  afterEach(async () => {
    await rm(migrationsDirectory, { recursive: true, force: true });
  });

  test("applies each migration once and skips it on rerun", async () => {
    const client = {
      async query(statement, parameters = []) {
        executedStatements.push(statement);

        if (statement.includes("SELECT name FROM schema_migrations")) {
          return { rows: [...appliedMigrations].map((name) => ({ name })) };
        }

        if (statement.includes("INSERT INTO schema_migrations")) {
          appliedMigrations.add(parameters[0]);
        }

        return { rows: [] };
      },
      release() {},
    };
    const pool = { connect: async () => client };

    await runMigrations({ pool, migrationsDirectory });
    await runMigrations({ pool, migrationsDirectory });

    expect(
      executedStatements.filter((statement) =>
        statement.includes("CREATE TABLE migration_fixture"),
      ),
    ).toHaveLength(1);
    expect(appliedMigrations).toEqual(new Set(["001_initial.sql"]));
  });
});
