import { URL } from "node:url";
import { expect, test } from "@playwright/test";

const exerciseId = "exercise-press";
const workoutId = "workout-lower-body";
const exerciseName =
  "Barbell press with a deliberately long exercise name for narrow screens";

const currentRun = {
  id: "run-wt-015",
  templateId: "program-wt-015",
  name: "A deliberately long program name that should wrap cleanly",
  status: "active",
  currentWeekNumber: 1,
  week: {
    weekNumber: 1,
    weekType: "training",
    days: [
      {
        id: "run-day-1",
        templateDayId: "workout-upper-body",
        slotNumber: 1,
        type: "workout",
        name: "Upper-body strength",
        status: "completed",
      },
      {
        id: "run-day-2",
        templateDayId: workoutId,
        slotNumber: 2,
        type: "workout",
        name: "Lower-body strength",
        status: "partial",
      },
      {
        id: "run-day-3",
        templateDayId: "workout-pull",
        slotNumber: 3,
        type: "workout",
        name: "Pull and carry",
        status: "skipped",
      },
      {
        id: "run-day-4",
        templateDayId: "workout-conditioning",
        slotNumber: 4,
        type: "workout",
        name: "Conditioning",
        status: "in_progress",
      },
      {
        id: "run-day-5",
        templateDayId: "workout-accessory",
        slotNumber: 5,
        type: "workout",
        name: "Accessory work",
        status: "pending",
      },
      {
        id: "run-day-6",
        templateDayId: null,
        slotNumber: 6,
        type: "rest",
        name: "Rest day",
        status: "pending",
      },
      {
        id: "run-day-7",
        templateDayId: null,
        slotNumber: 7,
        type: "rest",
        name: "Recovery",
        status: "rest_done",
      },
    ],
  },
};

