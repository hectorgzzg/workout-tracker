<script>
import { reactive } from "vue";

function makeIdempotencyKey() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function blankProgramSet() {
  return { type: "standard", repMin: 8, repMax: 10, rir: 2 };
}

function blankProgramDay() {
  return { type: "rest", name: "Rest", exercises: [] };
}

function serializeProgramDay(day) {
  return {
    type: day.type,
    name: day.name,
    exercises: day.exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      notes: exercise.notes,
      sets: exercise.sets.map((set) => ({
        type: set.type,
        repMin: Number(set.repMin),
        repMax:
          set.repMax === "" || set.repMax === null ? null : Number(set.repMax),
        rir: Number(set.rir),
      })),
    })),
  };
}

export default {
  data() {
    return {
      state: reactive({
        programs: [],
        selectedProgram: null,
        catalogExercises: [],
        deloadSourceWeekNumber: null,
        programLoading: false,
        editingDayId: null,
        dayForm: null,
        deloadDays: Array.from({ length: 7 }, blankProgramDay),
        savingDay: false,
        savingDeload: false,
        activating: false,
        activationConfirmed: false,
        source: "",
        name: "",
        preview: null,
        mappings: {},
        skipRowNumbers: [],
        acknowledgedSkipRows: [],
        confirmed: false,
        previewLoading: false,
        saving: false,
        loadingPrograms: true,
        error: "",
        validationErrors: null,
        message: "",
        idempotencyKey: "",
      }),
    };
  },
  computed: {
    rowErrorGroups() {
      const grouped = new Map();
      for (const error of this.state.preview?.rowErrors ?? []) {
        if (!grouped.has(error.rowNumber)) grouped.set(error.rowNumber, []);
        grouped.get(error.rowNumber).push(error);
      }
      return [...grouped.entries()].map(([rowNumber, errors]) => ({
        rowNumber,
        errors,
      }));
    },
    structuralAndWeekErrors() {
      const preview = this.state.preview;
      return [...preview.structuralErrors, ...preview.weekErrors];
    },
    includedMappingNames() {
      const skipped = new Set(this.state.skipRowNumbers);
      const names = new Set();
      for (const week of this.state.preview?.weeks ?? []) {
        for (const day of week.days) {
          for (const exercise of day.exercises) {
            if (!skipped.has(exercise.rowNumber)) names.add(exercise.name);
          }
        }
      }
      return [...names];
    },
    canImport() {
      const preview = this.state.preview;
      return Boolean(
        preview &&
        this.state.name.trim().length > 0 &&
        this.state.name.trim().length <= 120 &&
        preview.structuralErrors.length === 0 &&
        preview.weekErrors.length === 0 &&
        !preview.weeks.some((week) =>
          week.days.some((day) => this.dayWillBeEmpty(day)),
        ) &&
        this.rowErrorGroups.every(({ rowNumber }) =>
          this.state.skipRowNumbers.includes(rowNumber),
        ) &&
        preview.sourceSkipMarkers.every(({ rowNumber }) =>
          this.state.acknowledgedSkipRows.includes(rowNumber),
        ) &&
        this.includedMappingNames.every((name) => this.state.mappings[name]) &&
        this.state.confirmed &&
        !this.state.saving,
      );
    },
    hasDeload() {
      return Boolean(
        this.state.selectedProgram?.weeks.some(
          (week) => week.type === "deload",
        ),
      );
    },
    programReadyToActivate() {
      const program = this.state.selectedProgram;
      if (!program || !this.hasDeload || program.status === "active") {
        return false;
      }
      return Boolean(
        program.weeks.length > 0 &&
        program.weeks.at(-1).type === "deload" &&
        program.weeks.every(
          (week) =>
            week.days.length === 7 &&
            week.days.some((day) => day.type === "workout") &&
            week.days.every(
              (day) =>
                day.type === "rest" ||
                (day.exercises.length > 0 &&
                  day.exercises.every(
                    (exercise) =>
                      exercise.exerciseId && exercise.sets.length > 0,
                  )),
            ),
        ),
      );
    },
    canActivate() {
      return Boolean(
        this.programReadyToActivate &&
        this.state.activationConfirmed &&
        !this.state.activating,
      );
    },
    canConfigureDeload() {
      return Boolean(
        this.state.deloadDays.some((day) => day.type === "workout") &&
        this.state.deloadDays.every(
          (day) =>
            day.type === "rest" ||
            (day.exercises.length > 0 &&
              day.exercises.every(
                (exercise) => exercise.exerciseId && exercise.sets.length > 0,
              )),
        ) &&
        !this.state.savingDeload,
      );
    },
  },
  mounted() {
    this.loadPrograms();
  },
  methods: {
    async requestPrograms(path, options = {}) {
      let response;
      try {
        const apiOrigin = globalThis.__WORKOUT_TRACKER_API_ORIGIN__ ?? "";
        response = await fetch(`${apiOrigin}${path}`, {
          credentials: "include",
          ...options,
          headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...options.headers,
          },
        });
      } catch {
        throw new Error("The program service could not be reached. Try again.");
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(
          payload.error ?? "The program request could not be completed.",
        );
        error.validationErrors = payload.errors ?? null;
        throw error;
      }
      return payload;
    },
    async loadPrograms() {
      this.state.loadingPrograms = true;
      try {
        this.state.programs = await this.requestPrograms("/api/programs");
      } catch (error) {
        this.state.error = error.message;
      } finally {
        this.state.loadingPrograms = false;
      }
    },
    async openProgram(program) {
      this.state.error = "";
      this.state.message = "";
      this.state.programLoading = true;
      this.state.editingDayId = null;
      this.state.activationConfirmed = false;
      try {
        const [detail, exercises] = await Promise.all([
          this.requestPrograms(`/api/programs/${program.id}`),
          this.requestPrograms("/api/catalog/exercises"),
        ]);
        this.state.selectedProgram = detail;
        this.state.catalogExercises = exercises;
        const sourceWeek = detail.weeks
          .filter((week) => week.type === "training")
          .at(-1);
        if (!detail.weeks.some((week) => week.type === "deload")) {
          this.state.deloadSourceWeekNumber = sourceWeek?.weekNumber ?? null;
          this.state.deloadDays = this.deloadDaysFromWeek(sourceWeek);
        }
      } catch (error) {
        this.state.error = error.message;
      } finally {
        this.state.programLoading = false;
      }
    },
    closeProgram() {
      this.state.selectedProgram = null;
      this.state.editingDayId = null;
      this.state.activationConfirmed = false;
    },
    deloadDaysFromWeek(week) {
      const sourceDays = new Map(
        (week?.days ?? []).map((day) => [day.slotNumber, day]),
      );
      return Array.from({ length: 7 }, (_, index) => {
        const sourceDay = sourceDays.get(index + 1);
        if (!sourceDay || sourceDay.type === "rest") {
          return {
            ...blankProgramDay(),
            name: sourceDay?.name || "Rest",
          };
        }
        return {
          type: "workout",
          name: sourceDay.name,
          exercises: sourceDay.exercises.map((exercise) => ({
            exerciseId: exercise.exerciseId,
            notes: exercise.notes ?? "",
            sets: [],
          })),
        };
      });
    },
    beginEditDay(day) {
      this.state.editingDayId = day.id;
      this.state.dayForm = {
        type: day.type,
        name: day.name ?? "",
        exercises: day.exercises.map((exercise) => ({
          exerciseId: exercise.exerciseId,
          notes: exercise.notes ?? "",
          sets: exercise.sets.map((set) => ({
            type: set.type,
            repMin: set.repMin,
            repMax: set.repMax ?? "",
            rir: set.rir,
          })),
        })),
      };
      this.state.error = "";
      this.state.message = "";
    },
    resetDayType(day) {
      day.exercises = [];
      day.name = day.type === "rest" ? "Rest" : "Workout";
    },
    addExercise(day) {
      day.exercises.push({
        exerciseId: "",
        notes: "",
        sets: [blankProgramSet()],
      });
    },
    removeExercise(day, index) {
      day.exercises.splice(index, 1);
    },
    addSet(exercise) {
      exercise.sets.push(blankProgramSet());
    },
    removeSet(exercise, index) {
      exercise.sets.splice(index, 1);
    },
    updateSetType(set) {
      if (set.type === "failure") set.rir = 0;
    },
    cancelDayEdit() {
      this.state.editingDayId = null;
      this.state.dayForm = null;
    },
    async saveProgramDay(day) {
      if (!this.state.dayForm) return;
      this.state.savingDay = true;
      this.state.error = "";
      this.state.message = "";
      try {
        const saved = await this.requestPrograms(
          `/api/programs/${this.state.selectedProgram.id}/days/${day.id}`,
          {
            method: "PUT",
            body: JSON.stringify(serializeProgramDay(this.state.dayForm)),
          },
        );
        day.type = saved.type;
        day.name = saved.name;
        day.exercises = saved.exercises;
        this.state.message = `Day ${day.slotNumber} saved.`;
        this.cancelDayEdit();
      } catch (error) {
        this.state.error = error.message;
        this.state.validationErrors = error.validationErrors;
      } finally {
        this.state.savingDay = false;
      }
    },
    async configureDeload() {
      this.state.savingDeload = true;
      this.state.error = "";
      this.state.message = "";
      try {
        const programName = this.state.selectedProgram.name;
        await this.requestPrograms(
          `/api/programs/${this.state.selectedProgram.id}/deload`,
          {
            method: "POST",
            body: JSON.stringify({
              days: this.state.deloadDays.map(serializeProgramDay),
            }),
          },
        );
        this.state.deloadDays = Array.from({ length: 7 }, blankProgramDay);
        this.state.activationConfirmed = false;
        await this.openProgram(this.state.selectedProgram);
        this.state.message = `Manual deload added to ${programName}.`;
        await this.loadPrograms();
      } catch (error) {
        this.state.error = error.message;
        this.state.validationErrors = error.validationErrors;
      } finally {
        this.state.savingDeload = false;
      }
    },
    async activateProgram() {
      this.state.activating = true;
      this.state.error = "";
      this.state.message = "";
      try {
        await this.requestPrograms(
          `/api/programs/${this.state.selectedProgram.id}/activate`,
          {
            method: "POST",
            body: JSON.stringify({ confirmed: true }),
          },
        );
        this.state.selectedProgram.status = "active";
        this.state.activationConfirmed = false;
        this.state.message = `${this.state.selectedProgram.name} is active.`;
        await this.loadPrograms();
      } catch (error) {
        this.state.error = error.message;
        this.state.validationErrors = error.validationErrors;
      } finally {
        this.state.activating = false;
      }
    },
    invalidateRequest() {
      this.state.confirmed = false;
      this.invalidateIdempotency();
    },
    invalidateIdempotency() {
      this.state.idempotencyKey = "";
      this.state.validationErrors = null;
      this.state.message = "";
    },
    invalidatePreview() {
      this.invalidateRequest();
      this.state.preview = null;
      this.state.mappings = {};
      this.state.skipRowNumbers = [];
      this.state.acknowledgedSkipRows = [];
    },
    async loadCsvFile(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      this.invalidatePreview();
      this.state.error = "";
      try {
        this.state.source = await file.text();
        if (!this.state.name) {
          this.state.name = file.name.replace(/\.csv$/i, "");
        }
      } catch {
        this.state.error = "The selected CSV file could not be read.";
      }
    },
    async previewCsv() {
      this.state.previewLoading = true;
      this.state.error = "";
      this.state.validationErrors = null;
      this.state.message = "";
      this.state.preview = null;
      this.state.confirmed = false;
      this.state.idempotencyKey = "";
      try {
        const preview = await this.requestPrograms(
          "/api/programs/import/preview",
          {
            method: "POST",
            body: JSON.stringify({ source: this.state.source }),
          },
        );
        this.state.preview = preview;
        this.state.mappings = Object.fromEntries(
          preview.mappings.map(({ sourceName, exerciseId }) => [
            sourceName,
            exerciseId ?? "",
          ]),
        );
        this.state.skipRowNumbers = [];
        this.state.acknowledgedSkipRows = [];
      } catch (error) {
        this.state.error = error.message;
      } finally {
        this.state.previewLoading = false;
      }
    },
    formatSet(set) {
      const type = set.type[0].toUpperCase() + set.type.slice(1);
      const range =
        set.repMax === null ? `${set.repMin}+` : `${set.repMin}-${set.repMax}`;
      return `${type} · ${range} reps · RIR ${set.rir}`;
    },
    dayWillBeEmpty(day) {
      return (
        day.type === "workout" &&
        !day.exercises.some(
          (exercise) => !this.state.skipRowNumbers.includes(exercise.rowNumber),
        )
      );
    },
    async importProgram() {
      if (!this.state.idempotencyKey) {
        this.state.idempotencyKey = makeIdempotencyKey();
      }
      this.state.saving = true;
      this.state.error = "";
      this.state.validationErrors = null;
      this.state.message = "";
      try {
        const program = await this.requestPrograms("/api/programs/import", {
          method: "POST",
          headers: { "Idempotency-Key": this.state.idempotencyKey },
          body: JSON.stringify({
            source: this.state.source,
            name: this.state.name,
            confirmed: this.state.confirmed,
            skipRowNumbers: this.state.skipRowNumbers,
            acknowledgedSkipRows: this.state.acknowledgedSkipRows,
            mappings: this.state.mappings,
          }),
        });
        this.state.message = `${program.name} saved as a draft.`;
        this.state.preview = null;
        this.state.source = "";
        this.state.confirmed = false;
        this.state.idempotencyKey = "";
        await this.loadPrograms();
      } catch (error) {
        this.state.error = error.message;
        this.state.validationErrors = error.validationErrors;
      } finally {
        this.state.saving = false;
      }
    },
    errorsForWeek(week) {
      return (this.state.validationErrors?.weekErrors ?? []).filter(
        (error) => error.cycle === week.cycle,
      );
    },
  },
};
</script>

