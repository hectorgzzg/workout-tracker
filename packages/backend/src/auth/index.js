import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const passwordKeyLength = 64;
const passwordParameters = { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const dummySalt = Buffer.from("7b27cb123744dd6978ba8f62142bd3e9", "hex");
const sessionCookieName = "wt_session";
const sessionDurationSeconds = 12 * 60 * 60;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(
    password,
    salt,
    passwordKeyLength,
    passwordParameters,
  );
  return [
    "scrypt",
    passwordParameters.N,
    passwordParameters.r,
    passwordParameters.p,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

export function hashInvitationToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export async function verifyPassword(password, encodedHash) {
  const parts = typeof encodedHash === "string" ? encodedHash.split("$") : [];
  const validParameters =
    parts.length === 6 &&
    parts[0] === "scrypt" &&
    Number(parts[1]) === passwordParameters.N &&
    Number(parts[2]) === passwordParameters.r &&
    Number(parts[3]) === passwordParameters.p;
  const salt = validParameters ? Buffer.from(parts[4], "base64url") : dummySalt;
  const expected = validParameters
    ? Buffer.from(parts[5], "base64url")
    : Buffer.alloc(passwordKeyLength);
  const usableHash = salt.length >= 16 && expected.length === passwordKeyLength;
  const key = await scrypt(
    password,
    usableHash ? salt : dummySalt,
    passwordKeyLength,
    passwordParameters,
  );
  return usableHash && timingSafeEqual(key, expected);
}

function readSessionToken(request) {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  for (const cookie of cookieHeader.split(";")) {
    const separator = cookie.indexOf("=");
    if (
      separator < 0 ||
      cookie.slice(0, separator).trim() !== sessionCookieName
    ) {
      continue;
    }

    const token = cookie.slice(separator + 1).trim();
    return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
  }

  return null;
}

function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionCookie(token, { secure = false, clear = false } = {}) {
  const attributes = [
    `${sessionCookieName}=${clear ? "" : token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) {
    attributes.push("Secure");
  }
  attributes.push(clear ? "Max-Age=0" : `Max-Age=${sessionDurationSeconds}`);
  return attributes.join("; ");
}

export function authenticate({ pool }) {
  return async (request, response, next) => {
    const token = readSessionToken(request);
    if (!token) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!pool) {
      response
        .status(503)
        .json({ error: "Authentication service unavailable" });
      return;
    }

    try {
      const { rows } = await pool.query(
        `SELECT users.id AS user_id, users.email, users.role
         FROM auth_sessions AS sessions
         JOIN users ON users.id = sessions.user_id
         WHERE sessions.token_hash = $1
           AND sessions.revoked_at IS NULL
           AND sessions.expires_at > now()`,
        [hashSessionToken(token)],
      );
      if (rows.length !== 1) {
        response.status(401).json({ error: "Authentication required" });
        return;
      }

      request.auth = {
        userId: rows[0].user_id,
        email: rows[0].email,
        role: rows[0].role,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRole(role) {
  return (request, response, next) => {
    if (!request.auth) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }
    if (request.auth.role !== role) {
      response.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

export function requireUserOwner({ parameter = "userId" } = {}) {
  return (request, response, next) => {
    if (!request.auth) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }
    if (request.params[parameter] !== request.auth.userId) {
      response.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

export async function createSession(pool, userId) {
  const token = randomBytes(32).toString("base64url");
  await pool.query(
    `INSERT INTO auth_sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + interval '12 hours')`,
    [userId, hashSessionToken(token)],
  );
  return token;
}

export async function revokeSession(pool, token) {
  if (!pool || !token) {
    return;
  }
  await pool.query(
    `UPDATE auth_sessions SET revoked_at = now()
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hashSessionToken(token)],
  );
}
