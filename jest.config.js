export default {
  clearMocks: true,
  maxWorkers: "50%",
  projects: [
    {
      displayName: "backend",
      rootDir: ".",
      testEnvironment: "node",
      testMatch: ["<rootDir>/packages/backend/test/**/*.test.js"],
      setupFilesAfterEnv: ["<rootDir>/packages/backend/test/setup.js"],
    },
    {
      displayName: "frontend",
      rootDir: ".",
      testEnvironment: "jsdom",
      testMatch: ["<rootDir>/packages/frontend/**/*.test.js"],
      setupFilesAfterEnv: ["<rootDir>/packages/frontend/test/setup.js"],
      transform: {
        "^.+\\.js$": "babel-jest",
        "^.+\\.vue$": "@vue/vue3-jest",
      },
      transformIgnorePatterns: [
        "/node_modules/(?!(@vue|vue|primevue|@primeuix|@testing-library)/)",
      ],
      moduleNameMapper: {
        "^vue$": "<rootDir>/node_modules/vue/dist/vue.cjs.js",
        "^@vue/runtime-dom$":
          "<rootDir>/node_modules/@vue/runtime-dom/dist/runtime-dom.cjs.js",
      },
      moduleFileExtensions: ["js", "mjs", "cjs", "json", "vue"],
    },
  ],
};
