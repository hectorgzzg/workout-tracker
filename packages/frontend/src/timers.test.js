import {
  adjustRestTimer,
  createTimerState,
  getRestRemainingSeconds,
  getSessionElapsedSeconds,
  pauseRestTimer,
  pauseTimers,
  resetRestTimer,
  resumeTimers,
  resumeRestTimer,
  skipRestTimer,
  startRestTimer,
} from "./timers.js";

const second = 1000;

test("session elapsed time recovers from timestamps and excludes a pause", () => {
  const started = createTimerState(0);
  expect(getSessionElapsedSeconds(started, 12.5 * second)).toBe(12);

  const paused = pauseTimers(started, 12.5 * second);
  expect(getSessionElapsedSeconds(paused, 20 * second)).toBe(12);

  const resumed = resumeTimers(paused, 20 * second);
  expect(getSessionElapsedSeconds(resumed, 30 * second)).toBe(22);
});

test("rest countdown recovers from its end timestamp and pauses with the session", () => {
  const started = startRestTimer(createTimerState(0), 60, 0);
  expect(getRestRemainingSeconds(started, 15 * second)).toBe(45);
  expect(getRestRemainingSeconds(started, 60 * second)).toBe(0);

  const paused = pauseTimers(started, 15 * second);
  expect(getRestRemainingSeconds(paused, 30 * second)).toBe(45);

  const resumed = resumeTimers(paused, 30 * second);
  expect(getRestRemainingSeconds(resumed, 35 * second)).toBe(40);
});

test("rest controls reset, skip, and adjust without crossing zero", () => {
  const started = startRestTimer(createTimerState(0), 60, 0);
  const extended = adjustRestTimer(started, 30, 15 * second);
  expect(getRestRemainingSeconds(extended, 15 * second)).toBe(75);

  const shortened = adjustRestTimer(extended, -90, 15 * second);
  expect(getRestRemainingSeconds(shortened, 15 * second)).toBe(0);
  expect(getRestRemainingSeconds(skipRestTimer(started), 0)).toBe(0);
  expect(getRestRemainingSeconds(resetRestTimer(started), 0)).toBe(60);
});

test("rest can pause independently while the session timer keeps running", () => {
  const started = startRestTimer(createTimerState(0), 60, 0);
  const paused = pauseRestTimer(started, 20 * second);
  expect(getRestRemainingSeconds(paused, 30 * second)).toBe(40);
  expect(getSessionElapsedSeconds(paused, 30 * second)).toBe(30);

  const resumed = resumeRestTimer(paused, 30 * second);
  expect(getRestRemainingSeconds(resumed, 35 * second)).toBe(35);
});
