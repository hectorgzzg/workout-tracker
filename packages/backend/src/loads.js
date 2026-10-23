const kilogramsPerPound = 0.45359237;
const loadTypes = new Set(["external", "dumbbell", "bodyweight", "assisted"]);
const units = new Set(["kg", "lb"]);

function isRecord(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function isCanonicalLoad(value, { positive = false } = {}) {
  const scaledValue = value * 1000;
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= (positive ? 0.001 : 0) &&
    value <= 99999.999 &&
    Math.abs(scaledValue - Math.round(scaledValue)) <=
      Number.EPSILON * Math.max(1, Math.abs(scaledValue)) * 4
  );
}

function validateUnit(unit) {
  if (!units.has(unit)) throw new TypeError("Unit must be kg or lb");
}

function validateJsonValue(value, visited = new Set()) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || visited.has(value)) return false;

  visited.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => validateJsonValue(item, visited))
    : isRecord(value) &&
      Object.values(value).every((item) => validateJsonValue(item, visited));
  visited.delete(value);
  return valid;
}

function cloneJson(value) {
  if (!validateJsonValue(value)) {
    throw new TypeError("Snapshot values must be finite JSON data");
  }
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

function validatePositiveOrNull(value, name) {
  if (
    value !== null &&
    !(typeof value === "number" && Number.isFinite(value) && value > 0)
  ) {
    throw new TypeError(`${name} must be positive or null`);
  }
}

function normalizeGymEquipment(value) {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    value.name.trim().length === 0 ||
    !Array.isArray(value.equipment) ||
    !Array.isArray(value.bars) ||
    !Array.isArray(value.plates)
  ) {
    throw new TypeError("Gym equipment snapshot is invalid");
  }

  const equipment = value.equipment.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.name !== "string" ||
      item.name.trim().length === 0 ||
      !loadTypes.has(item.loadType) ||
      !isCanonicalLoad(item.minLoadKg) ||
      !isCanonicalLoad(item.maxLoadKg) ||
      item.maxLoadKg < item.minLoadKg ||
      !isCanonicalLoad(item.incrementKg, { positive: true }) ||
      !Array.isArray(item.availableLoadsKg) ||
      item.availableLoadsKg.some(
        (load) =>
          !isCanonicalLoad(load) ||
          load < item.minLoadKg ||
          load > item.maxLoadKg,
      )
    ) {
      throw new TypeError("Gym equipment snapshot is invalid");
    }
    return {
      name: item.name,
      loadType: item.loadType,
      minLoadKg: item.minLoadKg,
      maxLoadKg: item.maxLoadKg,
      incrementKg: item.incrementKg,
      availableLoadsKg: [...item.availableLoadsKg],
    };
  });
  const bars = value.bars.map((bar) => {
    if (
      !isRecord(bar) ||
      typeof bar.name !== "string" ||
      bar.name.trim().length === 0 ||
      !isCanonicalLoad(bar.weightKg, { positive: true })
    ) {
      throw new TypeError("Gym equipment snapshot is invalid");
    }
    return { name: bar.name, weightKg: bar.weightKg };
  });
  const plates = value.plates.map((plate) => {
    if (
      !isRecord(plate) ||
      !isCanonicalLoad(plate.weightKg, { positive: true }) ||
      !Number.isInteger(plate.quantity) ||
      plate.quantity < 0
    ) {
      throw new TypeError("Gym equipment snapshot is invalid");
    }
    return { weightKg: plate.weightKg, quantity: plate.quantity };
  });

  return { name: value.name, equipment, bars, plates };
}

export function convertLoad(value, fromUnit, toUnit) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError("Load must be a finite nonnegative number");
  }
  validateUnit(fromUnit);
  validateUnit(toUnit);
  if (fromUnit === toUnit) return value;
  return fromUnit === "kg"
    ? value / kilogramsPerPound
    : value * kilogramsPerPound;
}

export function roundLoadForDisplay(canonicalKg, unit, decimalPlaces = 2) {
  if (
    typeof canonicalKg !== "number" ||
    !Number.isFinite(canonicalKg) ||
    canonicalKg < 0
  ) {
    throw new TypeError("Load must be a finite nonnegative number");
  }
  validateUnit(unit);
  if (
    !Number.isInteger(decimalPlaces) ||
    decimalPlaces < 0 ||
    decimalPlaces > 6
  ) {
    throw new TypeError("Display precision must be an integer from 0 to 6");
  }
  const factor = 10 ** decimalPlaces;
  const displayed = convertLoad(canonicalKg, "kg", unit);
  return (
    Math.round((displayed + Number.EPSILON * Math.abs(displayed)) * factor) /
    factor
  );
}

export function createLoadInterpretation({
  loadType,
  unit,
  bodyweightFactor = null,
  assistanceRatio = null,
  dumbbellCount = null,
  sideCount = null,
} = {}) {
  if (!loadTypes.has(loadType)) throw new TypeError("Unsupported load type");
  validateUnit(unit);
  validatePositiveOrNull(bodyweightFactor, "Bodyweight factor");
  validatePositiveOrNull(assistanceRatio, "Assistance ratio");
  if (loadType !== "bodyweight" && bodyweightFactor !== null) {
    throw new TypeError("Bodyweight factor only applies to bodyweight loads");
  }
  if (loadType !== "assisted" && assistanceRatio !== null) {
    throw new TypeError("Assistance ratio only applies to assisted loads");
  }
  if (
    (loadType === "dumbbell" && dumbbellCount !== 1 && dumbbellCount !== 2) ||
    (loadType !== "dumbbell" && dumbbellCount !== null)
  ) {
    throw new TypeError("Dumbbell count must be one or two");
  }
  if (sideCount !== null && sideCount !== 1 && sideCount !== 2) {
    throw new TypeError("Side count must be one, two, or null");
  }

  return Object.freeze({
    loadType,
    unit,
    bodyweightFactor,
    assistanceRatio,
    dumbbellCount,
    sideCount,
  });
}

export function createExerciseSnapshot({
  name,
  exerciseEquipment,
  loadInterpretation,
  prescription,
  bodyweightKg,
  equipment,
} = {}) {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new TypeError("Exercise name is required");
  }
  if (
    typeof exerciseEquipment !== "string" ||
    exerciseEquipment.trim().length === 0
  ) {
    throw new TypeError("Exercise equipment is required");
  }
  if (
    !isRecord(loadInterpretation) ||
    !isCanonicalLoad(bodyweightKg ?? 0) ||
    (bodyweightKg === undefined && bodyweightKg !== null) ||
    !isRecord(prescription)
  ) {
    throw new TypeError("Exercise snapshot values are invalid");
  }
  const validatedInterpretation = createLoadInterpretation(loadInterpretation);
  const clonedPrescription = cloneJson(prescription);
  const normalizedEquipment = normalizeGymEquipment(equipment);

  return deepFreeze({
    name: name.trim(),
    exerciseEquipment: exerciseEquipment.trim(),
    ...validatedInterpretation,
    prescription: clonedPrescription,
    bodyweightKg: bodyweightKg ?? null,
    equipment: normalizedEquipment,
  });
}
