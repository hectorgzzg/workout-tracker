const cleanupActions = new Set();

export function registerTestCleanup(cleanup) {
  if (typeof cleanup !== "function") {
    throw new TypeError("Test cleanup must be a function");
  }

  cleanupActions.add(cleanup);
  return () => cleanupActions.delete(cleanup);
}

export async function runTestCleanups() {
  const actions = [...cleanupActions].reverse();
  cleanupActions.clear();
  const errors = [];

  for (const cleanup of actions) {
    try {
      await cleanup();
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length > 0) {
    throw new AggregateError(errors, "One or more test cleanups failed");
  }
}
