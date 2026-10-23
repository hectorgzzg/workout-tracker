<script>
export default {
  data() {
    return {
      state: {
        loading: true,
        error: "",
        saveError: "",
        saved: false,
        saving: false,
        session: null,
        inputs: {},
        pendingSave: null,
      },
    };
  },
  mounted() {
    this.loadSession();
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
    initializeInputs(session) {
      const inputs = {};
      for (const exercise of session.exercises ?? []) {
        for (const set of exercise.sets ?? []) {
          inputs[set.id] = {
            load: this.inputValue(set.actualLoadKg),
            reps: this.inputValue(set.actualReps),
            rir: this.inputValue(set.actualRir),
          };
        }
      }
      this.state.inputs = inputs;
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
        if (session) this.initializeInputs(session);
        this.state.pendingSave = null;
      } catch (error) {
        this.state.error = error.message;
      } finally {
        this.state.loading = false;
      }
    },
    updateInput(setId, field, value) {
      this.state.inputs[setId][field] = value;
      this.state.saved = false;
    },
    createPayload() {
      const sets = [];
      for (const exercise of this.state.session.exercises ?? []) {
        for (const set of exercise.sets ?? []) {
          const values = this.state.inputs[set.id] ?? {};
          const loadText = values.load.trim();
          const repsText = values.reps.trim();
          const rirText = values.rir.trim();
          const actualLoadKg = loadText === "" ? null : Number(loadText);
          const actualReps = repsText === "" ? null : Number(repsText);
          const actualRir = rirText === "" ? null : Number(rirText);
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
          sets.push({ id: set.id, actualLoadKg, actualReps, actualRir });
        }
      }
      return { version: this.state.session.version, sets };
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
        this.state.pendingSave = null;
        this.state.saved = true;
      } catch (error) {
        this.state.saveError = error.message;
      } finally {
        this.state.saving = false;
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
      <header class="page-heading">
        <p class="eyebrow">Online draft · {{ state.session.status }}</p>
        <h1>Workout tracker</h1>
        <p class="muted-copy">
          Draft started {{ formatStartDate(state.session.startedLocalDate) }} ·
          {{ state.session.startedTimezone }}
        </p>
      </header>

      <section
        v-for="exercise in state.session.exercises"
        :key="exercise.id"
        class="tracker-exercise"
        :aria-labelledby="`exercise-${exercise.id}`"
      >
        <h2 :id="`exercise-${exercise.id}`">{{ exercise.name }}</h2>
        <p v-if="exercise.prescription.notes" class="muted-copy">
          {{ exercise.prescription.notes }}
        </p>
        <fieldset
          v-for="set in exercise.sets"
          :key="set.id"
          class="tracker-set"
        >
          <legend>
            Set {{ set.setNumber }} · {{ setTypeLabel(set.type) }} ·
            {{ repRange(set.prescription) }} · target RIR
            {{ set.prescription.targetRir }}
          </legend>
          <div class="tracker-set__inputs">
            <label>
              Set {{ set.setNumber }} actual load (kg)
              <input
                type="number"
                min="0"
                step="0.001"
                :value="state.inputs[set.id].load"
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
                @input="updateInput(set.id, 'rir', $event.target.value)"
              />
            </label>
          </div>
        </fieldset>
      </section>

      <footer class="tracker-actions">
        <p
          v-if="state.saveError"
          class="form-message form-message--error"
          role="alert"
        >
          {{ state.saveError }}
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
