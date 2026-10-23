import { h } from "vue";
import { fireEvent, render, screen } from "@testing-library/vue";
import { createMemoryHistory } from "vue-router";
import { afterEach, jest } from "@jest/globals";
import { authState } from "./auth.js";
import { createAppRouter } from "./router.js";
import FeatureView from "./views/FeatureView.vue";
import exerciseInfoViewModule from "./views/ExerciseInfoView.vue";
import programsViewModule from "./views/ProgramsView.vue";
import settingsViewModule from "./views/SettingsView.vue";
import workoutDetailViewModule from "./views/WorkoutDetailView.vue";

const SettingsView = settingsViewModule.default ?? settingsViewModule;
const ProgramsView = programsViewModule.default ?? programsViewModule;
const ExerciseInfoView =
  exerciseInfoViewModule.default ?? exerciseInfoViewModule;
const WorkoutDetailView =
  workoutDetailViewModule.default ?? workoutDetailViewModule;
const originalFetch = globalThis.fetch;
const originalApiOrigin = globalThis.__WORKOUT_TRACKER_API_ORIGIN__;
const RouterLinkStub = {
  props: ["to"],
  setup(props, { slots }) {
    return () => h("a", { href: `#${props.to}` }, slots.default?.());
  },
};

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const programRun = {
  id: "run-1",
  templateId: "program-1",
  name: "Strength plan",
  currentWeekNumber: 1,
  week: {
    weekNumber: 1,
    weekType: "training",
    days: [
      {
        id: "run-day-1",
        templateDayId: "day-1",
        slotNumber: 1,
        type: "workout",
        name: "Upper body",
        status: "pending",
      },
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `run-day-${index + 2}`,
        templateDayId: `day-${index + 2}`,
        slotNumber: index + 2,
        type: "rest",
        name: "Rest",
        status: "pending",
      })),
    ],
  },
};

