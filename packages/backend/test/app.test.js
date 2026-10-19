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
});
