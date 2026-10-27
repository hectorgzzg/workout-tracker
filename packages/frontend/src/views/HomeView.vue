<script>
function mondayFor(date) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default {
  data() {
    return {
      state: {
        run: null,
        loading: true,
        error: "",
        monthView: false,
        ribbonExpanded: true,
        calendarDate: mondayFor(new Date()),
      },
    };
  },
  computed: {
    calendarDays() {
      const start = this.state.monthView
        ? mondayFor(
            new Date(
              this.state.calendarDate.getFullYear(),
              this.state.calendarDate.getMonth(),
              1,
            ),
          )
        : mondayFor(this.state.calendarDate);
      const count = this.state.monthView ? 42 : 7;
      return Array.from({ length: count }, (_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        return date;
      });
    },
    calendarTitle() {
      return new Intl.DateTimeFormat("en", {
        month: "long",
        year: "numeric",
      }).format(this.state.calendarDate);
    },
    programDays() {
      return this.state.run?.week?.days ?? [];
    },
  },
  mounted() {
    this.loadCurrentProgram();
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
        throw new Error("The program service could not be reached. Try again.");
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload.error ?? "The program request could not be completed.",
        );
      }
      return payload;
    },
    async loadCurrentProgram() {
      this.state.loading = true;
      this.state.error = "";
      try {
        const run = await this.request("/api/program-runs/current");
        this.state.run = run;
      } catch (error) {
        this.state.error = error.message;
      } finally {
        this.state.loading = false;
      }
    },
    moveCalendar(amount) {
      const date = new Date(this.state.calendarDate);
      if (this.state.monthView) {
        date.setMonth(date.getMonth() + amount);
      } else {
        date.setDate(date.getDate() + amount * 7);
      }
      this.state.calendarDate = date;
    },
    statusLabel(day) {
      if (day.type === "rest")
        return day.status === "rest_done" ? "Rest complete" : "Rest";
      const labels = {
        completed: "Completed",
        partial: "Partial",
        skipped: "Skipped",
        in_progress: "In progress",
      };
      return labels[day.status] ?? "Pending";
    },
    dayStateClass(day) {
      if (day.type === "rest")
        return day.status === "rest_done" ? "rest-done" : "rest";
      return ["completed", "partial", "skipped", "in_progress"].includes(
        day.status,
      )
        ? day.status
        : "pending";
    },
    calendarDateLabel(date) {
      return new Intl.DateTimeFormat("en", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(date);
    },
    isToday(date) {
      return dateKey(date) === dateKey(new Date());
    },
    inDisplayedMonth(date) {
      return (
        !this.state.monthView ||
        date.getMonth() === this.state.calendarDate.getMonth()
      );
    },
    dateKey,
  },
};
</script>

<template>
  <section class="page-content home-page">
    <header class="page-heading">
      <p class="eyebrow">Today</p>
      <h1>Your training, at a glance</h1>
    </header>

    <p v-if="state.error" class="form-message form-message--error" role="alert">
      {{ state.error }}
      <button class="text-button" type="button" @click="loadCurrentProgram">
        Retry
      </button>
    </p>

    <section
      class="home-calendar"
      :aria-label="state.monthView ? 'Month calendar' : 'Week calendar'"
      role="region"
    >
      <header class="calendar-heading">
        <div>
          <p class="eyebrow">Training calendar</p>
          <h2>{{ calendarTitle }}</h2>
        </div>
        <div class="calendar-controls">
          <button
            class="calendar-arrow"
            type="button"
            aria-label="Previous"
            @click="moveCalendar(-1)"
          >
            ‹
          </button>
          <button
            class="calendar-toggle"
            type="button"
            :aria-label="state.monthView ? 'Show week' : 'Show month'"
            @click="state.monthView = !state.monthView"
          >
            {{ state.monthView ? "Week" : "Month" }}
          </button>
          <button
            class="calendar-arrow"
            type="button"
            aria-label="Next"
            @click="moveCalendar(1)"
          >
            ›
          </button>
        </div>
      </header>
      <div
        class="calendar-grid"
        :class="
          state.monthView ? 'calendar-grid--month' : 'calendar-grid--week'
        "
        role="list"
      >
        <div
          v-for="date in calendarDays"
          :key="dateKey(date)"
          class="calendar-day"
          :class="{ 'calendar-day--outside': !inDisplayedMonth(date) }"
          role="listitem"
        >
          <span class="calendar-day__weekday">{{
            new Intl.DateTimeFormat("en", {
              weekday: state.monthView ? "narrow" : "short",
            }).format(date)
          }}</span>
          <span class="calendar-day__number">{{ date.getDate() }}</span>
          <span v-if="isToday(date)" class="calendar-day__today">Today</span>
        </div>
      </div>
    </section>

    <p v-if="state.loading" class="home-loading" role="status">
      Loading your current program…
    </p>
    <section v-else-if="!state.run" class="empty-state home-empty">
      <h2>No active program yet.</h2>
      <p>
        Your calendar and training days will appear here when a program is
        active.
      </p>
      <RouterLink to="/programs">View programs</RouterLink>
    </section>

    <section
      v-else
      class="program-ribbon"
      aria-labelledby="current-program-title"
    >
      <header class="program-ribbon__heading">
        <div class="program-ribbon__title">
          <p class="eyebrow">
            Week {{ state.run.currentWeekNumber }} ·
            {{ state.run.week?.weekType ?? "training" }}
          </p>
          <h2 id="current-program-title">{{ state.run.name }}</h2>
        </div>
        <button
          class="button button--quiet"
          type="button"
          :aria-expanded="state.ribbonExpanded"
          :aria-label="
            state.ribbonExpanded
              ? 'Collapse current program'
              : 'Expand current program'
          "
          @click="state.ribbonExpanded = !state.ribbonExpanded"
        >
          {{ state.ribbonExpanded ? "Hide days" : "Show days" }}
        </button>
      </header>
      <section
        v-if="state.ribbonExpanded"
        class="program-ribbon__content"
        aria-label="Current program days"
        role="region"
      >
        <ol class="program-ribbon__days">
          <li
            v-for="day in programDays"
            :key="day.id"
            class="program-slot"
            :class="`program-slot--${dayStateClass(day)}`"
          >
            <span class="program-slot__number">{{ day.slotNumber }}</span>
            <RouterLink
              v-if="day.type === 'workout'"
              :to="`/workouts/${day.templateDayId}`"
              class="program-slot__link"
            >
              <strong>{{ day.name }}</strong>
              <span>{{ statusLabel(day) }}</span>
            </RouterLink>
            <div v-else class="program-slot__link">
              <strong>{{ day.name }}</strong>
              <span>{{ statusLabel(day) }}</span>
            </div>
          </li>
        </ol>
      </section>
    </section>
  </section>
</template>
