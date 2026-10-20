import { env } from "node:process";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const apiTarget =
  env.VITE_API_PROXY_TARGET ?? `http://127.0.0.1:${env.PORT ?? 3000}`;

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
    },
  },
});
