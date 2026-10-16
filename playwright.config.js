import { defineConfig, devices } from "@playwright/test";

const getPort = (name, defaultPort) => {
  const port = Number(process.env[name] ?? defaultPort);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`${name} must be an available TCP port from 1024 to 65535`);
  }
  return port;
};

const backendPort = getPort("PLAYWRIGHT_BACKEND_PORT", 3101);
const frontendPort = getPort("PLAYWRIGHT_FRONTEND_PORT", 5174);
if (backendPort === frontendPort) {
  throw new Error("Playwright backend and frontend ports must be different");
}

const backendBaseURL = `http://127.0.0.1:${backendPort}`;
const frontendBaseURL = `http://127.0.0.1:${frontendPort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  outputDir: "test-results/playwright",
  use: {
    baseURL: frontendBaseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      metadata: { backendBaseURL },
    },
  ],
  webServer: [
    {
      command: "npm run start --workspace=@workout-tracker/backend",
      url: `${backendBaseURL}/health`,
      env: {
        HOST: "127.0.0.1",
        NODE_ENV: "test",
        PORT: String(backendPort),
        TEST_DATABASE_URL:
          process.env.TEST_DATABASE_URL ??
          "postgresql://localhost:5432/workout_tracker_test",
      },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `npm run dev --workspace=@workout-tracker/frontend -- --host 127.0.0.1 --port ${frontendPort} --strictPort`,
      url: frontendBaseURL,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
