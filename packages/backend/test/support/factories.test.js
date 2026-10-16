import { createTestDataFactory } from "./factories.js";

test("creates unique users and linked draft workouts per test factory", () => {
  const firstFactory = createTestDataFactory();
  const secondFactory = createTestDataFactory();
  const firstUser = firstFactory.user();
  const secondUser = firstFactory.user();
  const workout = firstFactory.workout(firstUser);
  const isolatedUser = secondFactory.user();

  expect(firstUser.id).not.toBe(secondUser.id);
  expect(firstUser.id).not.toBe(isolatedUser.id);
  expect(firstUser.email).toMatch(/@example\.test$/);
  expect(workout).toMatchObject({
    userId: firstUser.id,
    status: "draft",
  });
});
