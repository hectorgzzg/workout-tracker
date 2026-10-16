import { registerTestCleanup, runTestCleanups } from "./cleanup.js";

test("runs registered cleanups in reverse order and clears them", async () => {
  const completed = [];
  registerTestCleanup(() => completed.push("first"));
  registerTestCleanup(async () => completed.push("second"));

  await runTestCleanups();
  await runTestCleanups();

  expect(completed).toEqual(["second", "first"]);
});