<template>
  <section class="page-content programs-page">
    <header class="page-heading">
      <p class="eyebrow">Program setup</p>
      <h1>Programs</h1>
    </header>

    <p v-if="state.error" class="form-message form-message--error" role="alert">
      {{ state.error }}
    </p>
    <p v-if="state.message" class="form-message" role="status">
      {{ state.message }}
    </p>

    <div class="programs-layout">
      <section class="program-import" aria-labelledby="import-title">
        <div class="programs-section-heading">
          <h2 id="import-title">Import a CSV</h2>
          <span>New draft</span>
        </div>

        <label class="program-field" for="program-name">
          Program name
          <input
            id="program-name"
            v-model="state.name"
            maxlength="120"
            required
            @input="invalidateRequest"
          />
        </label>

        <label class="program-field" for="program-file">
          Choose a CSV file
          <input
            id="program-file"
            type="file"
            accept=".csv,text/csv"
            @change="loadCsvFile"
          />
        </label>

        <label class="program-field" for="program-csv">
          Or paste CSV data
          <textarea
            id="program-csv"
            v-model="state.source"
            rows="7"
            spellcheck="false"
            @input="invalidatePreview"
          />
        </label>

        <button
          class="button button--primary program-preview-button"
          type="button"
          :disabled="state.previewLoading || state.source.trim().length === 0"
          @click="previewCsv"
        >
          {{ state.previewLoading ? "Reading CSV…" : "Preview import" }}
        </button>
        <p class="programs-note">
          Import creates a separate draft. It does not replace programs, active
          workouts, or history.
        </p>

        <template v-if="state.preview">
          <div class="program-preview-heading">
            <h3>Preview</h3>
            <span>{{ state.preview.weeks.length }} weeks</span>
          </div>

          <ul
            v-if="structuralAndWeekErrors.length"
            class="program-error-list"
            role="alert"
          >
            <li
              v-for="error in structuralAndWeekErrors"
              :key="`${error.code}-${error.rowNumber ?? error.cycle}`"
            >
              {{ error.message }}
            </li>
          </ul>

          <fieldset v-if="rowErrorGroups.length" class="program-decisions">
            <legend>Rows to skip</legend>
            <label
              v-for="group in rowErrorGroups"
              :key="group.rowNumber"
              class="program-choice"
            >
              <input
                v-model="state.skipRowNumbers"
                type="checkbox"
                :value="group.rowNumber"
                @change="invalidateRequest"
              />
              <span>
                <strong>Skip row {{ group.rowNumber }}</strong>
                <span v-for="error in group.errors" :key="error.code">
                  {{ error.message }}
                </span>
              </span>
            </label>
          </fieldset>

          <fieldset
            v-if="state.preview.sourceSkipMarkers.length"
            class="program-decisions"
          >
            <legend>Source skip markers</legend>
            <label
              v-for="marker in state.preview.sourceSkipMarkers"
              :key="marker.rowNumber"
              class="program-choice"
            >
              <input
                v-model="state.acknowledgedSkipRows"
                type="checkbox"
                :value="marker.rowNumber"
                @change="invalidateRequest"
              />
              <span>Ignore source marker on row {{ marker.rowNumber }}</span>
            </label>
          </fieldset>

          <fieldset
            v-if="state.preview.mappings.length"
            class="program-decisions"
          >
            <legend>Exercise catalog mappings</legend>
            <label
              v-for="mapping in state.preview.mappings"
              :key="mapping.sourceName"
              class="program-mapping"
            >
              <span>
                {{ mapping.sourceName }}
                <small>{{
                  mapping.exactMatch
                    ? "Exact catalog match"
                    : "Choose a catalog exercise"
                }}</small>
              </span>
              <select
                v-model="state.mappings[mapping.sourceName]"
                :aria-label="`${mapping.sourceName} mapping`"
                @change="invalidateRequest"
              >
                <option value="">Choose an exercise</option>
                <option
                  v-for="exercise in state.preview.catalogExercises"
                  :key="exercise.id"
                  :value="exercise.id"
                >
                  {{ exercise.name }}
                </option>
              </select>
            </label>
          </fieldset>

          <div class="program-weeks">
            <section
              v-for="(week, weekIndex) in state.preview.weeks"
              :key="week.cycle"
              class="program-week"
            >
              <header>
                <h3>Week {{ weekIndex + 1 }}</h3>
                <span>Cycle {{ week.cycle }}</span>
              </header>
              <ul class="program-days">
                <li
                  v-for="(day, dayIndex) in week.days"
                  :key="`${week.cycle}-${dayIndex}`"
                  class="program-day"
                >
                  <h4>Day {{ dayIndex + 1 }} · {{ day.name }}</h4>
                  <p v-if="day.type === 'rest'" class="program-rest">Rest</p>
                  <p v-else-if="dayWillBeEmpty(day)" class="program-error-list">
                    Skipping these rows would leave this workout empty.
                  </p>
                  <ul
                    v-else-if="day.exercises.length"
                    class="program-exercises"
                  >
                    <li
                      v-for="exercise in day.exercises"
                      :key="`${exercise.rowNumber}-${exercise.name}`"
                      :class="{
                        'program-exercise--skipped':
                          state.skipRowNumbers.includes(exercise.rowNumber),
                      }"
                    >
                      <strong>{{ exercise.name }}</strong>
                      <span
                        v-if="state.skipRowNumbers.includes(exercise.rowNumber)"
                      >
                        Will be skipped
                      </span>
                      <ul v-else class="program-sets">
                        <li
                          v-for="(set, setIndex) in exercise.sets"
                          :key="setIndex"
                        >
                          {{ formatSet(set) }}
                        </li>
                      </ul>
                    </li>
                  </ul>
                  <p v-else class="program-rest">
                    No exercises in this workout
                  </p>
                  <ul
                    v-if="errorsForWeek(week).length"
                    class="program-error-list"
                  >
                    <li v-for="error in errorsForWeek(week)" :key="error.code">
                      {{ error.message }}
                    </li>
                  </ul>
                </li>
              </ul>
            </section>
          </div>

          <label class="program-confirm">
            <input
              v-model="state.confirmed"
              type="checkbox"
              @change="invalidateIdempotency"
            />
            <span>
              I confirm this preview, its skipped rows, and the selected
              exercise mappings.
            </span>
          </label>
          <button
            class="button button--primary program-create-button"
            type="button"
            :disabled="!canImport"
            @click="importProgram"
          >
            {{ state.saving ? "Saving draft…" : "Create draft program" }}
          </button>
        </template>
      </section>

      <section class="saved-programs" aria-labelledby="saved-programs-title">
        <div class="programs-section-heading">
          <h2 id="saved-programs-title">Saved programs</h2>
          <span>{{ state.programs.length }}</span>
        </div>
        <p v-if="state.loadingPrograms" role="status">Loading programs…</p>
        <p v-else-if="state.programs.length === 0" class="programs-note">
          Imported drafts will appear here.
        </p>
        <ul v-else class="saved-program-list">
          <li v-for="program in state.programs" :key="program.id">
            <div class="saved-program-meta">
              <strong>{{ program.name }}</strong>
              <span>
                {{ program.weekCount }}
                {{ program.weekCount === 1 ? "week" : "weeks" }} ·
                {{ program.status === "active" ? "Active" : "Draft" }}
              </span>
            </div>
            <button
              class="text-button"
              type="button"
              :aria-label="`Open ${program.name}`"
              @click="openProgram(program)"
            >
              Open
            </button>
          </li>
        </ul>

        <section
          v-if="state.selectedProgram"
          class="program-detail"
          aria-labelledby="selected-program-title"
        >
          <header class="program-detail-heading">
            <div>
              <h3 id="selected-program-title">
                {{ state.selectedProgram.name }}
              </h3>
              <span>
                {{
                  state.selectedProgram.status === "active" ? "Active" : "Draft"
                }}
              </span>
            </div>
            <button class="text-button" type="button" @click="closeProgram">
              Close
            </button>
          </header>

          <p v-if="state.programLoading" role="status">
            Loading program details…
          </p>
          <template v-else>
            <p class="programs-note">
              Only unresolved future days can be changed. Session prescriptions
              stay as recorded.
            </p>

            <div class="program-weeks">
              <details
                v-for="week in state.selectedProgram.weeks"
                :key="week.id"
                class="program-week"
              >
                <summary class="program-week__summary">
                  <h3>Week {{ week.weekNumber }}</h3>
                  <span>{{
                    week.type === "deload" ? "Manual deload" : "Training"
                  }}</span>
                </summary>
                <ol class="program-days">
                  <li
                    v-for="day in week.days"
                    :key="day.id"
                    class="program-day"
                  >
                    <div class="program-day-heading">
                      <h4>Day {{ day.slotNumber }} · {{ day.name }}</h4>
                      <button
                        v-if="state.editingDayId !== day.id"
                        class="text-button"
                        type="button"
                        :aria-label="`Edit Day ${day.slotNumber}`"
                        @click="beginEditDay(day)"
                      >
                        Edit
                      </button>
                    </div>
                    <template v-if="state.editingDayId === day.id">
                      <form
                        class="program-day-editor"
                        @submit.prevent="saveProgramDay(day)"
                      >
                        <label class="program-field">
                          Day type
                          <select
                            v-model="state.dayForm.type"
                            @change="resetDayType(state.dayForm)"
                          >
                            <option value="workout">Workout</option>
                            <option value="rest">Rest</option>
                          </select>
                        </label>
                        <label class="program-field">
                          Day name
                          <input v-model="state.dayForm.name" maxlength="120" />
                        </label>
                        <template v-if="state.dayForm.type === 'workout'">
                          <fieldset
                            v-for="(exercise, exerciseIndex) in state.dayForm
                              .exercises"
                            :key="exerciseIndex"
                            class="program-exercise-editor"
                          >
                            <legend>Exercise {{ exerciseIndex + 1 }}</legend>
                            <label class="program-field">
                              Exercise
                              <select
                                v-model="exercise.exerciseId"
                                :aria-label="`Day exercise ${exerciseIndex + 1}`"
                                required
                              >
                                <option value="">Choose an exercise</option>
                                <option
                                  v-for="entry in state.catalogExercises"
                                  :key="entry.id"
                                  :value="entry.id"
                                >
                                  {{ entry.name }}
                                </option>
                              </select>
                            </label>
                            <label class="program-field">
                              Notes
                              <input
                                v-model="exercise.notes"
                                maxlength="2000"
                              />
                            </label>
                            <fieldset
                              v-for="(set, setIndex) in exercise.sets"
                              :key="setIndex"
                              class="program-set-editor"
                            >
                              <legend>Set {{ setIndex + 1 }}</legend>
                              <label class="program-field">
                                Set type
                                <select
                                  v-model="set.type"
                                  :aria-label="`Set type, set ${setIndex + 1}`"
                                  @change="updateSetType(set)"
                                >
                                  <option value="standard">Standard</option>
                                  <option value="warmup">Warmup</option>
                                  <option value="failure">Failure</option>
                                </select>
                              </label>
                              <label class="program-field">
                                Minimum reps
                                <input
                                  v-model.number="set.repMin"
                                  :aria-label="`Rep minimum, set ${setIndex + 1}`"
                                  type="number"
                                  min="1"
                                  step="1"
                                  required
                                />
                              </label>
                              <label class="program-field">
                                Maximum reps
                                <input
                                  v-model.number="set.repMax"
                                  :aria-label="`Rep maximum, set ${setIndex + 1}`"
                                  type="number"
                                  min="1"
                                  step="1"
                                />
                              </label>
                              <label class="program-field">
                                Target RIR
                                <input
                                  v-model.number="set.rir"
                                  :aria-label="`Target RIR, set ${setIndex + 1}`"
                                  type="number"
                                  min="0"
                                  max="10"
                                  step="1"
                                  :disabled="set.type === 'failure'"
                                  required
                                />
                              </label>
                              <button
                                class="text-button"
                                type="button"
                                @click="removeSet(exercise, setIndex)"
                              >
                                Remove set
                              </button>
                            </fieldset>
                            <button
                              class="text-button"
                              type="button"
                              @click="addSet(exercise)"
                            >
                              Add set
                            </button>
                            <button
                              class="text-button"
                              type="button"
                              @click="
                                removeExercise(state.dayForm, exerciseIndex)
                              "
                            >
                              Remove exercise
                            </button>
                          </fieldset>
                          <button
                            class="text-button"
                            type="button"
                            @click="addExercise(state.dayForm)"
                          >
                            Add exercise
                          </button>
                        </template>
                        <div class="program-editor-actions">
                          <button
                            class="button button--primary"
                            type="submit"
                            :disabled="state.savingDay"
                          >
                            {{ state.savingDay ? "Saving…" : "Save day" }}
                          </button>
                          <button
                            class="text-button"
                            type="button"
                            @click="cancelDayEdit"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    </template>
                    <template v-else>
                      <p v-if="day.type === 'rest'" class="program-rest">
                        Rest
                      </p>
                      <ul v-else class="program-exercises">
                        <li
                          v-for="exercise in day.exercises"
                          :key="exercise.id"
                        >
                          <strong>{{ exercise.name }}</strong>
                          <ul class="program-sets">
                            <li v-for="set in exercise.sets" :key="set.id">
                              {{ formatSet(set) }}
                            </li>
                          </ul>
                        </li>
                      </ul>
                    </template>
                  </li>
                </ol>
              </details>
            </div>

            <section
              v-if="!hasDeload && state.selectedProgram.status !== 'active'"
              class="manual-deload"
              aria-labelledby="manual-deload-title"
            >
              <div class="program-preview-heading">
                <h3 id="manual-deload-title">Manual deload</h3>
                <span>7 slots</span>
              </div>
              <p class="programs-note">
                Exercise structure is copied from training Week
                {{ state.deloadSourceWeekNumber }}. Sets are left blank for you
                to prescribe.
              </p>
              <ol class="program-days">
                <li
                  v-for="(day, dayIndex) in state.deloadDays"
                  :key="dayIndex"
                  class="program-day"
                >
                  <h4>Day {{ dayIndex + 1 }}</h4>
                  <label class="program-field">
                    Day type
                    <select
                      v-model="day.type"
                      :aria-label="`Deload day ${dayIndex + 1} type`"
                      @change="resetDayType(day)"
                    >
                      <option value="workout">Workout</option>
                      <option value="rest">Rest</option>
                    </select>
                  </label>
                  <label class="program-field">
                    Day name
                    <input v-model="day.name" maxlength="120" />
                  </label>
                  <template v-if="day.type === 'workout'">
                    <fieldset
                      v-for="(exercise, exerciseIndex) in day.exercises"
                      :key="exerciseIndex"
                      class="program-exercise-editor"
                    >
                      <legend>Exercise {{ exerciseIndex + 1 }}</legend>
                      <label class="program-field">
                        Exercise
                        <select
                          v-model="exercise.exerciseId"
                          :aria-label="`Deload day ${dayIndex + 1} exercise ${exerciseIndex + 1}`"
                          required
                        >
                          <option value="">Choose an exercise</option>
                          <option
                            v-for="entry in state.catalogExercises"
                            :key="entry.id"
                            :value="entry.id"
                          >
                            {{ entry.name }}
                          </option>
                        </select>
                      </label>
                      <label class="program-field">
                        Notes
                        <input v-model="exercise.notes" maxlength="2000" />
                      </label>
                      <fieldset
                        v-for="(set, setIndex) in exercise.sets"
                        :key="setIndex"
                        class="program-set-editor"
                      >
                        <legend>Set {{ setIndex + 1 }}</legend>
                        <label class="program-field">
                          Set type
                          <select
                            v-model="set.type"
                            :aria-label="`Deload day ${dayIndex + 1} set ${setIndex + 1} type`"
                            @change="updateSetType(set)"
                          >
                            <option value="standard">Standard</option>
                            <option value="warmup">Warmup</option>
                            <option value="failure">Failure</option>
                          </select>
                        </label>
                        <label class="program-field">
                          Minimum reps
                          <input
                            v-model.number="set.repMin"
                            :aria-label="`Deload day ${dayIndex + 1} minimum reps, set ${setIndex + 1}`"
                            type="number"
                            min="1"
                            step="1"
                            required
                          />
                        </label>
                        <label class="program-field">
                          Maximum reps
                          <input
                            v-model.number="set.repMax"
                            :aria-label="`Deload day ${dayIndex + 1} maximum reps, set ${setIndex + 1}`"
                            type="number"
                            min="1"
                            step="1"
                          />
                        </label>
                        <label class="program-field">
                          Target RIR
                          <input
                            v-model.number="set.rir"
                            :aria-label="`Deload day ${dayIndex + 1} target RIR, set ${setIndex + 1}`"
                            type="number"
                            min="0"
                            max="10"
                            step="1"
                            :disabled="set.type === 'failure'"
                            required
                          />
                        </label>
                        <button
                          class="text-button"
                          type="button"
                          @click="removeSet(exercise, setIndex)"
                        >
                          Remove set
                        </button>
                      </fieldset>
                      <button
                        class="text-button"
                        type="button"
                        @click="addSet(exercise)"
                      >
                        Add set
                      </button>
                      <button
                        class="text-button"
                        type="button"
                        @click="removeExercise(day, exerciseIndex)"
                      >
                        Remove exercise
                      </button>
                    </fieldset>
                    <button
                      class="text-button"
                      type="button"
                      :aria-label="`Add exercise to deload day ${dayIndex + 1}`"
                      @click="addExercise(day)"
                    >
                      Add exercise
                    </button>
                  </template>
                </li>
              </ol>
              <button
                class="button button--primary"
                type="button"
                :disabled="!canConfigureDeload"
                @click="configureDeload"
              >
                {{
                  state.savingDeload
                    ? "Saving deload…"
                    : "Configure manual deload"
                }}
              </button>
            </section>

            <section
              v-if="state.selectedProgram.status !== 'active'"
              class="program-activation"
              aria-label="Program activation"
            >
              <p v-if="!hasDeload" class="programs-note">
                Add the manual deload before activation.
              </p>
              <template v-else>
                <p v-if="!canActivate" class="programs-note">
                  Activation requires seven valid slots in every week and at
                  least one mapped workout with complete sets per week.
                </p>
                <label class="program-confirm">
                  <input
                    v-model="state.activationConfirmed"
                    type="checkbox"
                    :disabled="!programReadyToActivate"
                  />
                  <span>
                    I confirm this program and its appended deload are ready to
                    activate.
                  </span>
                </label>
                <button
                  class="button button--primary"
                  type="button"
                  :disabled="!canActivate"
                  @click="activateProgram"
                >
                  {{ state.activating ? "Activating…" : "Activate program" }}
                </button>
              </template>
            </section>
          </template>
        </section>
      </section>
    </div>
  </section>
</template>
