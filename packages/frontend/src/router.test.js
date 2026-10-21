import { createMemoryHistory } from "vue-router";
import { authState } from "./auth.js";
import { createAppRouter } from "./router.js";

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
