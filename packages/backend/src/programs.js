import { createHash } from "node:crypto";
import express from "express";
import { authenticate } from "./auth/index.js";
import { parseWorkoutCsv } from "./import.js";

const maximumSourceBytes = 512 * 1024;
const idempotencyKeyPattern = /^[A-Za-z0-9._:-]{8,128}$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validTimerTimestamp(value) {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function validTimerState(value) {
  const keys = [
    "sessionElapsedSeconds",
    "sessionStartedAt",
    "paused",
    "restPaused",
    "restDurationSeconds",
    "restRemainingSeconds",
    "restEndsAt",
  ];
  return (
    isRecord(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key)) &&
    Number.isInteger(value.sessionElapsedSeconds) &&
    value.sessionElapsedSeconds >= 0 &&
    typeof value.paused === "boolean" &&
    typeof value.restPaused === "boolean" &&
    Number.isInteger(value.restDurationSeconds) &&
    value.restDurationSeconds >= 0 &&
    Number.isInteger(value.restRemainingSeconds) &&
    value.restRemainingSeconds >= 0 &&
    value.restRemainingSeconds <= value.restDurationSeconds &&
    (value.paused
      ? value.sessionStartedAt === null && value.restEndsAt === null
      : validTimerTimestamp(value.sessionStartedAt)) &&
    (value.restEndsAt === null || validTimerTimestamp(value.restEndsAt)) &&
    (!(value.paused || value.restPaused) || value.restEndsAt === null)
  );
}

function validSource(value) {
  return (
    typeof value === "string" &&
    Buffer.byteLength(value, "utf8") > 0 &&
    Buffer.byteLength(value, "utf8") <= maximumSourceBytes
  );
}

function listExercises(weeks) {
  return weeks.flatMap((week) =>
    week.days.flatMap((day) => day.exercises ?? []),
  );
}

async function buildPreview(source, pool) {
  const parsed = parseWorkoutCsv(source);
  for (const exercise of listExercises(parsed.weeks)) {
    if (
      exercise.sets.length === 0 &&
      !parsed.rowErrors.some((error) => error.rowNumber === exercise.rowNumber)
    ) {
      parsed.rowErrors.push({
        rowNumber: exercise.rowNumber,
        code: "exercise_has_no_sets",
        message: "An exercise row must contain at least one valid set.",
        exerciseName: exercise.name,
      });
    }
  }
  if (parsed.rowErrors.length > 0) parsed.canActivate = false;

  const { rows: catalogExercises } = await pool.query(
    "SELECT id, name FROM exercises ORDER BY lower(name), id",
  );
  const catalogByName = new Map(
    catalogExercises.map((exercise) => [exercise.name, exercise]),
  );
  const sourceNames = [
    ...new Set(listExercises(parsed.weeks).map(({ name }) => name)),
  ];
  return {
    ...parsed,
    mappings: sourceNames.map((sourceName) => ({
      sourceName,
      exerciseId: catalogByName.get(sourceName)?.id ?? null,
      exactMatch: catalogByName.has(sourceName),
    })),
    catalogExercises,
  };
}

function normalizedNumbers(value) {
  if (
    !Array.isArray(value) ||
    value.some((number) => !Number.isInteger(number) || number < 1)
  ) {
    return null;
  }
  return [...new Set(value)].sort((left, right) => left - right);
}

function requestHash({
  source,
  name,
  skipRowNumbers,
  acknowledgedSkipRows,
  mappings,
}) {
  const normalized = {
    source,
    name,
    skipRowNumbers,
    acknowledgedSkipRows,
    mappings: Object.entries(mappings).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function responseProgram(row, replayed = false) {
  return {
    id: row.id,
    name: row.name,
    status: "draft",
    ...(replayed ? { replayed: true } : {}),
  };
}

function validationError(response, error, errors = {}) {
  response.status(400).json({ error, errors });
}

function normalizeProgramDay(value) {
  if (
    !isRecord(value) ||
    !["workout", "rest"].includes(value.type) ||
    typeof value.name !== "string" ||
    value.name.trim().length === 0 ||
    value.name.trim().length > 120 ||
    !Array.isArray(value.exercises) ||
    value.exercises.length > 100
  ) {
    return null;
  }

  const exercises = [];
  for (const exercise of value.exercises) {
    if (
      !isRecord(exercise) ||
      typeof exercise.exerciseId !== "string" ||
      !uuidPattern.test(exercise.exerciseId) ||
      typeof (exercise.notes ?? "") !== "string" ||
      (exercise.notes ?? "").length > 2000 ||
      !Array.isArray(exercise.sets) ||
      exercise.sets.length === 0 ||
      exercise.sets.length > 100
    ) {
      return null;
    }
    const sets = [];
    for (const set of exercise.sets) {
      if (
        !isRecord(set) ||
        !["standard", "warmup", "failure"].includes(set.type) ||
        !Number.isInteger(set.repMin) ||
        set.repMin < 1 ||
        set.repMin > 32767 ||
        (set.repMax !== null &&
          (!Number.isInteger(set.repMax) ||
            set.repMax < set.repMin ||
            set.repMax > 32767)) ||
        !Number.isInteger(set.rir) ||
        set.rir < 0 ||
        set.rir > 10 ||
        (set.type === "failure" && set.rir !== 0)
      ) {
        return null;
      }
      sets.push({
        type: set.type,
        repMin: set.repMin,
        repMax: set.repMax ?? null,
        rir: set.rir,
      });
    }
    exercises.push({
      exerciseId: exercise.exerciseId,
      notes: exercise.notes ?? "",
      sets,
    });
  }

  if (
    (value.type === "workout" && exercises.length === 0) ||
    (value.type === "rest" && exercises.length !== 0)
  ) {
    return null;
  }
  return { type: value.type, name: value.name.trim(), exercises };
}

async function missingExerciseIds(client, days) {
  const requestedIds = [
    ...new Set(
      days.flatMap((day) => day.exercises.map(({ exerciseId }) => exerciseId)),
    ),
  ];
  if (requestedIds.length === 0) return [];
  const { rows } = await client.query(
    "SELECT id FROM exercises WHERE id = ANY($1::uuid[])",
    [requestedIds],
  );
  const foundIds = new Set(rows.map(({ id }) => id));
  return requestedIds.filter((id) => !foundIds.has(id));
}

async function insertProgramDay(client, userId, weekId, slotNumber, day) {
  const dayResult = await client.query(
    `INSERT INTO program_days (user_id, week_id, slot_number, day_type, name)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [userId, weekId, slotNumber, day.type, day.name],
  );
  const dayId = dayResult.rows[0].id;
  for (const [exerciseIndex, exercise] of day.exercises.entries()) {
    const prescriptionSnapshot = {
      notes: exercise.notes,
      sets: exercise.sets.map((set) => ({
        type: set.type,
        repMin: set.repMin,
        repMax: set.repMax,
        targetRir: set.rir,
      })),
    };
    const exerciseResult = await client.query(
      `INSERT INTO program_day_exercises
         (user_id, day_id, exercise_id, sort_order, prescription_snapshot)
       VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id`,
      [
        userId,
        dayId,
        exercise.exerciseId,
        exerciseIndex + 1,
        JSON.stringify(prescriptionSnapshot),
      ],
    );
    for (const [setIndex, set] of exercise.sets.entries()) {
      await client.query(
        `INSERT INTO program_sets
           (user_id, day_exercise_id, set_number, set_type, rep_min, rep_max, target_rir)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          userId,
          exerciseResult.rows[0].id,
          setIndex + 1,
          set.type,
          set.repMin,
          set.repMax,
          set.rir,
        ],
      );
    }
  }
  return dayId;
}

