import { render, screen } from "@testing-library/vue";
import PrimeVue from "primevue/config";
import { createPinia } from "pinia";
import HomeView from "./HomeView.vue";

test("renders the workout tracker home heading", () => {
  render(HomeView, {
    global: {
      plugins: [createPinia(), PrimeVue],
    },
  });

  expect(
    screen.getByRole("heading", { name: "Training, kept simple." }),
  ).toBeInTheDocument();
});
