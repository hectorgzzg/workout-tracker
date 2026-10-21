<script>
import { reactive } from "vue";

function blankEntry() {
  return {
    name: "",
    equipment: "",
    imageUrl: "",
    imageAltText: "",
    imageCredit: "",
    imageLicense: "",
    primaryMuscles: "",
    secondaryMuscles: "",
    tertiaryMuscles: "",
    loadType: "external",
    restCategory: "",
    dumbbellCount: "",
    sideCount: "",
    bodyweightFactor: "",
    assistanceRatio: "",
  };
}

export default {
  setup() {
    return {
      muscleRoles: ["primary", "secondary", "tertiary"],
      catalogState: reactive({
        entries: [],
        loading: true,
        saving: false,
        selectedId: null,
        error: "",
        message: "",
        form: blankEntry(),
      }),
    };
  },
  mounted() {
    this.loadEntries();
  },
  methods: {
    async requestCatalog(path, options = {}) {
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
        throw new Error("The catalog service could not be reached. Try again.");
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload.error ?? "The catalog request could not be completed.",
        );
      }
      return payload;
    },
    async loadEntries() {
      this.catalogState.loading = true;
      this.catalogState.error = "";
      try {
        this.catalogState.entries = await this.requestCatalog(
          "/api/catalog/exercises",
        );
      } catch (loadError) {
        this.catalogState.error = loadError.message;
      } finally {
        this.catalogState.loading = false;
      }
    },
    splitMuscles(value) {
      return value
        .split(",")
        .map((muscle) => muscle.trim())
        .filter(Boolean);
    },
    numericOrNull(value) {
      return value === "" ? null : Number(value);
    },
    entryPayload() {
      const form = this.catalogState.form;
      const imageUrl = form.imageUrl.trim();
      return {
        name: form.name,
        equipment: form.equipment,
        image: imageUrl
          ? {
              url: imageUrl,
              altText: form.imageAltText,
              credit: form.imageCredit,
              license: form.imageLicense,
            }
          : null,
        muscles: {
          primary: this.splitMuscles(form.primaryMuscles),
          secondary: this.splitMuscles(form.secondaryMuscles),
          tertiary: this.splitMuscles(form.tertiaryMuscles),
        },
        loadType: form.loadType,
        restCategory: form.restCategory || null,
        dumbbellCount: this.numericOrNull(form.dumbbellCount),
        sideCount: this.numericOrNull(form.sideCount),
        bodyweightFactor: this.numericOrNull(form.bodyweightFactor),
        assistanceRatio: this.numericOrNull(form.assistanceRatio),
      };
    },
    async saveEntry() {
      this.catalogState.saving = true;
      this.catalogState.error = "";
      this.catalogState.message = "";
      const id = this.catalogState.selectedId;
      try {
        const saved = await this.requestCatalog(
          id
            ? `/api/admin/catalog/exercises/${id}`
            : "/api/admin/catalog/exercises",
          {
            method: id ? "PATCH" : "POST",
            body: JSON.stringify(this.entryPayload()),
          },
        );
        this.catalogState.entries = [
          saved,
          ...this.catalogState.entries.filter((entry) => entry.id !== saved.id),
        ].sort((left, right) => left.name.localeCompare(right.name));
        this.catalogState.message = id
          ? "Exercise updated."
          : "Exercise added.";
        this.cancelEdit();
      } catch (saveError) {
        this.catalogState.error = saveError.message;
      } finally {
        this.catalogState.saving = false;
      }
    },
    editEntry(entry) {
      this.catalogState.selectedId = entry.id;
      this.catalogState.form = {
        name: entry.name,
        equipment: entry.equipment,
        imageUrl: entry.image?.url ?? "",
        imageAltText: entry.image?.altText ?? "",
        imageCredit: entry.image?.credit ?? "",
        imageLicense: entry.image?.license ?? "",
        primaryMuscles: entry.muscles.primary.join(", "),
        secondaryMuscles: entry.muscles.secondary.join(", "),
        tertiaryMuscles: entry.muscles.tertiary.join(", "),
        loadType: entry.loadType,
        restCategory: entry.restCategory ?? "",
        dumbbellCount: entry.dumbbellCount?.toString() ?? "",
        sideCount: entry.sideCount?.toString() ?? "",
        bodyweightFactor: entry.bodyweightFactor?.toString() ?? "",
        assistanceRatio: entry.assistanceRatio?.toString() ?? "",
      };
      this.catalogState.message = "";
      this.catalogState.error = "";
    },
    cancelEdit() {
      this.catalogState.selectedId = null;
      this.catalogState.form = blankEntry();
    },
  },
};
</script>

