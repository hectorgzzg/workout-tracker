import { parse } from "csv-parse/sync";

const setTypeNames = new Map([
  ["standard", "standard"],
  ["standard set", "standard"],
  ["warmup", "warmup"],
  ["warm up", "warmup"],
  ["warmup set", "warmup"],
  ["warm up set", "warmup"],
  ["failure", "failure"],
  ["failure set", "failure"],
]);

function emptyResult() {
  return {
    metadata: {},
    weeks: [],
    rowErrors: [],
    structuralErrors: [],
    weekErrors: [],
    sourceSkipMarkers: [],
    canActivate: false,
  };
}

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function firstNonempty(record) {
  return record.find((value) => String(value ?? "").trim() !== "") ?? "";
}

function rowNumberFor(raw, linesRead) {
  const lineBreaks = raw.match(/\r\n|\r|\n/g)?.length ?? 0;
  return Math.max(1, linesRead - lineBreaks + 1);
}

function parseMetadata(record) {
  const metadata = {};
  const colonFields = record
    .map((value) =>
      String(value ?? "")
        .trim()
        .match(/^([^:]+):\s*(.*)$/),
    )
    .filter(Boolean);
  if (colonFields.length > 0) {
    for (const [, key, value] of colonFields)
      metadata[key.trim()] = value.trim();
    return metadata;
  }

  for (let index = 0; index + 1 < record.length; index += 2) {
    const key = String(record[index] ?? "").trim();
    if (key) metadata[key] = String(record[index + 1] ?? "").trim();
  }
  return metadata;
}

function isHeaderRow(record) {
  return (
    (normalizeHeader(record[0]) === "workout" ||
      /^cycle\s+\d+$/i.test(String(record[0] ?? "").trim())) &&
    normalizeHeader(record[1]) === "exercise"
  );
}

function setGroupColumns(record) {
  const groups = new Map();
  let nextGenericGroup = 0;

  record.forEach((heading, columnIndex) => {
    const normalized = normalizeHeader(heading);
    const numbered = normalized.match(/^set(\d+)(type|reprange|rir|rest)$/);
    let groupNumber;
    let field;

    if (numbered) {
      groupNumber = Number(numbered[1]);
      field = numbered[2];
    } else if (["type", "reprange", "rir", "rest"].includes(normalized)) {
      field = normalized;
      while (groups.get(nextGenericGroup)?.[field] !== undefined) {
        nextGenericGroup += 1;
      }
      groupNumber = nextGenericGroup;
    } else {
      return;
    }

    if (!groups.has(groupNumber)) groups.set(groupNumber, {});
    groups.get(groupNumber)[field] = columnIndex;
  });

  return [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([number, fields]) => ({ number, fields }));
}

function findHeader(records, result) {
  const headerEntry = records.find(
    (entry, index) => index > 0 && isHeaderRow(entry.record),
  );
  if (!headerEntry) {
    result.structuralErrors.push({
      code: "invalid_header",
      rowNumber: records[1]?.rowNumber ?? 1,
      message: "The CSV must contain a Workout and Exercise header row.",
    });
    return null;
  }

  const header = headerEntry.record.map((value) => String(value ?? "").trim());
  const groups = setGroupColumns(header);
  const firstColumn = normalizeHeader(header[0]);
  const cycleHeader = /^cycle\s+\d+$/i.test(header[0]);
  const exerciseColumn = header.findIndex(
    (value) => normalizeHeader(value) === "exercise",
  );
  const skippedColumn = header.findIndex(
    (value) => normalizeHeader(value) === "skipped",
  );
  const notesColumn = header.findIndex((value) =>
    normalizeHeader(value).startsWith("notes"),
  );

  if (
    (!cycleHeader && !["workout", "day", "workoutday"].includes(firstColumn)) ||
    exerciseColumn < 0 ||
    groups.length === 0 ||
    groups.some(
      ({ fields }) =>
        fields.type === undefined ||
        fields.reprange === undefined ||
        fields.rir === undefined,
    )
  ) {
    result.structuralErrors.push({
      code: "invalid_header",
      rowNumber: headerEntry.rowNumber,
      message:
        "The CSV header must identify workout, exercise, and complete set groups.",
    });
    return null;
  }

  return {
    entry: headerEntry,
    header,
    groups,
    exerciseColumn,
    skippedColumn,
    notesColumn,
  };
}

function cell(record, index) {
  return index === undefined ? "" : String(record[index] ?? "").trim();
}

