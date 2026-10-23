<script>
export default {
  data() {
    return {
      state: {
        loading: true,
        error: "",
        run: null,
        day: null,
        catalog: [],
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
      const currentDay = this.state.run?.week?.days?.find(
        (day) => day.templateDayId === this.state.day?.id,
      );
      return currentDay?.status === "in_progress"
        ? "Resume Workout"
        : "Start Workout";
    },
  },
  mounted() {
    this.loadWorkout();
  },
  methods: {
    async request(path) {
      let response;
      const apiOrigin = globalThis.__WORKOUT_TRACKER_API_ORIGIN__ ?? "";
      try {
        response = await fetch(`${apiOrigin}${path}`, {
          credentials: "include",
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
        const run = await this.request("/api/program-runs/current");
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
        <RouterLink to="/tracker" class="button">{{ startLabel }}</RouterLink>
      </footer>
    </template>
  </section>
</template>
