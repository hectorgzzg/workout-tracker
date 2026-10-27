import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/vue";
import { afterEach, beforeEach, jest } from "@jest/globals";
import programsViewModule from "./ProgramsView.vue";

const ProgramsView = programsViewModule.default ?? programsViewModule;
const originalFetch = globalThis.fetch;

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function preview(overrides = {}) {
  return {
    metadata: { Program: "Preview fixture" },
    weeks: [
      {
        cycle: 1,
        type: "training",
        days: [
          {
            type: "workout",
            name: "Workout A",
            rowNumber: 4,
            exercises: [
              {
                name: "Known lift",
                rowNumber: 4,
                notes: "",
                sets: [{ type: "standard", repMin: 5, repMax: 8, rir: 2 }],
              },
              {
                name: "Mystery lift",
                rowNumber: 5,
                notes: "",
                sets: [],
              },
            ],
          },
          ...Array.from({ length: 6 }, (_, index) => ({
            type: "rest",
            name: "Rest",
            rowNumber: index + 6,
            exercises: [],
          })),
        ],
      },
    ],
    rowErrors: [
      {
        rowNumber: 5,
        code: "invalid_rep_range",
        message: "Invalid rep range: 5-3.",
        exerciseName: "Mystery lift",
      },
    ],
    structuralErrors: [],
    weekErrors: [],
    sourceSkipMarkers: [{ rowNumber: 3, marker: "Skipped" }],
    canActivate: false,
    mappings: [
      { sourceName: "Known lift", exerciseId: "exercise-1", exactMatch: true },
      { sourceName: "Mystery lift", exerciseId: null, exactMatch: false },
    ],
    catalogExercises: [
      { id: "exercise-1", name: "Known lift" },
      { id: "exercise-2", name: "Alternate lift" },
    ],
    ...overrides,
  };
}