function error(result, rowNumber, code, message, exerciseName) {
  result.rowErrors.push({
    rowNumber,
    code,
    message,
    ...(exerciseName ? { exerciseName } : {}),
  });
}

function parseRepRange(value) {
  const match = value.match(/^(\d+)(?:\s*-\s*(\d+)|\s*(\+))?$/);
  if (!match) return null;
  const repMin = Number(match[1]);
  const repMax = match[2] ? Number(match[2]) : null;
  if (repMin < 1 || (repMax !== null && repMax < repMin)) return null;
  return { repMin, repMax, plus: Boolean(match[3]) };
}

function parseExerciseSets(entry, columns, exerciseName, result) {
  const sets = [];
  for (const { fields } of columns.groups) {
    const typeValue = cell(entry.record, fields.type);
    const rangeValue = cell(entry.record, fields.reprange);
    const rirValue = cell(entry.record, fields.rir);
    const restValue = cell(entry.record, fields.rest);
    if (!typeValue && !rangeValue && !rirValue && !restValue) continue;

    const rawType = setTypeNames.get(typeValue.toLowerCase());
    if (!rawType) {
      error(
        result,
        entry.rowNumber,
        "unknown_set_type",
        `Unknown set type: ${typeValue || "(empty)"}.`,
        exerciseName,
      );
      continue;
    }

    const range = parseRepRange(rangeValue);
    if (!range) {
      error(
        result,
        entry.rowNumber,
        "invalid_rep_range",
        `Invalid rep range: ${rangeValue || "(empty)"}.`,
        exerciseName,
      );
    }
    const rir = /^\d+$/.test(rirValue) ? Number(rirValue) : null;
    if (rir === null || rir < 0 || rir > 10) {
      error(
        result,
        entry.rowNumber,
        "invalid_rir",
        `RIR must be an integer from 0 to 10: ${rirValue || "(empty)"}.`,
        exerciseName,
      );
    }

    const type = range?.plus ? "failure" : rawType;
    if (type === "failure" && rir !== 0) {
      error(
        result,
        entry.rowNumber,
        range?.plus ? "n_plus_requires_zero_rir" : "failure_requires_zero_rir",
        "Failure sets, including N+ ranges, must use RIR 0.",
        exerciseName,
      );
    }
    if (
      !range ||
      rir === null ||
      rir < 0 ||
      rir > 10 ||
      (type === "failure" && rir !== 0)
    ) {
      continue;
    }

    sets.push({ type, repMin: range.repMin, repMax: range.repMax, rir });
  }
  return sets;
}

function isIgnoredMarker(value) {
  return /^(?:block\b|deload\b)/i.test(value.trim());
}

function addWeekError(result, week, day, code, message) {
  result.weekErrors.push({
    code,
    cycle: week.cycle,
    ...(day ? { day: day.name, rowNumber: day.rowNumber } : {}),
    actualSlots: week.days.length,
    message,
  });
}