async function getProgramDetail(pool, userId, templateId) {
  const templateResult = await pool.query(
    `SELECT templates.id, templates.name,
            EXISTS (
              SELECT 1 FROM program_runs AS runs
              WHERE runs.user_id = templates.user_id
                AND runs.template_id = templates.id AND runs.status = 'active'
            ) AS active
     FROM program_templates AS templates
     WHERE templates.user_id = $1 AND templates.id = $2`,
    [userId, templateId],
  );
  if (templateResult.rows.length === 0) return null;
  const template = templateResult.rows[0];
  const weekResult = await pool.query(
    `SELECT id, week_number, week_type FROM program_weeks
     WHERE user_id = $1 AND template_id = $2 ORDER BY week_number`,
    [userId, templateId],
  );
  const weeks = weekResult.rows.map((week) => ({
    id: week.id,
    weekNumber: week.week_number,
    type: week.week_type,
    days: [],
  }));
  if (weeks.length === 0) {
    return {
      id: template.id,
      name: template.name,
      status: template.active ? "active" : "draft",
      weeks,
    };
  }

  const weekById = new Map(weeks.map((week) => [week.id, week]));
  const weekIds = weeks.map(({ id }) => id);
  const dayResult = await pool.query(
    `SELECT id, week_id, slot_number, day_type, name FROM program_days
     WHERE user_id = $1 AND week_id = ANY($2::uuid[])
     ORDER BY slot_number`,
    [userId, weekIds],
  );
  const days = dayResult.rows.map((day) => ({
    id: day.id,
    slotNumber: day.slot_number,
    type: day.day_type,
    name: day.name,
    exercises: [],
  }));
  const dayById = new Map(days.map((day) => [day.id, day]));
  for (const row of dayResult.rows)
    weekById.get(row.week_id).days.push(dayById.get(row.id));

  const dayIds = days.map(({ id }) => id);
  if (dayIds.length > 0) {
    const exerciseResult = await pool.query(
      `SELECT day_exercises.id, day_exercises.day_id, day_exercises.exercise_id,
              day_exercises.prescription_snapshot, exercises.name AS exercise_name
       FROM program_day_exercises AS day_exercises
       JOIN exercises ON exercises.id = day_exercises.exercise_id
       WHERE day_exercises.user_id = $1 AND day_exercises.day_id = ANY($2::uuid[])
       ORDER BY day_exercises.sort_order`,
      [userId, dayIds],
    );
    const exerciseById = new Map();
    for (const exercise of exerciseResult.rows) {
      const snapshot = exercise.prescription_snapshot ?? {};
      const item = {
        id: exercise.id,
        exerciseId: exercise.exercise_id,
        name: exercise.exercise_name,
        notes: snapshot.notes ?? "",
        sets: [],
      };
      exerciseById.set(item.id, item);
      dayById.get(exercise.day_id).exercises.push(item);
    }
    const exerciseIds = [...exerciseById.keys()];
    if (exerciseIds.length > 0) {
      const setResult = await pool.query(
        `SELECT id, day_exercise_id, set_number, set_type, rep_min, rep_max, target_rir
         FROM program_sets WHERE user_id = $1 AND day_exercise_id = ANY($2::uuid[])
         ORDER BY set_number`,
        [userId, exerciseIds],
      );
      for (const set of setResult.rows) {
        exerciseById.get(set.day_exercise_id).sets.push({
          id: set.id,
          setNumber: set.set_number,
          type: set.set_type,
          repMin: set.rep_min,
          repMax: set.rep_max,
          rir: set.target_rir,
        });
      }
    }
  }
  return {
    id: template.id,
    name: template.name,
    status: template.active ? "active" : "draft",
    weeks,
  };
}

async function activationErrors(client, userId, templateId) {
  const { rows: weeks } = await client.query(
    `SELECT id, week_number, week_type FROM program_weeks
     WHERE user_id = $1 AND template_id = $2 ORDER BY week_number`,
    [userId, templateId],
  );
  const errors = {};
  const deloadWeeks = weeks.filter(({ week_type: type }) => type === "deload");
  if (deloadWeeks.length !== 1 || deloadWeeks[0]?.id !== weeks.at(-1)?.id) {
    errors.deload = "required";
  }
  if (weeks.length === 0) errors.weeks = "required";
  for (const [index, week] of weeks.entries()) {
    if (
      week.week_number !== index + 1 ||
      week.week_type !== (index === weeks.length - 1 ? "deload" : "training")
    ) {
      errors.weeks = "must_be_ordered_with_appended_deload";
    }
    const { rows: days } = await client.query(
      `SELECT days.id, days.day_type,
              count(DISTINCT day_exercises.id)::int AS exercise_count,
              count(DISTINCT exercises.id)::int AS mapped_count
       FROM program_days AS days
       LEFT JOIN program_day_exercises AS day_exercises
         ON day_exercises.user_id = days.user_id AND day_exercises.day_id = days.id
       LEFT JOIN exercises ON exercises.id = day_exercises.exercise_id
       WHERE days.user_id = $1 AND days.week_id = $2
       GROUP BY days.id ORDER BY days.slot_number`,
      [userId, week.id],
    );
    if (days.length !== 7) errors.days = "exactly_seven_required";
    if (!days.some((day) => day.day_type === "workout")) {
      errors.workouts = "at_least_one_required";
    }
    if (
      days.some((day) => day.day_type === "workout" && day.exercise_count === 0)
    ) {
      errors.workouts = "must_contain_exercises";
    }
    if (days.some((day) => day.exercise_count !== day.mapped_count)) {
      errors.mappings = "unresolved";
    }
    const { rows: exercisesWithoutSets } = await client.query(
      `SELECT day_exercises.id
       FROM program_days AS days
       JOIN program_day_exercises AS day_exercises
         ON day_exercises.user_id = days.user_id AND day_exercises.day_id = days.id
       LEFT JOIN program_sets AS sets
         ON sets.user_id = day_exercises.user_id
        AND sets.day_exercise_id = day_exercises.id
       WHERE days.user_id = $1 AND days.week_id = $2
       GROUP BY day_exercises.id HAVING count(sets.id) = 0`,
      [userId, week.id],
    );
    if (exercisesWithoutSets.length > 0) errors.sets = "required";
  }
  return errors;
}

async function insertProgramRun(client, userId, templateId) {
  const run = await client.query(
    `INSERT INTO program_runs (user_id, template_id)
     VALUES ($1, $2) RETURNING id`,
    [userId, templateId],
  );
  await client.query(
    `INSERT INTO program_run_days
       (user_id, run_id, template_day_id, week_number, slot_number, day_type)
     SELECT days.user_id, $3, days.id, weeks.week_number,
            days.slot_number, days.day_type
     FROM program_weeks AS weeks
     JOIN program_days AS days
       ON days.user_id = weeks.user_id AND days.week_id = weeks.id
     WHERE weeks.user_id = $1 AND weeks.template_id = $2
     ORDER BY weeks.week_number, days.slot_number`,
    [userId, templateId, run.rows[0].id],
  );
  return run.rows[0].id;
}

async function getCurrentWeekNumber(client, userId, runId) {
  const { rows } = await client.query(
    `SELECT min(week_number)::int AS week_number
     FROM program_run_days
     WHERE user_id = $1 AND run_id = $2 AND status = 'pending'`,
    [userId, runId],
  );
  return rows[0].week_number;
}

async function finishRunIfResolved(client, userId, runId, weekNumber) {
  const { rows } = await client.query(
    `SELECT count(*) FILTER (WHERE status = 'pending')::int AS pending,
            max(week_number)::int AS final_week
     FROM program_run_days WHERE user_id = $1 AND run_id = $2`,
    [userId, runId],
  );
  if (rows[0].pending === 0 && rows[0].final_week === weekNumber) {
    await client.query(
      `UPDATE program_runs SET status = 'completed', ended_at = now()
       WHERE user_id = $1 AND id = $2 AND status = 'active'`,
      [userId, runId],
    );
    return "completed";
  }
  return "active";
}

async function resolveRunDay(client, userId, runId, runDayId, dayType, status) {
  const run = await client.query(
    `SELECT status FROM program_runs
     WHERE user_id = $1 AND id = $2 FOR UPDATE`,
    [userId, runId],
  );
  if (run.rows.length === 0) {
    return { statusCode: 404, error: "Program run not found." };
  }
  if (run.rows[0].status !== "active") {
    return {
      statusCode: 409,
      error: "Only the active program run can advance.",
    };
  }

  const currentWeekNumber = await getCurrentWeekNumber(client, userId, runId);
  const day = await client.query(
    `SELECT week_number, day_type, status FROM program_run_days
     WHERE user_id = $1 AND run_id = $2 AND id = $3 FOR UPDATE`,
    [userId, runId, runDayId],
  );
  if (day.rows.length === 0) {
    return { statusCode: 404, error: "Program run day not found." };
  }
  const currentDay = day.rows[0];
  if (currentDay.day_type !== dayType) {
    return { statusCode: 400, error: `This slot is not a ${dayType} day.` };
  }
  if (
    currentDay.week_number !== currentWeekNumber ||
    (status === "pending"
      ? currentDay.status !== "rest_done"
      : currentDay.status !== "pending")
  ) {
    return {
      statusCode: 409,
      error: "Only unresolved slots in the current week can be changed.",
    };
  }

  await client.query(
    `UPDATE program_run_days SET status = $1, resolved_at = $2
     WHERE user_id = $3 AND run_id = $4 AND id = $5`,
    [status, status === "pending" ? null : new Date(), userId, runId, runDayId],
  );
  const runStatus = await finishRunIfResolved(
    client,
    userId,
    runId,
    currentWeekNumber,
  );
  return {
    statusCode: 200,
    runStatus,
    currentWeekNumber:
      runStatus === "active"
        ? await getCurrentWeekNumber(client, userId, runId)
        : null,
  };
}

export async function resolveProgramRunWorkout(
  client,
  { userId, runId, runDayId, outcome },
) {
  if (!["completed", "partial", "skipped"].includes(outcome)) {
    return { statusCode: 400, error: "A valid workout outcome is required." };
  }
  return resolveRunDay(client, userId, runId, runDayId, "workout", outcome);
}

