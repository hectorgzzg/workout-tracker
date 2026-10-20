import { URL } from "node:url";
import { expect, test } from "@playwright/test";

test("ACC-01: serves signed-out login through the API proxy and backend health", async ({
  page,
  request,
  baseURL,
}, testInfo) => {
  const backendBaseURL = testInfo.project.metadata.backendBaseURL;
  const healthResponse = await request.get(`${backendBaseURL}/health`);

  expect(healthResponse.status()).toBe(200);
  expect(await healthResponse.json()).toEqual({ status: "ok" });

  const profileResponsePromise = page.waitForResponse(
    (response) =>
      response.url() === new URL("/api/profile", baseURL).href &&
      response.request().method() === "GET",
  );
  await page.goto("/");
  const profileResponse = await profileResponsePromise;
  expect(profileResponse.status()).toBe(401);
  expect(await profileResponse.json()).toEqual({
    error: "Authentication required",
  });

  await expect(page).toHaveURL(/\/#\/login\?redirect=\/$/);
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
