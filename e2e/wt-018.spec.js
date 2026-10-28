import { URL } from "node:url";
import { expect, test } from "@playwright/test";

const sessionId = "session-wt-018";
const startedAt = "2026-10-27T14:00:00.000Z";

function buildSession(setTypes = ["standard"]) {
  return {
    id: sessionId,
    status: "draft",
    version: 1,
    startedAt,
    startedTimezone: "UTC",
    startedLocalDate: "2026-10-27",
    timers: {
      sessionElapsedSeconds: 0,
      sessionStartedAt: startedAt,
      paused: false,
      restPaused: true,
      restDurationSeconds: 0,
      restRemainingSeconds: 0,
      restEndsAt: null,
    },
    exercises: [
      {
        id: "session-exercise-wt-018",
        exerciseId: null,
        name: "Bench press",
        snapshot: { restCategory: "upper_compound", unit: "kg" },
        prescription: { notes: "", sets: [] },
        sets: setTypes.map((type, index) => ({
          id: `session-set-wt-018-${index + 1}`,
          setNumber: index + 1,
          type,
          prescription: {
            repMin: 5,
            repMax: 8,
            targetRir: 2,
            unit: "kg",
          },
          actualLoadKg: 40,
          actualReps: 6,
          actualRir: type === "failure" ? 0 : 2,
          checked: false,
        })),
      },
    ],
  };
}

class WorkoutTimerPage {
  constructor(page) {
    this.page = page;
    this.sessionTimer = page.getByRole("status", { name: "Session timer" });
    this.restTimer = page.getByRole("status", { name: "Rest timer" });
  }

  async open() {
    const startupErrors = [];
    this.page.on("pageerror", (error) =>
      startupErrors.push(`pageerror: ${error.message}`),
    );
    this.page.on("requestfailed", (request) =>
      startupErrors.push(
        `requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText}`,
      ),
    );
    await this.page.goto(`/#/tracker/${sessionId}`);
    try {
      await expect(
        this.page.getByRole("heading", { name: "Bench press" }),
      ).toBeVisible();
    } catch (error) {
      throw new Error(`${error.message}\n${startupErrors.join("\n")}`, {
        cause: error,
      });
    }
  }

  async clickTimerControl(name) {
    const button = this.page.getByRole("button", { name, exact: true });
    await expect(button).toBeEnabled();
    const saveResponse = this.page.waitForResponse(
      (response) =>
        response.url().includes(`/api/workout-sessions/${sessionId}`) &&
        response.request().method() === "PUT",
    );
    await button.click();
    await saveResponse;
    await expect(
      this.page.getByText("Draft saved.", { exact: true }),
    ).toBeVisible();
  }

  async documentWidths() {
    return this.page.evaluate(() => ({
      document: globalThis.document.documentElement.scrollWidth,
      viewport: globalThis.window.innerWidth,
      overflow: [...globalThis.document.querySelectorAll("body *")]
        .map((element) => ({
          element: `${element.tagName.toLowerCase()}.${element.className}`,
          right: Math.round(element.getBoundingClientRect().right),
          width: Math.round(element.getBoundingClientRect().width),
        }))
        .filter(({ right }) => right > globalThis.window.innerWidth)
        .slice(0, 8),
    }));
  }
}

async function mockTrackerApi(
  page,
  { setTypes = ["standard"], restSeconds = 75 } = {},
) {
  const state = { session: buildSession(setTypes) };
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const method = route.request().method();
    let status = 200;
    let body;

    if (pathname === "/api/profile" && method === "GET") {
      body = {
        id: "user-wt-018",
        email: "wt-018@example.test",
        displayName: "WT-018 Browser Test",
        role: "member",
      };
    } else if (
      pathname === `/api/workout-sessions/${sessionId}` &&
      method === "GET"
    ) {
      body = state.session;
    } else if (pathname === "/api/settings" && method === "GET") {
      body = {
        profile: {
          restDurationsSeconds: {
            upper_compound: restSeconds,
            lower_compound: 180,
            upper_isolation: 90,
            lower_isolation: 90,
            core: 60,
          },
        },
      };
    } else if (
      pathname === `/api/workout-sessions/${sessionId}` &&
      method === "PUT"
    ) {
      const payload = route.request().postDataJSON();
      state.session = {
        ...state.session,
        version: state.session.version + 1,
        timers: payload.timers,
        exercises: state.session.exercises.map((exercise) => ({
          ...exercise,
          sets: exercise.sets.map((set) => ({
            ...set,
            ...payload.sets.find((change) => change.id === set.id),
          })),
        })),
      };
      body = state.session;
    } else {
      status = 404;
      body = { error: `Unexpected API request: ${method} ${pathname}` };
    }

    await route.fulfill({ status, json: body });
  });
  return state;
}

