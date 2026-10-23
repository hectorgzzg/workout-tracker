import { createRouter, createWebHashHistory } from "vue-router";
import { nextTick } from "vue";
import { authState, loadCurrentProfile } from "./auth.js";
import catalogViewModule from "./views/CatalogView.vue";
import exerciseInfoViewModule from "./views/ExerciseInfoView.vue";
import FeatureView from "./views/FeatureView.vue";
import homeViewModule from "./views/HomeView.vue";
import LoginView from "./views/LoginView.vue";
import programsViewModule from "./views/ProgramsView.vue";
import RegisterView from "./views/RegisterView.vue";
import settingsViewModule from "./views/SettingsView.vue";
import workoutDetailViewModule from "./views/WorkoutDetailView.vue";

const ExerciseInfoView =
  exerciseInfoViewModule.default ?? exerciseInfoViewModule;
const HomeView = homeViewModule.default ?? homeViewModule;
const WorkoutDetailView =
  workoutDetailViewModule.default ?? workoutDetailViewModule;
const CatalogView = catalogViewModule.default ?? catalogViewModule;
const SettingsView = settingsViewModule.default ?? settingsViewModule;
const ProgramsView = programsViewModule.default ?? programsViewModule;

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
        component: ProgramsView,
        meta: { requiresAuth: true },
      },
      {
        path: "/workouts/:workoutId",
        name: "workout-detail",
        component: WorkoutDetailView,
        meta: { requiresAuth: true },
      },
      {
        path: "/exercises/:exerciseId/info",
        name: "exercise-info",
        component: ExerciseInfoView,
        meta: { requiresAuth: true },
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
        component: SettingsView,
        meta: { requiresAuth: true },
      },
      {
        path: "/admin/catalog",
        name: "admin-catalog",
        component: CatalogView,
        meta: { requiresAuth: true, requiresAdmin: true },
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
    if (to.meta.requiresAdmin && authState.profile?.role !== "admin") {
      return { name: "home" };
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
