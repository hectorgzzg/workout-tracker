import { render, screen } from "@testing-library/vue";
import PrimeVue from "primevue/config";
import { createPinia } from "pinia";
import HomeView from "./HomeView.vue";

test("renders a signed-in home heading and explicit program empty state", () => {
  render(HomeView, {
    global: {
      plugins: [createPinia(), PrimeVue],
    },
  });

  expect(
    screen.getByRole("heading", { name: "Your training, at a glance" }),
  ).toBeInTheDocument();
  expect(screen.getByText("No active program yet.")).toBeInTheDocument();
});