test.describe("WT-018: mocked-API browser behavior", () => {
  test("controls pause both clocks and mocked draft state recovers after reload", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date(startedAt) });
    await page.setViewportSize({ width: 390, height: 844 });
    const state = await mockTrackerApi(page);
    const tracker = new WorkoutTimerPage(page);

    await tracker.open();
    await expect(tracker.sessionTimer).toHaveText("00:00");
    await tracker.clickTimerControl("Start rest");
    await expect(tracker.restTimer).toHaveText("01:15");

    await page.clock.runFor(5_000);
    await tracker.clickTimerControl("Pause timers");
    const elapsedSession = await tracker.sessionTimer.innerText();
    const remainingRest = await tracker.restTimer.innerText();
    await page.clock.runFor(10_000);
    await expect(tracker.sessionTimer).toHaveText(elapsedSession);
    await expect(tracker.restTimer).toHaveText(remainingRest);
    expect(state.session.timers.paused).toBe(true);

    await page.reload();
    await expect(tracker.sessionTimer).toHaveText(elapsedSession);
    await expect(tracker.restTimer).toHaveText(remainingRest);
    await expect(
      page.getByRole("button", { name: "Resume timers", exact: true }),
    ).toBeVisible();

    await tracker.clickTimerControl("Resume timers");
    await page.clock.runFor(3_000);
    await expect(tracker.sessionTimer).not.toHaveText(elapsedSession);
    await tracker.clickTimerControl("Pause rest");
    const pausedRest = await tracker.restTimer.innerText();
    await page.clock.runFor(5_000);
    await expect(tracker.restTimer).toHaveText(pausedRest);

    await tracker.clickTimerControl("Add 30 seconds");
    await expect(tracker.restTimer).toHaveText("01:37");
    await tracker.clickTimerControl("Subtract 30 seconds");
    await expect(tracker.restTimer).toHaveText(pausedRest);
    await tracker.clickTimerControl("Reset rest");
    await expect(tracker.restTimer).toHaveText("01:15");
    await tracker.clickTimerControl("Skip rest");
    await expect(tracker.restTimer).toHaveText("00:00");
  });

  test("warmups do not start rest, working sets replace it, and foreground audio fires", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date(startedAt) });
    await page.addInitScript(() => {
      globalThis.__restToneCount = 0;
      globalThis.AudioContext = class {
        currentTime = 0;
        destination = {};
        state = "running";
        createOscillator() {
          return {
            frequency: { value: 0 },
            connect() {},
            start() {
              globalThis.__restToneCount += 1;
            },
            stop() {},
          };
        }
        createGain() {
          return { gain: { value: 0 }, connect() {} };
        }
        resume() {
          return Promise.resolve();
        }
      };
    });
    const state = await mockTrackerApi(page, {
      setTypes: ["warmup", "standard", "failure"],
      restSeconds: 5,
    });
    const tracker = new WorkoutTimerPage(page);
    await tracker.open();

    await page.getByRole("checkbox", { name: "Complete set 1" }).check();
    await expect.poll(() => state.session.version).toBe(2);
    expect(state.session.timers.restDurationSeconds).toBe(0);

    await page.getByRole("checkbox", { name: "Complete set 2" }).check();
    await expect.poll(() => state.session.version).toBe(3);
    await expect(tracker.restTimer).toHaveText("00:05");
    await page.getByRole("checkbox", { name: "Complete set 3" }).check();
    await expect.poll(() => state.session.version).toBe(4);
    expect(state.session.timers.restDurationSeconds).toBe(5);
    await expect(tracker.restTimer).toHaveText("00:05");

    await page.clock.runFor(6_000);
    await expect
      .poll(() => page.evaluate(() => globalThis.__restToneCount))
      .toBe(1);
  });

  test("timer toolbar fits mobile and desktop viewports", async ({ page }) => {
    await mockTrackerApi(page);
    const tracker = new WorkoutTimerPage(page);
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await tracker.open();
      await expect(tracker.sessionTimer).toBeVisible();
      await expect(tracker.restTimer).toBeVisible();
      const widths = await tracker.documentWidths();
      expect(
        widths.document,
        JSON.stringify(widths.overflow),
      ).toBeLessThanOrEqual(widths.viewport);
    }
  });
});