<template>
  <section class="page-content catalog-page">
    <header class="page-heading">
      <p class="eyebrow">Administration</p>
      <h1>Exercise catalog</h1>
    </header>

    <p
      v-if="catalogState.error"
      class="form-message form-message--error"
      role="alert"
    >
      {{ catalogState.error }}
      <button
        v-if="!catalogState.loading"
        class="text-button"
        type="button"
        @click="loadEntries"
      >
        Retry
      </button>
    </p>
    <p v-if="catalogState.message" class="form-message" role="status">
      {{ catalogState.message }}
    </p>

    <div class="catalog-layout">
      <section class="catalog-list" aria-labelledby="catalog-list-title">
        <div class="catalog-section-heading">
          <h2 id="catalog-list-title">Shared exercises</h2>
          <span>{{ catalogState.entries.length }}</span>
        </div>
        <p v-if="catalogState.loading" role="status">Loading catalog…</p>
        <p v-else-if="catalogState.entries.length === 0">
          No exercises have been added.
        </p>
        <ul v-else class="catalog-items">
          <li v-for="entry in catalogState.entries" :key="entry.id">
            <article class="catalog-item">
              <img
                v-if="entry.image?.url"
                class="catalog-item__image"
                :src="entry.image.url"
                :alt="entry.image.altText"
              />
              <div class="catalog-item__content">
                <h3>{{ entry.name }}</h3>
                <p class="catalog-item__meta">
                  {{ entry.equipment }} · {{ entry.loadType }}
                  <span v-if="entry.restCategory">
                    · {{ entry.restCategory.replaceAll("_", " ") }}</span
                  >
                </p>
                <p v-if="!entry.image" class="catalog-item__meta">
                  Image not supplied
                </p>
                <p
                  v-for="role in muscleRoles"
                  :key="role"
                  class="catalog-item__muscle"
                >
                  <template v-if="entry.muscles?.[role]?.length">
                    {{ role[0].toUpperCase() + role.slice(1) }}:
                    {{ entry.muscles[role].join(", ") }}
                  </template>
                </p>
                <p
                  v-if="entry.image?.credit || entry.image?.license"
                  class="catalog-item__meta"
                >
                  {{ entry.image.credit
                  }}<span v-if="entry.image.credit && entry.image.license">
                    · </span
                  >{{ entry.image.license }}
                </p>
                <button
                  class="button button--quiet"
                  type="button"
                  :aria-label="`Edit ${entry.name}`"
                  @click="editEntry(entry)"
                >
                  Edit
                </button>
              </div>
            </article>
          </li>
        </ul>
      </section>

      <form class="catalog-form" @submit.prevent="saveEntry">
        <div class="catalog-section-heading">
          <h2>
            {{ catalogState.selectedId ? "Edit exercise" : "Add exercise" }}
          </h2>
          <button
            v-if="catalogState.selectedId"
            class="text-button"
            type="button"
            @click="cancelEdit"
          >
            Cancel
          </button>
        </div>

        <label for="catalog-name">Exercise name</label>
        <input
          id="catalog-name"
          v-model="catalogState.form.name"
          maxlength="120"
          required
        />

        <label for="catalog-equipment">Equipment</label>
        <input
          id="catalog-equipment"
          v-model="catalogState.form.equipment"
          maxlength="80"
          required
        />

        <div class="catalog-form__columns">
          <div>
            <label for="catalog-load-type">Load type</label>
            <select id="catalog-load-type" v-model="catalogState.form.loadType">
              <option value="external">External</option>
              <option value="dumbbell">Dumbbell</option>
              <option value="bodyweight">Bodyweight</option>
              <option value="assisted">Assisted</option>
            </select>
          </div>
          <div>
            <label for="catalog-rest-category">Rest category</label>
            <select
              id="catalog-rest-category"
              v-model="catalogState.form.restCategory"
            >
              <option value="">Not assigned</option>
              <option value="upper_compound">Upper compound</option>
              <option value="lower_compound">Lower compound</option>
              <option value="upper_isolation">Upper isolation</option>
              <option value="lower_isolation">Lower isolation</option>
              <option value="core">Core</option>
            </select>
          </div>
        </div>

        <div class="catalog-form__columns">
          <div>
            <label for="catalog-dumbbell-count">Dumbbells counted</label>
            <select
              id="catalog-dumbbell-count"
              v-model="catalogState.form.dumbbellCount"
            >
              <option value="">Not applicable</option>
              <option value="1">One</option>
              <option value="2">Two</option>
            </select>
          </div>
          <div>
            <label for="catalog-side-count">Sides counted</label>
            <select
              id="catalog-side-count"
              v-model="catalogState.form.sideCount"
            >
              <option value="">Not specified</option>
              <option value="1">One side</option>
              <option value="2">Both sides</option>
            </select>
          </div>
        </div>

        <fieldset>
          <legend>Muscle roles</legend>
          <label for="catalog-primary-muscles">Primary muscles</label>
          <input
            id="catalog-primary-muscles"
            v-model="catalogState.form.primaryMuscles"
          />
          <label for="catalog-secondary-muscles">Secondary muscles</label>
          <input
            id="catalog-secondary-muscles"
            v-model="catalogState.form.secondaryMuscles"
          />
          <label for="catalog-tertiary-muscles">Tertiary muscles</label>
          <input
            id="catalog-tertiary-muscles"
            v-model="catalogState.form.tertiaryMuscles"
          />
        </fieldset>

        <fieldset>
          <legend>Image metadata</legend>
          <label for="catalog-image-url">Image URL</label>
          <input
            id="catalog-image-url"
            v-model="catalogState.form.imageUrl"
            type="url"
          />
          <label for="catalog-image-alt">Image description</label>
          <input
            id="catalog-image-alt"
            v-model="catalogState.form.imageAltText"
            maxlength="300"
          />
          <label for="catalog-image-credit">Image credit</label>
          <input
            id="catalog-image-credit"
            v-model="catalogState.form.imageCredit"
            maxlength="200"
          />
          <label for="catalog-image-license">Image license</label>
          <input
            id="catalog-image-license"
            v-model="catalogState.form.imageLicense"
            maxlength="200"
          />
        </fieldset>

        <fieldset>
          <legend>Recommendation metadata</legend>
          <label for="catalog-bodyweight-factor">Bodyweight factor</label>
          <input
            id="catalog-bodyweight-factor"
            v-model="catalogState.form.bodyweightFactor"
            type="number"
            min="0"
            step="any"
          />
          <label for="catalog-assistance-ratio">Assistance ratio</label>
          <input
            id="catalog-assistance-ratio"
            v-model="catalogState.form.assistanceRatio"
            type="number"
            min="0"
            step="any"
          />
          <p class="catalog-form__note">
            Leave unset until validated. Missing factors keep automatic
            recommendations unavailable.
          </p>
        </fieldset>

        <button
          class="button button--primary"
          type="submit"
          :disabled="catalogState.saving"
        >
          {{
            catalogState.saving
              ? "Saving…"
              : catalogState.selectedId
                ? "Save changes"
                : "Add exercise"
          }}
        </button>
      </form>
    </div>
  </section>
</template>
