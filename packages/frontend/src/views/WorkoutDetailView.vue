<script>
export default {
  data() {
    return {
      state: {
        loading: true,
        error: "",
        startError: "",
        starting: false,
        run: null,
        day: null,
        catalog: [],
        activeSession: null,
        pendingStart: null,
      },
    };
  },
  computed: {
    targetMuscles() {
      const catalogById = new Map(
        this.state.catalog.map((exercise) => [exercise.id, exercise]),
      );
      return [
        ...new Set(
          (this.state.day?.exercises ?? []).flatMap(
            (exercise) =>
              catalogById.get(exercise.exerciseId)?.muscles?.primary ?? [],
          ),
        ),
      ];
    },
    startLabel() {
      if (this.state.activeSession) {
        const runDay = this.state.run?.week?.days?.find(
          (day) => day.templateDayId === this.state.day?.id,
        );
        return runDay?.id === this.state.activeSession.runDayId
          ? "Resume Workout"
          : "Resume Active Workout";
      }
      return "Start Workout";
    },
  },
  mounted() {
    this.loadWorkout();
  },
  methods: {
    async request(path, options = {}) {
      let response;
      const apiOrigin = globalThis.__WORKOUT_TRACKER_API_ORIGIN__ ?? "";
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
    async loadWorkout() {
      this.state.loading = true;
      this.state.error = "";
      try {
        const [run, activeSession] = await Promise.all([
          this.request("/api/program-runs/current"),
          this.request("/api/workout-sessions/active"),
        ]);
        this.state.activeSession = activeSession;
        if (!run) {
          this.state.day = null;
          return;
        }
        const [program, catalog] = await Promise.all([
          this.request(`/api/programs/${run.templateId}`),
          this.request("/api/catalog/exercises"),
        ]);
        const dayId = this.$route.params.workoutId;
        const day = program.weeks
          .flatMap((week) => week.days)
          .find((candidate) => candidate.id === dayId);
        this.state.run = run;
        this.state.day = day ?? null;
        this.state.catalog = catalog;
      } catch (error) {
        this.state.error = error.message;
      } finally {
        this.state.loading = false;
      }
    },
    async startWorkout() {
      const activeSession = this.state.activeSession;
      if (activeSession) {
        await this.$router.push(`/tracker/${activeSession.id}`);
        return;
      }
      const runDay = this.state.run?.week?.days?.find(
        (day) => day.templateDayId === this.state.day?.id,
      );
      if (!runDay || !this.state.run?.id) {
        this.state.startError = "This workout is no longer available to start.";
        return;
      }
      const payload = { runId: this.state.run.id, runDayId: runDay.id };
      if (
        !this.state.pendingStart ||
        this.state.pendingStart.payload.runId !== payload.runId ||
        this.state.pendingStart.payload.runDayId !== payload.runDayId
      ) {
        this.state.pendingStart = {
          payload,
          key:
            globalThis.crypto?.randomUUID?.() ??
            `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        };
      }
      this.state.starting = true;
      this.state.startError = "";
      try {
        const session = await this.request("/api/workout-sessions/start", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": this.state.pendingStart.key,
          },
          body: JSON.stringify(this.state.pendingStart.payload),
        });
        await this.$router.push(`/tracker/${session.id}`);
      } catch (error) {
        this.state.startError = error.message;
      } finally {
        this.state.starting = false;
      }
    },
    muscleRoles(exerciseId) {
      const exercise = this.state.catalog.find(
        (entry) => entry.id === exerciseId,
      );
      return ["primary", "secondary", "tertiary"].flatMap((role) =>
        (exercise?.muscles?.[role] ?? []).map((muscle) => ({ role, muscle })),
      );
    },
    missingMuscles(exercise) {
      return this.muscleRoles(exercise.exerciseId).length === 0;
    },
    infoPath(exercise) {
      return `/exercises/${exercise.exerciseId}/info`;
    },
    infoLinkAttrs(exercise) {
      return {
        to: this.infoPath(exercise),
        "aria-label": `${exercise.name} info`,
      };
    },
    setLabel(set) {
      const type =
        set.type === "warmup"
          ? "Warmup"
          : set.type === "failure"
            ? "Failure"
            : "Standard";
      const range =
        set.repMax === null ? `${set.repMin}+` : `${set.repMin}-${set.repMax}`;
      return `${type} · ${range} reps · RIR ${set.rir}`;
    },
  },
};
</script>

<template>
  <section class="page-content workout-detail-page">
    <p v-if="state.loading" class="home-loading" role="status">
      Loading workout…
    </p>
    <p
      v-else-if="state.error"
      class="form-message form-message--error"
      role="alert"
    >
      {{ state.error }}
      <button class="text-button" type="button" @click="loadWorkout">
        Retry
      </button>
    </p>
    <div v-else-if="!state.day" class="empty-state">
      <h1>Workout unavailable</h1>
      <p>This workout is not part of your current program.</p>
      <RouterLink to="/" class="text-button">Return home</RouterLink>
    </div>
    <template v-else>
      <header class="page-heading">
        <p class="eyebrow">
          Week {{ state.run.currentWeekNumber }} · Slot
          {{ state.day.slotNumber }}
        </p>
        <h1>{{ state.day.name }}</h1>
      </header>

      <section class="workout-targets" aria-labelledby="target-muscles-title">
        <h2 id="target-muscles-title">Target muscles</h2>
        <p v-if="targetMuscles.length">{{ targetMuscles.join(" · ") }}</p>
        <p v-else class="muted-copy">No primary muscle targets are listed.</p>
      </section>

      <section
        class="workout-exercises"
        aria-labelledby="workout-exercises-title"
      >
        <h2 id="workout-exercises-title">Exercises</h2>
        <ol class="workout-exercise-list">
          <li
            v-for="exercise in state.day.exercises"
            :key="exercise.id"
            class="workout-exercise"
          >
            <header class="workout-exercise__heading">
              <div>
                <h3>{{ exercise.name }}</h3>
                <p v-if="exercise.notes" class="muted-copy">
                  {{ exercise.notes }}
                </p>
              </div>
              <RouterLink v-bind="infoLinkAttrs(exercise)">Info</RouterLink>
            </header>
            <ul class="workout-prescriptions">
              <li v-for="set in exercise.sets" :key="set.id ?? set.setNumber">
                {{ setLabel(set) }}
              </li>
            </ul>
            <div
              class="muscle-pills muscle-pills--scroll"
              :aria-label="`${exercise.name} target muscles`"
              tabindex="0"
            >
              <span
                v-for="(item, index) in muscleRoles(exercise.exerciseId)"
                :key="`${item.role}-${item.muscle}-${index}`"
                class="muscle-pill"
                :class="`muscle-pill--${item.role}`"
              >
                {{ item.muscle }} <small>{{ item.role }}</small>
              </span>
              <span v-if="missingMuscles(exercise)">Muscles not listed</span>
            </div>
          </li>
        </ol>
      </section>

      <footer class="workout-detail__actions">
        <p
          v-if="state.activeSession && startLabel === 'Resume Active Workout'"
          class="form-message"
        >
          Another workout draft is active. Resume it before starting this slot.
        </p>
        <p
          v-if="state.startError"
          class="form-message form-message--error"
          role="alert"
        >
          {{ state.startError }}
        </p>
        <button
          class="button button--primary"
          type="button"
          :disabled="state.starting"
          @click="startWorkout"
        >
          {{ state.starting ? "Starting…" : startLabel }}
        </button>
        <button
          v-if="state.startError"
          class="text-button"
          type="button"
          :disabled="state.starting"
          @click="startWorkout"
        >
          Retry Start
        </button>
      </footer>
    </template>
  </section>
</template>
