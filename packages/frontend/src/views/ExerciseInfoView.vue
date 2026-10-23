<script>
export default {
  data() {
    return {
      state: { loading: true, error: "", exercise: null },
    };
  },
  mounted() {
    this.loadExercise();
  },
  methods: {
    async loadExercise() {
      this.state.loading = true;
      this.state.error = "";
      try {
        const apiOrigin = globalThis.__WORKOUT_TRACKER_API_ORIGIN__ ?? "";
        let response;
        try {
          response = await fetch(`${apiOrigin}/api/catalog/exercises`, {
            credentials: "include",
          });
        } catch {
          throw new Error(
            "The exercise catalog could not be reached. Try again.",
          );
        }
        const exercises = await response.json().catch(() => []);
        if (!response.ok) {
          throw new Error(
            exercises.error ?? "The exercise information could not be loaded.",
          );
        }
        this.state.exercise =
          exercises.find(
            (exercise) => exercise.id === this.$route.params.exerciseId,
          ) ?? null;
      } catch (error) {
        this.state.error = error.message;
      } finally {
        this.state.loading = false;
      }
    },
  },
};
</script>

<template>
  <section class="page-content exercise-info-page">
    <p v-if="state.loading" class="home-loading" role="status">
      Loading exercise information…
    </p>
    <p
      v-else-if="state.error"
      class="form-message form-message--error"
      role="alert"
    >
      {{ state.error }}
      <button class="text-button" type="button" @click="loadExercise">
        Retry
      </button>
    </p>
    <div v-else-if="!state.exercise" class="empty-state">
      <h1>Exercise not found</h1>
      <p>This exercise is not available in the shared catalog.</p>
    </div>
    <template v-else>
      <header class="page-heading">
        <p class="eyebrow">Exercise info</p>
        <h1>{{ state.exercise.name }}</h1>
      </header>
      <figure v-if="state.exercise.image?.url" class="exercise-info__figure">
        <img
          :src="state.exercise.image.url"
          :alt="state.exercise.image.altText || state.exercise.name"
        />
        <figcaption
          v-if="state.exercise.image.credit || state.exercise.image.license"
        >
          <span>{{ state.exercise.image.credit }}</span>
          <span
            v-if="state.exercise.image.credit && state.exercise.image.license"
          >
            ·
          </span>
          <span>{{ state.exercise.image.license }}</span>
        </figcaption>
      </figure>
      <p v-else class="muted-copy exercise-info__missing-image">
        Image not supplied.
      </p>
      <dl class="exercise-muscle-roles">
        <div v-for="role in ['primary', 'secondary', 'tertiary']" :key="role">
          <dt>{{ role[0].toUpperCase() + role.slice(1) }}</dt>
          <dd>
            {{ state.exercise.muscles?.[role]?.join(", ") || "Not specified" }}
          </dd>
        </div>
      </dl>
    </template>
  </section>
</template>
