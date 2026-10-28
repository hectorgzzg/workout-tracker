import { fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { afterEach, jest } from "@jest/globals";
import workoutTrackerViewModule from "./WorkoutTrackerView.vue";

const WorkoutTrackerView =
  workoutTrackerViewModule.default ?? workoutTrackerViewModule;
const originalFetch = globalThis.fetch;
const originalAudioContext = globalThis.AudioContext;
const originalVisibilityState = Object.getOwnPropertyDescriptor(
  document,
  "visibilityState",
);
const startTime = Date.parse("2026-10-27T14:00:00.000Z");

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function sessionWithTimers(setTypes = ["standard"]) {
  return {
    id: "session-018",
    status: "draft",
    version: 1,
    startedAt: new Date(startTime).toISOString(),
    startedTimezone: "UTC",
    startedLocalDate: "2026-10-27",
    timers: {
      sessionElapsedSeconds: 0,
      sessionStartedAt: new Date(startTime).toISOString(),
      paused: false,
      restPaused: true,
      restDurationSeconds: 0,
      restRemainingSeconds: 0,
      restEndsAt: null,
    },
    exercises: [
      {
        id: "session-exercise-018",
        exerciseId: null,
        name: "Bench press",
        snapshot: { restCategory: "upper_compound", unit: "kg" },
        prescription: { notes: "", sets: [] },
        sets: setTypes.map((type, index) => ({
          id: `session-set-018-${index + 1}`,
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

function renderTracker() {
  return render(WorkoutTrackerView, {
    global: {
      mocks: { $route: { params: { sessionId: "session-018" } } },
      stubs: { RouterLink: true },
    },
  });
}

function timerSeconds(label) {
  return screen
    .getByLabelText(label)
    .textContent.split(":")
    .map(Number)
    .reduce((total, part) => total * 60 + part, 0);
}

async function clickTimerControl(name) {
  const button = screen.getByRole("button", { name });
  await waitFor(() => expect(button).not.toBeDisabled());
  await fireEvent.click(button);
  await waitFor(() => expect(button).not.toBeDisabled());
}

afterEach(() => {
  jest.useRealTimers();
  globalThis.fetch = originalFetch;
  if (originalAudioContext === undefined) {
    delete globalThis.AudioContext;
  } else {
    globalThis.AudioContext = originalAudioContext;
  }
  if (originalVisibilityState) {
    Object.defineProperty(document, "visibilityState", originalVisibilityState);
  } else {
    delete document.visibilityState;
  }
});

test("timer controls use profile rest settings and pause/resume from timestamps", async () => {
  jest.useFakeTimers({ now: startTime });
  let session = sessionWithTimers();
  const fetch = jest.fn(async (url, options = {}) => {
    if (url.endsWith("/api/workout-sessions/session-018") && !options.method) {
      return jsonResponse(session);
    }
    if (url.endsWith("/api/settings")) {
      return jsonResponse({
        profile: {
          restDurationsSeconds: {
            upper_compound: 75,
            lower_compound: 180,
            upper_isolation: 90,
            lower_isolation: 90,
            core: 60,
          },
        },
      });
    }
    if (
      url.endsWith("/api/workout-sessions/session-018") &&
      options.method === "PUT"
    ) {
      const payload = JSON.parse(options.body);
      session = {
        ...session,
        version: session.version + 1,
        timers: payload.timers,
      };
      return jsonResponse(session);
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  globalThis.fetch = fetch;

  renderTracker();

  expect(await screen.findByLabelText("Session timer")).toHaveTextContent(
    "00:00",
  );
  await clickTimerControl("Start rest");
  expect(screen.getByLabelText("Rest timer")).toHaveTextContent("01:15");

  await jest.advanceTimersByTimeAsync(5_000);
  expect(screen.getByLabelText("Session timer")).toHaveTextContent("00:05");
  expect(timerSeconds("Rest timer")).toBeGreaterThanOrEqual(70);
  expect(timerSeconds("Rest timer")).toBeLessThanOrEqual(71);
  const restBeforePause = timerSeconds("Rest timer");

  await clickTimerControl("Pause timers");
  const restAfterPause = timerSeconds("Rest timer");
  expect(restAfterPause).toBeLessThanOrEqual(restBeforePause);
  expect(restAfterPause).toBeGreaterThanOrEqual(restBeforePause - 1);
  await jest.advanceTimersByTimeAsync(10_000);
  expect(screen.getByLabelText("Session timer")).toHaveTextContent("00:05");
  expect(timerSeconds("Rest timer")).toBe(restAfterPause);

  await clickTimerControl("Resume timers");
  await jest.advanceTimersByTimeAsync(3_000);
  expect(timerSeconds("Session timer")).toBeGreaterThanOrEqual(6);
  expect(timerSeconds("Session timer")).toBeLessThanOrEqual(8);
  expect(timerSeconds("Session timer")).toBeGreaterThan(5);
  const restAfterResume = timerSeconds("Rest timer");
  expect(restAfterResume).toBeGreaterThanOrEqual(restBeforePause - 4);
  expect(restAfterResume).toBeLessThan(restBeforePause);

  const sessionBeforeRestPause = timerSeconds("Session timer");
  await clickTimerControl("Pause rest");
  const restAfterRestPause = timerSeconds("Rest timer");
  expect(restAfterRestPause).toBeLessThanOrEqual(restAfterResume);
  expect(restAfterRestPause).toBeGreaterThanOrEqual(restAfterResume - 1);
  await jest.advanceTimersByTimeAsync(5_000);
  expect(timerSeconds("Session timer")).toBeGreaterThanOrEqual(
    sessionBeforeRestPause + 4,
  );
  expect(timerSeconds("Session timer")).toBeLessThanOrEqual(
    sessionBeforeRestPause + 6,
  );
  expect(timerSeconds("Rest timer")).toBe(restAfterRestPause);

  await clickTimerControl("Resume rest");
  await clickTimerControl("Add 30 seconds");
  expect(timerSeconds("Rest timer")).toBe(restAfterRestPause + 30);
  await clickTimerControl("Subtract 30 seconds");
  expect(timerSeconds("Rest timer")).toBe(restAfterRestPause);
  await clickTimerControl("Reset rest");
  expect(screen.getByLabelText("Rest timer")).toHaveTextContent("01:15");
  await clickTimerControl("Start rest");
  await clickTimerControl("Skip rest");
  expect(screen.getByLabelText("Rest timer")).toHaveTextContent("00:00");

  expect(
    fetch.mock.calls.some(([, options]) => {
      if (options?.method !== "PUT") return false;
      return JSON.parse(options.body).timers?.paused === true;
    }),
  ).toBe(true);
});

test("warmups do not start rest; working and failure sets do, and unchecking does not rewind", async () => {
  jest.useFakeTimers({ now: startTime });
  let session = sessionWithTimers(["warmup", "standard", "failure"]);
  const fetch = jest.fn(async (url, options = {}) => {
    if (url.endsWith("/api/workout-sessions/session-018") && !options.method) {
      return jsonResponse(session);
    }
    if (url.endsWith("/api/settings")) {
      return jsonResponse({
        profile: {
          restDurationsSeconds: {
            upper_compound: 75,
            lower_compound: 180,
            upper_isolation: 90,
            lower_isolation: 90,
            core: 60,
          },
        },
      });
    }
    if (
      url.endsWith("/api/workout-sessions/session-018") &&
      options.method === "PUT"
    ) {
      const payload = JSON.parse(options.body);
      session = {
        ...session,
        version: session.version + 1,
        timers: payload.timers,
        exercises: session.exercises.map((exercise) => ({
          ...exercise,
          sets: exercise.sets.map((set) => ({
            ...set,
            ...payload.sets.find((change) => change.id === set.id),
          })),
        })),
      };
      return jsonResponse(session);
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  globalThis.fetch = fetch;

  renderTracker();
  await screen.findByRole("heading", { name: "Bench press" });

  await fireEvent.click(
    screen.getByRole("checkbox", { name: "Complete set 1" }),
  );
  await waitFor(() => expect(session.timers.restDurationSeconds).toBe(0));

  await fireEvent.click(
    screen.getByRole("checkbox", { name: "Complete set 2" }),
  );
  await waitFor(() => expect(session.timers.restDurationSeconds).toBe(75));
  await jest.advanceTimersByTimeAsync(10_000);
  const restBeforeUncheck = timerSeconds("Rest timer");
  expect(restBeforeUncheck).toBeGreaterThanOrEqual(65);
  expect(restBeforeUncheck).toBeLessThanOrEqual(66);

  await fireEvent.click(
    screen.getByRole("checkbox", { name: "Complete set 2" }),
  );
  await waitFor(() => expect(session.version).toBe(4));
  expect(timerSeconds("Rest timer")).toBe(restBeforeUncheck);

  await waitFor(() =>
    expect(
      screen.getByRole("checkbox", { name: "Complete set 3" }),
    ).not.toBeDisabled(),
  );
  await fireEvent.click(
    screen.getByRole("checkbox", { name: "Complete set 3" }),
  );
  await waitFor(() => expect(session.version).toBe(5));
  const saves = fetch.mock.calls
    .filter(([, options]) => options?.method === "PUT")
    .map(([, options]) => JSON.parse(options.body));
  expect(saves.at(-1).timers.restDurationSeconds).toBe(75);
  expect(screen.getByLabelText("Rest timer")).toHaveTextContent("01:15");
});

test("rest progress diminishes and a foreground completion plays a tone", async () => {
  jest.useFakeTimers({ now: startTime });
  let session = sessionWithTimers();
  const oscillator = {
    connect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    frequency: { value: 0 },
  };
  const gain = {
    connect: jest.fn(),
    gain: { value: 0 },
  };
  class MockAudioContext {
    currentTime = 0;
    destination = {};
    createOscillator() {
      return oscillator;
    }
    createGain() {
      return gain;
    }
    resume() {}
  }
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  globalThis.AudioContext = MockAudioContext;
  globalThis.fetch = jest.fn(async (url, options = {}) => {
    if (url.endsWith("/api/workout-sessions/session-018") && !options.method) {
      return jsonResponse(session);
    }
    if (url.endsWith("/api/settings")) {
      return jsonResponse({
        profile: {
          restDurationsSeconds: {
            upper_compound: 10,
            lower_compound: 180,
            upper_isolation: 90,
            lower_isolation: 90,
            core: 60,
          },
        },
      });
    }
    if (
      url.endsWith("/api/workout-sessions/session-018") &&
      options.method === "PUT"
    ) {
      session = {
        ...session,
        version: session.version + 1,
        timers: JSON.parse(options.body).timers,
      };
      return jsonResponse(session);
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  renderTracker();
  await screen.findByRole("heading", { name: "Bench press" });
  await fireEvent.click(screen.getByRole("button", { name: "Start rest" }));
  const progress = screen.getByRole("progressbar", {
    name: "Rest timer progress",
  });
  expect(progress).toHaveValue(10);

  await jest.advanceTimersByTimeAsync(5_000);
  expect(Number(progress.getAttribute("value"))).toBeGreaterThanOrEqual(5);
  expect(Number(progress.getAttribute("value"))).toBeLessThanOrEqual(6);
  await jest.advanceTimersByTimeAsync(5_000);
  await jest.advanceTimersByTimeAsync(1_000);
  expect(oscillator.start).toHaveBeenCalledTimes(1);
  expect(oscillator.stop).toHaveBeenCalledTimes(1);

  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "hidden",
  });
  await clickTimerControl("Start rest");
  await jest.advanceTimersByTimeAsync(11_000);
  expect(oscillator.start).toHaveBeenCalledTimes(1);
});