export function parseWorkoutCsv(source, { knownExerciseNames } = {}) {
  if (typeof source !== "string") {
    throw new TypeError("CSV source must be a string");
  }
  if (
    knownExerciseNames !== undefined &&
    !Array.isArray(knownExerciseNames) &&
    !(knownExerciseNames instanceof Set)
  ) {
    throw new TypeError("Known exercise names must be an array or Set");
  }

  const result = emptyResult();
  let parsed;
  try {
    parsed = parse(source, {
      bom: true,
      info: true,
      raw: true,
      relax_column_count: true,
      skip_empty_lines: true,
    });
  } catch (parseError) {
    result.structuralErrors.push({
      code: "malformed_csv",
      rowNumber: parseError.lines ?? null,
      message: "The CSV syntax is malformed.",
    });
    return result;
  }

  const records = parsed.map(({ record, raw, info }) => ({
    record,
    rowNumber: rowNumberFor(raw, info.lines),
  }));
  if (records.length > 0) result.metadata = parseMetadata(records[0].record);
  const columns = findHeader(records, result);
  if (!columns) return result;

  const knownNames =
    knownExerciseNames === undefined ? null : new Set(knownExerciseNames);
  const cycleNumbers = new Set();
  let currentWeek = null;
  let currentDay = null;

  for (const entry of records) {
    const record = entry.record;
    if (entry === records[0]) continue;
    const first = cell(record, 0);
    const cycleMatch = first.match(/^cycle\s+(\d+)\s*$/i);
    const cycleHeader = cycleMatch && normalizeHeader(record[1]) === "exercise";
    if (
      entry.rowNumber < columns.entry.rowNumber ||
      (entry.rowNumber === columns.entry.rowNumber && !cycleHeader)
    ) {
      continue;
    }
    if (isHeaderRow(record) && !cycleHeader) continue;

    const exerciseName = cell(record, columns.exerciseColumn);
    const marker = firstNonempty(record);
    if (cycleMatch) {
      const cycle = Number(cycleMatch[1]);
      if (cycleNumbers.has(cycle)) {
        result.structuralErrors.push({
          code: "duplicate_cycle",
          rowNumber: entry.rowNumber,
          cycle,
          message: `Cycle ${cycle} appears more than once.`,
        });
        currentWeek = null;
        currentDay = null;
        continue;
      }
      cycleNumbers.add(cycle);
      currentWeek = { cycle, type: "training", days: [] };
      result.weeks.push(currentWeek);
      currentDay = null;
      continue;
    }
    if (!marker || isIgnoredMarker(first)) continue;

    if (/^skip(?:ped)?$/i.test(first)) {
      result.sourceSkipMarkers.push({
        rowNumber: entry.rowNumber,
        marker: first,
      });
      continue;
    }
    const skippedValue = cell(record, columns.skippedColumn).toLowerCase();
    if (
      ["yes", "true", "1", "skip", "skipped"].includes(skippedValue) ||
      /\bskip(?:ped)?\b/i.test(record.map(String).join(" "))
    ) {
      result.sourceSkipMarkers.push({ rowNumber: entry.rowNumber, marker });
    }

    if (!currentWeek) {
      result.structuralErrors.push({
        code: "row_outside_cycle",
        rowNumber: entry.rowNumber,
        message: "Workout and rest rows must belong to a Cycle N group.",
      });
      continue;
    }
    if (record.length > columns.header.length) {
      result.structuralErrors.push({
        code: "row_has_extra_columns",
        rowNumber: entry.rowNumber,
        message: "A data row contains more columns than the CSV header.",
      });
      continue;
    }

    if (/^rest$/i.test(first)) {
      currentDay = {
        type: "rest",
        name: "Rest",
        rowNumber: entry.rowNumber,
        exercises: [],
      };
      currentWeek.days.push(currentDay);
      continue;
    }

    if (first) {
      currentDay = {
        type: "workout",
        name: first,
        rowNumber: entry.rowNumber,
        exercises: [],
      };
      currentWeek.days.push(currentDay);
    } else if (!currentDay || currentDay.type !== "workout") {
      result.structuralErrors.push({
        code: "row_without_workout",
        rowNumber: entry.rowNumber,
        message: "An exercise row cannot inherit a workout day.",
      });
      continue;
    }

    if (!exerciseName) {
      const hasSetData = columns.groups.some(({ fields }) =>
        [fields.type, fields.reprange, fields.rir, fields.rest].some(
          (index) => cell(record, index) !== "",
        ),
      );
      if (hasSetData) {
        error(
          result,
          entry.rowNumber,
          "missing_exercise_name",
          "A set prescription requires an exercise name.",
        );
      }
      continue;
    }

    if (knownNames && !knownNames.has(exerciseName)) {
      error(
        result,
        entry.rowNumber,
        "unknown_exercise",
        `Exercise is not in the known catalog: ${exerciseName}.`,
        exerciseName,
      );
    }

    currentDay.exercises.push({
      name: exerciseName,
      rowNumber: entry.rowNumber,
      notes: cell(record, columns.notesColumn),
      sets: parseExerciseSets(entry, columns, exerciseName, result),
    });
  }

  for (const week of result.weeks) {
    if (week.days.length !== 7) {
      addWeekError(
        result,
        week,
        null,
        "week_must_have_seven_slots",
        `Cycle ${week.cycle} has ${week.days.length} slots; exactly seven are required.`,
      );
    }
    for (const day of week.days) {
      if (day.type === "workout" && day.exercises.length === 0) {
        addWeekError(
          result,
          week,
          day,
          "empty_workout",
          `Workout ${day.name} has no exercise rows.`,
        );
      }
    }
  }

  result.canActivate =
    result.rowErrors.length === 0 &&
    result.structuralErrors.length === 0 &&
    result.weekErrors.length === 0 &&
    result.sourceSkipMarkers.length === 0;
  return result;
}
