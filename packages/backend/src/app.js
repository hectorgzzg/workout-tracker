import express from "express";
import rateLimit from "express-rate-limit";
import { createDatabasePool } from "./persistence/pool.js";
import {
  authenticate,
  createSession,
  revokeSession,
  sessionCookie,
  verifyPassword,
} from "./auth/index.js";

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function parseAllowedOrigins(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value) {
    return value
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("FRONTEND_ORIGINS must be configured in production");
  }
  return ["http://localhost:5173", "http://127.0.0.1:5173"];
}

function normalizeOrigin(value) {
  const parsed = new URL(value);
  if (
    parsed.origin !== value ||
    !["http:", "https:"].includes(parsed.protocol)
  ) {
    throw new Error(
      "Frontend origins must be exact HTTP(S) origins without paths",
    );
  }
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new Error("Production frontend origins must use HTTPS");
  }
  return parsed.origin;
}

function parseBoolean(value, name) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function createCorsMiddleware(allowedOrigins) {
  const originSet = new Set(allowedOrigins);
  return (request, response, next) => {
    const origin = request.get("Origin");
    if (origin && originSet.has(origin)) {
      response.vary("Origin");
      response.set("Access-Control-Allow-Origin", origin);
      response.set("Access-Control-Allow-Credentials", "true");
    }

    if (
      request.method === "OPTIONS" &&
      request.get("Access-Control-Request-Method")
    ) {
      if (!origin || !originSet.has(origin)) {
        response.status(403).json({ error: "Untrusted request origin" });
        return;
      }
      response.set(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      );
      response.set(
        "Access-Control-Allow-Headers",
        "Content-Type, X-Requested-With",
      );
      response.status(204).end();
      return;
    }

    next();
  };
}

function verifyRequestOrigin(allowedOrigins) {
  const originSet = new Set(allowedOrigins);
  return (request, response, next) => {
    if (
      unsafeMethods.has(request.method) &&
      (!request.get("Origin") || !originSet.has(request.get("Origin")))
    ) {
      response.status(403).json({ error: "Untrusted request origin" });
      return;
    }
    next();
  };
}

export function createApp(options = {}) {
  const allowedOrigins = parseAllowedOrigins(
    options.allowedOrigins ?? process.env.FRONTEND_ORIGINS,
  ).map(normalizeOrigin);
  const cookieSecure =
    options.cookieSecure ??
    (process.env.COOKIE_SECURE
      ? parseBoolean(process.env.COOKIE_SECURE, "COOKIE_SECURE")
      : process.env.NODE_ENV === "production");
  if (process.env.NODE_ENV === "production" && !cookieSecure) {
    throw new Error("Production authentication requires secure cookies");
  }
  const trustProxyHops = Number(
    options.trustProxyHops ?? process.env.TRUST_PROXY_HOPS ?? 0,
  );
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) {
    throw new Error("TRUST_PROXY_HOPS must be a nonnegative integer");
  }

  const pool =
    options.pool ??
    (process.env.DATABASE_URL
      ? createDatabasePool({ connectionString: process.env.DATABASE_URL })
      : null);
  const app = express();
  app.set("trust proxy", trustProxyHops);
  app.use("/api", createCorsMiddleware(allowedOrigins));
  app.use(express.json({ limit: "16kb" }));
  app.use("/api", (_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });
  app.use("/api", verifyRequestOrigin(allowedOrigins));

  const loginLimiter = rateLimit({
    windowMs: options.authRateLimit?.windowMs ?? 15 * 60 * 1000,
    limit: options.authRateLimit?.limit ?? 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_request, response) => {
      response.status(429).json({ error: "Too many login attempts" });
    },
  });

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.post("/api/auth/login", loginLimiter, async (request, response) => {
    const email =
      typeof request.body?.email === "string"
        ? request.body.email.trim().toLowerCase()
        : "";
    const password = request.body?.password;
    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof password !== "string" ||
      password.length === 0 ||
      password.length > 256
    ) {
      response.status(400).json({ error: "Valid email and password required" });
      return;
    }
    if (!pool) {
      response
        .status(503)
        .json({ error: "Authentication service unavailable" });
      return;
    }

    const { rows } = await pool.query(
      "SELECT id, email, role, password_hash FROM users WHERE lower(email) = $1",
      [email],
    );
    const user = rows[0];
    if (!(await verifyPassword(password, user?.password_hash))) {
      response.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const token = await createSession(pool, user.id);
    response.setHeader(
      "Set-Cookie",
      sessionCookie(token, { secure: cookieSecure }),
    );
    response
      .status(200)
      .json({ id: user.id, email: user.email, role: user.role });
  });

  app.post("/api/auth/logout", async (request, response) => {
    const cookieHeader = request.headers.cookie ?? "";
    const token = cookieHeader
      .split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith("wt_session="))
      ?.slice("wt_session=".length);
    if (!pool) {
      response
        .status(503)
        .json({ error: "Authentication service unavailable" });
      return;
    }
    await revokeSession(pool, token);
    response.setHeader(
      "Set-Cookie",
      sessionCookie("", { secure: cookieSecure, clear: true }),
    );
    response.status(204).end();
  });

  app.get("/api/profile", authenticate({ pool }), async (request, response) => {
    const { rows } = await pool.query(
      `SELECT users.id, users.email, users.role, profiles.display_name,
              profiles.timezone, profiles.default_unit
       FROM users
       JOIN profiles ON profiles.user_id = users.id
       WHERE users.id = $1`,
      [request.auth.userId],
    );
    if (rows.length !== 1) {
      response.status(404).json({ error: "Profile not found" });
      return;
    }
    const profile = rows[0];
    response.json({
      id: profile.id,
      email: profile.email,
      role: profile.role,
      displayName: profile.display_name,
      timezone: profile.timezone,
      defaultUnit: profile.default_unit,
    });
  });

  app.use((error, _request, response, _next) => {
    if (response.headersSent) {
      _next(error);
      return;
    }
    if (error.status === 400 && error.type === "entity.parse.failed") {
      response.status(400).json({ error: "Invalid request body" });
      return;
    }
    response.status(500).json({ error: "Internal server error" });
  });

  return app;
}

export { authenticate, requireRole, requireUserOwner } from "./auth/index.js";
export default createApp();
