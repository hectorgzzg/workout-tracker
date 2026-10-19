import { randomBytes, randomUUID, createHash } from "node:crypto";
import express from "express";
import request from "supertest";
import { PGlite } from "@electric-sql/pglite";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.js";
import {
  authenticate,
  hashPassword,
  requireRole,
  requireUserOwner,
} from "../src/auth/index.js";
import { runMigrations } from "../src/persistence/migrate.js";

const migrationsDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);
const origin = "https://workout.example";

describe("WT-005 authentication and WT-006 onboarding", () => {
  let database;
  let pool;
  let app;
  let member;
  let otherMember;
  let admin;

  beforeEach(async () => {
    database = new PGlite();
    pool = {
      async connect() {
        return {
          async query(statement, parameters) {
            if (
              statement.startsWith("CREATE TABLE users (") ||
              statement.startsWith("ALTER TABLE users") ||
              statement.startsWith("CREATE TABLE registration_invitations")
            ) {
              await database.exec(statement);
              return { rows: [] };
            }

            return database.query(statement, parameters);
          },
          release() {},
        };
      },
      query: (statement, parameters) => database.query(statement, parameters),
    };
    await runMigrations({ pool, migrationsDirectory });

    member = await createAccount("member@example.test", "member");
    otherMember = await createAccount("other@example.test", "member");
    admin = await createAccount("admin@example.test", "admin");
    app = createApp({
      pool,
      allowedOrigins: [origin],
      cookieSecure: false,
      authRateLimit: { windowMs: 60_000, limit: 10 },
    });
  });

  afterEach(async () => {
    await database.close();
  });

  async function createAccount(email, role) {
    const id = randomUUID();
    const passwordHash = await hashPassword("CorrectHorse!23");
    await database.query(
      "INSERT INTO users (id, email, role, password_hash) VALUES ($1, $2, $3, $4)",
      [id, email, role, passwordHash],
    );
    await database.query(
      "INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)",
      [id, email.split("@")[0]],
    );
    return { id, email, role, password: "CorrectHorse!23" };
  }

  async function signIn(account = member) {
    return request(app)
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({ email: account.email, password: account.password });
  }

  function cookieFrom(response) {
    return response.headers["set-cookie"][0].split(";")[0];
  }

  async function createInvitation() {
    const signedInAdmin = await signIn(admin);
    return request(app)
      .post("/api/admin/invitations")
      .set("Origin", origin)
      .set("Cookie", cookieFrom(signedInAdmin));
  }

  async function registerWith(token, email = "new@example.test") {
    return request(app).post("/api/auth/register").set("Origin", origin).send({
      token,
      email,
      password: "A-strong-password-123",
      displayName: "New Member",
    });
  }

  test("logs in with a case-insensitive email and issues an opaque secure cookie", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({ email: member.email.toUpperCase(), password: member.password });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: member.id,
      email: member.email,
      role: "member",
    });
    expect(JSON.stringify(response.body)).not.toContain("password");
    expect(response.headers["set-cookie"][0]).toMatch(/HttpOnly/i);
    expect(response.headers["set-cookie"][0]).toMatch(/SameSite=Lax/i);
    expect(cookieFrom(response)).toMatch(/^wt_session=[A-Za-z0-9_-]{43}$/);

    const { rows } = await database.query(
      "SELECT token_hash FROM auth_sessions WHERE user_id = $1",
      [member.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toBe(cookieFrom(response).slice(11));
  });

  test.each([
    ["unknown email", "missing@example.test", "CorrectHorse!23"],
    ["wrong password", "member@example.test", "incorrect-password"],
  ])("returns the same safe error for %s", async (_label, email, password) => {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({ email, password });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Invalid email or password" });
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  test("validates login input without exposing database or credential details", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({ email: "not-an-email", password: "" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Valid email and password required",
    });
  });

  test("allows only admins to create invitations and stores only token hashes", async () => {
    const unauthenticated = await request(app)
      .post("/api/admin/invitations")
      .set("Origin", origin);
    expect(unauthenticated.status).toBe(401);

    const signedInMember = await signIn(member);
    const denied = await request(app)
      .post("/api/admin/invitations")
      .set("Origin", origin)
      .set("Cookie", cookieFrom(signedInMember));
    expect(denied.status).toBe(403);

    const response = await createInvitation();
    expect(response.status).toBe(201);
    const registrationUrl = new URL(response.body.registrationUrl);
    expect(registrationUrl.origin).toBe(origin);
    const token = registrationUrl.searchParams.get("token");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(response.body.expiresAt).toBeDefined();

    const { rows } = await database.query(
      "SELECT token_hash, expires_at FROM registration_invitations",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).toBe(
      createHash("sha256").update(token).digest("hex"),
    );
    expect(rows[0].token_hash).not.toBe(token);
    const expiresIn = new Date(rows[0].expires_at).getTime() - Date.now();
    expect(expiresIn).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
    expect(expiresIn).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000);
  });

  test("registers a member and profile from a valid invitation", async () => {
    const invitation = await createInvitation();
    const token = new URL(invitation.body.registrationUrl).searchParams.get(
      "token",
    );
    const response = await registerWith(token);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      email: "new@example.test",
      role: "member",
      displayName: "New Member",
    });
    expect(JSON.stringify(response.body)).not.toMatch(/password|token/i);
    const { rows } = await database.query(
      `SELECT users.password_hash, profiles.display_name
       FROM users JOIN profiles ON profiles.user_id = users.id
       WHERE users.email = $1`,
      ["new@example.test"],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].password_hash).not.toBe("A-strong-password-123");
    expect(rows[0].display_name).toBe("New Member");
  });

  test.each(["invalid", "expired", "redeemed"])(
    "rejects an %s invitation without creating an account",
    async (state) => {
      let token = "invalid-registration-token";
      if (state !== "invalid") {
        const invitation = await createInvitation();
        token = new URL(invitation.body.registrationUrl).searchParams.get(
          "token",
        );
        if (state === "expired") {
          await database.query(
            `UPDATE registration_invitations
             SET created_at = now() - interval '2 hours',
                 expires_at = now() - interval '1 hour'`,
          );
        } else {
          await registerWith(token, "first@example.test");
        }
      }

      const response = await registerWith(token);
      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: "Invalid or expired invitation",
      });
      const { rows } = await database.query(
        "SELECT id FROM users WHERE email = $1",
        ["new@example.test"],
      );
      expect(rows).toHaveLength(0);
    },
  );

  test("does not consume an invitation when the email is already registered", async () => {
    const invitation = await createInvitation();
    const token = new URL(invitation.body.registrationUrl).searchParams.get(
      "token",
    );
    const response = await registerWith(token, member.email);

    expect(response.status).toBe(409);
    const { rows } = await database.query(
      "SELECT redeemed_at FROM registration_invitations",
    );
    expect(rows[0].redeemed_at).toBeNull();
  });

  test("allows only one concurrent registration to redeem an invitation", async () => {
    const invitation = await createInvitation();
    const token = new URL(invitation.body.registrationUrl).searchParams.get(
      "token",
    );
    const responses = await Promise.all([
      registerWith(token, "first@example.test"),
      registerWith(token, "second@example.test"),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 400]);
    const { rows } = await database.query(
      `SELECT count(*)::integer AS count FROM users
       WHERE email IN ('first@example.test', 'second@example.test')`,
    );
    expect(rows[0].count).toBe(1);
  });

  test("rate-limits registration and invitation creation", async () => {
    app = createApp({
      pool,
      allowedOrigins: [origin],
      cookieSecure: false,
      registrationRateLimit: { windowMs: 60_000, limit: 1 },
      invitationRateLimit: { windowMs: 60_000, limit: 1 },
    });
    const registrationAttempt = () =>
      request(app)
        .post("/api/auth/register")
        .set("Origin", origin)
        .send({
          token: "A".repeat(43),
          email: "new@example.test",
          password: "A-strong-password-123",
        });
    expect((await registrationAttempt()).status).toBe(400);
    expect((await registrationAttempt()).status).toBe(429);

    const signedInAdmin = await signIn(admin);
    const invitationAttempt = () =>
      request(app)
        .post("/api/admin/invitations")
        .set("Origin", origin)
        .set("Cookie", cookieFrom(signedInAdmin));
    expect((await invitationAttempt()).status).toBe(201);
    expect((await invitationAttempt()).status).toBe(429);
  });

  test("validates account details before checking invitation state", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .set("Origin", origin)
      .send({
        token: "A".repeat(43),
        email: "not-an-email",
        password: "short",
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Valid invitation and account details required",
    });
  });

  test("bootstraps only one initial admin and creates its profile", async () => {
    await database.query("DELETE FROM users");
    const { bootstrapInitialAdmin } = await import("../src/auth/bootstrap.js");
    const result = await bootstrapInitialAdmin(pool, {
      email: "first-admin@example.test",
      password: "A-strong-password-123",
      displayName: "First Admin",
    });

    expect(result).toEqual({
      id: expect.any(String),
      email: "first-admin@example.test",
      role: "admin",
      displayName: "First Admin",
    });
    await expect(
      bootstrapInitialAdmin(pool, {
        email: "second-admin@example.test",
        password: "A-strong-password-123",
        displayName: "Second Admin",
      }),
    ).rejects.toThrow("An admin account already exists");
    const { rows } = await database.query(
      `SELECT users.password_hash, profiles.display_name
       FROM users JOIN profiles ON profiles.user_id = users.id
       WHERE users.role = 'admin'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].password_hash).not.toBe("A-strong-password-123");
    expect(rows[0].display_name).toBe("First Admin");
  });

  test("serializes concurrent attempts to provision the first admin", async () => {
    await database.query("DELETE FROM users");
    const { bootstrapInitialAdmin } = await import("../src/auth/bootstrap.js");
    const attempts = await Promise.allSettled([
      bootstrapInitialAdmin(pool, {
        email: "first-admin@example.test",
        password: "A-strong-password-123",
      }),
      bootstrapInitialAdmin(pool, {
        email: "second-admin@example.test",
        password: "A-strong-password-123",
      }),
    ]);

    expect(
      attempts.filter(({ status }) => status === "fulfilled"),
    ).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );
    const { rows } = await database.query(
      "SELECT id FROM users WHERE role = 'admin'",
    );
    expect(rows).toHaveLength(1);
  });

  test("returns only the authenticated user's profile, ignoring another user id", async () => {
    const signedIn = await signIn();
    const response = await request(app)
      .get(`/api/profile?userId=${otherMember.id}`)
      .set("Cookie", cookieFrom(signedIn));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: member.id,
      email: member.email,
      role: "member",
      displayName: "member",
      timezone: "UTC",
      defaultUnit: "kg",
    });
    expect(JSON.stringify(response.body)).not.toContain("password_hash");
  });

  test("rejects invalid, revoked, and expired session cookies", async () => {
    const invalid = await request(app)
      .get("/api/profile")
      .set("Cookie", "wt_session=not-a-valid-session");
    expect(invalid.status).toBe(401);

    const expiredToken = randomBytes(32).toString("base64url");
    await database.query(
      `INSERT INTO auth_sessions (user_id, token_hash, created_at, expires_at)
       VALUES ($1, $2, now() - interval '1 hour', now() - interval '1 second')`,
      [member.id, createHash("sha256").update(expiredToken).digest("hex")],
    );
    const expired = await request(app)
      .get("/api/profile")
      .set("Cookie", `wt_session=${expiredToken}`);
    expect(expired.status).toBe(401);

    const signedIn = await signIn();
    await request(app)
      .post("/api/auth/logout")
      .set("Origin", origin)
      .set("Cookie", cookieFrom(signedIn));
    const revoked = await request(app)
      .get("/api/profile")
      .set("Cookie", cookieFrom(signedIn));
    expect(revoked.status).toBe(401);
  });

  test("logout revokes the server session and clears the cookie", async () => {
    const signedIn = await signIn();
    const response = await request(app)
      .post("/api/auth/logout")
      .set("Origin", origin)
      .set("Cookie", cookieFrom(signedIn));

    expect(response.status).toBe(204);
    expect(response.headers["set-cookie"][0]).toMatch(/Max-Age=0/i);
    const { rows } = await database.query(
      "SELECT revoked_at FROM auth_sessions WHERE user_id = $1",
      [member.id],
    );
    expect(rows[0].revoked_at).not.toBeNull();
  });

  test("rejects missing or untrusted origins on state-changing API requests", async () => {
    const missing = await request(app)
      .post("/api/auth/login")
      .send({ email: member.email, password: member.password });
    const untrusted = await request(app)
      .post("/api/auth/login")
      .set("Origin", "https://attacker.example")
      .send({ email: member.email, password: member.password });

    expect(missing.status).toBe(403);
    expect(untrusted.status).toBe(403);
    expect(missing.body).toEqual({ error: "Untrusted request origin" });
  });

  test("allows credentialed CORS only for configured frontend origins", async () => {
    const allowed = await request(app)
      .options("/api/auth/login")
      .set("Origin", origin)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type");
    const denied = await request(app)
      .options("/api/auth/login")
      .set("Origin", "https://attacker.example")
      .set("Access-Control-Request-Method", "POST");

    expect(allowed.status).toBe(204);
    expect(allowed.headers["access-control-allow-origin"]).toBe(origin);
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");
    expect(denied.status).toBe(403);
  });

  test("limits repeated login attempts", async () => {
    app = createApp({
      pool,
      allowedOrigins: [origin],
      cookieSecure: false,
      authRateLimit: { windowMs: 60_000, limit: 2 },
    });
    const attempt = () =>
      request(app)
        .post("/api/auth/login")
        .set("Origin", origin)
        .send({ email: member.email, password: "wrong-password" });

    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(401);
    const limited = await attempt();
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: "Too many login attempts" });
  });

  test("enforces role and user ownership in server-side middleware", async () => {
    const signedInMember = await signIn();
    const signedInAdmin = await signIn(admin);
    const authorizationApp = express();
    authorizationApp.get(
      "/admin",
      authenticate({ pool }),
      requireRole("admin"),
      (_req, res) => res.json({ allowed: true }),
    );
    authorizationApp.get(
      "/users/:userId/private",
      authenticate({ pool }),
      requireUserOwner(),
      (_req, res) => res.json({ allowed: true }),
    );

    expect(
      (
        await request(authorizationApp)
          .get("/admin")
          .set("Cookie", cookieFrom(signedInMember))
      ).status,
    ).toBe(403);
    expect(
      (
        await request(authorizationApp)
          .get("/admin")
          .set("Cookie", cookieFrom(signedInAdmin))
      ).status,
    ).toBe(200);
    expect(
      (
        await request(authorizationApp)
          .get(`/users/${otherMember.id}/private`)
          .set("Cookie", cookieFrom(signedInMember))
      ).status,
    ).toBe(403);
    expect(
      (
        await request(authorizationApp)
          .get(`/users/${member.id}/private`)
          .set("Cookie", cookieFrom(signedInMember))
      ).status,
    ).toBe(200);
  });

  test("uses a secure same-site cookie for HTTPS deployment", async () => {
    app = createApp({
      pool,
      allowedOrigins: [origin],
      cookieSecure: true,
      authRateLimit: { windowMs: 60_000, limit: 10 },
    });
    const response = await signIn();

    expect(response.status).toBe(200);
    expect(response.headers["set-cookie"][0]).toMatch(/Secure/i);
    expect(response.headers["set-cookie"][0]).toMatch(/SameSite=Lax/i);
  });

  test("rejects insecure or non-HTTPS production cookie configuration", () => {
    const originalNodeEnvironment = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(() =>
        createApp({
          pool,
          allowedOrigins: [origin],
          cookieSecure: false,
        }),
      ).toThrow("Production authentication requires secure cookies");
      expect(() =>
        createApp({
          pool,
          allowedOrigins: ["http://workout.example"],
          cookieSecure: true,
        }),
      ).toThrow("Production frontend origins must use HTTPS");
    } finally {
      if (originalNodeEnvironment === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnvironment;
      }
    }
  });
});