async function checkRunDayEligibility(client, userId, runId, runDayId) {
  const run = await client.query(
    `SELECT status FROM program_runs
     WHERE user_id = $1 AND id = $2 FOR UPDATE`,
    [userId, runId],
  );
  if (run.rows.length === 0) {
    return { statusCode: 404, error: "Program run not found." };
  }
  if (run.rows[0].status !== "active") {
    return {
      statusCode: 409,
      error: "Only the active program run is eligible.",
    };
  }
  const currentWeekNumber = await getCurrentWeekNumber(client, userId, runId);
  const day = await client.query(
    `SELECT week_number, day_type, status FROM program_run_days
     WHERE user_id = $1 AND run_id = $2 AND id = $3 FOR UPDATE`,
    [userId, runId, runDayId],
  );
  if (day.rows.length === 0) {
    return { statusCode: 404, error: "Program run day not found." };
  }
  if (
    day.rows[0].day_type !== "workout" ||
    day.rows[0].status !== "pending" ||
    day.rows[0].week_number !== currentWeekNumber
  ) {
    return {
      statusCode: 409,
      error: "Only pending workout slots in the current week are eligible.",
    };
  }
  return { statusCode: 200 };
}

async function checkWorkoutDateEligibility(
  client,
  userId,
  localDate,
  sessionId = null,
) {
  const parameters = [userId, localDate];
  const sessionFilter = sessionId ? "AND id <> $3" : "";
  if (sessionId) parameters.push(sessionId);
  const performance = await client.query(
    `SELECT id FROM workout_sessions
     WHERE user_id = $1 AND started_local_date = $2
       AND status IN ('completed', 'partial') AND has_performance
       ${sessionFilter}
     LIMIT 1`,
    parameters,
  );
  if (performance.rows.length > 0) {
    return {
      statusCode: 409,
      error:
        "A workout with retained performance already exists for this local start date.",
    };
  }
  return { statusCode: 200 };
}

export async function recheckWorkoutSessionEligibility(
  client,
  { userId, sessionId },
) {
  const session = await client.query(
    `SELECT status, program_run_id, program_run_day_id, started_local_date
     FROM workout_sessions WHERE user_id = $1 AND id = $2 FOR UPDATE`,
    [userId, sessionId],
  );
  if (session.rows.length === 0) {
    return { statusCode: 404, error: "Workout session not found." };
  }
  const current = session.rows[0];
  if (current.status !== "draft") {
    return { statusCode: 409, error: "Only an active draft can be finalized." };
  }
  if (!current.program_run_id || !current.program_run_day_id) {
    return {
      statusCode: 409,
      error: "The workout no longer has an eligible program slot.",
    };
  }
  const dayEligibility = await checkRunDayEligibility(
    client,
    userId,
    current.program_run_id,
    current.program_run_day_id,
  );
  if (dayEligibility.statusCode !== 200) return dayEligibility;
  return checkWorkoutDateEligibility(
    client,
    userId,
    current.started_local_date,
    sessionId,
  );
}

function sessionResponse(row, exercises, replayed = false) {
  return {
    id: row.id,
    runId: row.program_run_id,
    runDayId: row.program_run_day_id,
    status: row.status,
    hasPerformance: row.has_performance,
    startedAt: row.started_at,
    startedTimezone: row.started_timezone,
    startedLocalDate: row.started_local_date,
    version: row.version,
    timers: row.timer_state,
    exercises,
    ...(replayed ? { replayed: true } : {}),
  };
}

async function getWorkoutSession(pool, userId, sessionId) {
  const sessionResult = await pool.query(
    `SELECT id, program_run_id, program_run_day_id, status, has_performance,
            started_at, started_timezone,
            to_char(started_local_date, 'YYYY-MM-DD') AS started_local_date,
          version, timer_state
     FROM workout_sessions WHERE user_id = $1 AND id = $2`,
    [userId, sessionId],
  );
  if (sessionResult.rows.length === 0) return null;
  const exerciseResult = await pool.query(
    `SELECT id, exercise_id, name_snapshot, exercise_snapshot,
            prescription_snapshot, skipped, bodyweight_kg, bodyweight_factor,
            assistance_ratio
     FROM session_exercises
    WHERE user_id = $1 AND session_id = $2
    ORDER BY (exercise_snapshot->>'sortOrder')::int`,
    [userId, sessionId],
  );
  const exercises = exerciseResult.rows.map((exercise) => ({
    id: exercise.id,
    exerciseId: exercise.exercise_id,
    name: exercise.name_snapshot,
    snapshot: exercise.exercise_snapshot,
    prescription: exercise.prescription_snapshot,
    skipped: exercise.skipped,
    bodyweightKg: exercise.bodyweight_kg,
    bodyweightFactor: exercise.bodyweight_factor,
    assistanceRatio: exercise.assistance_ratio,
    sets: [],
  }));
  const exerciseById = new Map(
    exercises.map((exercise) => [exercise.id, exercise]),
  );
  if (exerciseById.size > 0) {
    const setResult = await pool.query(
      `SELECT id, session_exercise_id, set_number, set_type,
              prescription_snapshot, actual_load_kg, actual_reps, actual_rir,
              checked_at
       FROM session_sets WHERE user_id = $1
         AND session_exercise_id = ANY($2::uuid[]) ORDER BY set_number`,
      [userId, [...exerciseById.keys()]],
    );
    for (const set of setResult.rows) {
      exerciseById.get(set.session_exercise_id).sets.push({
        id: set.id,
        setNumber: set.set_number,
        type: set.set_type,
        prescription: set.prescription_snapshot,
        actualLoadKg: set.actual_load_kg,
        actualReps: set.actual_reps,
        actualRir: set.actual_rir,
        checked: set.checked_at !== null,
      });
    }
  }
  const row = sessionResult.rows[0];
  return sessionResponse(row, exercises);
}

async function insertSessionSnapshots(client, userId, sessionId, runDayId) {
  const source = await client.query(
    `SELECT day_exercises.id AS day_exercise_id, day_exercises.exercise_id,
            day_exercises.sort_order, day_exercises.prescription_snapshot AS notes_snapshot,
            exercises.name, exercises.image_url, exercises.load_type,
            exercises.rest_category, exercises.bodyweight_factor,
            exercises.assistance_ratio, exercises.dumbbell_count,
            profiles.bodyweight_kg, profiles.default_unit,
            preferences.unit_override, sets.set_number, sets.set_type,
            sets.rep_min, sets.rep_max, sets.target_rir
     FROM program_run_days AS run_days
     JOIN program_days AS days
       ON days.user_id = run_days.user_id AND days.id = run_days.template_day_id
     JOIN program_day_exercises AS day_exercises
       ON day_exercises.user_id = days.user_id AND day_exercises.day_id = days.id
     JOIN exercises ON exercises.id = day_exercises.exercise_id
     JOIN program_sets AS sets
       ON sets.user_id = day_exercises.user_id
      AND sets.day_exercise_id = day_exercises.id
     JOIN profiles ON profiles.user_id = run_days.user_id
     LEFT JOIN exercise_preferences AS preferences
       ON preferences.user_id = run_days.user_id
      AND preferences.exercise_id = exercises.id
     WHERE run_days.user_id = $1 AND run_days.id = $2
     ORDER BY day_exercises.sort_order, sets.set_number`,
    [userId, runDayId],
  );
  const {
    rows: [profile],
  } = await client.query(
    `SELECT timezone, default_unit FROM profiles WHERE user_id = $1 FOR SHARE`,
    [userId],
  );
  const gym = await client.query("SELECT id FROM gyms WHERE user_id = $1", [
    userId,
  ]);
  const gymId = gym.rows[0]?.id;
  const equipment = gymId
    ? await client.query(
        `SELECT name, load_type, min_load_kg, max_load_kg, increment_kg,
                available_loads_kg
         FROM gym_equipment WHERE user_id = $1 AND gym_id = $2 ORDER BY name`,
        [userId, gymId],
      )
    : { rows: [] };
  const bars = gymId
    ? await client.query(
        "SELECT name, weight_kg FROM gym_bars WHERE user_id = $1 AND gym_id = $2 ORDER BY name",
        [userId, gymId],
      )
    : { rows: [] };
  const plates = gymId
    ? await client.query(
        "SELECT weight_kg, quantity FROM gym_plates WHERE user_id = $1 AND gym_id = $2 ORDER BY weight_kg",
        [userId, gymId],
      )
    : { rows: [] };
  const gymSnapshot = {
    equipment: equipment.rows,
    bars: bars.rows,
    plates: plates.rows,
  };
  let currentDayExerciseId = null;
  let currentExercise = null;
  for (const row of source.rows) {
    if (row.day_exercise_id !== currentDayExerciseId) {
      if (currentExercise) {
        await client.query(
          `UPDATE session_exercises SET prescription_snapshot = $1::jsonb
           WHERE user_id = $2 AND id = $3`,
          [
            JSON.stringify(currentExercise.prescription),
            userId,
            currentExercise.sessionExerciseId,
          ],
        );
      }
      currentDayExerciseId = row.day_exercise_id;
      const preferenceUnit = row.unit_override ?? row.default_unit;
      const exerciseSnapshot = {
        sortOrder: row.sort_order,
        imageUrl: row.image_url,
        loadType: row.load_type,
        restCategory: row.rest_category,
        dumbbellCount: row.dumbbell_count,
        unit: preferenceUnit,
        defaultUnit: profile.default_unit,
        timezone: profile.timezone,
        gym: gymSnapshot,
      };
      currentExercise = {
        source: row,
        snapshot: exerciseSnapshot,
        prescription: {
          notes: row.notes_snapshot?.notes ?? "",
          sets: [],
        },
      };
      const inserted = await client.query(
        `INSERT INTO session_exercises
           (user_id, session_id, exercise_id, name_snapshot, exercise_snapshot,
            prescription_snapshot, bodyweight_kg, bodyweight_factor, assistance_ratio)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9)
         RETURNING id`,
        [
          userId,
          sessionId,
          row.exercise_id,
          row.name,
          JSON.stringify(exerciseSnapshot),
          JSON.stringify(currentExercise.prescription),
          row.bodyweight_kg,
          row.bodyweight_factor,
          row.assistance_ratio,
        ],
      );
      currentExercise.sessionExerciseId = inserted.rows[0].id;
      currentExercise.sets = [];
    }
    const prescription = {
      repMin: row.rep_min,
      repMax: row.rep_max,
      targetRir: row.target_rir,
      unit: row.unit_override ?? row.default_unit,
      loadType: row.load_type,
    };
    currentExercise.prescription.sets.push({
      type: row.set_type,
      ...prescription,
    });
    const insertedSet = await client.query(
      `INSERT INTO session_sets
         (user_id, session_exercise_id, set_number, set_type, prescription_snapshot)
       VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id`,
      [
        userId,
        currentExercise.sessionExerciseId,
        row.set_number,
        row.set_type,
        JSON.stringify(prescription),
      ],
    );
    currentExercise.sets.push(insertedSet.rows[0].id);
  }
  if (currentExercise) {
    await client.query(
      `UPDATE session_exercises SET prescription_snapshot = $1::jsonb
       WHERE user_id = $2 AND id = $3`,
      [
        JSON.stringify(currentExercise.prescription),
        userId,
        currentExercise.sessionExerciseId,
      ],
    );
  }
}

