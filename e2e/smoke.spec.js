import { expect, test } from "@playwright/test";

test("serves the home screen and backend health endpoint", async ({
  page,
  request,
}, testInfo) => {
  const backendBaseURL = testInfo.project.metadata.backendBaseURL;
  const healthResponse = await request.get(`${backendBaseURL}/health`);

  expect(healthResponse.status()).toBe(200);
  expect(await healthResponse.json()).toEqual({ status: "ok" });

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Training, kept simple." }),
  ).toBeVisible();
});
