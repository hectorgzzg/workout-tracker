import { fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { afterEach, beforeEach, jest } from "@jest/globals";
import catalogViewModule from "./CatalogView.vue";

const CatalogView = catalogViewModule.default ?? catalogViewModule;

const originalFetch = globalThis.fetch;

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const squat = {
  id: "exercise-1",
  name: "Barbell squat",
  equipment: "barbell",
  image: null,
  muscles: {
    primary: ["quadriceps"],
    secondary: ["gluteus maximus"],
    tertiary: [],
  },
  loadType: "external",
  restCategory: "lower_compound",
  dumbbellCount: null,
  sideCount: 2,
  bodyweightFactor: null,
  assistanceRatio: null,
};

beforeEach(() => {
  globalThis.fetch = jest.fn(async () => jsonResponse([squat]));
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("shows shared exercise identity, image placeholder, and muscle roles", async () => {
  render(CatalogView);

  expect(
    await screen.findByRole("heading", { name: "Exercise catalog" }),
  ).toBeInTheDocument();
  expect(await screen.findByText("Barbell squat")).toBeInTheDocument();
  expect(screen.getByText("Primary: quadriceps")).toBeInTheDocument();
  expect(screen.getByText("Secondary: gluteus maximus")).toBeInTheDocument();
  expect(screen.getByText("Image not supplied")).toBeInTheDocument();
});

test("creates and edits catalog entries with validated metadata", async () => {
  globalThis.fetch = jest.fn(async (url, options = {}) => {
    if (url.endsWith("/api/catalog/exercises")) {
      return jsonResponse([squat]);
    }
    if (url.endsWith("/api/admin/catalog/exercises")) {
      const body = JSON.parse(options.body);
      return jsonResponse({ ...body, id: "exercise-2" }, 201);
    }
    if (url.endsWith("/api/admin/catalog/exercises/exercise-1")) {
      const body = JSON.parse(options.body);
      return jsonResponse({ ...body, id: "exercise-1" });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  render(CatalogView);

  await screen.findByText("Barbell squat");
  await fireEvent.update(
    screen.getByLabelText("Exercise name"),
    "Dumbbell row",
  );
  await fireEvent.update(screen.getByLabelText("Equipment"), "dumbbell");
  await fireEvent.update(screen.getByLabelText("Load type"), "dumbbell");
  await fireEvent.update(
    screen.getByLabelText("Rest category"),
    "upper_isolation",
  );
  await fireEvent.update(screen.getByLabelText("Dumbbells counted"), "1");
  await fireEvent.update(screen.getByLabelText("Sides counted"), "1");
  await fireEvent.update(
    screen.getByLabelText("Primary muscles"),
    "latissimus dorsi",
  );
  await fireEvent.click(screen.getByRole("button", { name: "Add exercise" }));

  await waitFor(() =>
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/admin/catalog/exercises"),
      expect.objectContaining({ method: "POST", credentials: "include" }),
    ),
  );
  expect(JSON.parse(globalThis.fetch.mock.calls[1][1].body)).toMatchObject({
    name: "Dumbbell row",
    loadType: "dumbbell",
    dumbbellCount: 1,
    sideCount: 1,
    muscles: { primary: ["latissimus dorsi"] },
    bodyweightFactor: null,
    assistanceRatio: null,
  });
  expect(await screen.findByText("Dumbbell row")).toBeInTheDocument();

  await fireEvent.click(
    screen.getByRole("button", { name: "Edit Barbell squat" }),
  );
  await fireEvent.update(
    screen.getByLabelText("Exercise name"),
    "High-bar barbell squat",
  );
  await fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/admin/catalog/exercises/exercise-1"),
      expect.objectContaining({ method: "PATCH" }),
    ),
  );
  expect(await screen.findByText("High-bar barbell squat")).toBeInTheDocument();
});
