import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const defaultMigrationsDirectory = fileURLToPath(
  new URL("../../migrations/", import.meta.url),
);

export async function runMigrations({
  pool,
  migrationsDirectory = defaultMigrationsDirectory,
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(73014201)");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query(
      "SELECT name FROM schema_migrations ORDER BY name",
    );
    const appliedNames = new Set(rows.map(({ name }) => name));
    const migrationNames = (await readdir(migrationsDirectory))
      .filter((name) => /^\d+_[a-z0-9_]+\.sql$/i.test(name))
      .sort();

    for (const name of migrationNames) {
      if (appliedNames.has(name)) {
        continue;
      }

      const sql = await readFile(`${migrationsDirectory}/${name}`, "utf8");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
        name,
      ]);
    }

    await client.query("COMMIT");
    return migrationNames.filter((name) => !appliedNames.has(name));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
