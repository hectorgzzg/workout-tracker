import { createPinia } from "pinia";
import PrimeVue from "primevue/config";
import Aura from "@primeuix/themes/aura";
import { createApp } from "vue";
import App from "./App.vue";
import router from "./router.js";
import { createAuthFacade } from "./auth.js";
import * as timerFunctions from "./timers.js";
import "./style.css";

globalThis.__WORKOUT_TRACKER_API_ORIGIN__ =
  import.meta.env?.VITE_API_ORIGIN ?? "";

const app = createApp(App);
app.provide("timerFunctions", timerFunctions);
app.config.globalProperties.$auth = createAuthFacade(router);
app
  .use(createPinia())
  .use(router)
  .use(PrimeVue, {
    theme: {
      preset: Aura,
    },
  })
  .mount("#app");
