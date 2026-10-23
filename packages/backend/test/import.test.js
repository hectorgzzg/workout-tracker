import { parseWorkoutCsv } from "../src/import.js";

const columns = [
  "Workout",
  "Exercise",
  "Notes",
  "Set 1 Type",
  "Set 1 Rep Range",
  "Set 1 RIR",
  "Set 1 Rest",
  "Set 2 Type",
  "Set 2 Rep Range",
  "Set 2 RIR",
  "Set 2 Rest",
  "Set 3 Type",
  "Set 3 Rep Range",
  "Set 3 RIR",
  "Set 3 Rest",
];

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvRow(values) {
  return values.map(csvCell).join(",");
}

function makeCsv(slotCounts = Array(5).fill(7)) {
  const rows = [
    ["Program Name", "Five-cycle fixture", "Deload", "Deload metadata"],
    columns,
  ];

  slotCounts.forEach((slotCount, cycleIndex) => {
    rows.push([`Block ${cycleIndex + 1}`]);
    rows.push([`Cycle ${cycleIndex + 1}`]);
    rows.push(columns);
    for (let slot = 1; slot <= slotCount; slot += 1) {
      if (slot === 3) {
        rows.push(["Rest"]);
        continue;
      }

      rows.push([
        `Workout ${cycleIndex + 1}-${slot}`,
        "Barbell squat",
        slot === 1 ? 'Pause,\nthen say "go"; café' : "",
        "Standard Set",
        "5-8",
        "2",
        "120",
        "Failure Set",
        "8+",
        "0",
        "90",
        "",
        "",
        "",
        "",
      ]);
      if (slot === 1) {
        rows.push([
          "",
          "Cable row",
          "Inherited day",
          "Warmup",
          "10-12",
          "3",
          "60",
        ]);
      }
    }
  });

  return rows.map(csvRow).join("\n");
}

describe("WT-011 CSV parser and validation model", () => {
  test("imports every cycle as a training week and parses slots, sets, notes, and quoted Unicode", () => {
    const result = parseWorkoutCsv(makeCsv());

    expect(result.metadata).toMatchObject({
      "Program Name": "Five-cycle fixture",
      Deload: "Deload metadata",
    });
    expect(result.weeks).toHaveLength(5);
    expect(result.weeks.map((week) => week.type)).toEqual(
      Array(5).fill("training"),
    );
    expect(result.weeks[0].days).toHaveLength(7);
    expect(result.weeks[0].days[0]).toMatchObject({
      type: "workout",
      name: "Workout 1-1",
      exercises: [
        {
          name: "Barbell squat",
          rowNumber: 6,
          notes: 'Pause,\nthen say "go"; café',
          sets: [
            { type: "standard", repMin: 5, repMax: 8, rir: 2 },
            { type: "failure", repMin: 8, repMax: null, rir: 0 },
          ],
        },
        {
          name: "Cable row",
          rowNumber: 8,
          sets: [{ type: "warmup", repMin: 10, repMax: 12, rir: 3 }],
        },
      ],
    });
    expect(result.weeks[0].days[2]).toMatchObject({
      type: "rest",
      exercises: [],
    });
    expect(result.rowErrors).toEqual([]);
    expect(result.structuralErrors).toEqual([]);
    expect(result.weekErrors).toEqual([]);
    expect(result.canActivate).toBe(true);
  });

  test("accepts seven CSV cycles without adding the separately configured deload", () => {
    const result = parseWorkoutCsv(makeCsv(Array(7).fill(7)));

    expect(result.weeks).toHaveLength(7);
    expect(result.weeks.map((week) => week.cycle)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(result.weeks.every((week) => week.type === "training")).toBe(true);
    expect(result.weeks.some((week) => week.type === "deload")).toBe(false);
    expect(result.weekErrors).toEqual([]);
  });

  test("ignores empty trailing set groups and reports invalid rows separately from structure", () => {
    const rows = [
      ["Program Name", "Validation fixture"],
      columns,
      ["Cycle 1"],
      ["Workout A", "Known lift", "", "Unknown Set", "5-8", "2"],
      ["", "Mystery lift", "", "Standard Set", "8-12", "2"],
      ["", "Known lift", "", "Failure Set", "8+", "1"],
      ["", "Known lift", "", "Warmup", "5-3", "11"],
      ["", "Known lift", "skip", "Standard Set", "5-8", "2"],
      ["Rest"],
      ["Workout C", "Known lift", "", "Standard Set", "5-8", "2"],
      ["Rest"],
      ["Workout E", "Known lift", "", "Standard Set", "5-8", "2"],
      ["Rest"],
      ["Workout G", "Known lift", "", "Standard Set", "5-8", "2"],
    ];
    const result = parseWorkoutCsv(rows.map(csvRow).join("\n"), {
      knownExerciseNames: ["Known lift"],
    });

    expect(result.weeks[0].days).toHaveLength(7);
    expect(result.weeks[0].days[0].exercises).toHaveLength(5);
    expect(result.weeks[0].days[0].exercises[0].sets).toEqual([]);
    expect(result.rowErrors.map((error) => error.code)).toEqual([
      "unknown_set_type",
      "unknown_exercise",
      "n_plus_requires_zero_rir",
      "invalid_rep_range",
      "invalid_rir",
    ]);
    expect(result.rowErrors.map((error) => error.rowNumber)).toEqual([
      4, 5, 6, 7, 7,
    ]);
    expect(result.sourceSkipMarkers).toHaveLength(1);
    expect(result.sourceSkipMarkers[0].rowNumber).toBe(8);
    expect(result.structuralErrors).toEqual([]);
    expect(result.canActivate).toBe(false);
  });

  test.each([6, 8])("blocks activation for a %i-slot cycle", (slotCount) => {
    const result = parseWorkoutCsv(makeCsv([slotCount]));

    expect(result.weeks[0].days).toHaveLength(slotCount);
    expect(result.weekErrors).toEqual([
      expect.objectContaining({
        code: "week_must_have_seven_slots",
        cycle: 1,
        actualSlots: slotCount,
      }),
    ]);
    expect(result.canActivate).toBe(false);
  });

  test.each([
    {
      name: "missing set-group header",
      source: "Program,Fixture\nWorkout,Exercise,RIR\nCycle 1\n",
      code: "invalid_header",
    },
    {
      name: "workout rows before a cycle marker",
      source: `Program,Fixture\n${csvRow(columns)}\nWorkout A,Known lift\n`,
      code: "row_outside_cycle",
    },
  ])("classifies $name as unsafe structure", ({ source, code }) => {
    const result = parseWorkoutCsv(source);

    expect(result.structuralErrors.map((error) => error.code)).toContain(code);
    expect(result.canActivate).toBe(false);
  });
});
