function timestamp(milliseconds) {
  return new Date(milliseconds).toISOString();
}

function secondsUntil(value, now) {
  const end = Date.parse(value);
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.ceil((end - now) / 1000));
}

export function createTimerState(now = Date.now()) {
  return {
    sessionElapsedSeconds: 0,
    sessionStartedAt: timestamp(now),
    paused: false,
    restPaused: true,
    restDurationSeconds: 0,
    restRemainingSeconds: 0,
    restEndsAt: null,
  };
}

export function getSessionElapsedSeconds(state, now = Date.now()) {
  const elapsed = Number.isInteger(state?.sessionElapsedSeconds)
    ? state.sessionElapsedSeconds
    : 0;
  const startedAt = Date.parse(state?.sessionStartedAt);
  const runningSeconds = Number.isFinite(startedAt)
    ? Math.max(0, Math.floor((now - startedAt) / 1000))
    : 0;
  return elapsed + runningSeconds;
}

export function getRestRemainingSeconds(state, now = Date.now()) {
  if (!state?.paused && !state?.restPaused && state?.restEndsAt) {
    return secondsUntil(state.restEndsAt, now);
  }
  return Math.max(0, state?.restRemainingSeconds ?? 0);
}

export function pauseTimers(state, now = Date.now()) {
  if (state.paused) return state;
  return {
    ...state,
    sessionElapsedSeconds: getSessionElapsedSeconds(state, now),
    sessionStartedAt: null,
    paused: true,
    restRemainingSeconds: getRestRemainingSeconds(state, now),
    restEndsAt: null,
  };
}

export function resumeTimers(state, now = Date.now()) {
  if (!state.paused) return state;
  const restRemainingSeconds = getRestRemainingSeconds(state, now);
  return {
    ...state,
    sessionStartedAt: timestamp(now),
    paused: false,
    restRemainingSeconds,
    restEndsAt:
      !state.restPaused && restRemainingSeconds > 0
        ? timestamp(now + restRemainingSeconds * 1000)
        : null,
  };
}

export function startRestTimer(state, durationSeconds, now = Date.now()) {
  const duration = Math.max(0, Math.floor(durationSeconds));
  return {
    ...state,
    restPaused: false,
    restDurationSeconds: duration,
    restRemainingSeconds: duration,
    restEndsAt:
      !state.paused && duration > 0 ? timestamp(now + duration * 1000) : null,
  };
}

export function adjustRestTimer(state, adjustmentSeconds, now = Date.now()) {
  const remaining = getRestRemainingSeconds(state, now);
  const elapsed = Math.max(0, state.restDurationSeconds - remaining);
  const restRemainingSeconds = Math.max(
    0,
    remaining + Math.floor(adjustmentSeconds),
  );
  return {
    ...state,
    restDurationSeconds: elapsed + restRemainingSeconds,
    restRemainingSeconds,
    restEndsAt:
      !state.paused && !state.restPaused && restRemainingSeconds > 0
        ? timestamp(now + restRemainingSeconds * 1000)
        : null,
  };
}

export function pauseRestTimer(state, now = Date.now()) {
  if (state.restPaused) return state;
  return {
    ...state,
    restPaused: true,
    restRemainingSeconds: getRestRemainingSeconds(state, now),
    restEndsAt: null,
  };
}

export function resumeRestTimer(state, now = Date.now()) {
  if (!state.restPaused) return state;
  const restRemainingSeconds = getRestRemainingSeconds(state, now);
  return {
    ...state,
    restPaused: false,
    restRemainingSeconds,
    restEndsAt:
      !state.paused && restRemainingSeconds > 0
        ? timestamp(now + restRemainingSeconds * 1000)
        : null,
  };
}

export function resetRestTimer(state) {
  return {
    ...state,
    restPaused: true,
    restRemainingSeconds: state.restDurationSeconds,
    restEndsAt: null,
  };
}

export function skipRestTimer(state) {
  return {
    ...state,
    restPaused: true,
    restRemainingSeconds: 0,
    restEndsAt: null,
  };
}
