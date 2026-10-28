<script>
const KG_PER_LB = 0.45359237;
const defaultRestDurationsSeconds = {
  upper_compound: 120,
  lower_compound: 180,
  upper_isolation: 90,
  lower_isolation: 90,
  core: 60,
};

export default {
  inject: {
    timerFunctions: {
      default: () => globalThis.__WORKOUT_TIMER_FUNCTIONS__,
    },
  },
  data() {
    return {
      state: {
        loading: true,
        error: "",
        saveError: "",
        saved: false,
        saving: false,
        session: null,
        timers: null,
        timerNow: Date.now(),
        restDurationsSeconds: { ...defaultRestDurationsSeconds },
        inputs: {},
        selectedExerciseIndex: 0,
        setExerciseById: {},
        unitByExerciseId: {},
        skippedByExerciseId: {},
        unitSaveError: "",
        typePicker: {
          open: false,
          setId: null,
          setNumber: null,
          type: "standard",
        },
        pendingSave: null,
      },
    };
  },
  computed: {
    selectedExercise() {
      return (
        this.state.session?.exercises?.[this.state.selectedExerciseIndex] ??
        null
      );
    },
    selectedExercisePosition() {
      const total = this.state.session?.exercises?.length ?? 0;
      if (total === 0) return "";
      const setCount = this.selectedExercise?.sets?.length ?? 0;
      return `Exercise ${this.state.selectedExerciseIndex + 1} of ${total} · Set 1 of ${setCount}`;
    },
  },
  mounted() {
    this._timerIntervalId = setInterval(this.refreshTimerDisplay, 250);
    this.loadSession();
  },
  beforeUnmount() {
    clearInterval(this._timerIntervalId);
    this._audioContext?.close?.();
  },
  methods: {
    async request(path, options = {}) {
      const apiOrigin = globalThis.__WORKOUT_TRACKER_API_ORIGIN__ ?? "";
      let response;
      try {
        response = await fetch(`${apiOrigin}${path}`, {
          credentials: "include",
          ...options,
        });
      } catch {
        throw new Error("The workout service could not be reached. Try again.");
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload.error ?? "The workout request could not be completed.",
        );
      }
      return payload;
    },
    inputValue(value) {
      return value === null || value === undefined ? "" : String(value);
    },
    parseLoad(value, unit) {
      if (value === null || value === undefined) return "";
      const number = Number(value);
      if (!Number.isFinite(number)) return "";
      if (unit === "lb") {
        return String(number / KG_PER_LB);
      }
      return this.inputValue(value);
    },
    normalizeLoad(value, unit) {
      if (value.trim() === "") return null;
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return NaN;
      return unit === "lb" ? parsed * KG_PER_LB : parsed;
    },
    setExerciseId(session, setId) {
      return (
        this.state.setExerciseById[setId] ??
        session.exercises?.find((exercise) =>
          exercise.sets?.some((set) => set.id === setId),
        )?.id ??
        null
      );
    },
    unitForSet(session, setId) {
      const exerciseId = this.setExerciseId(session, setId);
      return this.state.unitByExerciseId[exerciseId] ?? "kg";
    },
    initializeInputs(session, preferredUnits = this.state.unitByExerciseId) {
      const inputs = {};
      const setExerciseById = {};
      const unitByExerciseId = {};
      const skippedByExerciseId = {};
      for (const exercise of session.exercises ?? []) {
        unitByExerciseId[exercise.id] =
          preferredUnits[exercise.id] ??
          exercise.snapshot?.unit ??
          exercise.sets?.[0]?.prescription?.unit ??
          "kg";
        skippedByExerciseId[exercise.id] = Boolean(exercise.skipped);
        for (const set of exercise.sets ?? []) {
          const unit = unitByExerciseId[exercise.id];
          setExerciseById[set.id] = exercise.id;
          inputs[set.id] = {
            load: this.parseLoad(set.actualLoadKg, unit),
            reps: this.inputValue(set.actualReps),
            rir: this.inputValue(set.actualRir),
            type: set.type,
            checked: set.checked,
          };
        }
      }
      this.state.inputs = inputs;
      this.state.setExerciseById = setExerciseById;
      this.state.unitByExerciseId = unitByExerciseId;
      this.state.skippedByExerciseId = skippedByExerciseId;
    },
    async loadUnitPreferences(session) {
      await Promise.all(
        (session.exercises ?? []).map(async (exercise) => {
          if (!exercise.exerciseId) return;
          try {
            const preference = await this.request(
              `/api/exercises/${exercise.exerciseId}/preferences`,
            );
            const previousUnit = this.state.unitByExerciseId[exercise.id];
            const nextUnit = preference.unit;
            if (!["kg", "lb"].includes(nextUnit)) return;
            this.state.unitByExerciseId[exercise.id] = nextUnit;
            if (previousUnit === nextUnit) return;
            for (const set of exercise.sets ?? []) {
              const values = this.state.inputs[set.id];
              if (!values || values.load.trim() === "") continue;
              const canonicalLoad = this.normalizeLoad(
                values.load,
                previousUnit,
              );
              values.load = this.parseLoad(canonicalLoad, nextUnit);
            }
          } catch {
            // Keep the unit captured in the session snapshot if preferences are unavailable.
          }
        }),
      );
    },
    async loadSession() {
      this.state.loading = true;
      this.state.error = "";
      try {
        const sessionId = this.$route.params.sessionId;
        const path = sessionId
          ? `/api/workout-sessions/${sessionId}`
          : "/api/workout-sessions/active";
        const session = await this.request(path);
        this.state.session = session;
        if (session) {
          this.state.timers = this.restoreTimerState(session);
          this.state.timerNow = Date.now();
          this.initializeInputs(session);
          this.state.selectedExerciseIndex = 0;
          await Promise.all([
            this.loadUnitPreferences(session),
            this.loadRestDurations(),
          ]);
        }
        this.state.pendingSave = null;
      } catch (error) {
        this.state.error = error.message;
      } finally {
        this.state.loading = false;
      }
    },
    restoreTimerState(session) {
      const timers = session.timers;
      if (
        timers &&
        Number.isInteger(timers.sessionElapsedSeconds) &&
        typeof timers.paused === "boolean" &&
        typeof timers.restPaused === "boolean" &&
        Number.isInteger(timers.restDurationSeconds) &&
        Number.isInteger(timers.restRemainingSeconds)
      ) {
        return timers;
      }
      const startedAt = Date.parse(session.startedAt);
      return this.timerFunctions.createTimerState(
        Number.isFinite(startedAt) ? startedAt : Date.now(),
      );
    },
    async loadRestDurations() {
      try {
        const settings = await this.request("/api/settings");
        const configured = settings.profile?.restDurationsSeconds;
        if (!configured || typeof configured !== "object") return;
        this.state.restDurationsSeconds = {
          ...defaultRestDurationsSeconds,
          ...Object.fromEntries(
            Object.keys(defaultRestDurationsSeconds)
              .filter(
                (category) =>
                  Number.isInteger(configured[category]) &&
                  configured[category] > 0,
              )
              .map((category) => [category, configured[category]]),
          ),
        };
      } catch {
        this.state.restDurationsSeconds = { ...defaultRestDurationsSeconds };
      }
    },
    refreshTimerDisplay() {
      if (!this.state.timers) return;
      const previousRemaining = this.timerFunctions.getRestRemainingSeconds(
        this.state.timers,
        this.state.timerNow,
      );
      const now = Date.now();
      this.state.timerNow = now;
      const remaining = this.timerFunctions.getRestRemainingSeconds(
        this.state.timers,
        now,
      );
      if (previousRemaining > 0 && remaining === 0) this.playRestTone();
    },
    formatTimer(seconds) {
      const total = Math.max(0, Math.floor(seconds));
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const remainingSeconds = total % 60;
      const pad = (value) => String(value).padStart(2, "0");
      return hours > 0
        ? `${pad(hours)}:${pad(minutes)}:${pad(remainingSeconds)}`
        : `${pad(minutes)}:${pad(remainingSeconds)}`;
    },
    sessionTimerText() {
      return this.formatTimer(
        this.timerFunctions.getSessionElapsedSeconds(
          this.state.timers,
          this.state.timerNow,
        ),
      );
    },
    restTimerText() {
      return this.formatTimer(
        this.timerFunctions.getRestRemainingSeconds(
          this.state.timers,
          this.state.timerNow,
        ),
      );
    },
    restTimerRemaining() {
      return this.timerFunctions.getRestRemainingSeconds(
        this.state.timers,
        this.state.timerNow,
      );
    },
    restDurationFor(exercise) {
      return (
        this.state.restDurationsSeconds[exercise?.snapshot?.restCategory] ?? 0
      );
    },
    prepareAudio() {
      const AudioContextConstructor =
        globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!this._audioContext && AudioContextConstructor) {
        this._audioContext = new AudioContextConstructor();
      }
      if (this._audioContext?.state === "suspended") {
        this._audioContext.resume();
      }
    },
    playRestTone() {
      if (document.visibilityState !== "visible") return;
      this.prepareAudio();
      if (!this._audioContext) return;
      const oscillator = this._audioContext.createOscillator();
      const gain = this._audioContext.createGain();
      oscillator.frequency.value = 880;
      gain.gain.value = 0.12;
      oscillator.connect(gain);
      gain.connect(this._audioContext.destination);
      oscillator.start();
      oscillator.stop(this._audioContext.currentTime + 0.25);
    },
    async updateTimers(timers) {
      this.state.timers = timers;
      this.state.timerNow = Date.now();
      this.state.saved = false;
      this.prepareAudio();
      await this.saveDraft();
    },
    async toggleSessionTimers() {
      const timers = this.state.timers.paused
        ? this.timerFunctions.resumeTimers(this.state.timers, Date.now())
        : this.timerFunctions.pauseTimers(this.state.timers, Date.now());
      await this.updateTimers(timers);
    },
    async startRest() {
      const duration = this.restDurationFor(this.selectedExercise);
      if (!duration) return;
      await this.updateTimers(
        this.timerFunctions.startRestTimer(
          this.state.timers,
          duration,
          Date.now(),
        ),
      );
    },
    async toggleRestPause() {
      const timers = this.state.timers.restPaused
        ? this.timerFunctions.resumeRestTimer(this.state.timers, Date.now())
        : this.timerFunctions.pauseRestTimer(this.state.timers, Date.now());
      await this.updateTimers(timers);
    },
    async resetRest() {
      await this.updateTimers(
        this.timerFunctions.resetRestTimer(this.state.timers),
      );
    },
    async skipRest() {
      await this.updateTimers(
        this.timerFunctions.skipRestTimer(this.state.timers),
      );
    },
    async adjustRest(adjustmentSeconds) {
      await this.updateTimers(
        this.timerFunctions.adjustRestTimer(
          this.state.timers,
          adjustmentSeconds,
          Date.now(),
        ),
      );
    },
    updateInput(setId, field, value) {
      if (this.state.inputs[setId]?.checked) return;
      this.state.inputs[setId][field] = value;
      this.state.saved = false;
    },
    setTypeBadge(type) {
      return type === "warmup" ? "W" : type === "failure" ? "F" : "1";
    },
    openTypePicker(set) {
      this.state.typePicker = {
        open: true,
        setId: set.id,
        setNumber: set.setNumber,
        type: this.state.inputs[set.id].type,
      };
    },
    applyTypePicker() {
      const setId = this.state.typePicker.setId;
      if (!setId || !this.state.inputs[setId]) return;
      this.state.inputs[setId].type = this.state.typePicker.type;
      this.state.inputs[setId].checked = false;
      this.state.typePicker.open = false;
      this.state.saved = false;
    },
    closeTypePicker() {
      this.state.typePicker.open = false;
    },
    async selectExercise(index) {
      this.state.selectedExerciseIndex = index;
    },
    exerciseComplete(exercise) {
      const workingSets = (exercise.sets ?? []).filter(
        (set) => set.type !== "warmup",
      );
      return (
        workingSets.length > 0 &&
        workingSets.every((set) => this.state.inputs[set.id]?.checked === true)
      );
    },
    autoLoadValue() {
      return "Manual";
    },
    autoRepsValue(set) {
      return this.repRange(set.prescription);
    },
    autoRirValue(set) {
      return String(set.prescription.targetRir);
    },
    unitLabel(unit) {
      return unit === "lb" ? "lbs" : "kg";
    },
    toggleChecked(setId, checked) {
      if (!this.state.inputs[setId]) return;
      this.state.inputs[setId].checked = checked;
      if (checked && this.state.inputs[setId].type !== "warmup") {
        this.state.timers = this.timerFunctions.startRestTimer(
          this.state.timers,
          this.restDurationFor(this.selectedExercise),
          Date.now(),
        );
        this.state.timerNow = Date.now();
        this.prepareAudio();
      }
      this.saveDraft();
    },
    createPayload() {
      const sets = [];
      const exerciseStates = [];
      for (const exercise of this.state.session.exercises ?? []) {
        exerciseStates.push({
          id: exercise.id,
          skipped: Boolean(this.state.skippedByExerciseId[exercise.id]),
        });
        for (const set of exercise.sets ?? []) {
          const values = this.state.inputs[set.id] ?? {};
          const loadText = values.load?.trim?.() ?? "";
          const repsText = values.reps.trim();
          const rirText = values.rir.trim();
          const unit = this.state.unitByExerciseId[exercise.id] ?? "kg";
          const actualLoadKg = this.normalizeLoad(loadText, unit);
          const actualReps = repsText === "" ? null : Number(repsText);
          const actualRir = rirText === "" ? null : Number(rirText);
          const checked = Boolean(values.checked);
          const type = values.type ?? set.type;
          if (
            (actualLoadKg !== null &&
              (!Number.isFinite(actualLoadKg) || actualLoadKg < 0)) ||
            (actualReps !== null &&
              (!Number.isInteger(actualReps) || actualReps < 1)) ||
            (actualRir !== null &&
              (!Number.isInteger(actualRir) || actualRir < 0 || actualRir > 10))
          ) {
            throw new Error(
              "Enter a nonnegative load, whole reps, and RIR from 0 to 10.",
            );
          }
          if (
            checked &&
            (actualLoadKg === null || actualReps === null || actualRir === null)
          ) {
            throw new Error("Checked sets require load, reps, and RIR.");
          }
          if (checked && type === "failure" && actualRir !== 0) {
            throw new Error("Failure sets require actual RIR 0.");
          }
          sets.push({
            id: set.id,
            type,
            actualLoadKg,
            actualReps,
            actualRir,
            checked,
          });
        }
      }
      return {
        version: this.state.session.version,
        sets,
        exerciseStates,
        timers: this.state.timers,
      };
    },
    async toggleExerciseSkipped(exercise) {
      this.state.skippedByExerciseId[exercise.id] =
        !this.state.skippedByExerciseId[exercise.id];
      this.state.saved = false;
      await this.saveDraft();
    },
    async saveDraft() {
      let payload;
      try {
        payload = this.createPayload();
      } catch (error) {
        this.state.saveError = error.message;
        this.state.saved = false;
        return;
      }
      const serialized = JSON.stringify(payload);
      if (this.state.pendingSave?.serialized !== serialized) {
        this.state.pendingSave = {
          serialized,
          payload,
          key:
            globalThis.crypto?.randomUUID?.() ??
            `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        };
      }
      this.state.saving = true;
      this.state.saveError = "";
      this.state.saved = false;
      try {
        const session = await this.request(
          `/api/workout-sessions/${this.state.session.id}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": this.state.pendingSave.key,
            },
            body: this.state.pendingSave.serialized,
          },
        );
        this.state.session = session;
        this.state.timers = this.restoreTimerState(session);
        this.state.timerNow = Date.now();
        this.initializeInputs(session, this.state.unitByExerciseId);
        this.state.pendingSave = null;
        this.state.saved = true;
      } catch (error) {
        this.state.saveError = error.message;
      } finally {
        this.state.saving = false;
      }
    },
    async saveUnitOverride(exercise, unit) {
      this.state.unitSaveError = "";
      const previousUnit = this.state.unitByExerciseId[exercise.id] ?? "kg";
      if (unit === previousUnit) return;
      try {
        const preference = await this.request(
          `/api/exercises/${exercise.exerciseId}/preferences`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ unitOverride: unit }),
          },
        );
        this.state.unitByExerciseId[exercise.id] = preference.unit;
        for (const set of exercise.sets ?? []) {
          const values = this.state.inputs[set.id];
          if (!values || values.load.trim() === "") continue;
          const oldCanonical = this.normalizeLoad(values.load, previousUnit);
          values.load = this.parseLoad(oldCanonical, preference.unit);
        }
        this.state.saved = false;
      } catch (error) {
        this.state.unitSaveError = error.message;
      }
    },
    formatStartDate(date) {
      const [year, month, day] = date.split("-").map(Number);
      return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(
        "en-US",
        { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" },
      );
    },
    setTypeLabel(type) {
      return type === "warmup"
        ? "Warmup"
        : type === "failure"
          ? "Failure"
          : "Standard";
    },
    repRange(prescription) {
      return prescription.repMax === null
        ? `${prescription.repMin}+ reps`
        : `${prescription.repMin}-${prescription.repMax} reps`;
    },
  },
};
</script>