const workoutProgram = {
  id: "program-1",
  name: "Strength plan",
  weeks: [
    {
      weekNumber: 1,
      type: "training",
      days: [
        {
          id: "day-1",
          slotNumber: 1,
          type: "workout",
          name: "Upper body",
          exercises: [
            {
              id: "program-ex-1",
              exerciseId: "exercise-1",
              name: "Barbell squat",
              sets: [
                {
                  setNumber: 1,
                  type: "standard",
                  repMin: 5,
                  repMax: 8,
                  rir: 2,
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const exerciseCatalog = [
  {
    id: "exercise-1",
    name: "Barbell squat",
    image: {
      url: "https://example.test/squat.jpg",
      altText: "Barbell squat setup",
      credit: "Coach",
      license: "CC BY",
    },
    muscles: {
      primary: ["Quadriceps"],
      secondary: ["Gluteus maximus"],
      tertiary: ["Adductors"],
    },
  },
];

function renderRoute(path) {
  const isWorkout = path.startsWith("/workouts/");
  const view = isWorkout ? WorkoutDetailView : ExerciseInfoView;
  const params = isWorkout
    ? { workoutId: path.split("/").at(-1) }
    : { exerciseId: path.split("/").at(-2) };
  render(view, {
    global: {
      mocks: { $route: { params } },
      stubs: { RouterLink: RouterLinkStub },
    },
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.__WORKOUT_TRACKER_API_ORIGIN__ = originalApiOrigin;
});

test.each([
  ["member", "home"],
  ["admin", "admin-catalog"],
])(
  "routes the %s away from restricted catalog access correctly",
  async (role, expectedRoute) => {
    authState.status = "authenticated";
    authState.profile = { role };
    const router = createAppRouter(createMemoryHistory());

    await router.push("/admin/catalog");
    await router.isReady();

    expect(router.currentRoute.value.name).toBe(expectedRoute);
  },
);

test("resolves the admin catalog route to its Vue component definition", async () => {
  authState.status = "authenticated";
  authState.profile = { role: "admin" };
  const router = createAppRouter(createMemoryHistory());

  await router.push("/admin/catalog");
  await router.isReady();

  expect(
    router.currentRoute.value.matched[0].components.default,
  ).toHaveProperty("setup");
});

test("resolves Settings to the profile and gym editor", async () => {
  authState.status = "authenticated";
  authState.profile = { role: "member" };
  const router = createAppRouter(createMemoryHistory());

  await router.push("/settings");
  await router.isReady();

  expect(router.currentRoute.value.matched[0].components.default).toBe(
    SettingsView,
  );
});

test("resolves Programs to the CSV import view", async () => {
  authState.status = "authenticated";
  authState.profile = { role: "member" };
  const router = createAppRouter(createMemoryHistory());

  await router.push("/programs");
  await router.isReady();

  expect(router.currentRoute.value.matched[0].components.default).toBe(
    ProgramsView,
  );
});

test("registers dedicated workout detail and exercise info routes", () => {
  const router = createAppRouter(createMemoryHistory());

  expect(
    router.getRoutes().find((route) => route.name === "workout-detail")
      .components.default,
  ).toBe(WorkoutDetailView);
  expect(
    router.getRoutes().find((route) => route.name === "exercise-info")
      .components.default,
  ).toBe(ExerciseInfoView);
  expect(
    router.getRoutes().find((route) => route.name === "tracker").components
      .default,
  ).not.toBe(FeatureView);
});

test("renders a workout's target muscles, prescriptions, and navigation affordances", async () => {
  globalThis.fetch = jest.fn(async (url) => {
    if (url.endsWith("/api/workout-sessions/active")) return jsonResponse(null);
    if (url.endsWith("/api/program-runs/current"))
      return jsonResponse(programRun);
    if (url.endsWith("/api/programs/program-1"))
      return jsonResponse(workoutProgram);
    if (url.endsWith("/api/catalog/exercises"))
      return jsonResponse(exerciseCatalog);
    throw new Error(`Unexpected request: ${url}`);
  });
  globalThis.__WORKOUT_TRACKER_API_ORIGIN__ = "https://api.example.test";

  renderRoute("/workouts/day-1");

  expect(
    await screen.findByRole("heading", { name: "Upper body" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("region", { name: "Target muscles" }),
  ).toHaveTextContent("Quadriceps");
  expect(screen.getByText("Standard · 5-8 reps · RIR 2")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Start Workout" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Barbell squat info" }),
  ).toHaveAttribute("href", "#/exercises/exercise-1/info");
  expect(document.querySelector(".muscle-pills--scroll")).toBeInTheDocument();
});

test("preserves long workout and exercise names and offers Resume without creating a draft", async () => {
  const longDayName =
    "Upper body session with a deliberately long descriptive training label";
  const longExerciseName =
    "Barbell squat with a deliberately long equipment and stance variation name";
  const longProgram = {
    ...workoutProgram,
    weeks: [
      {
        ...workoutProgram.weeks[0],
        days: [
          {
            ...workoutProgram.weeks[0].days[0],
            name: longDayName,
            exercises: [
              {
                ...workoutProgram.weeks[0].days[0].exercises[0],
                name: longExerciseName,
              },
            ],
          },
        ],
      },
    ],
  };
  const inProgressRun = {
    ...programRun,
    week: {
      ...programRun.week,
      days: programRun.week.days.map((day) =>
        day.templateDayId === "day-1" ? { ...day, status: "in_progress" } : day,
      ),
    },
  };
  globalThis.fetch = jest.fn(async (url) => {
    if (url.endsWith("/api/workout-sessions/active"))
      return jsonResponse({ id: "session-1", runDayId: "run-day-1" });
    if (url.endsWith("/api/program-runs/current"))
      return jsonResponse(inProgressRun);
    if (url.endsWith("/api/programs/program-1"))
      return jsonResponse(longProgram);
    if (url.endsWith("/api/catalog/exercises"))
      return jsonResponse(exerciseCatalog);
    throw new Error(`Unexpected request: ${url}`);
  });
  globalThis.__WORKOUT_TRACKER_API_ORIGIN__ = "https://api.example.test";

  renderRoute("/workouts/day-1");

  expect(
    await screen.findByRole("heading", { name: longDayName }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: longExerciseName }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Resume Workout" }),
  ).toBeInTheDocument();
  expect(
    globalThis.fetch.mock.calls.every(
      ([, options]) => !options?.method || options.method === "GET",
    ),
  ).toBe(true);
});

test("reports workout loading failures and shows the unavailable empty state after retry", async () => {
  globalThis.fetch = jest
    .fn()
    .mockRejectedValueOnce(new Error("network down"))
    .mockResolvedValue(jsonResponse(null));
  globalThis.__WORKOUT_TRACKER_API_ORIGIN__ = "https://api.example.test";

  renderRoute("/workouts/day-1");

  expect(await screen.findByRole("alert")).toHaveTextContent(
    /could not be reached/i,
  );
  await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(
    await screen.findByRole("heading", { name: "Workout unavailable" }),
  ).toBeInTheDocument();
});

test("renders exercise image and all three catalog muscle roles", async () => {
  globalThis.fetch = jest.fn(async (url) => {
    if (url.endsWith("/api/catalog/exercises"))
      return jsonResponse(exerciseCatalog);
    throw new Error(`Unexpected request: ${url}`);
  });
  globalThis.__WORKOUT_TRACKER_API_ORIGIN__ = "https://api.example.test";

  renderRoute("/exercises/exercise-1/info");

  expect(
    await screen.findByRole("heading", { name: "Barbell squat" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("img", { name: "Barbell squat setup" }),
  ).toHaveAttribute("src", "https://example.test/squat.jpg");
  expect(screen.getByText("Primary", { exact: true })).toBeInTheDocument();
  expect(screen.getByText("Quadriceps", { exact: true })).toBeInTheDocument();
  expect(screen.getByText("Secondary", { exact: true })).toBeInTheDocument();
  expect(
    screen.getByText("Gluteus maximus", { exact: true }),
  ).toBeInTheDocument();
  expect(screen.getByText("Tertiary", { exact: true })).toBeInTheDocument();
  expect(screen.getByText("Adductors", { exact: true })).toBeInTheDocument();
});

test("reports exercise catalog failures and handles an unknown exercise", async () => {
  globalThis.fetch = jest
    .fn()
    .mockResolvedValueOnce(jsonResponse({ error: "Catalog unavailable" }, 503))
    .mockResolvedValueOnce(jsonResponse([]));
  globalThis.__WORKOUT_TRACKER_API_ORIGIN__ = "https://api.example.test";

  renderRoute("/exercises/missing-exercise/info");

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Catalog unavailable",
  );
  await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(
    await screen.findByRole("heading", { name: "Exercise not found" }),
  ).toBeInTheDocument();
});
