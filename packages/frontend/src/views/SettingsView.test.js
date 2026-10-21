import { fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { afterEach, beforeEach, jest } from "@jest/globals";
import settingsViewModule from "./SettingsView.vue";

const SettingsView = settingsViewModule.default ?? settingsViewModule;
const originalFetch = globalThis.fetch;

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const initialSettings = {
  profile: {
    id: "member-1",
    email: "member@example.test",
    role: "member",
    displayName: "Member One",
    timezone: "UTC",
    bodyweightKg: null,
    defaultUnit: "kg",
    restDurationsSeconds: {
      upper_compound: 120,
      lower_compound: 180,
      upper_isolation: 90,
      lower_isolation: 90,
      core: 60,
    },
  },
  gym: {
    id: "gym-1",
    name: "North Gym",
    equipment: [
      {
        name: "Cable stack",
        loadType: "external",
        minLoadKg: 2.5,
        maxLoadKg: 100,
        incrementKg: 2.5,
        availableLoadsKg: [2.5, 5, 7.5],
      },
      {
        name: "Dumbbells",
        loadType: "dumbbell",
        minLoadKg: 2,
        maxLoadKg: 40,
        incrementKg: 2,
        availableLoadsKg: [2, 4, 6, 8],
      },
    ],
    bars: [{ name: "Olympic bar", weightKg: 20 }],
    plates: [{ weightKg: 2.5, quantity: 4 }],
  },
};

beforeEach(() => {
  globalThis.fetch = jest.fn(async () => jsonResponse(initialSettings));
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("loads and saves profile defaults, rest overrides, and gym inventory", async () => {
  globalThis.fetch = jest.fn(async (url, options = {}) => {
    if (options.method === "PUT") {
      return jsonResponse({
        ...JSON.parse(options.body),
        profile: {
          ...JSON.parse(options.body).profile,
          id: "member-1",
          role: "member",
        },
        gym: { ...JSON.parse(options.body).gym, id: "gym-1" },
      });
    }
    return jsonResponse(initialSettings);
  });
  render(SettingsView);

  expect(
    await screen.findByRole("heading", { name: "Profile and gym" }),
  ).toBeInTheDocument();
  expect(await screen.findByLabelText("Display name")).toHaveValue(
    "Member One",
  );
  expect(screen.getByLabelText("Upper compound rest (seconds)")).toHaveValue(
    120,
  );
  expect(screen.getByLabelText("Lower compound rest (seconds)")).toHaveValue(
    180,
  );
  expect(screen.getByLabelText("Upper isolation rest (seconds)")).toHaveValue(
    90,
  );
  expect(screen.getByLabelText("Lower isolation rest (seconds)")).toHaveValue(
    90,
  );
  expect(screen.getByLabelText("Core rest (seconds)")).toHaveValue(60);
  expect(screen.getByDisplayValue("Dumbbells")).toBeInTheDocument();
  expect(screen.getByDisplayValue("Olympic bar")).toBeInTheDocument();
  expect(screen.getByLabelText("Plate weight (kg)")).toHaveValue(2.5);

  await fireEvent.update(screen.getByLabelText("Display name"), "Updated Name");
  await fireEvent.update(
    screen.getByLabelText("Email"),
    "updated@example.test",
  );
  await fireEvent.update(screen.getByLabelText("Timezone"), "Europe/London");
  await fireEvent.update(screen.getByLabelText("Bodyweight (kg)"), "72.5");
  await fireEvent.update(screen.getByLabelText("Default units"), "lb");
  await fireEvent.update(screen.getByLabelText("Core rest (seconds)"), "75");
  await fireEvent.update(screen.getByLabelText("Gym name"), "City Gym");
  await fireEvent.update(
    screen.getAllByLabelText("Load increment (kg)")[0],
    "5",
  );
  await fireEvent.update(
    screen.getByLabelText("Plate quantity for 2.5 kg"),
    "6",
  );
  await fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

  await waitFor(() =>
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/settings"),
      expect.objectContaining({ method: "PUT", credentials: "include" }),
    ),
  );
  const payload = JSON.parse(globalThis.fetch.mock.calls[1][1].body);
  expect(payload).toEqual({
    profile: {
      displayName: "Updated Name",
      email: "updated@example.test",
      timezone: "Europe/London",
      bodyweightKg: 72.5,
      defaultUnit: "lb",
      restDurationsSeconds: {
        upper_compound: 120,
        lower_compound: 180,
        upper_isolation: 90,
        lower_isolation: 90,
        core: 75,
      },
    },
    gym: {
      name: "City Gym",
      equipment: [
        {
          name: "Cable stack",
          loadType: "external",
          minLoadKg: 2.5,
          maxLoadKg: 100,
          incrementKg: 5,
          availableLoadsKg: [2.5, 5, 7.5],
        },
        {
          name: "Dumbbells",
          loadType: "dumbbell",
          minLoadKg: 2,
          maxLoadKg: 40,
          incrementKg: 2,
          availableLoadsKg: [2, 4, 6, 8],
        },
      ],
      bars: [{ name: "Olympic bar", weightKg: 20 }],
      plates: [{ weightKg: 2.5, quantity: 6 }],
    },
  });
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Settings saved.",
  );
});

test("shows a recoverable error when settings cannot be loaded or saved", async () => {
  globalThis.fetch = jest.fn(async () =>
    jsonResponse({ error: "Settings service unavailable" }, 503),
  );
  render(SettingsView);

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Settings service unavailable",
  );
  expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
});

test("keeps an equipment name field focused while typing", async () => {
  render(SettingsView);
  await screen.findByLabelText("Display name");
  await fireEvent.click(screen.getByRole("button", { name: "Add equipment" }));

  const nameField = screen.getAllByLabelText("Equipment name").at(-1);
  nameField.focus();
  for (const value of ["R", "Ra", "Rack"]) {
    await fireEvent.update(nameField, value);
    expect(document.activeElement).toBe(nameField);
  }
  expect(nameField).toHaveValue("Rack");
});
