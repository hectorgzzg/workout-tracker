import { randomUUID } from "node:crypto";

export function createTestDataFactory() {
  const runId = randomUUID();
  let sequence = 0;
  const nextId = () => `${runId}-${++sequence}`;

  return {
    user(overrides = {}) {
      const id = nextId();
      return {
        id,
        email: `${id}@example.test`,
        ...overrides,
      };
    },
    workout(user, overrides = {}) {
      return {
        id: nextId(),
        userId: user.id,
        status: "draft",
        ...overrides,
      };
    },
  };
}