async function getCurrentProgramRun(pool, userId) {
  const run = await pool.query(
    `SELECT runs.id, runs.template_id, runs.status, runs.started_at,
            templates.name,
            (SELECT min(week_number)::int FROM program_run_days
             WHERE user_id = runs.user_id AND run_id = runs.id AND status = 'pending')
              AS current_week_number
     FROM program_runs AS runs
     JOIN program_templates AS templates
       ON templates.user_id = runs.user_id AND templates.id = runs.template_id
     WHERE runs.user_id = $1 AND runs.status = 'active'`,
    [userId],
  );
  if (run.rows.length === 0) return null;
  const current = run.rows[0];
  const week = await pool.query(
    `SELECT run_days.id, run_days.template_day_id, run_days.slot_number,
            run_days.day_type, run_days.status, run_days.resolved_at, days.name,
            weeks.week_type
     FROM program_run_days AS run_days
     JOIN program_days AS days
       ON days.user_id = run_days.user_id AND days.id = run_days.template_day_id
     JOIN program_weeks AS weeks
       ON weeks.user_id = run_days.user_id
      AND weeks.template_id = $4 AND weeks.week_number = run_days.week_number
     WHERE run_days.user_id = $1 AND run_days.run_id = $2
       AND run_days.week_number = $3
     ORDER BY run_days.slot_number`,
    [userId, current.id, current.current_week_number, current.template_id],
  );
  return {
    id: current.id,
    templateId: current.template_id,
    name: current.name,
    status: current.status,
    startedAt: current.started_at,
    currentWeekNumber: current.current_week_number,
    week: {
      weekNumber: current.current_week_number,
      weekType: week.rows[0]?.week_type,
      days: week.rows.map((day) => ({
        id: day.id,
        templateDayId: day.template_day_id,
        slotNumber: day.slot_number,
        type: day.day_type,
        name: day.name,
        status: day.status,
        resolvedAt: day.resolved_at,
      })),
    },
  };
}

