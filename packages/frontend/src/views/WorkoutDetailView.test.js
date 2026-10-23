import { fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { afterEach, jest } from "@jest/globals";
import { createMemoryHistory, createRouter } from "vue-router";
import workoutDetailViewModule from "./WorkoutDetailView.vue";

const WorkoutDetailView =
  workoutDetailViewModule.default ?? workoutDetailViewModule;
const originalFetch = globalThis.fetch;

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function createFetch({ activeSession = null, startSession } = {}) {
  return jest.fn(async (url, options = {}) => {
    if (url.endsWith("/api/program-runs/current")) {
      return jsonResponse({
        id: "run-1",
        templateId: "program-1",
        currentWeekNumber: 1,
        week: {
          days: [
            { id: "run-day-1", templateDayId: "day-1", status: "pending" },
          ],
        },
      });
    }
    if (url.endsWith("/api/programs/program-1")) {
      return jsonResponse({
        weeks: [
          {
            days: [
              { id: "day-1", name: "Workout A", slotNumber: 1, exercises: [] },
            ],
          },
        ],
      });
    }
    if (url.endsWith("/api/catalog/exercises")) return jsonResponse([]);
    if (url.endsWith("/api/workout-sessions/active")) {
      return jsonResponse(activeSession);
    }
    if (
      url.endsWith("/api/workout-sessions/start") &&
      options.method === "POST"
    ) {
      return startSession();
    }
    throw new Error(`Unexpected request: ${url}`);
  });
}

async function renderWorkoutDetail() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/workouts/:workoutId", component: WorkoutDetailView },
      {
        path: "/tracker/:sessionId?",
        component: { template: "<p>Tracker</p>" },
      },
    ],
  });
  await router.push("/workouts/day-1");
  await router.isReady();
  render(WorkoutDetailView, { global: { plugins: [router] } });
  await screen.findByRole("heading", { name: "Workout A" });
  return router;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("starts the selected run slot and navigates to the persisted draft", async () => {
  globalThis.fetch = createFetch({
    startSession: async () =>
      jsonResponse({ id: "session-1", status: "draft" }, 201),
  });
  const router = await renderWorkoutDetail();

  await fireEvent.click(screen.getByRole("button", { name: "Start Workout" }));

  await waitFor(() =>
    expect(router.currentRoute.value.fullPath).toBe("/tracker/session-1"),
  );
  const call = globalThis.fetch.mock.calls.find(([url]) =>
    url.endsWith("/api/workout-sessions/start"),
  );
  expect(call[1].method).toBe("POST");
  expect(call[1].credentials).toBe("include");
  expect(call[1].headers["Idempotency-Key"]).toMatch(
    /^[A-Za-z0-9._:-]{8,128}$/,
  );
  expect(JSON.parse(call[1].body)).toEqual({
    runId: "run-1",
    runDayId: "run-day-1",
  });
});

test("resumes an existing draft without creating another session", async () => {
  globalThis.fetch = createFetch({
    activeSession: {
      id: "session-existing",
      runDayId: "run-day-1",
      status: "draft",
    },
    startSession: async () => {
      throw new Error("Start must not be called while resuming.");
    },
  });
  const router = await renderWorkoutDetail();

  await fireEvent.click(screen.getByRole("button", { name: "Resume Workout" }));

  await waitFor(() =>
    expect(router.currentRoute.value.fullPath).toBe(
      "/tracker/session-existing",
    ),
  );
  expect(
    globalThis.fetch.mock.calls.some(([url]) =>
      url.endsWith("/api/workout-sessions/start"),
    ),
  ).toBe(false);
});

test("keeps Start visible after a failed request and retries with the same key", async () => {
  let attempts = 0;
  globalThis.fetch = createFetch({
    startSession: async () => {
      attempts += 1;
      return attempts === 1
        ? jsonResponse(
            { error: "The workout service could not be reached. Try again." },
            503,
          )
        : jsonResponse({ id: "session-retried", status: "draft" }, 201);
    },
  });
  const router = await renderWorkoutDetail();

  await fireEvent.click(screen.getByRole("button", { name: "Start Workout" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/try again/i);
  expect(router.currentRoute.value.fullPath).toBe("/workouts/day-1");
  await fireEvent.click(screen.getByRole("button", { name: "Retry Start" }));

  await waitFor(() =>
    expect(router.currentRoute.value.fullPath).toBe("/tracker/session-retried"),
  );
  const keys = globalThis.fetch.mock.calls
    .filter(([url]) => url.endsWith("/api/workout-sessions/start"))
    .map(([, options]) => options.headers["Idempotency-Key"]);
  expect(keys[0]).toBe(keys[1]);
});
