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
      globals: globals.node,
    },
  },
  {
    files: ["packages/frontend/**/*.{js,vue}"],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      "vue/singleline-html-element-content-newline": "off",
    },
  },
];
