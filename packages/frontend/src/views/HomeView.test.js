import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/vue";
import { h } from "vue";
import PrimeVue from "primevue/config";
import { createPinia } from "pinia";
import { afterEach, beforeEach, jest } from "@jest/globals";
import homeViewModule from "./HomeView.vue";

const HomeView = homeViewModule.default ?? homeViewModule;
const RouterLinkStub = {
  props: ["to"],
  setup(props, { slots }) {
    return () => h("a", { href: `#${props.to}` }, slots.default?.());
  },
};

const originalFetch = globalThis.fetch;
const originalApiOrigin = globalThis.__WORKOUT_TRACKER_API_ORIGIN__;

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const currentRun = {
  id: "run-1",
  templateId: "program-1",
  name: "Strength plan with a deliberately long program name",
  status: "active",
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
      {
        id: "run-day-2",
        templateDayId: "day-2",
        slotNumber: 2,
        type: "workout",
        name: "Lower body",
        status: "completed",
      },
      {
        id: "run-day-3",
        templateDayId: "day-3",
        slotNumber: 3,
        type: "workout",
        name: "Pull",
        status: "partial",
      },
      {
        id: "run-day-4",
        templateDayId: "day-4",
        slotNumber: 4,
        type: "workout",
        name: "Push",
        status: "skipped",
      },
      {
        id: "run-day-5",
        templateDayId: "day-5",
        slotNumber: 5,
        type: "rest",
        name: "Rest",
        status: "rest_done",
      },
      {
        id: "run-day-6",
        templateDayId: "day-6",
        slotNumber: 6,
        type: "rest",
        name: "Rest",
        status: "pending",
      },
      {
        id: "run-day-7",
        templateDayId: "day-7",
        slotNumber: 7,
        type: "workout",
        name: "Full body",
        status: "pending",
      },
    ],
  },
};

const program = {
  id: "program-1",
  name: currentRun.name,
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
        ...currentRun.week.days.slice(1).map((day) => ({
          id: day.templateDayId,
          slotNumber: day.slotNumber,
          type: day.type,
          name: day.name,
          exercises: [],
        })),
      ],
    },
  ],
};

const catalog = [
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

function renderHome() {
  render(HomeView, {
    global: {
      plugins: [createPinia(), PrimeVue],
      stubs: { RouterLink: RouterLinkStub },
    },
  });
}

beforeEach(() => {
  globalThis.__WORKOUT_TRACKER_API_ORIGIN__ = "https://api.example.test";
  globalThis.fetch = jest.fn(async (url) => {
    if (url.endsWith("/api/program-runs/current"))
      return jsonResponse(currentRun);
    if (url.endsWith("/api/programs/program-1")) return jsonResponse(program);
    if (url.endsWith("/api/catalog/exercises")) return jsonResponse(catalog);
    throw new Error(`Unexpected request: ${url}`);
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.__WORKOUT_TRACKER_API_ORIGIN__ = originalApiOrigin;
});

test("shows the collapsed week and expands the active program's seven distinct slots", async () => {
  renderHome();

  expect(screen.getByRole("status")).toHaveTextContent(
    "Loading your current program",
  );
  expect(
    await screen.findByRole("heading", { name: currentRun.name }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("region", { name: "Week calendar" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Show month" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Expand current program" }),
  ).toBeInTheDocument();
  await fireEvent.click(
    screen.getByRole("button", { name: "Expand current program" }),
  );

  const ribbon = screen.getByRole("region", { name: "Current program days" });
  expect(within(ribbon).getAllByRole("listitem")).toHaveLength(7);
  expect(within(ribbon).getAllByRole("link")).toHaveLength(5);
  expect(within(ribbon).getByText("Partial")).toBeInTheDocument();
  expect(within(ribbon).getByText("Skipped")).toBeInTheDocument();
  expect(within(ribbon).getAllByText("Rest", { exact: true })).toHaveLength(3);
  expect(within(ribbon).getByText("Rest complete")).toBeInTheDocument();
  expect(
    within(ribbon).getByRole("link", { name: /Upper body/ }),
  ).toHaveAttribute("href", "#/workouts/day-1");
  expect(globalThis.fetch).toHaveBeenCalledWith(
    "https://api.example.test/api/program-runs/current",
    expect.objectContaining({ credentials: "include" }),
  );
});

test("switches the calendar between a week and a month", async () => {
  globalThis.fetch = jest.fn(async (url) => {
    if (url.endsWith("/api/program-runs/current")) return jsonResponse(null);
    throw new Error(`Unexpected request: ${url}`);
  });
  renderHome();

  expect(await screen.findByText("No active program yet.")).toBeInTheDocument();
  await fireEvent.click(screen.getByRole("button", { name: "Show month" }));
  expect(
    screen.getByRole("region", { name: "Month calendar" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Show week" })).toBeInTheDocument();
  await fireEvent.click(screen.getByRole("button", { name: "Show week" }));
  expect(
    screen.getByRole("region", { name: "Week calendar" }),
  ).toBeInTheDocument();
});

test("reports and retries current-program loading failures", async () => {
  globalThis.fetch = jest
    .fn()
    .mockRejectedValueOnce(new Error("network down"))
    .mockResolvedValueOnce(jsonResponse(null));
  renderHome();

  expect(await screen.findByRole("alert")).toHaveTextContent(
    /could not be reached/i,
  );
  await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() =>
    expect(screen.getByText("No active program yet.")).toBeInTheDocument(),
  );
});
