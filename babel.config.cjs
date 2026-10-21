module.exports = {
  presets: [
    ["@babel/preset-env", { targets: { node: "current" }, modules: false }],
  ],
  overrides: [
    {
      test: /\.vue$/,
      plugins: ["@babel/plugin-transform-modules-commonjs"],
    },
  ],
};
