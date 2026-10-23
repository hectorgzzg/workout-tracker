import request from "supertest";
import app from "../src/app.js";

describe("backend health endpoint", () => {
  test("reports that the API is available", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  test("rejects unauthenticated access to the current user's profile", async () => {
    const response = await request(app).get("/api/profile");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Authentication required" });
  });

  test("allows idempotent session requests through cross-origin preflight", async () => {
    const response = await request(app)
      .options("/api/workout-sessions/start")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type,idempotency-key");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-headers"]).toContain(
      "Idempotency-Key",
    );
  });
});