function savedProgram(overrides = {}) {
  return {
    id: "program-1",
    name: "Strength plan",
    status: "draft",
    weeks: [
      {
        id: "week-1",
        weekNumber: 1,
        type: "training",
        days: [
          {
            id: "day-1",
            slotNumber: 1,
            type: "workout",
            name: "Workout A",
            exercises: [
              {
                id: "program-exercise-1",
                exerciseId: "exercise-1",
                name: "Known lift",
                notes: "",
                sets: [
                  {
                    id: "set-1",
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
          ...Array.from({ length: 6 }, (_, index) => ({
            id: `day-${index + 2}`,
            slotNumber: index + 2,
            type: "rest",
            name: "Rest",
            exercises: [],
          })),
        ],
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  globalThis.fetch = jest.fn(async (url) => {
    if (url.endsWith("/api/programs")) return jsonResponse([]);
    if (url.endsWith("/api/programs/import/preview")) {
      return jsonResponse(preview());
    }
    if (url.endsWith("/api/programs/import")) {
      return jsonResponse(
        {
          id: "program-1",
          name: "Strength plan",
          status: "draft",
        },
        201,
      );
    }
    throw new Error(`Unexpected request: ${url}`);
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("previews, confirms row and catalog decisions, then creates a new draft", async () => {
  const { container } = render(ProgramsView);
  await screen.findByText("Imported drafts will appear here.");
  await fireEvent.update(
    screen.getByLabelText("Program name"),
    "Strength plan",
  );
  await fireEvent.update(
    screen.getByLabelText("Or paste CSV data"),
    "Workout,Exercise\nfixture",
  );
  await fireEvent.click(screen.getByRole("button", { name: "Preview import" }));

  expect(
    await screen.findByRole("heading", { name: "Week 1" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Standard · 5-8 reps · RIR 2")).toBeInTheDocument();
  await fireEvent.click(screen.getByLabelText(/Skip row 5/));
  await fireEvent.update(
    screen.getByLabelText("Mystery lift mapping"),
    "exercise-2",
  );
  await fireEvent.click(screen.getByLabelText("Ignore source marker on row 3"));
  expect(screen.getByText("Will be skipped")).toBeInTheDocument();

  const createButton = screen.getByRole("button", {
    name: "Create draft program",
  });
  expect(createButton).toBeDisabled();
  await fireEvent.click(
    screen.getByLabelText(
      "I confirm this preview, its skipped rows, and the selected exercise mappings.",
    ),
  );
  await waitFor(() => expect(createButton).toBeEnabled());
  await fireEvent.click(createButton);

  await screen.findByText("Strength plan saved as a draft.");
  const createCall = globalThis.fetch.mock.calls.find(([url]) =>
    url.endsWith("/api/programs/import"),
  );
  expect(createCall[1]).toMatchObject({
    method: "POST",
    credentials: "include",
  });
  expect(createCall[1].headers["Idempotency-Key"]).toMatch(
    /^[A-Za-z0-9._:-]{8,128}$/,
  );
  expect(JSON.parse(createCall[1].body)).toMatchObject({
    name: "Strength plan",
    confirmed: true,
    skipRowNumbers: [5],
    acknowledgedSkipRows: [3],
    mappings: { "Known lift": "exercise-1", "Mystery lift": "exercise-2" },
  });
  expect(container).toHaveTextContent("Strength plan saved as a draft.");
});

test("blocks unsafe preview structure and recovers after editing and re-previewing", async () => {
  let previewCount = 0;
  globalThis.fetch = jest.fn(async (url) => {
    if (url.endsWith("/api/programs")) return jsonResponse([]);
    previewCount += 1;
    return jsonResponse(
      preview(
        previewCount === 1
          ? {
              structuralErrors: [
                {
                  code: "row_without_workout",
                  rowNumber: 4,
                  message: "An exercise row cannot inherit a workout day.",
                },
              ],
              weekErrors: [
                {
                  code: "week_must_have_seven_slots",
                  cycle: 1,
                  actualSlots: 6,
                  message: "Cycle 1 has 6 slots; exactly seven are required.",
                },
              ],
            }
          : {},
      ),
    );
  });
  render(ProgramsView);
  await screen.findByText("Imported drafts will appear here.");
  await fireEvent.update(
    screen.getByLabelText("Or paste CSV data"),
    "unsafe csv",
  );
  await fireEvent.click(screen.getByRole("button", { name: "Preview import" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Cycle 1 has 6 slots; exactly seven are required.",
  );
  expect(
    screen.getByRole("button", { name: "Create draft program" }),
  ).toBeDisabled();
  await fireEvent.update(
    screen.getByLabelText("Or paste CSV data"),
    "corrected csv",
  );
  await fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
  expect(
    await screen.findByRole("heading", { name: "Week 1" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByText("Cycle 1 has 6 slots; exactly seven are required."),
  ).not.toBeInTheDocument();
});

test("edits a future prescription, configures seven deload slots, and activates explicitly", async () => {
  let deloadConfigured = false;
  let configuredDays = [];
  const program = savedProgram();
  globalThis.fetch = jest.fn(async (url, options = {}) => {
    if (url.endsWith("/api/programs")) {
      return jsonResponse([
        {
          id: "program-1",
          name: "Strength plan",
          weekCount: 1,
          status: "draft",
        },
      ]);
    }
    if (url.endsWith("/api/catalog/exercises")) {
      return jsonResponse([{ id: "exercise-1", name: "Known lift" }]);
    }
    if (url.endsWith("/api/programs/program-1/days/day-1")) {
      return jsonResponse({
        ...program.weeks[0].days[0],
        ...JSON.parse(options.body),
      });
    }
    if (url.endsWith("/api/programs/program-1/deload")) {
      deloadConfigured = true;
      configuredDays = JSON.parse(options.body).days;
      return jsonResponse(
        { id: "week-2", weekNumber: 2, weekType: "deload" },
        201,
      );
    }
    if (url.endsWith("/api/programs/program-1/activate")) {
      return jsonResponse(
        { id: "run-1", templateId: "program-1", status: "active" },
        201,
      );
    }
    if (url.endsWith("/api/programs/program-1")) {
      return jsonResponse(
        deloadConfigured
          ? savedProgram({
              weeks: [
                ...program.weeks,
                {
                  id: "week-2",
                  weekNumber: 2,
                  type: "deload",
                  days: configuredDays.map((day, index) => ({
                    id: `deload-day-${index + 1}`,
                    slotNumber: index + 1,
                    ...day,
                    exercises: day.exercises.map((exercise, exerciseIndex) => ({
                      id: `deload-exercise-${index + 1}-${exerciseIndex + 1}`,
                      name: "Known lift",
                      ...exercise,
                      sets: exercise.sets.map((set, setIndex) => ({
                        id: `deload-set-${index + 1}-${setIndex + 1}`,
                        ...set,
                      })),
                    })),
                  })),
                },
              ],
            })
          : program,
      );
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  render(ProgramsView);
  await screen.findByRole("button", { name: "Open Strength plan" });
  await fireEvent.click(
    screen.getByRole("button", { name: "Open Strength plan" }),
  );
  await screen.findByRole("heading", { name: "Strength plan" });
  expect(screen.getByLabelText("Deload day 1 exercise 1")).toHaveValue(
    "exercise-1",
  );
  expect(screen.getByLabelText("Deload day 1 type")).toHaveValue("workout");
  expect(screen.getByLabelText("Deload day 2 type")).toHaveValue("rest");
  expect(
    screen.queryByLabelText("Deload day 1 set 1 type"),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Configure manual deload" }),
  ).toBeDisabled();
  await fireEvent.click(screen.getByRole("button", { name: "Edit Day 1" }));
  await fireEvent.update(screen.getByLabelText("Rep minimum, set 1"), "6");
  await fireEvent.click(screen.getByRole("button", { name: "Save day" }));
  await waitFor(() =>
    expect(
      globalThis.fetch.mock.calls.some(([url]) =>
        url.endsWith("/api/programs/program-1/days/day-1"),
      ),
    ).toBe(true),
  );

  await fireEvent.click(
    within(screen.getByRole("region", { name: "Manual deload" })).getByRole(
      "button",
      { name: "Add set" },
    ),
  );
  await fireEvent.update(
    screen.getByLabelText("Deload day 1 target RIR, set 1"),
    "3",
  );
  await fireEvent.click(
    screen.getByRole("button", { name: "Configure manual deload" }),
  );
  await waitFor(() => expect(deloadConfigured).toBe(true));
  await screen.findByRole("heading", { name: "Week 2" });
  const deloadCall = globalThis.fetch.mock.calls.find(([url]) =>
    url.endsWith("/api/programs/program-1/deload"),
  );
  expect(JSON.parse(deloadCall[1].body).days).toHaveLength(7);
  expect(JSON.parse(deloadCall[1].body).days[0]).toMatchObject({
    type: "workout",
    exercises: [
      {
        exerciseId: "exercise-1",
        sets: [{ type: "standard", repMin: 8, repMax: 10, rir: 3 }],
      },
    ],
  });

  const activationConfirmation = screen.getByLabelText(
    "I confirm this program and its appended deload are ready to activate.",
  );
  const activateButton = screen.getByRole("button", {
    name: "Activate program",
  });
  expect(activationConfirmation).toBeEnabled();
  expect(activateButton).toBeDisabled();
  await fireEvent.click(activationConfirmation);
  await waitFor(() => expect(activateButton).toBeEnabled());
  await fireEvent.click(activateButton);
  await screen.findByText("Strength plan is active.");
  const activationCall = globalThis.fetch.mock.calls.find(([url]) =>
    url.endsWith("/api/programs/program-1/activate"),
  );
  expect(JSON.parse(activationCall[1].body)).toEqual({ confirmed: true });
});

test("keeps saved program weeks collapsed until opened, including the deload week", async () => {
  const program = savedProgram({
    weeks: [
      ...savedProgram().weeks,
      {
        id: "week-2",
        weekNumber: 2,
        type: "training",
        days: savedProgram().weeks[0].days,
      },
      {
        id: "week-3",
        weekNumber: 3,
        type: "deload",
        days: savedProgram().weeks[0].days,
      },
    ],
  });
  globalThis.fetch = jest.fn(async (url) => {
    if (url.endsWith("/api/programs")) {
      return jsonResponse([
        {
          id: "program-1",
          name: "Strength plan",
          weekCount: 3,
          status: "draft",
        },
      ]);
    }
    if (url.endsWith("/api/programs/program-1")) return jsonResponse(program);
    if (url.endsWith("/api/catalog/exercises")) {
      return jsonResponse([{ id: "exercise-1", name: "Known lift" }]);
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  render(ProgramsView);
  await fireEvent.click(
    await screen.findByRole("button", { name: "Open Strength plan" }),
  );
  await screen.findByRole("heading", { name: "Strength plan" });

  const deloadSummary = screen.getByText("Week 3").closest("summary");
  const deloadDetails = deloadSummary.closest("details");
  expect(deloadSummary).toHaveTextContent("Manual deload");
  expect(deloadDetails).not.toHaveAttribute("open");
  expect(screen.getAllByText("Day 1 · Workout A")).toHaveLength(3);
  await fireEvent.click(deloadSummary);

  expect(deloadDetails).toHaveAttribute("open");
  expect(
    screen.getAllByText("Week 1")[0].closest("details"),
  ).not.toHaveAttribute("open");
  expect(
    screen.getAllByText("Week 2")[0].closest("details"),
  ).not.toHaveAttribute("open");
});
