import { createRouter, createWebHashHistory } from "vue-router";
import { nextTick } from "vue";
import { authState, loadCurrentProfile } from "./auth.js";
import FeatureView from "./views/FeatureView.vue";
import HomeView from "./views/HomeView.vue";
import LoginView from "./views/LoginView.vue";
import RegisterView from "./views/RegisterView.vue";

export function createAppRouter(
  history = createWebHashHistory(import.meta.env?.BASE_URL ?? "/"),
) {
  const router = createRouter({
    history,
    routes: [
      {
        path: "/login",
        name: "login",
        component: LoginView,
        meta: { publicOnly: true },
      },
      {
        path: "/register",
        name: "register",
        component: RegisterView,
        meta: { publicOnly: true },
      },
      {
        path: "/",
        name: "home",
        component: HomeView,
        meta: { requiresAuth: true },
      },
      {
        path: "/programs",
        name: "programs",
        component: FeatureView,
        meta: {
          requiresAuth: true,
          pageTitle: "Programs",
          emptyTitle: "No active program",
          pageMessage: "Program setup is not available yet.",
        },
      },
      {
        path: "/workouts/:workoutId",
        name: "workout-detail",
        component: FeatureView,
        meta: {
          requiresAuth: true,
          pageTitle: "Workout details",
          emptyTitle: "Workout details are not available",
          pageMessage:
            "Workout prescriptions will appear here when program setup is available.",
        },
      },
      {
        path: "/tracker/:sessionId?",
        name: "tracker",
        component: FeatureView,
        meta: {
          requiresAuth: true,
          pageTitle: "Workout tracker",
          emptyTitle: "No active workout",
          pageMessage:
            "Start a workout from a program day when workout tracking is available.",
        },
      },
      {
        path: "/history",
        name: "history",
        component: FeatureView,
        meta: {
          requiresAuth: true,
          pageTitle: "Workout history",
          emptyTitle: "No completed workouts yet.",
          pageMessage: "Completed sessions will appear here.",
        },
      },
      {
        path: "/dashboard",
        name: "dashboard",
        component: FeatureView,
        meta: {
          requiresAuth: true,
          pageTitle: "Dashboard",
          emptyTitle: "Your training overview",
          pageMessage:
            "Workout metrics will appear here when session history is available.",
        },
      },
      {
        path: "/settings",
        name: "settings",
        component: FeatureView,
        meta: {
          requiresAuth: true,
          pageTitle: "Settings",
          emptyTitle: "Your profile and gym",
          pageMessage: "Profile and gym settings are not available yet.",
        },
      },
      {
        path: "/:pathMatch(.*)*",
        name: "not-found",
        component: FeatureView,
        meta: {
          requiresAuth: true,
          pageTitle: "Page not found",
          emptyTitle: "This page is unavailable",
          pageMessage: "Check the address or return to Home.",
        },
      },
    ],
  });

  router.beforeEach(async (to) => {
    if (authState.status === "loading") {
      await loadCurrentProfile();
    }
    if (to.meta.requiresAuth && authState.status !== "authenticated") {
      return { name: "login", query: { redirect: to.fullPath } };
    }
    if (to.meta.publicOnly && authState.status === "authenticated") {
      return { name: "home" };
    }
    return true;
  });

  router.afterEach(async (_to, _from, failure) => {
    if (!failure && typeof document !== "undefined") {
      await nextTick();
      document.getElementById("main-content")?.focus({ preventScroll: true });
    }
  });

  return router;
}

export default createAppRouter();