export function createProgramsRouter({ pool }) {
  const router = express.Router();
  const requireSignIn = authenticate({ pool });

  router.get(
    "/workout-sessions/active",
    requireSignIn,
    async (request, response) => {
      const { rows } = await pool.query(
        `SELECT id FROM workout_sessions
         WHERE user_id = $1 AND status = 'draft'`,
        [request.auth.userId],
      );
      if (rows.length === 0) {
        response.json(null);
        return;
      }
      response.json(
        await getWorkoutSession(pool, request.auth.userId, rows[0].id),
      );
    },
  );

  router.post(
    "/workout-sessions/start",
    requireSignIn,
    async (request, response) => {
      const { runId, runDayId } = request.body ?? {};
      const idempotencyKey = request.get("Idempotency-Key");
      if (
        !uuidPattern.test(runId ?? "") ||
        !uuidPattern.test(runDayId ?? "") ||
        !idempotencyKeyPattern.test(idempotencyKey ?? "") ||
        Object.keys(request.body ?? {}).some(
          (key) => !["runId", "runDayId"].includes(key),
        )
      ) {
        validationError(
          response,
          "A valid run, workout slot, and idempotency key are required.",
        );
        return;
      }
      const userId = request.auth.userId;
      const requestHash = createHash("sha256")
        .update(JSON.stringify({ runId, runDayId }))
        .digest("hex");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [
          userId,
        ]);
        const previousRequest = await client.query(
          `SELECT operation, request_hash, session_id
           FROM workout_session_requests
           WHERE user_id = $1 AND idempotency_key = $2`,
          [userId, idempotencyKey],
        );
        if (previousRequest.rows.length > 0) {
          const previous = previousRequest.rows[0];
          if (
            previous.operation !== "start" ||
            previous.request_hash !== requestHash
          ) {
            await client.query("ROLLBACK");
            response.status(409).json({
              error:
                "Idempotency key was already used with a different request.",
            });
            return;
          }
          const session = await getWorkoutSession(
            client,
            userId,
            previous.session_id,
          );
          await client.query("COMMIT");
          response.status(200).json({ ...session, replayed: true });
          return;
        }

        const activeDraft = await client.query(
          `SELECT id, program_run_id, program_run_day_id
           FROM workout_sessions WHERE user_id = $1 AND status = 'draft'
           FOR UPDATE`,
          [userId],
        );
        if (activeDraft.rows.length > 0) {
          const existing = activeDraft.rows[0];
          if (
            existing.program_run_id !== runId ||
            existing.program_run_day_id !== runDayId
          ) {
            await client.query("ROLLBACK");
            response.status(409).json({
              error: "Resolve the active workout before starting another slot.",
            });
            return;
          }
          const session = await getWorkoutSession(client, userId, existing.id);
          await client.query(
            `INSERT INTO workout_session_requests
               (user_id, idempotency_key, operation, request_hash, session_id, resulting_version)
             VALUES ($1, $2, 'start', $3, $4, $5)`,
            [userId, idempotencyKey, requestHash, existing.id, session.version],
          );
          await client.query("COMMIT");
          response.status(200).json(session);
          return;
        }

        const eligibility = await checkRunDayEligibility(
          client,
          userId,
          runId,
          runDayId,
        );
        if (eligibility.statusCode !== 200) {
          await client.query("ROLLBACK");
          response
            .status(eligibility.statusCode)
            .json({ error: eligibility.error });
          return;
        }
        const profile = await client.query(
          `SELECT timezone, (now() AT TIME ZONE timezone)::date AS local_date
           FROM profiles WHERE user_id = $1 FOR SHARE`,
          [userId],
        );
        if (profile.rows.length === 0) {
          await client.query("ROLLBACK");
          response
            .status(409)
            .json({ error: "A profile is required to start a workout." });
          return;
        }
        const dateEligibility = await checkWorkoutDateEligibility(
          client,
          userId,
          profile.rows[0].local_date,
        );
        if (dateEligibility.statusCode !== 200) {
          await client.query("ROLLBACK");
          response
            .status(dateEligibility.statusCode)
            .json({ error: dateEligibility.error });
          return;
        }
        const sessionResult = await client.query(
          `INSERT INTO workout_sessions
             (user_id, program_run_id, program_run_day_id, started_at,
              started_timezone, started_local_date)
           VALUES ($1, $2, $3, now(), $4, $5)
           RETURNING id`,
          [
            userId,
            runId,
            runDayId,
            profile.rows[0].timezone,
            profile.rows[0].local_date,
          ],
        );
        const sessionId = sessionResult.rows[0].id;
        await insertSessionSnapshots(client, userId, sessionId, runDayId);
        const session = await getWorkoutSession(client, userId, sessionId);
        await client.query(
          `INSERT INTO workout_session_requests
             (user_id, idempotency_key, operation, request_hash, session_id, resulting_version)
           VALUES ($1, $2, 'start', $3, $4, $5)`,
          [userId, idempotencyKey, requestHash, sessionId, session.version],
        );
        await client.query("COMMIT");
        response.status(201).json(session);
      } catch (error) {
        await client.query("ROLLBACK");
        if (error.code === "23505") {
          response
            .status(409)
            .json({ error: "A workout session already exists." });
          return;
        }
        throw error;
      } finally {
        client.release();
      }
    },
  );

  router.get(
    "/workout-sessions/:sessionId",
    requireSignIn,
    async (request, response) => {
      if (!uuidPattern.test(request.params.sessionId)) {
        response.status(404).json({ error: "Workout session not found." });
        return;
      }
      const session = await getWorkoutSession(
        pool,
        request.auth.userId,
        request.params.sessionId,
      );
      if (!session || session.status !== "draft") {
        response.status(404).json({ error: "Workout session not found." });
        return;
      }
      response.json(session);
    },
  );

  router.put(
    "/workout-sessions/:sessionId",
    requireSignIn,
    async (request, response) => {
      const { sessionId } = request.params;
      const { version, sets, exerciseStates, timers } = request.body ?? {};
      const idempotencyKey = request.get("Idempotency-Key");
      if (
        !uuidPattern.test(sessionId) ||
        !Number.isInteger(version) ||
        version < 1 ||
        !Array.isArray(sets) ||
        sets.length < 1 ||
        sets.length > 500 ||
        (exerciseStates !== undefined &&
          (!Array.isArray(exerciseStates) || exerciseStates.length > 200)) ||
        (timers !== undefined && !validTimerState(timers)) ||
        !idempotencyKeyPattern.test(idempotencyKey ?? "") ||
        Object.keys(request.body ?? {}).some(
          (key) =>
            !["version", "sets", "exerciseStates", "timers"].includes(key),
        )
      ) {
        validationError(
          response,
          "A session version, set changes, and idempotency key are required.",
        );
        return;
      }
      const normalizedExerciseStates = Array.isArray(exerciseStates)
        ? [...exerciseStates].sort((left, right) =>
            String(left?.id).localeCompare(String(right?.id)),
          )
        : [];
      const normalizedSets = [...sets].sort((left, right) =>
        String(left?.id).localeCompare(String(right?.id)),
      );
      if (
        normalizedExerciseStates.some(
          (exercise) =>
            !isRecord(exercise) ||
            !uuidPattern.test(exercise.id ?? "") ||
            Object.keys(exercise).some(
              (key) => !["id", "skipped"].includes(key),
            ) ||
            typeof exercise.skipped !== "boolean",
        ) ||
        new Set(normalizedExerciseStates.map((exercise) => exercise.id))
          .size !== normalizedExerciseStates.length ||
        normalizedSets.some(
          (set) =>
            !isRecord(set) ||
            !uuidPattern.test(set.id ?? "") ||
            Object.keys(set).some(
              (key) =>
                ![
                  "id",
                  "type",
                  "actualLoadKg",
                  "actualReps",
                  "actualRir",
                  "checked",
                ].includes(key),
            ) ||
            !Object.hasOwn(set, "actualLoadKg") ||
            !Object.hasOwn(set, "actualReps") ||
            !Object.hasOwn(set, "actualRir") ||
            (Object.hasOwn(set, "type") &&
              !["standard", "warmup", "failure"].includes(set.type)) ||
            (Object.hasOwn(set, "checked") &&
              typeof set.checked !== "boolean") ||
            (set.actualLoadKg !== null &&
              (typeof set.actualLoadKg !== "number" ||
                !Number.isFinite(set.actualLoadKg) ||
                set.actualLoadKg < 0)) ||
            (set.actualReps !== null &&
              (!Number.isInteger(set.actualReps) || set.actualReps < 1)) ||
            (set.actualRir !== null &&
              (!Number.isInteger(set.actualRir) ||
                set.actualRir < 0 ||
                set.actualRir > 10)),
        ) ||
        new Set(normalizedSets.map((set) => set.id)).size !==
          normalizedSets.length
      ) {
        validationError(response, "Set values are invalid.");
        return;
      }

      const userId = request.auth.userId;
      const requestPayload = { version, sets: normalizedSets };
      if (Object.hasOwn(request.body ?? {}, "exerciseStates")) {
        requestPayload.exerciseStates = normalizedExerciseStates;
      }
      if (Object.hasOwn(request.body ?? {}, "timers")) {
        requestPayload.timers = timers;
      }
      const requestHash = createHash("sha256")
        .update(JSON.stringify(requestPayload))
        .digest("hex");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [
          userId,
        ]);
        const previousRequest = await client.query(
          `SELECT operation, request_hash, session_id
           FROM workout_session_requests
           WHERE user_id = $1 AND idempotency_key = $2`,
          [userId, idempotencyKey],
        );
        if (previousRequest.rows.length > 0) {
          const previous = previousRequest.rows[0];
          if (
            previous.operation !== "save" ||
            previous.request_hash !== requestHash ||
            previous.session_id !== sessionId
          ) {
            await client.query("ROLLBACK");
            response.status(409).json({
              error:
                "Idempotency key was already used with a different request.",
            });
            return;
          }
          const session = await getWorkoutSession(client, userId, sessionId);
          await client.query("COMMIT");
          response.status(200).json({ ...session, replayed: true });
          return;
        }

        const current = await client.query(
          `SELECT version FROM workout_sessions
           WHERE user_id = $1 AND id = $2 AND status = 'draft' FOR UPDATE`,
          [userId, sessionId],
        );
        if (current.rows.length === 0) {
          await client.query("ROLLBACK");
          response.status(404).json({ error: "Workout session not found." });
          return;
        }
        if (current.rows[0].version !== version) {
          await client.query("ROLLBACK");
          response.status(409).json({
            error: "This workout changed in another tab or device.",
            currentVersion: current.rows[0].version,
          });
          return;
        }
        const setIds = normalizedSets.map(({ id }) => id);
        const ownedSets = await client.query(
          `SELECT sets.id, sets.set_type, sets.checked_at
           FROM session_sets AS sets
           JOIN session_exercises AS exercises
             ON exercises.user_id = sets.user_id
            AND exercises.id = sets.session_exercise_id
           WHERE sets.user_id = $1 AND exercises.session_id = $2
             AND sets.id = ANY($3::uuid[])`,
          [userId, sessionId, setIds],
        );
        if (ownedSets.rows.length !== normalizedSets.length) {
          await client.query("ROLLBACK");
          validationError(response, "A set does not belong to this workout.");
          return;
        }
        if (normalizedExerciseStates.length > 0) {
          const exerciseIds = normalizedExerciseStates.map(({ id }) => id);
          const ownedExercises = await client.query(
            `SELECT id FROM session_exercises
             WHERE user_id = $1 AND session_id = $2 AND id = ANY($3::uuid[])`,
            [userId, sessionId, exerciseIds],
          );
          if (ownedExercises.rows.length !== normalizedExerciseStates.length) {
            await client.query("ROLLBACK");
            validationError(
              response,
              "An exercise state does not belong to this workout.",
            );
            return;
          }
          for (const exercise of normalizedExerciseStates) {
            await client.query(
              `UPDATE session_exercises
               SET skipped = $1
               WHERE user_id = $2 AND id = $3`,
              [exercise.skipped, userId, exercise.id],
            );
          }
        }
        const setTypeById = new Map(
          ownedSets.rows.map(({ id, set_type: type }) => [id, type]),
        );
        if (
          normalizedSets.some((set) => {
            const type = set.type ?? setTypeById.get(set.id);
            const checked = Object.hasOwn(set, "checked")
              ? set.checked
              : set.actualLoadKg !== null &&
                set.actualReps !== null &&
                set.actualRir !== null;
            return (
              checked &&
              type === "failure" &&
              set.actualLoadKg !== null &&
              set.actualReps !== null &&
              set.actualRir !== null &&
              set.actualRir !== 0
            );
          })
        ) {
          await client.query("ROLLBACK");
          validationError(response, "Failure sets require actual RIR 0.");
          return;
        }
        for (const set of normalizedSets) {
          const checked = Object.hasOwn(set, "checked")
            ? set.checked
            : set.actualLoadKg !== null &&
              set.actualReps !== null &&
              set.actualRir !== null;
          if (
            checked &&
            (set.actualLoadKg === null ||
              set.actualReps === null ||
              set.actualRir === null)
          ) {
            await client.query("ROLLBACK");
            validationError(
              response,
              "Checked sets require actual load, reps, and RIR.",
            );
            return;
          }
          await client.query(
            `UPDATE session_sets
             SET set_type = $1,
                 actual_load_kg = $2::numeric,
                 actual_reps = $3::integer,
                 actual_rir = $4::smallint,
                 checked_at = CASE
                   WHEN $5::boolean THEN coalesce(checked_at, now())
                   ELSE NULL END
             WHERE user_id = $6 AND id = $7`,
            [
              set.type ?? setTypeById.get(set.id),
              set.actualLoadKg,
              set.actualReps,
              set.actualRir,
              checked,
              userId,
              set.id,
            ],
          );
        }
        const updated = await client.query(
          `UPDATE workout_sessions
           SET version = version + 1,
               timer_state = coalesce($3::jsonb, timer_state)
           WHERE user_id = $1 AND id = $2 AND status = 'draft'
           RETURNING version`,
          [
            userId,
            sessionId,
            timers === undefined ? null : JSON.stringify(timers),
          ],
        );
        await client.query(
          `INSERT INTO workout_session_requests
             (user_id, idempotency_key, operation, request_hash, session_id, resulting_version)
           VALUES ($1, $2, 'save', $3, $4, $5)`,
          [
            userId,
            idempotencyKey,
            requestHash,
            sessionId,
            updated.rows[0].version,
          ],
        );
        const session = await getWorkoutSession(client, userId, sessionId);
        await client.query("COMMIT");
        response.json(session);
      } catch (error) {
        await client.query("ROLLBACK");
        if (error.code === "23505") {
          response
            .status(409)
            .json({ error: "The request conflicts with an existing update." });
          return;
        }
        throw error;
      } finally {
        client.release();
      }
    },
  );

  router.get(
    "/program-runs/current",
    requireSignIn,
    async (request, response) => {
      response.json(await getCurrentProgramRun(pool, request.auth.userId));
    },
  );

  router.post(
    "/program-runs/:runId/days/:runDayId/rest",
    requireSignIn,
    async (request, response) => {
      const { runId, runDayId } = request.params;
      const checked = request.body?.checked;
      if (
        !uuidPattern.test(runId) ||
        !uuidPattern.test(runDayId) ||
        typeof checked !== "boolean"
      ) {
        validationError(
          response,
          "A valid rest day and checked state are required.",
        );
        return;
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await resolveRunDay(
          client,
          request.auth.userId,
          runId,
          runDayId,
          "rest",
          checked ? "rest_done" : "pending",
        );
        if (result.statusCode !== 200) {
          await client.query("ROLLBACK");
          response.status(result.statusCode).json({ error: result.error });
          return;
        }
        await client.query("COMMIT");
        response.json({
          runId,
          runStatus: result.runStatus,
          currentWeekNumber: result.currentWeekNumber,
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  );

  router.post(
    "/program-runs/:runId/stop",
    requireSignIn,
    async (request, response) => {
      if (!uuidPattern.test(request.params.runId)) {
        response.status(404).json({ error: "Program run not found." });
        return;
      }
      if (request.body?.confirmed !== true) {
        validationError(
          response,
          "Explicit confirmation is required to stop a program.",
        );
        return;
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [
          request.auth.userId,
        ]);
        const run = await client.query(
          `SELECT id, status FROM program_runs
           WHERE user_id = $1 AND id = $2 FOR UPDATE`,
          [request.auth.userId, request.params.runId],
        );
        if (run.rows.length === 0) {
          await client.query("ROLLBACK");
          response.status(404).json({ error: "Program run not found." });
          return;
        }
        if (run.rows[0].status !== "active") {
          await client.query("ROLLBACK");
          response
            .status(409)
            .json({ error: "Only an active program can be stopped." });
          return;
        }
        const draft = await client.query(
          `SELECT id FROM workout_sessions
           WHERE user_id = $1 AND program_run_id = $2 AND status = 'draft'`,
          [request.auth.userId, request.params.runId],
        );
        if (draft.rows.length > 0) {
          await client.query("ROLLBACK");
          response.status(409).json({
            error: "Resolve the active workout before stopping the program.",
          });
          return;
        }
        await client.query(
          `UPDATE program_runs SET status = 'stopped', ended_at = now()
           WHERE user_id = $1 AND id = $2`,
          [request.auth.userId, request.params.runId],
        );
        await client.query("COMMIT");
        response.json({ id: request.params.runId, status: "stopped" });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  );

  router.post(
    "/program-runs/:runId/restart",
    requireSignIn,
    async (request, response) => {
      if (!uuidPattern.test(request.params.runId)) {
        response.status(404).json({ error: "Program run not found." });
        return;
      }
      if (request.body?.confirmed !== true) {
        validationError(
          response,
          "Explicit confirmation is required to restart a program.",
        );
        return;
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [
          request.auth.userId,
        ]);
        const previous = await client.query(
          `SELECT id, template_id, status FROM program_runs
           WHERE user_id = $1 AND id = $2 FOR UPDATE`,
          [request.auth.userId, request.params.runId],
        );
        if (previous.rows.length === 0) {
          await client.query("ROLLBACK");
          response.status(404).json({ error: "Program run not found." });
          return;
        }
        if (!["completed", "stopped"].includes(previous.rows[0].status)) {
          await client.query("ROLLBACK");
          response.status(409).json({
            error: "Only a stopped or completed program can restart.",
          });
          return;
        }
        const activeRun = await client.query(
          "SELECT id FROM program_runs WHERE user_id = $1 AND status = 'active'",
          [request.auth.userId],
        );
        const draft = await client.query(
          "SELECT id FROM workout_sessions WHERE user_id = $1 AND status = 'draft'",
          [request.auth.userId],
        );
        if (activeRun.rows.length > 0 || draft.rows.length > 0) {
          await client.query("ROLLBACK");
          response.status(409).json({
            error: "Resolve the current program and workout before restarting.",
          });
          return;
        }
        const errors = await activationErrors(
          client,
          request.auth.userId,
          previous.rows[0].template_id,
        );
        if (Object.keys(errors).length > 0) {
          await client.query("ROLLBACK");
          validationError(
            response,
            "The saved program is no longer ready to restart.",
            errors,
          );
          return;
        }
        const runId = await insertProgramRun(
          client,
          request.auth.userId,
          previous.rows[0].template_id,
        );
        await client.query("COMMIT");
        response.status(201).json({
          id: runId,
          templateId: previous.rows[0].template_id,
          status: "active",
          restartedFrom: request.params.runId,
        });
      } catch (error) {
        await client.query("ROLLBACK");
        if (error.code === "23505") {
          response
            .status(409)
            .json({ error: "Another program is already active." });
          return;
        }
        throw error;
      } finally {
        client.release();
      }
    },
  );

  router.get("/programs", requireSignIn, async (request, response) => {
    const { rows } = await pool.query(
      `SELECT templates.id, templates.name, templates.created_at,
              count(DISTINCT weeks.id)::int AS week_count,
              EXISTS (
                SELECT 1 FROM program_runs AS runs
                WHERE runs.user_id = templates.user_id
                  AND runs.template_id = templates.id AND runs.status = 'active'
              ) AS active
       FROM program_templates AS templates
       LEFT JOIN program_weeks AS weeks
         ON weeks.user_id = templates.user_id AND weeks.template_id = templates.id
       WHERE templates.user_id = $1
       GROUP BY templates.id
       ORDER BY templates.created_at DESC, templates.id`,
      [request.auth.userId],
    );
    response.json(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
        weekCount: row.week_count,
        status: row.active ? "active" : "draft",
      })),
    );
  });

  router.get(
    "/programs/:templateId",
    requireSignIn,
    async (request, response) => {
      if (!uuidPattern.test(request.params.templateId)) {
        response.status(404).json({ error: "Program not found." });
        return;
      }
      const program = await getProgramDetail(
        pool,
        request.auth.userId,
        request.params.templateId,
      );
      if (!program) {
        response.status(404).json({ error: "Program not found." });
        return;
      }
      response.json(program);
    },
  );

  router.post(
    "/programs/:templateId/deload",
    requireSignIn,
    async (request, response) => {
      const rawDays = request.body?.days;
      if (!Array.isArray(rawDays) || rawDays.length !== 7) {
        validationError(
          response,
          "A manual deload must contain exactly seven day slots.",
          { days: "exactly_seven_required" },
        );
        return;
      }
      const days = rawDays.map(normalizeProgramDay);
      if (days.some((day) => !day)) {
        validationError(
          response,
          "Each workout needs mapped exercises and valid set prescriptions; rest days cannot contain exercises.",
          { days: "invalid_day_or_prescription" },
        );
        return;
      }
      if (!days.some((day) => day.type === "workout")) {
        validationError(
          response,
          "A manual deload must contain at least one mapped workout.",
          { workouts: "at_least_one_required" },
        );
        return;
      }
      if (!uuidPattern.test(request.params.templateId)) {
        response.status(404).json({ error: "Program not found." });
        return;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const template = await client.query(
          `SELECT id FROM program_templates
           WHERE user_id = $1 AND id = $2 FOR UPDATE`,
          [request.auth.userId, request.params.templateId],
        );
        if (template.rows.length === 0) {
          await client.query("ROLLBACK");
          response.status(404).json({ error: "Program not found." });
          return;
        }
        const activeRun = await client.query(
          `SELECT id FROM program_runs
           WHERE user_id = $1 AND template_id = $2 AND status = 'active'`,
          [request.auth.userId, request.params.templateId],
        );
        if (activeRun.rows.length > 0) {
          await client.query("ROLLBACK");
          response
            .status(409)
            .json({ error: "The active program cannot add a deload week." });
          return;
        }
        const existingWeeks = await client.query(
          `SELECT count(*)::int AS count, max(week_number)::int AS last_week,
                  count(*) FILTER (WHERE week_type = 'deload')::int AS deload_count
           FROM program_weeks WHERE user_id = $1 AND template_id = $2`,
          [request.auth.userId, request.params.templateId],
        );
        const summary = existingWeeks.rows[0];
        if (summary.count === 0 || summary.deload_count !== 0) {
          await client.query("ROLLBACK");
          response.status(409).json({
            error: "A draft program can have one appended deload week.",
          });
          return;
        }
        const missingIds = await missingExerciseIds(client, days);
        if (missingIds.length > 0) {
          await client.query("ROLLBACK");
          validationError(
            response,
            "Map every deload exercise to the catalog.",
            {
              unresolvedMappings: missingIds,
            },
          );
          return;
        }
        const weekNumber = summary.last_week + 1;
        const week = await client.query(
          `INSERT INTO program_weeks (user_id, template_id, week_number, week_type)
           VALUES ($1, $2, $3, 'deload') RETURNING id`,
          [request.auth.userId, request.params.templateId, weekNumber],
        );
        for (const [index, day] of days.entries()) {
          await insertProgramDay(
            client,
            request.auth.userId,
            week.rows[0].id,
            index + 1,
            day,
          );
        }
        await client.query("COMMIT");
        response.status(201).json({
          id: week.rows[0].id,
          weekNumber,
          weekType: "deload",
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  );

  router.put(
    "/programs/:templateId/days/:dayId",
    requireSignIn,
    async (request, response) => {
      const day = normalizeProgramDay(request.body);
      if (!day) {
        validationError(
          response,
          "Provide a valid workout or rest day with complete exercise prescriptions.",
          { day: "invalid_day_or_prescription" },
        );
        return;
      }
      if (
        !uuidPattern.test(request.params.templateId) ||
        !uuidPattern.test(request.params.dayId)
      ) {
        response.status(404).json({ error: "Program day not found." });
        return;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const ownedDay = await client.query(
          `SELECT days.id FROM program_templates AS templates
           JOIN program_weeks AS weeks
             ON weeks.user_id = templates.user_id AND weeks.template_id = templates.id
           JOIN program_days AS days
             ON days.user_id = weeks.user_id AND days.week_id = weeks.id
           WHERE templates.user_id = $1 AND templates.id = $2 AND days.id = $3
           FOR UPDATE OF templates, days`,
          [
            request.auth.userId,
            request.params.templateId,
            request.params.dayId,
          ],
        );
        if (ownedDay.rows.length === 0) {
          await client.query("ROLLBACK");
          response.status(404).json({ error: "Program day not found." });
          return;
        }
        const locked = await client.query(
          `SELECT EXISTS (
             SELECT 1 FROM program_run_days AS run_days
             LEFT JOIN workout_sessions AS sessions
               ON sessions.user_id = run_days.user_id
              AND sessions.program_run_day_id = run_days.id
              AND sessions.status <> 'discarded'
             WHERE run_days.user_id = $1 AND run_days.template_day_id = $2
                 AND (run_days.status <> 'pending' OR sessions.id IS NOT NULL)
           ) AS locked`,
          [request.auth.userId, request.params.dayId],
        );
        if (locked.rows[0].locked) {
          await client.query("ROLLBACK");
          response.status(409).json({
            error: "Only future program days without a session can be edited.",
          });
          return;
        }
        const missingIds = await missingExerciseIds(client, [day]);
        if (missingIds.length > 0) {
          await client.query("ROLLBACK");
          validationError(response, "Map every exercise to the catalog.", {
            unresolvedMappings: missingIds,
          });
          return;
        }
        await client.query(
          `UPDATE program_days SET day_type = $1, name = $2
           WHERE user_id = $3 AND id = $4`,
          [day.type, day.name, request.auth.userId, request.params.dayId],
        );
        await client.query(
          `UPDATE program_run_days AS run_days SET day_type = $1
           FROM program_runs AS runs
           WHERE runs.user_id = run_days.user_id AND runs.id = run_days.run_id
             AND runs.status = 'active' AND run_days.status = 'pending'
             AND run_days.user_id = $2 AND run_days.template_day_id = $3`,
          [day.type, request.auth.userId, request.params.dayId],
        );
        await client.query(
          "DELETE FROM program_day_exercises WHERE user_id = $1 AND day_id = $2",
          [request.auth.userId, request.params.dayId],
        );
        for (const [exerciseIndex, exercise] of day.exercises.entries()) {
          const snapshot = {
            notes: exercise.notes,
            sets: exercise.sets.map((set) => ({
              type: set.type,
              repMin: set.repMin,
              repMax: set.repMax,
              targetRir: set.rir,
            })),
          };
          const inserted = await client.query(
            `INSERT INTO program_day_exercises
               (user_id, day_id, exercise_id, sort_order, prescription_snapshot)
             VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id`,
            [
              request.auth.userId,
              request.params.dayId,
              exercise.exerciseId,
              exerciseIndex + 1,
              JSON.stringify(snapshot),
            ],
          );
          for (const [setIndex, set] of exercise.sets.entries()) {
            await client.query(
              `INSERT INTO program_sets
                 (user_id, day_exercise_id, set_number, set_type, rep_min, rep_max, target_rir)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [
                request.auth.userId,
                inserted.rows[0].id,
                setIndex + 1,
                set.type,
                set.repMin,
                set.repMax,
                set.rir,
              ],
            );
          }
        }
        await client.query("COMMIT");
        const program = await getProgramDetail(
          pool,
          request.auth.userId,
          request.params.templateId,
        );
        const savedDay = program.weeks
          .flatMap((week) => week.days)
          .find(({ id }) => id === request.params.dayId);
        response.json(savedDay);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  );

  router.post(
    "/programs/:templateId/activate",
    requireSignIn,
    async (request, response) => {
      if (request.body?.confirmed !== true) {
        validationError(
          response,
          "Explicit confirmation is required to activate a program.",
        );
        return;
      }
      if (!uuidPattern.test(request.params.templateId)) {
        response.status(404).json({ error: "Program not found." });
        return;
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [
          request.auth.userId,
        ]);
        const template = await client.query(
          `SELECT id FROM program_templates
           WHERE user_id = $1 AND id = $2 FOR UPDATE`,
          [request.auth.userId, request.params.templateId],
        );
        if (template.rows.length === 0) {
          await client.query("ROLLBACK");
          response.status(404).json({ error: "Program not found." });
          return;
        }
        const errors = await activationErrors(
          client,
          request.auth.userId,
          request.params.templateId,
        );
        if (Object.keys(errors).length > 0) {
          await client.query("ROLLBACK");
          validationError(
            response,
            "Resolve every workout, exercise mapping, and seven-slot week, including the appended deload, before activation.",
            errors,
          );
          return;
        }
        const activeRun = await client.query(
          `SELECT id FROM program_runs
           WHERE user_id = $1 AND status = 'active' FOR UPDATE`,
          [request.auth.userId],
        );
        if (activeRun.rows.length > 0) {
          if (request.body?.replaceActive !== true) {
            await client.query("ROLLBACK");
            response
              .status(409)
              .json({ error: "Confirm replacement of the active program." });
            return;
          }
          const draft = await client.query(
            `SELECT id FROM workout_sessions
             WHERE user_id = $1 AND status = 'draft'`,
            [request.auth.userId],
          );
          if (draft.rows.length > 0) {
            await client.query("ROLLBACK");
            response.status(409).json({
              error: "Resolve the active workout before replacing the program.",
            });
            return;
          }
          await client.query(
            `UPDATE program_runs SET status = 'stopped', ended_at = now()
             WHERE user_id = $1 AND id = $2 AND status = 'active'`,
            [request.auth.userId, activeRun.rows[0].id],
          );
        }
        const runId = await insertProgramRun(
          client,
          request.auth.userId,
          request.params.templateId,
        );
        await client.query("COMMIT");
        response.status(201).json({
          id: runId,
          templateId: request.params.templateId,
          status: "active",
        });
      } catch (error) {
        await client.query("ROLLBACK");
        if (error.code === "23505") {
          response
            .status(409)
            .json({ error: "Another program is already active." });
          return;
        }
        throw error;
      } finally {
        client.release();
      }
    },
  );

  router.post(
    "/programs/import/preview",
    requireSignIn,
    async (request, response) => {
      if (!validSource(request.body?.source)) {
        validationError(
          response,
          "CSV data is required and must be under 512 KB.",
        );
        return;
      }
      response.json(await buildPreview(request.body.source, pool));
    },
  );

  router.post("/programs/import", requireSignIn, async (request, response) => {
    const body = request.body;
    const idempotencyKey = request.get("Idempotency-Key")?.trim();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (
      !validSource(body?.source) ||
      name.length === 0 ||
      name.length > 120 ||
      body.confirmed !== true ||
      !idempotencyKeyPattern.test(idempotencyKey ?? "") ||
      !isRecord(body.mappings)
    ) {
      validationError(
        response,
        "A valid CSV, program name, explicit confirmation, mappings, and idempotency key are required.",
      );
      return;
    }

    const skipRowNumbers = normalizedNumbers(body.skipRowNumbers);
    const acknowledgedSkipRows = normalizedNumbers(body.acknowledgedSkipRows);
    if (!skipRowNumbers || !acknowledgedSkipRows) {
      validationError(
        response,
        "Row decisions must be arrays of positive row numbers.",
      );
      return;
    }

    const mappings = Object.fromEntries(
      Object.entries(body.mappings).map(([sourceName, exerciseId]) => [
        sourceName,
        typeof exerciseId === "string" ? exerciseId : "",
      ]),
    );
    const fingerprint = requestHash({
      source: body.source,
      name,
      skipRowNumbers,
      acknowledgedSkipRows,
      mappings,
    });
    const key = idempotencyKey.toLowerCase();
    const userId = request.auth.userId;

    const existing = await pool.query(
      `SELECT imports.request_hash, templates.id, templates.name
       FROM program_import_requests AS imports
       JOIN program_templates AS templates
         ON templates.user_id = imports.user_id AND templates.id = imports.template_id
       WHERE imports.user_id = $1 AND imports.idempotency_key = $2`,
      [userId, key],
    );
    if (existing.rows.length > 0) {
      if (existing.rows[0].request_hash !== fingerprint) {
        response
          .status(409)
          .json({ error: "This import key was used for different data." });
        return;
      }
      response.status(200).json(responseProgram(existing.rows[0], true));
      return;
    }

    const preview = await buildPreview(body.source, pool);
    const errors = {
      rowErrors: preview.rowErrors,
      structuralErrors: preview.structuralErrors,
      weekErrors: [...preview.weekErrors],
      unresolvedMappings: [],
      sourceSkipMarkers: preview.sourceSkipMarkers,
    };
    if (errors.structuralErrors.length > 0) {
      validationError(
        response,
        "The CSV structure cannot be imported safely.",
        errors,
      );
      return;
    }
    if (errors.weekErrors.length > 0) {
      validationError(
        response,
        "Every week must contain seven slots and each workout must contain exercises.",
        errors,
      );
      return;
    }

    const requiredSkipRows = [
      ...new Set(preview.rowErrors.map(({ rowNumber }) => rowNumber)),
    ].sort((left, right) => left - right);
    if (
      requiredSkipRows.some((rowNumber) => !skipRowNumbers.includes(rowNumber))
    ) {
      validationError(
        response,
        "Confirm skipping each invalid row or correct the CSV and preview again.",
        errors,
      );
      return;
    }
    if (
      skipRowNumbers.some((rowNumber) => !requiredSkipRows.includes(rowNumber))
    ) {
      validationError(
        response,
        "Only rows with preview errors can be skipped.",
        errors,
      );
      return;
    }

    const requiredAcknowledgements = preview.sourceSkipMarkers
      .map(({ rowNumber }) => rowNumber)
      .sort((left, right) => left - right);
    if (
      requiredAcknowledgements.some(
        (rowNumber) => !acknowledgedSkipRows.includes(rowNumber),
      ) ||
      acknowledgedSkipRows.some(
        (rowNumber) => !requiredAcknowledgements.includes(rowNumber),
      )
    ) {
      validationError(
        response,
        "Acknowledge each source skip marker before importing.",
        errors,
      );
      return;
    }

    const catalogById = new Map(
      preview.catalogExercises.map((exercise) => [exercise.id, exercise]),
    );
    const catalogByName = new Map(
      preview.catalogExercises.map((exercise) => [exercise.name, exercise]),
    );
    const includedNames = new Set();
    for (const exercise of listExercises(preview.weeks)) {
      if (!skipRowNumbers.includes(exercise.rowNumber)) {
        includedNames.add(exercise.name);
      }
    }
    for (const sourceName of includedNames) {
      const exerciseId = mappings[sourceName];
      const target = catalogById.get(exerciseId);
      const exact = catalogByName.get(sourceName);
      if (!target || (exact && exact.id !== target.id)) {
        errors.unresolvedMappings.push(sourceName);
      }
    }
    if (errors.unresolvedMappings.length > 0) {
      validationError(
        response,
        "Resolve every included exercise catalog mapping.",
        errors,
      );
      return;
    }

    const importedWeeks = preview.weeks.map((week) => ({
      ...week,
      days: week.days.map((day) => ({
        ...day,
        exercises: day.exercises.filter(
          (exercise) => !skipRowNumbers.includes(exercise.rowNumber),
        ),
      })),
    }));
    importedWeeks.forEach((week) =>
      week.days.forEach((day) => {
        if (day.type === "workout" && day.exercises.length === 0) {
          errors.weekErrors.push({
            code: "empty_workout",
            cycle: week.cycle,
            day: day.name,
            rowNumber: day.rowNumber,
            actualSlots: week.days.length,
            message: `Workout ${day.name} has no included exercise rows.`,
          });
        }
      }),
    );
    if (errors.weekErrors.length > 0) {
      validationError(
        response,
        "Skipping these rows would leave an empty workout.",
        errors,
      );
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const templateResult = await client.query(
        `INSERT INTO program_templates (user_id, name, source_metadata)
         VALUES ($1, $2, $3::jsonb) RETURNING id, name`,
        [
          userId,
          name,
          JSON.stringify({
            importedFrom: "csv",
            metadata: preview.metadata,
            sourceCycleNumbers: preview.weeks.map(({ cycle }) => cycle),
            skippedRowNumbers: skipRowNumbers,
            acknowledgedSkipRows,
          }),
        ],
      );
      const template = templateResult.rows[0];

      for (const [weekIndex, week] of importedWeeks.entries()) {
        const weekResult = await client.query(
          `INSERT INTO program_weeks (user_id, template_id, week_number, week_type)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [userId, template.id, weekIndex + 1, week.type],
        );
        for (const [dayIndex, day] of week.days.entries()) {
          const dayResult = await client.query(
            `INSERT INTO program_days (user_id, week_id, slot_number, day_type, name)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [userId, weekResult.rows[0].id, dayIndex + 1, day.type, day.name],
          );
          for (const [exerciseIndex, exercise] of day.exercises.entries()) {
            const prescriptionSnapshot = {
              notes: exercise.notes,
              sourceRowNumber: exercise.rowNumber,
              sets: exercise.sets.map((set) => ({
                type: set.type,
                repMin: set.repMin,
                repMax: set.repMax,
                targetRir: set.rir,
              })),
            };
            const exerciseResult = await client.query(
              `INSERT INTO program_day_exercises
                 (user_id, day_id, exercise_id, sort_order, prescription_snapshot)
               VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id`,
              [
                userId,
                dayResult.rows[0].id,
                mappings[exercise.name],
                exerciseIndex + 1,
                JSON.stringify(prescriptionSnapshot),
              ],
            );
            for (const [setIndex, set] of exercise.sets.entries()) {
              await client.query(
                `INSERT INTO program_sets
                   (user_id, day_exercise_id, set_number, set_type, rep_min, rep_max, target_rir)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                  userId,
                  exerciseResult.rows[0].id,
                  setIndex + 1,
                  set.type,
                  set.repMin,
                  set.repMax,
                  set.rir,
                ],
              );
            }
          }
        }
      }

      await client.query(
        `INSERT INTO program_import_requests
           (user_id, idempotency_key, request_hash, template_id)
         VALUES ($1, $2, $3, $4)`,
        [userId, key, fingerprint, template.id],
      );
      await client.query("COMMIT");
      response.status(201).json(responseProgram(template));
    } catch (error) {
      await client.query("ROLLBACK");
      if (error.code === "23505") {
        const duplicate = await pool.query(
          `SELECT imports.request_hash, templates.id, templates.name
           FROM program_import_requests AS imports
           JOIN program_templates AS templates
             ON templates.user_id = imports.user_id AND templates.id = imports.template_id
           WHERE imports.user_id = $1 AND imports.idempotency_key = $2`,
          [userId, key],
        );
        if (duplicate.rows.length > 0) {
          if (duplicate.rows[0].request_hash !== fingerprint) {
            response
              .status(409)
              .json({ error: "This import key was used for different data." });
            return;
          }
          response.status(200).json(responseProgram(duplicate.rows[0], true));
          return;
        }
      }
      throw error;
    } finally {
      client.release();
    }
  });

  return router;
}
