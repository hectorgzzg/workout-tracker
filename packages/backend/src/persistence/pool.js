import pg from "pg";

const { Pool } = pg;

export function createDatabasePool({
  connectionString = process.env.DATABASE_URL,
} = {}) {
  let databaseUrl;
  try {
    databaseUrl = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }

  if (
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    databaseUrl.pathname.length < 2
  ) {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }

  return new Pool({ connectionString });
}
