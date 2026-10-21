import { fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { afterEach, beforeEach, jest } from "@jest/globals";
import { createMemoryHistory } from "vue-router";
import App from "./App.vue";
import { createAppRouter } from "./router.js";
import { authState, createAuthFacade } from "./auth.js";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  authState.status = "loading";
  authState.profile = null;
  authState.error = "";
  authState.submitting = false;
  authState.registrationComplete = false;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test("guards deep links and supports accessible sign-in and invitation registration", async () => {
  const router = createAppRouter();
  globalThis.fetch = jest.fn(async (url, options = {}) => {
    if (url.endsWith("/api/profile")) {
      return jsonResponse({ error: "Authentication required" }, 401);
    }
    if (url.endsWith("/api/auth/login")) {
      expect(options.credentials).toBe("include");
      return jsonResponse({
        id: "member-1",
        email: "member@example.test",
        role: "member",
      });
    }
    if (url.endsWith("/api/auth/logout")) return jsonResponse({}, 204);
    if (url.endsWith("/api/auth/register")) {
      expect(JSON.parse(options.body)).toMatchObject({
        token: "invite-secret",
      });
      return jsonResponse({ id: "member-2", role: "member" }, 201);
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  await router.push("/history");
  await router.isReady();
  render(App, {
    global: {
      plugins: [router],
      config: { globalProperties: { $auth: createAuthFacade(router) } },
    },
  });

  expect(
    await screen.findByRole("heading", { name: "Sign in" }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Email address")).toBeInTheDocument();
  expect(globalThis.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/profile"),
    expect.objectContaining({ credentials: "include" }),
  );

  await fireEvent.update(
    screen.getByLabelText("Email address"),
    "member@example.test",
  );
  await fireEvent.update(screen.getByLabelText("Password"), "CorrectHorse!23");
  await fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

  expect(
    await screen.findByRole("heading", { name: "Workout history" }),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("main")),
  );
  expect(
    screen.getByRole("navigation", { name: "Primary" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
  expect(screen.getByText("No completed workouts yet.")).toBeInTheDocument();
  await fireEvent.click(screen.getByRole("link", { name: "Dashboard" }));
  expect(
    await screen.findByRole("heading", { name: "Dashboard" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Your training overview")).toBeInTheDocument();

  await fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await screen.findByRole("heading", { name: "Sign in" });
  await router.push("/register?token=invite-secret");

  expect(
    await screen.findByRole("heading", { name: "Create account" }),
  ).toBeInTheDocument();
  await fireEvent.update(screen.getByLabelText("Display name"), "New Member");
  await fireEvent.update(
    screen.getByLabelText("Email address"),
    "new@example.test",
  );
  await fireEvent.update(
    screen.getByLabelText("Password"),
    "A-strong-password-123",
  );
  await fireEvent.click(screen.getByRole("button", { name: "Create account" }));

  await waitFor(() =>
    expect(
      screen.getByText("Account created. Sign in to continue."),
    ).toBeInTheDocument(),
  );
  expect(globalThis.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/auth/register"),
    expect.objectContaining({ credentials: "include" }),
  );
});

test("shows profile loading failures and retries only after the user asks", async () => {
  const router = createAppRouter(createMemoryHistory());
  authState.status = "loading";
  authState.profile = null;
  authState.error = "";
  globalThis.fetch = jest
    .fn()
    .mockResolvedValueOnce(
      jsonResponse({ error: "Profile service unavailable" }, 503),
    )
    .mockResolvedValueOnce(
      jsonResponse({ error: "Authentication required" }, 401),
    );

  await router.push("/history");
  await router.isReady();
  render(App, {
    global: {
      plugins: [router],
      config: { globalProperties: { $auth: createAuthFacade(router) } },
    },
  });

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Profile service unavailable",
  );
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("announces the initial session check while the profile request is pending", async () => {
  const router = createAppRouter(createMemoryHistory());
  authState.status = "loading";
  authState.profile = null;
  authState.error = "";
  let resolveProfile;
  globalThis.fetch = jest.fn(
    () =>
      new Promise((resolve) => {
        resolveProfile = resolve;
      }),
  );

  render(App, {
    global: {
      plugins: [router],
      config: { globalProperties: { $auth: createAuthFacade(router) } },
    },
  });

  await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("status")).toHaveTextContent("Checking your sign-in");
  resolveProfile(jsonResponse({ error: "Authentication required" }, 401));
  expect(
    await screen.findByRole("heading", { name: "Sign in" }),
  ).toBeInTheDocument();
});

test("shows exercise catalog maintenance in navigation for admins", async () => {
  authState.status = "authenticated";
  authState.profile = {
    id: "admin-1",
    email: "admin@example.test",
    role: "admin",
    displayName: "Admin",
  };
  const router = createAppRouter(createMemoryHistory());
  await router.push("/");
  await router.isReady();

  render(App, {
    global: {
      plugins: [router],
      config: { globalProperties: { $auth: createAuthFacade(router) } },
    },
  });

  expect(
    screen.getByRole("link", { name: "Exercise catalog" }),
  ).toHaveAttribute("href", "/admin/catalog");
});
