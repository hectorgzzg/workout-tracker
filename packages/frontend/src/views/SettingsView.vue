<script>
import { reactive } from "vue";

const restCategories = [
  { key: "upper_compound", label: "Upper compound" },
  { key: "lower_compound", label: "Lower compound" },
  { key: "upper_isolation", label: "Upper isolation" },
  { key: "lower_isolation", label: "Lower isolation" },
  { key: "core", label: "Core" },
];
let nextRowKey = 0;

function createRowKey() {
  nextRowKey += 1;
  return `settings-row-${nextRowKey}`;
}

function blankSettings() {
  return {
    profile: {
      displayName: "",
      email: "",
      timezone: "UTC",
      bodyweightKg: "",
      defaultUnit: "kg",
      restDurationsSeconds: {
        upper_compound: 120,
        lower_compound: 180,
        upper_isolation: 90,
        lower_isolation: 90,
        core: 60,
      },
    },
    gym: { name: "", equipment: [], bars: [], plates: [] },
  };
}

function equipmentForm(item = {}) {
  return {
    rowKey: createRowKey(),
    name: item.name ?? "",
    loadType: item.loadType ?? "external",
    minLoadKg: item.minLoadKg ?? 0,
    maxLoadKg: item.maxLoadKg ?? 0,
    incrementKg: item.incrementKg ?? 2.5,
    availableLoads: (item.availableLoadsKg ?? []).join(", "),
  };
}

export default {
  setup() {
    return {
      restCategories,
      settingsState: reactive({
        ...blankSettings(),
        loading: true,
        saving: false,
        error: "",
        message: "",
      }),
    };
  },
  mounted() {
    this.loadSettings();
  },
  methods: {
    async requestSettings(options = {}) {
      let response;
      try {
        const apiOrigin = globalThis.__WORKOUT_TRACKER_API_ORIGIN__ ?? "";
        response = await fetch(`${apiOrigin}/api/settings`, {
          credentials: "include",
          ...options,
          headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...options.headers,
          },
        });
      } catch {
        throw new Error(
          "The settings service could not be reached. Try again.",
        );
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload.error ?? "The settings request could not be completed.",
        );
      }
      return payload;
    },
    applySettings(saved) {
      this.settingsState.profile = {
        ...saved.profile,
        bodyweightKg: saved.profile.bodyweightKg ?? "",
      };
      this.settingsState.gym = {
        name: saved.gym.name,
        equipment: saved.gym.equipment.map(equipmentForm),
        bars: saved.gym.bars.map((bar) => ({ ...bar, rowKey: createRowKey() })),
        plates: saved.gym.plates.map((plate) => ({
          ...plate,
          rowKey: createRowKey(),
        })),
      };
    },
    async loadSettings() {
      this.settingsState.loading = true;
      this.settingsState.error = "";
      try {
        this.applySettings(await this.requestSettings());
      } catch (loadError) {
        this.settingsState.error = loadError.message;
      } finally {
        this.settingsState.loading = false;
      }
    },
    availableLoads(item) {
      return item.availableLoads
        .split(",")
        .map((load) => load.trim())
        .filter(Boolean)
        .map(Number);
    },
    settingsPayload() {
      const profile = this.settingsState.profile;
      const gym = this.settingsState.gym;
      return {
        profile: {
          displayName: profile.displayName,
          email: profile.email,
          timezone: profile.timezone,
          bodyweightKg:
            profile.bodyweightKg === "" || profile.bodyweightKg === null
              ? null
              : Number(profile.bodyweightKg),
          defaultUnit: profile.defaultUnit,
          restDurationsSeconds: Object.fromEntries(
            restCategories.map(({ key }) => [
              key,
              Number(profile.restDurationsSeconds[key]),
            ]),
          ),
        },
        gym: {
          name: gym.name,
          equipment: gym.equipment.map((item) => ({
            name: item.name,
            loadType: item.loadType,
            minLoadKg: Number(item.minLoadKg),
            maxLoadKg: Number(item.maxLoadKg),
            incrementKg: Number(item.incrementKg),
            availableLoadsKg: this.availableLoads(item),
          })),
          bars: gym.bars.map((bar) => ({
            name: bar.name,
            weightKg: Number(bar.weightKg),
          })),
          plates: gym.plates.map((plate) => ({
            weightKg: Number(plate.weightKg),
            quantity: Number(plate.quantity),
          })),
        },
      };
    },
    async saveSettings() {
      this.settingsState.saving = true;
      this.settingsState.error = "";
      this.settingsState.message = "";
      try {
        const saved = await this.requestSettings({
          method: "PUT",
          body: JSON.stringify(this.settingsPayload()),
        });
        this.applySettings(saved);
        if (this.$auth?.state) this.$auth.state.profile = saved.profile;
        this.settingsState.message = "Settings saved.";
      } catch (saveError) {
        this.settingsState.error = saveError.message;
      } finally {
        this.settingsState.saving = false;
      }
    },
    addEquipment() {
      this.settingsState.gym.equipment.push(equipmentForm());
    },
    addBar() {
      this.settingsState.gym.bars.push({
        rowKey: createRowKey(),
        name: "",
        weightKg: 20,
      });
    },
    addPlate() {
      this.settingsState.gym.plates.push({
        rowKey: createRowKey(),
        weightKg: 1.25,
        quantity: 0,
      });
    },
  },
};
</script>