<template>
  <section class="page-content workout-tracker-page">
    <p v-if="state.loading" class="home-loading" role="status">
      Recovering workout draft…
    </p>
    <p
      v-else-if="state.error"
      class="form-message form-message--error"
      role="alert"
    >
      {{ state.error }}
      <button class="text-button" type="button" @click="loadSession">
        Retry
      </button>
    </p>
    <div v-else-if="!state.session" class="empty-state">
      <h1>No active workout</h1>
      <p>Start a workout from one of your current program days.</p>
      <RouterLink class="text-button" to="/">Return home</RouterLink>
    </div>
    <template v-else>
      <section class="tracker-timers" aria-label="Workout timers">
        <div class="tracker-timers__readouts">
          <div class="tracker-timers__readout">
            <span>Session</span>
            <output aria-label="Session timer">{{ sessionTimerText() }}</output>
          </div>
          <div class="tracker-timers__readout tracker-timers__readout--rest">
            <span>Rest</span>
            <output aria-label="Rest timer">{{ restTimerText() }}</output>
            <progress
              aria-label="Rest timer progress"
              :max="Math.max(1, state.timers.restDurationSeconds)"
              :value="restTimerRemaining()"
            ></progress>
          </div>
        </div>
        <div class="tracker-timers__actions" aria-label="Timer controls">
          <button
            class="button button--quiet"
            type="button"
            :disabled="state.saving"
            @click="toggleSessionTimers"
          >
            {{ state.timers.paused ? "Resume timers" : "Pause timers" }}
          </button>
          <button
            class="button button--quiet"
            type="button"
            :disabled="state.saving || !restDurationFor(selectedExercise)"
            @click="startRest"
          >
            Start rest
          </button>
          <button
            class="button button--quiet"
            type="button"
            :disabled="state.saving || state.timers.restDurationSeconds === 0"
            @click="toggleRestPause"
          >
            {{ state.timers.restPaused ? "Resume rest" : "Pause rest" }}
          </button>
          <button
            class="button button--quiet"
            type="button"
            :disabled="state.saving || state.timers.restDurationSeconds === 0"
            @click="resetRest"
          >
            Reset rest
          </button>
          <button
            class="button button--quiet"
            type="button"
            :disabled="state.saving || state.timers.restDurationSeconds === 0"
            @click="skipRest"
          >
            Skip rest
          </button>
          <button
            class="button button--quiet"
            type="button"
            :disabled="state.saving || state.timers.restDurationSeconds === 0"
            @click="adjustRest(30)"
          >
            Add 30 seconds
          </button>
          <button
            class="button button--quiet"
            type="button"
            :disabled="state.saving || state.timers.restDurationSeconds === 0"
            @click="adjustRest(-30)"
          >
            Subtract 30 seconds
          </button>
        </div>
      </section>
      <header class="page-heading">
        <p class="eyebrow">Online draft · {{ state.session.status }}</p>
        <h1>Workout tracker</h1>
        <p class="muted-copy">
          Draft started {{ formatStartDate(state.session.startedLocalDate) }} ·
          {{ state.session.startedTimezone }}
        </p>
      </header>

      <nav class="tracker-exercise-nav" aria-label="Exercise navigation">
        <button
          v-for="(exercise, index) in state.session.exercises"
          :key="exercise.id"
          class="tracker-exercise-nav__item"
          :class="{
            'tracker-exercise-nav__item--active':
              index === state.selectedExerciseIndex,
            'tracker-exercise-nav__item--complete': exerciseComplete(exercise),
          }"
          type="button"
          :aria-current="
            index === state.selectedExerciseIndex ? 'true' : undefined
          "
          :aria-label="`Exercise ${index + 1}: ${exercise.name}${exerciseComplete(exercise) ? ', complete' : ''}`"
          @click="selectExercise(index)"
        >
          <img
            v-if="exercise.snapshot?.imageUrl"
            :src="exercise.snapshot.imageUrl"
            alt=""
          />
          <span>{{ index + 1 }}</span>
        </button>
      </nav>

      <section v-if="selectedExercise" class="tracker-current-exercise">
        <div class="tracker-current-exercise__header">
          <h2>{{ selectedExercise.name }}</h2>
          <p class="muted-copy">{{ selectedExercisePosition }}</p>
        </div>
        <div class="tracker-action-strip" aria-label="Exercise actions">
          <RouterLink
            class="text-button"
            :to="`/exercises/${selectedExercise.exerciseId}/info`"
          >
            Info
          </RouterLink>
          <RouterLink
            class="text-button"
            :to="`/history?exerciseId=${selectedExercise.exerciseId}`"
          >
            History
          </RouterLink>
          <button
            class="text-button"
            type="button"
            @click="toggleExerciseSkipped(selectedExercise)"
          >
            {{
              state.skippedByExerciseId[selectedExercise.id]
                ? "Undo Skip"
                : "Skip Exercise"
            }}
          </button>
          <label class="tracker-unit-select">
            <span>Unit</span>
            <select
              :aria-label="`Unit for ${selectedExercise.name}`"
              :value="state.unitByExerciseId[selectedExercise.id]"
              @change="saveUnitOverride(selectedExercise, $event.target.value)"
            >
              <option value="kg">kg</option>
              <option value="lb">lb</option>
            </select>
          </label>
        </div>
      </section>

      <section
        v-if="selectedExercise"
        class="tracker-exercise"
        :aria-labelledby="`exercise-${selectedExercise.id}`"
      >
        <p
          v-if="state.skippedByExerciseId[selectedExercise.id]"
          class="form-message"
        >
          This exercise is marked skipped. You can continue with later exercises
          and finish this workout as partial.
        </p>
        <p v-if="selectedExercise.prescription.notes" class="muted-copy">
          {{ selectedExercise.prescription.notes }}
        </p>
        <fieldset
          v-for="set in selectedExercise.sets"
          :key="set.id"
          class="tracker-set"
        >
          <legend>
            Set {{ set.setNumber }} ·
            {{ setTypeLabel(state.inputs[set.id].type) }} ·
            {{ repRange(set.prescription) }} · target RIR
            {{ set.prescription.targetRir }}
          </legend>
          <div class="tracker-set__inputs tracker-set__inputs--grid">
            <button
              type="button"
              class="button button--quiet tracker-type-button"
              :aria-label="`Set ${set.setNumber} type`"
              :disabled="state.inputs[set.id].checked"
              @click="openTypePicker(set)"
            >
              {{ setTypeBadge(state.inputs[set.id].type) }}
            </button>
            <label>
              Auto load
              <input
                :aria-label="`Auto load`"
                :value="autoLoadValue(set)"
                readonly
              />
            </label>
            <label>
              Auto reps
              <input
                :aria-label="`Auto reps`"
                :value="autoRepsValue(set)"
                readonly
              />
            </label>
            <label>
              Auto RIR
              <input
                :aria-label="`Auto RIR`"
                :value="autoRirValue(set)"
                readonly
              />
            </label>
            <label>
              Set {{ set.setNumber }} actual load ({{
                unitLabel(state.unitByExerciseId[selectedExercise.id])
              }})
              <input
                type="number"
                min="0"
                step="0.001"
                :value="state.inputs[set.id].load"
                :aria-label="`Set ${set.setNumber} actual load (${unitLabel(state.unitByExerciseId[selectedExercise.id])})`"
                :disabled="state.inputs[set.id].checked"
                @input="updateInput(set.id, 'load', $event.target.value)"
              />
            </label>
            <label>
              Set {{ set.setNumber }} actual reps
              <input
                type="number"
                min="1"
                step="1"
                :value="state.inputs[set.id].reps"
                :disabled="state.inputs[set.id].checked"
                @input="updateInput(set.id, 'reps', $event.target.value)"
              />
            </label>
            <label>
              Set {{ set.setNumber }} actual RIR
              <input
                type="number"
                min="0"
                max="10"
                step="1"
                :value="state.inputs[set.id].rir"
                :disabled="state.inputs[set.id].checked"
                @input="updateInput(set.id, 'rir', $event.target.value)"
              />
            </label>
            <label>
              Complete
              <input
                type="checkbox"
                :aria-label="`Complete set ${set.setNumber}`"
                :checked="state.inputs[set.id].checked"
                :disabled="state.saving"
                @change="toggleChecked(set.id, $event.target.checked)"
              />
            </label>
          </div>
        </fieldset>
      </section>

      <section
        v-if="state.typePicker.open"
        class="tracker-type-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="`Set ${state.typePicker.setNumber} type`"
      >
        <h3>Set {{ state.typePicker.setNumber }} type</h3>
        <label>
          <input
            v-model="state.typePicker.type"
            type="radio"
            value="standard"
          />
          Standard
        </label>
        <label>
          <input v-model="state.typePicker.type" type="radio" value="warmup" />
          Warmup
        </label>
        <label>
          <input v-model="state.typePicker.type" type="radio" value="failure" />
          Failure
        </label>
        <div class="tracker-type-modal__actions">
          <button
            class="button button--quiet"
            type="button"
            @click="closeTypePicker"
          >
            Cancel
          </button>
          <button
            class="button button--primary"
            type="button"
            @click="applyTypePicker"
          >
            Save type
          </button>
        </div>
      </section>

      <footer class="tracker-actions">
        <p
          v-if="state.saveError"
          class="form-message form-message--error"
          role="alert"
        >
          {{ state.saveError }}
        </p>
        <p
          v-if="state.unitSaveError"
          class="form-message form-message--error"
          role="alert"
        >
          {{ state.unitSaveError }}
        </p>
        <p v-if="state.saved" role="status">Draft saved.</p>
        <button
          class="button button--primary"
          type="button"
          :disabled="state.saving"
          @click="saveDraft"
        >
          {{ state.saving ? "Saving…" : "Save draft" }}
        </button>
        <button
          v-if="state.saveError"
          class="text-button"
          type="button"
          :disabled="state.saving"
          @click="saveDraft"
        >
          Retry Save
        </button>
      </footer>
    </template>
  </section>
</template>
