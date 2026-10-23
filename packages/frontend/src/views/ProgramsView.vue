<script>
import { reactive } from "vue";

function makeIdempotencyKey() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export default {
  data() {
    return {
      state: reactive({
        programs: [],
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
            <strong>{{ program.name }}</strong>
            <span>{{ program.weekCount }} weeks</span>
          </li>
        </ul>
      </section>
    </div>
  </section>
</template>