<template>
  <section class="page-content settings-page">
    <header class="page-heading">
      <p class="eyebrow">Your training setup</p>
      <h1>Profile and gym</h1>
    </header>

    <p v-if="settingsState.loading" role="status">Loading settings…</p>
    <p
      v-if="settingsState.error"
      class="form-message form-message--error"
      role="alert"
    >
      {{ settingsState.error }}
      <button class="text-button" type="button" @click="loadSettings">
        Retry
      </button>
    </p>
    <p v-if="settingsState.message" class="form-message" role="status">
      {{ settingsState.message }}
    </p>

    <form
      v-if="!settingsState.loading || settingsState.error"
      class="settings-form"
      @submit.prevent="saveSettings"
    >
      <fieldset class="settings-section">
        <legend>Profile</legend>
        <div class="settings-fields">
          <label>
            Display name
            <input
              v-model="settingsState.profile.displayName"
              maxlength="80"
              required
            />
          </label>
          <label>
            Email
            <input
              v-model="settingsState.profile.email"
              type="email"
              maxlength="254"
              required
            />
          </label>
          <label>
            Timezone
            <input
              v-model="settingsState.profile.timezone"
              maxlength="100"
              placeholder="America/Los_Angeles"
              required
            />
          </label>
          <label>
            Bodyweight (kg)
            <input
              v-model.number="settingsState.profile.bodyweightKg"
              type="number"
              min="0"
              step="0.001"
            />
          </label>
          <label>
            Default units
            <select v-model="settingsState.profile.defaultUnit">
              <option value="kg">Kilograms (kg)</option>
              <option value="lb">Pounds (lb)</option>
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset class="settings-section">
        <legend>Rest defaults</legend>
        <div class="settings-fields settings-fields--rest">
          <label v-for="category in restCategories" :key="category.key">
            {{ category.label }} rest (seconds)
            <input
              v-model.number="
                settingsState.profile.restDurationsSeconds[category.key]
              "
              type="number"
              min="1"
              max="86400"
              step="1"
              required
            />
          </label>
        </div>
      </fieldset>

      <fieldset class="settings-section">
        <legend>Gym</legend>
        <label class="settings-field settings-field--gym-name">
          Gym name
          <input v-model="settingsState.gym.name" maxlength="100" required />
        </label>

        <div class="settings-subsection">
          <div class="settings-section-heading">
            <h2>Equipment and dumbbells</h2>
            <button
              class="button button--quiet"
              type="button"
              @click="addEquipment"
            >
              Add equipment
            </button>
          </div>
          <p
            v-if="settingsState.gym.equipment.length === 0"
            class="settings-empty"
          >
            No equipment added.
          </p>
          <div
            v-for="(item, index) in settingsState.gym.equipment"
            :key="item.rowKey"
            class="settings-item"
          >
            <div class="settings-fields settings-fields--equipment">
              <label>
                Equipment name
                <input v-model="item.name" maxlength="80" required />
              </label>
              <label>
                Load type
                <select v-model="item.loadType">
                  <option value="external">External</option>
                  <option value="dumbbell">Dumbbell</option>
                  <option value="bodyweight">Bodyweight</option>
                  <option value="assisted">Assisted</option>
                </select>
              </label>
              <label>
                Minimum load (kg)
                <input
                  v-model.number="item.minLoadKg"
                  type="number"
                  min="0"
                  step="0.001"
                  required
                />
              </label>
              <label>
                Maximum load (kg)
                <input
                  v-model.number="item.maxLoadKg"
                  type="number"
                  min="0"
                  step="0.001"
                  required
                />
              </label>
              <label>
                {{
                  item.loadType === "dumbbell"
                    ? "Dumbbell weight increment (kg)"
                    : "Load increment (kg)"
                }}
                <input
                  v-model.number="item.incrementKg"
                  type="number"
                  min="0.001"
                  step="0.001"
                  required
                />
              </label>
              <label>
                Available loads (kg, comma separated)
                <input
                  v-model="item.availableLoads"
                  placeholder="2.5, 5, 7.5"
                />
              </label>
            </div>
            <button
              class="text-button settings-remove"
              type="button"
              :aria-label="`Remove ${item.name || 'equipment'}`"
              @click="settingsState.gym.equipment.splice(index, 1)"
            >
              Remove equipment
            </button>
          </div>
        </div>

        <div class="settings-subsection">
          <div class="settings-section-heading">
            <h2>Bars</h2>
            <button class="button button--quiet" type="button" @click="addBar">
              Add bar
            </button>
          </div>
          <p v-if="settingsState.gym.bars.length === 0" class="settings-empty">
            No bars added.
          </p>
          <div
            v-for="(bar, index) in settingsState.gym.bars"
            :key="bar.rowKey"
            class="settings-row"
          >
            <label>
              Bar name
              <input v-model="bar.name" maxlength="80" required />
            </label>
            <label>
              Bar weight (kg)
              <input
                v-model.number="bar.weightKg"
                type="number"
                min="0.001"
                step="0.001"
                required
              />
            </label>
            <button
              class="text-button"
              type="button"
              :aria-label="`Remove ${bar.name || 'bar'}`"
              @click="settingsState.gym.bars.splice(index, 1)"
            >
              Remove
            </button>
          </div>
        </div>

        <div class="settings-subsection">
          <div class="settings-section-heading">
            <h2>Plate inventory</h2>
            <button
              class="button button--quiet"
              type="button"
              @click="addPlate"
            >
              Add plate size
            </button>
          </div>
          <p
            v-if="settingsState.gym.plates.length === 0"
            class="settings-empty"
          >
            No plates added.
          </p>
          <div
            v-for="(plate, index) in settingsState.gym.plates"
            :key="plate.rowKey"
            class="settings-row"
          >
            <label>
              Plate weight (kg)
              <input
                v-model.number="plate.weightKg"
                type="number"
                min="0.001"
                step="0.001"
                required
              />
            </label>
            <label>
              Plate quantity for {{ plate.weightKg }} kg
              <input
                v-model.number="plate.quantity"
                type="number"
                min="0"
                max="1000"
                step="1"
                required
              />
            </label>
            <button
              class="text-button"
              type="button"
              :aria-label="`Remove ${plate.weightKg} kg plate size`"
              @click="settingsState.gym.plates.splice(index, 1)"
            >
              Remove
            </button>
          </div>
        </div>
      </fieldset>

      <button
        class="button button--primary settings-save"
        type="submit"
        :disabled="settingsState.saving || settingsState.loading"
      >
        {{ settingsState.saving ? "Saving…" : "Save settings" }}
      </button>
    </form>
  </section>
</template>
