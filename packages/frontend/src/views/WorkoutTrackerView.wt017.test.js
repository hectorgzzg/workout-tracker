import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/vue";
import { afterEach, jest } from "@jest/globals";
import { h } from "vue";
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

function buildSession(overrides = {}) {
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
        exerciseId: "11111111-1111-4111-8111-111111111111",
        name: "Bench press",
        snapshot: { imageUrl: "https://example.test/bench.jpg", unit: "kg" },
        prescription: {
          notes: "",
          sets: [
            {
              type: "standard",
              repMin: 5,
              repMax: 8,
              targetRir: 2,
              unit: "kg",
            },
          ],
        },
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
      {
        id: "session-exercise-2",
        exerciseId: "22222222-2222-4222-8222-222222222222",
        name: "Seated row",
        snapshot: { imageUrl: "https://example.test/row.jpg", unit: "kg" },
        prescription: {
          notes: "",
          sets: [
            {
              type: "standard",
              repMin: 10,
              repMax: 12,
              targetRir: 2,
              unit: "kg",
            },
          ],
        },
        sets: [
          {
            id: "session-set-2",
            setNumber: 1,
            type: "standard",
            prescription: { repMin: 10, repMax: 12, targetRir: 2, unit: "kg" },
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

function renderTracker() {
  const RouterLinkStub = {
    props: ["to"],
    setup(props, { slots }) {
      return () => h("a", { href: `#${props.to}` }, slots.default?.());
    },
  };
  return render(WorkoutTrackerView, {
    global: {
      mocks: {
        $route: { params: { sessionId: "session-1" } },
      },
      stubs: { RouterLink: RouterLinkStub },
    },
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("shows exercise image navigation, position text, and Info/History actions", async () => {
  globalThis.fetch = jest.fn(async (url) => {
    if (url.endsWith("/api/workout-sessions/session-1")) {
      return jsonResponse(buildSession());
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  renderTracker();

  expect(
    await screen.findByRole("heading", { name: "Bench press" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Exercise 1 of 2 · Set 1 of 1")).toBeInTheDocument();
  expect(screen.getByLabelText("Auto load")).toHaveValue("Manual");
  expect(screen.getByLabelText("Auto load")).toHaveAttribute("readonly");
  expect(screen.getByLabelText("Auto reps")).toHaveValue("5-8 reps");
  expect(screen.getByLabelText("Auto RIR")).toHaveValue("2");
  expect(screen.getByLabelText("Unit for Bench press")).toHaveValue("kg");
  expect(screen.getByLabelText("Set 1 actual load (kg)")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Info" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "History" })).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Exercise 1: Bench press" }),
  ).not.toHaveClass("tracker-exercise-nav__item--complete");

  await fireEvent.click(
    screen.getByRole("button", { name: "Exercise 2: Seated row" }),
  );

  expect(
    screen.getByRole("heading", { name: "Seated row" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Exercise 2 of 2 · Set 1 of 1")).toBeInTheDocument();
});

test("marks an exercise selector complete after every working set, excluding warmups", async () => {
  let session = buildSession({
    exercises: [
      {
        ...buildSession().exercises[0],
        sets: [
          {
            id: "warmup-set",
            setNumber: 1,
            type: "warmup",
            prescription: { repMin: 5, repMax: 8, targetRir: 2, unit: "kg" },
            actualLoadKg: "20.000",
            actualReps: 8,
            actualRir: 3,
            checked: true,
          },
          {
            id: "working-set-1",
            setNumber: 2,
            type: "standard",
            prescription: { repMin: 5, repMax: 8, targetRir: 2, unit: "kg" },
            actualLoadKg: "40.000",
            actualReps: 6,
            actualRir: 2,
            checked: true,
          },
          {
            id: "working-set-2",
            setNumber: 3,
            type: "standard",
            prescription: { repMin: 5, repMax: 8, targetRir: 2, unit: "kg" },
            actualLoadKg: "40.000",
            actualReps: 6,
            actualRir: 2,
            checked: false,
          },
        ],
      },
      buildSession().exercises[1],
    ],
  });
  const fetch = jest.fn(async (url, options = {}) => {
    if (url.endsWith("/api/workout-sessions/session-1") && !options.method) {
      return jsonResponse(session);
    }
    if (
      url.endsWith("/api/workout-sessions/session-1") &&
      options.method === "PUT"
    ) {
      const { sets } = JSON.parse(options.body);
      session = {
        ...session,
        version: session.version + 1,
        exercises: session.exercises.map((exercise) => ({
          ...exercise,
          sets: exercise.sets.map((set) => ({
            ...set,
            checked:
              sets.find((change) => change.id === set.id)?.checked ??
              set.checked,
          })),
        })),
      };
      return jsonResponse(session);
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  globalThis.fetch = fetch;

  renderTracker();

  const selector = await screen.findByRole("button", {
    name: "Exercise 1: Bench press",
  });
  expect(selector).not.toHaveClass("tracker-exercise-nav__item--complete");
  await fireEvent.click(
    screen.getByRole("checkbox", { name: "Complete set 3" }),
  );

  await waitFor(() =>
    expect(selector).toHaveClass("tracker-exercise-nav__item--complete"),
  );
  expect(selector).toHaveAccessibleName("Exercise 1: Bench press, complete");
  expect(within(selector).queryByText("✓")).not.toBeInTheDocument();
});

test("checks a set to save and lock, then unchecks to unlock with a second save", async () => {
  let session = buildSession();
  const fetch = jest.fn(async (url, options = {}) => {
    if (url.endsWith("/api/workout-sessions/session-1") && !options.method) {
      return jsonResponse(session);
    }
    if (
      url.endsWith("/api/workout-sessions/session-1") &&
      options.method === "PUT"
    ) {
      const payload = JSON.parse(options.body);
      const checked = payload.sets[0].checked;
      session = buildSession({
        version: checked ? 2 : 3,
        exercises: [
          {
            ...session.exercises[0],
            sets: [
              {
                ...session.exercises[0].sets[0],
                actualLoadKg: payload.sets[0].actualLoadKg,
                actualReps: payload.sets[0].actualReps,
                actualRir: payload.sets[0].actualRir,
                checked,
              },
            ],
          },
          session.exercises[1],
        ],
      });
      return jsonResponse(session);
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  globalThis.fetch = fetch;

  renderTracker();

  const load = await screen.findByLabelText("Set 1 actual load (kg)");
  await fireEvent.update(load, "42.5");
  await fireEvent.update(screen.getByLabelText("Set 1 actual reps"), "6");
  await fireEvent.update(screen.getByLabelText("Set 1 actual RIR"), "2");

  await fireEvent.click(
    screen.getByRole("checkbox", { name: "Complete set 1" }),
  );

  await waitFor(() => expect(load).toBeDisabled());
  await fireEvent.update(load, "99");
  expect(load).toHaveValue(42.5);
  expect(screen.getByLabelText("Set 1 actual reps")).toBeDisabled();
  expect(screen.getByLabelText("Set 1 actual RIR")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Set 1 type" })).toBeDisabled();
  expect(
    fetch.mock.calls.filter(
      ([url, options]) =>
        url.endsWith("/api/workout-sessions/session-1") &&
        options?.method === "PUT",
    ),
  ).toHaveLength(1);
  const firstSave = fetch.mock.calls.find(
    ([url, options]) =>
      url.endsWith("/api/workout-sessions/session-1") &&
      options?.method === "PUT",
  );
  const firstPayload = JSON.parse(firstSave[1].body);
  expect(firstPayload.sets).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "session-set-1",
        type: "standard",
        actualLoadKg: 42.5,
        actualReps: 6,
        actualRir: 2,
        checked: true,
      }),
    ]),
  );

  await fireEvent.click(
    screen.getByRole("checkbox", { name: "Complete set 1" }),
  );

  await waitFor(() => expect(load).not.toBeDisabled());
  const saves = fetch.mock.calls.filter(
    ([url, options]) =>
      url.endsWith("/api/workout-sessions/session-1") &&
      options?.method === "PUT",
  );
  expect(JSON.parse(saves[1][1].body).sets[0].checked).toBe(false);
});

test("persists per-exercise unit overrides from the tracker", async () => {
  const fetch = jest.fn(async (url, options = {}) => {
    if (url.endsWith("/api/workout-sessions/session-1") && !options.method) {
      return jsonResponse(buildSession());
    }
    if (
      url.endsWith(
        "/api/exercises/11111111-1111-4111-8111-111111111111/preferences",
      ) &&
      !options.method
    ) {
      return jsonResponse({ unit: "kg", unitOverride: null });
    }
    if (
      url.endsWith(
        "/api/exercises/11111111-1111-4111-8111-111111111111/preferences",
      ) &&
      options.method === "PUT"
    ) {
      return jsonResponse({
        exerciseId: "11111111-1111-4111-8111-111111111111",
        unit: "lb",
        unitOverride: "lb",
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  globalThis.fetch = fetch;

  renderTracker();

  const unitSelect = await screen.findByLabelText("Unit for Bench press");
  await fireEvent.update(unitSelect, "lb");
  expect(unitSelect).toHaveValue("lb");

  await waitFor(() => {
    const preferenceCall = fetch.mock.calls.find(
      ([url, options]) =>
        url.endsWith(
          "/api/exercises/11111111-1111-4111-8111-111111111111/preferences",
        ) && options?.method === "PUT",
    );
    expect(preferenceCall).toBeTruthy();
    expect(JSON.parse(preferenceCall[1].body)).toEqual({ unitOverride: "lb" });
  });
});

test("uses the effective unit and preserves a fractional load when switching units", async () => {
  let session = buildSession({
    exercises: [
      {
        ...buildSession().exercises[0],
        sets: [
          {
            ...buildSession().exercises[0].sets[0],
            actualLoadKg: "42.500",
          },
        ],
      },
      buildSession().exercises[1],
    ],
  });
  const fetch = jest.fn(async (url, options = {}) => {
    if (url.endsWith("/api/workout-sessions/session-1") && !options.method) {
      return jsonResponse(session);
    }
    if (
      url.endsWith(
        "/api/exercises/11111111-1111-4111-8111-111111111111/preferences",
      ) &&
      !options.method
    ) {
      return jsonResponse({ unit: "lb", unitOverride: "lb" });
    }
    if (
      url.endsWith(
        "/api/exercises/22222222-2222-4222-8222-222222222222/preferences",
      ) &&
      !options.method
    ) {
      return jsonResponse({ unit: "kg", unitOverride: null });
    }
    if (
      url.endsWith("/api/workout-sessions/session-1") &&
      options.method === "PUT"
    ) {
      const payload = JSON.parse(options.body);
      expect(
        payload.sets.find((set) => set.id === "session-set-1").actualLoadKg,
      ).toBeCloseTo(42.5, 10);
      session = buildSession({ version: 2 });
      return jsonResponse(session);
    }
    if (
      url.endsWith(
        "/api/exercises/11111111-1111-4111-8111-111111111111/preferences",
      ) &&
      options.method === "PUT"
    ) {
      return jsonResponse({ unit: "lb", unitOverride: "lb" });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  globalThis.fetch = fetch;

  renderTracker();

  const load = await screen.findByLabelText("Set 1 actual load (lbs)");
  expect(Number(load.value)).toBeCloseTo(42.5 / 0.45359237, 10);
  await fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

  await waitFor(() =>
    expect(screen.getByText("Draft saved.")).toBeInTheDocument(),
  );
});

test("marks an exercise skipped and saves its state without removing later navigation", async () => {
  let session = buildSession();
  const fetch = jest.fn(async (url, options = {}) => {
    if (url.endsWith("/api/workout-sessions/session-1") && !options.method) {
      return jsonResponse(session);
    }
    if (
      url.endsWith("/api/workout-sessions/session-1") &&
      options.method === "PUT"
    ) {
      const payload = JSON.parse(options.body);
      session = buildSession({
        version: session.version + 1,
        exercises: session.exercises.map((exercise) => ({
          ...exercise,
          skipped:
            payload.exerciseStates.find((state) => state.id === exercise.id)
              ?.skipped ?? false,
        })),
      });
      return jsonResponse(session);
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  globalThis.fetch = fetch;

  renderTracker();
  await screen.findByRole("heading", { name: "Bench press" });
  await fireEvent.click(screen.getByRole("button", { name: "Skip Exercise" }));

  expect(
    await screen.findByText(/finish this workout as partial/i),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Exercise 2: Seated row" }),
  ).toBeInTheDocument();
  await waitFor(() => {
    const save = fetch.mock.calls.find(
      ([url, options]) =>
        url.endsWith("/api/workout-sessions/session-1") &&
        options?.method === "PUT",
    );
    expect(JSON.parse(save[1].body).exerciseStates).toEqual([
      { id: "session-exercise-1", skipped: true },
      { id: "session-exercise-2", skipped: false },
    ]);
  });
});

test("selects a failure set in the type modal and rejects nonzero actual RIR", async () => {
  const fetch = jest.fn(async (url) => {
    if (url.endsWith("/api/workout-sessions/session-1")) {
      return jsonResponse(buildSession());
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  globalThis.fetch = fetch;

  renderTracker();
  await screen.findByRole("heading", { name: "Bench press" });
  await fireEvent.click(screen.getByRole("button", { name: "Set 1 type" }));

  const dialog = screen.getByRole("dialog", { name: "Set 1 type" });
  await fireEvent.click(within(dialog).getByRole("radio", { name: "Failure" }));
  await fireEvent.click(screen.getByRole("button", { name: "Save type" }));

  expect(screen.getByText(/Failure · 5-8 reps/)).toBeInTheDocument();
  await fireEvent.update(screen.getByLabelText("Set 1 actual load (kg)"), "0");
  await fireEvent.update(screen.getByLabelText("Set 1 actual reps"), "6");
  await fireEvent.update(screen.getByLabelText("Set 1 actual RIR"), "1");
  await fireEvent.click(
    screen.getByRole("checkbox", { name: "Complete set 1" }),
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(
    /failure sets require actual rir 0/i,
  );
  expect(
    fetch.mock.calls.some(([, options]) => options?.method === "PUT"),
  ).toBe(false);
});
