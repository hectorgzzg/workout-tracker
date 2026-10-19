import { randomUUID } from "node:crypto";
import { hashPassword } from "./index.js";

export async function bootstrapInitialAdmin(
  pool,
  { email, password, displayName },
) {
  const normalizedEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "";
  const normalizedDisplayName =
    typeof displayName === "string"
      ? displayName.trim()
      : normalizedEmail.split("@")[0];
  if (
    normalizedEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 256 ||
    normalizedDisplayName.length < 1 ||
    normalizedDisplayName.length > 80
  ) {
    throw new Error("Valid initial admin email, password, and name required");
  }

  const passwordHash = await hashPassword(password);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(73014202)");
    const existingAdmin = await client.query(
      "SELECT id FROM users WHERE role = 'admin' LIMIT 1",
    );
    if (existingAdmin.rows.length > 0) {
      throw new Error("An admin account already exists");
    }

    const id = randomUUID();
    await client.query(
      `INSERT INTO users (id, email, role, password_hash)
       VALUES ($1, $2, 'admin', $3)`,
      [id, normalizedEmail, passwordHash],
    );
    await client.query(
      "INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)",
      [id, normalizedDisplayName],
    );
    await client.query("COMMIT");
    return {
      id,
      email: normalizedEmail,
      role: "admin",
      displayName: normalizedDisplayName,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      throw new Error("An account with that email already exists", {
        cause: error,
      });
    }
    throw error;
  } finally {
    client.release();
  }
}