const workoutProgram = {
  id: "program-wt-015",
  name: currentRun.name,
  status: "active",
  weeks: [
    {
      id: "week-one",
      weekNumber: 1,
      type: "training",
      days: [
        {
          id: workoutId,
          slotNumber: 2,
          type: "workout",
          name: "Lower-body strength",
          exercises: [
            {
              id: "day-exercise-press",
              exerciseId,
              name: exerciseName,
              notes: "Controlled tempo",
              sets: [
                {
                  id: "set-standard",
                  setNumber: 1,
                  type: "standard",
                  repMin: 6,
                  repMax: 8,
                  rir: 2,
                },
                {
                  id: "set-warmup",
                  setNumber: 2,
                  type: "warmup",
                  repMin: 8,
                  repMax: 10,
                  rir: 3,
                },
                {
                  id: "set-failure",
                  setNumber: 3,
                  type: "failure",
                  repMin: 10,
                  repMax: null,
                  rir: 0,
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const catalog = [
  {
    id: exerciseId,
    name: exerciseName,
    muscles: {
      primary: ["Pectoralis major", "Anterior deltoid"],
      secondary: ["Triceps brachii", "Serratus anterior", "Latissimus dorsi"],
      tertiary: [
        "Upper trapezius",
        "Lower trapezius",
        "Rotator cuff",
        "Rhomboids",
        "Posterior deltoid",
        "Wrist extensors",
      ],
    },
  },
];

class WorkoutViewsPage {
  constructor(page) {
    this.page = page;
  }

  async openHome() {
    await this.page.goto("/");
  }

  async openWorkout(id) {
    await this.page.goto(`/#/workouts/${id}`);
  }

  get calendar() {
    return this.page.getByRole("region", { name: /calendar$/i });
  }

  get programDays() {
    return this.page.getByRole("region", { name: "Current program days" });
  }

  async documentWidths() {
    return this.page.evaluate(() => ({
      document: globalThis.document.documentElement.scrollWidth,
      viewport: globalThis.window.innerWidth,
    }));
  }
}

async function mockApi(page, responses = {}) {
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const response = responses[pathname] ?? {
      status: 404,
      body: { error: "Unexpected API request" },
    };
    const resolvedResponse =
      typeof response === "function" ? await response(route) : response;

    await route.fulfill({
      status: resolvedResponse.status ?? 200,
      contentType: "application/json",
      body: JSON.stringify(resolvedResponse.body),
    });
  });
}

function standardResponses(run = currentRun) {
  return {
    "/api/profile": {
      body: {
        id: "user-wt-015",
        email: "wt-015@example.test",
        displayName: "WT-015 Browser Test",
        role: "member",
      },
    },
    "/api/program-runs/current": { body: run },
    "/api/programs/program-wt-015": { body: workoutProgram },
    "/api/catalog/exercises": { body: catalog },
  };
}

test.describe("WT-015: mocked Home and workout detail UI", () => {
  test("shows week/month calendar and expandable seven-slot ribbon with distinct states and navigation", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page, standardResponses());
    const home = new WorkoutViewsPage(page);

    await home.openHome();
    await expect(
      page.getByRole("heading", { name: "Your training, at a glance" }),
    ).toBeVisible();
    await expect(home.calendar.getByRole("listitem")).toHaveCount(7);

    await page.getByRole("button", { name: "Show month" }).click();
    await expect(
      page
        .getByRole("region", { name: "Month calendar" })
        .getByRole("listitem"),
    ).toHaveCount(42);
    const monthCalendar = page.getByRole("region", { name: "Month calendar" });
    const initialMonth = await monthCalendar.getByRole("heading").innerText();
    await monthCalendar.getByRole("button", { name: "Next" }).click();
    await expect(monthCalendar.getByRole("heading")).not.toHaveText(
      initialMonth,
    );
    await page.getByRole("button", { name: "Show week" }).click();
    await expect(home.calendar.getByRole("listitem")).toHaveCount(7);

    const expandButton = page.getByRole("button", {
      name: "Expand current program",
    });
    await expect(expandButton).toHaveAttribute("aria-expanded", "false");
    await expandButton.click();
    await expect(
      page.getByRole("button", { name: "Collapse current program" }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(home.programDays.getByRole("listitem")).toHaveCount(7);

    for (const status of [
      "Completed",
      "Partial",
      "Skipped",
      "In progress",
      "Pending",
      "Rest",
      "Rest complete",
    ]) {
      await expect(
        home.programDays.getByText(status, { exact: true }),
      ).toBeVisible();
    }

    await expect(
      home.programDays.getByRole("link", {
        name: "Lower-body strength Partial",
      }),
    ).toBeVisible();
    await home.programDays
      .getByRole("link", { name: "Lower-body strength Partial" })
      .click();
    await expect(page).toHaveURL(/#\/workouts\/workout-lower-body$/);
    await expect(
      page.getByRole("heading", { name: "Lower-body strength" }),
    ).toBeVisible();

    const mobileWidths = await home.documentWidths();
    expect(mobileWidths.document).toBeLessThanOrEqual(mobileWidths.viewport);
    await page.setViewportSize({ width: 1440, height: 900 });
    const desktopWidths = await home.documentWidths();
    expect(desktopWidths.document).toBeLessThanOrEqual(desktopWidths.viewport);
  });

  test("recovers from current-program errors and displays the no-program empty state", async ({
    page,
  }) => {
    let currentRunRequests = 0;
    const responses = standardResponses();
    responses["/api/program-runs/current"] = () => {
      currentRunRequests += 1;
      return currentRunRequests === 1
        ? {
            status: 503,
            body: { error: "Program service unavailable" },
          }
        : { body: null };
    };
    await mockApi(page, responses);
    const home = new WorkoutViewsPage(page);

    await home.openHome();
    await expect(page.getByRole("alert")).toContainText(
      "Program service unavailable",
    );
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(
      page.getByRole("heading", { name: "No active program yet." }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "View programs" }),
    ).toBeVisible();
  });

  test("renders prescriptions, muscle roles, Info, and responsive detail without page overflow", async ({
    page,
  }) => {
    await mockApi(page, standardResponses());
    const workout = new WorkoutViewsPage(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await workout.openWorkout(workoutId);
    await expect(
      page.getByRole("heading", { name: "Lower-body strength" }),
    ).toBeVisible();
    await expect(
      page.getByText("Pectoralis major · Anterior deltoid"),
    ).toBeVisible();
    await expect(page.getByText("Standard · 6-8 reps · RIR 2")).toBeVisible();
    await expect(page.getByText("Warmup · 8-10 reps · RIR 3")).toBeVisible();
    await expect(page.getByText("Failure · 10+ reps · RIR 0")).toBeVisible();

    const pills = page.getByLabel(`${exerciseName} target muscles`);
    await expect(pills.getByText("Pectoralis major")).toBeVisible();
    await expect(pills.getByText("Triceps brachii")).toBeVisible();
    await expect(pills.getByText("Upper trapezius")).toBeVisible();
    const pillDimensions = await pills.evaluate((element) => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
    }));
    expect(pillDimensions.scroll).toBeGreaterThan(pillDimensions.client);

    const mobileWidths = await workout.documentWidths();
    expect(mobileWidths.document).toBeLessThanOrEqual(mobileWidths.viewport);
    const infoLink = page.getByRole("link", {
      name: `${exerciseName} info`,
    });
    await infoLink.click();
    await expect(page).toHaveURL(/#\/exercises\/exercise-press\/info$/);
    await expect(
      page.getByRole("heading", { name: exerciseName }),
    ).toBeVisible();
    await expect(page.getByText("Primary", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Pectoralis major, Anterior deltoid", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Secondary", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Triceps brachii, Serratus anterior, Latissimus dorsi", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText("Tertiary", { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        "Upper trapezius, Lower trapezius, Rotator cuff, Rhomboids, Posterior deltoid, Wrist extensors",
        { exact: true },
      ),
    ).toBeVisible();

    await page.setViewportSize({ width: 1440, height: 900 });
    const desktopWidths = await workout.documentWidths();
    expect(desktopWidths.document).toBeLessThanOrEqual(desktopWidths.viewport);
    const headingBox = await page
      .getByRole("heading", { name: exerciseName })
      .boundingBox();
    expect(headingBox.x + headingBox.width).toBeLessThanOrEqual(1440);
  });
});
