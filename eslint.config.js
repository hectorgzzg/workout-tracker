import js from "@eslint/js";
import globals from "globals";
import vue from "eslint-plugin-vue";

export default [
  {
    ignores: ["**/dist/**", "**/node_modules/**"],
  },
  js.configs.recommended,
  ...vue.configs["flat/recommended"],
  {
    files: ["packages/backend/**/*.js"],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
  },
  {
    files: ["packages/frontend/**/*.{js,vue}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.jest },
    },
    rules: {
      "vue/html-self-closing": "off",
      "vue/max-attributes-per-line": "off",
      "vue/singleline-html-element-content-newline": "off",
    },
  },
  {
    files: ["jest.config.js", "playwright.config.js", "babel.config.cjs"],
    languageOptions: {
      globals: globals.node,
    },
  },
];
