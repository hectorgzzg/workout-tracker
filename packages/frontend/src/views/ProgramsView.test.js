import { fireEvent, render, screen, waitFor } from "@testing-library/vue";
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
