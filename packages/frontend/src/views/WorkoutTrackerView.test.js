import { fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { afterEach, jest } from "@jest/globals";
import workoutTrackerViewModule from "./WorkoutTrackerView.vue";

const WorkoutTrackerView =
  workoutTrackerViewModule.default ?? workoutTrackerViewModule;
const originalFetch = globalThis.fetch;

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function draftSession(overrides = {}) {
  return {
    id: "session-1",
    runId: "run-1",
    runDayId: "run-day-1",
    status: "draft",
    version: 1,
    startedTimezone: "America/Los_Angeles",
    startedLocalDate: "2026-10-22",
    exercises: [
      {
        id: "session-exercise-1",
        name: "Bench press",
        prescription: { notes: "", sets: [] },
        sets: [
          {
            id: "session-set-1",
            setNumber: 1,
            type: "standard",
            prescription: { repMin: 5, repMax: 8, targetRir: 2, unit: "kg" },
            actualLoadKg: null,
            actualReps: null,
            actualRir: null,
            checked: false,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function renderTracker(sessionId = "session-1") {
  return render(WorkoutTrackerView, {
    global: {
      mocks: {
        $route: { params: sessionId ? { sessionId } : {} },
        $router: { replace: jest.fn() },
      },
      stubs: { RouterLink: true },
    },
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("recovers an active draft after opening the tracker without a session URL", async () => {
  globalThis.fetch = jest.fn(async (url) => {
    if (url.endsWith("/api/workout-sessions/active")) {
      return jsonResponse(draftSession());
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  renderTracker(null);

  expect(
    await screen.findByRole("heading", { name: "Bench press" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Draft started October 22, 2026 · America/Los_Angeles"),
  ).toBeInTheDocument();
});

test("preserves visible unsaved set input after failure and retries the same request", async () => {
  let saveAttempts = 0;
  const fetch = jest.fn(async (url, options = {}) => {
    if (url.endsWith("/api/workout-sessions/session-1") && !options.method) {
      return jsonResponse(draftSession());
    }
    if (
      url.endsWith("/api/workout-sessions/session-1") &&
      options.method === "PUT"
    ) {
      saveAttempts += 1;
      return saveAttempts === 1
        ? jsonResponse(
            { error: "The workout service could not be reached. Try again." },
            503,
          )
        : jsonResponse(draftSession({ version: 2 }));
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  globalThis.fetch = fetch;

  renderTracker();
  const load = await screen.findByLabelText("Set 1 actual load (kg)");
  const reps = screen.getByLabelText("Set 1 actual reps");
  const rir = screen.getByLabelText("Set 1 actual RIR");
  await fireEvent.update(load, "42.5");
  await fireEvent.update(reps, "6");
  await fireEvent.update(rir, "2");
  await fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(/try again/i);
  expect(load).toHaveValue(42.5);
  expect(reps).toHaveValue(6);
  expect(rir).toHaveValue(2);
  expect(screen.queryByText("Draft saved.")).not.toBeInTheDocument();
  await fireEvent.click(screen.getByRole("button", { name: "Retry Save" }));

  await waitFor(() =>
    expect(screen.getByText("Draft saved.")).toBeInTheDocument(),
  );
  const saves = fetch.mock.calls.filter(
    ([, options]) => options?.method === "PUT",
  );
  expect(saves).toHaveLength(2);
  expect(saves[0][1].headers["Idempotency-Key"]).toBe(
    saves[1][1].headers["Idempotency-Key"],
  );
  expect(JSON.parse(saves[1][1].body)).toMatchObject({
    version: 1,
    sets: [{ actualLoadKg: 42.5, actualReps: 6, actualRir: 2 }],
  });
});
