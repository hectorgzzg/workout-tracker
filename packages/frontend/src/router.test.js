import { createMemoryHistory } from "vue-router";
import { authState } from "./auth.js";
import { createAppRouter } from "./router.js";
import settingsViewModule from "./views/SettingsView.vue";

const SettingsView = settingsViewModule.default ?? settingsViewModule;

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
