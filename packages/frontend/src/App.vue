<template>
  <div class="app-shell">
    <p
      v-if="$auth.state.status === 'loading'"
      class="session-loading"
      role="status"
    >
      Checking your sign-in…
    </p>

    <template v-else-if="$auth.state.status === 'authenticated'">
      <a class="skip-link" href="#main-content">Skip to main content</a>
      <header class="app-header">
        <RouterLink class="brand" to="/" aria-label="Workout Tracker home">
          <span class="brand__mark" aria-hidden="true">WT</span>
          <span>Workout Tracker</span>
        </RouterLink>
        <div class="account-controls">
          <span class="account-name">{{
            $auth.state.profile?.displayName || $auth.state.profile?.email
          }}</span>
          <button
            class="button button--quiet"
            type="button"
            @click="$auth.signOutFromApp"
          >
            Sign out
          </button>
        </div>
      </header>
      <div class="app-body">
        <nav class="primary-nav" aria-label="Primary">
          <RouterLink
            to="/"
            :aria-current="$route.name === 'home' ? 'page' : undefined"
          >
            Home
          </RouterLink>
          <RouterLink
            to="/programs"
            :aria-current="$route.name === 'programs' ? 'page' : undefined"
          >
            Programs
          </RouterLink>
          <RouterLink
            to="/tracker"
            :aria-current="$route.name === 'tracker' ? 'page' : undefined"
          >
            Workout
          </RouterLink>
          <RouterLink
            to="/history"
            :aria-current="$route.name === 'history' ? 'page' : undefined"
          >
            History
          </RouterLink>
          <RouterLink
            to="/dashboard"
            :aria-current="$route.name === 'dashboard' ? 'page' : undefined"
          >
            Dashboard
          </RouterLink>
          <RouterLink
            to="/settings"
            :aria-current="$route.name === 'settings' ? 'page' : undefined"
          >
            Settings
          </RouterLink>
          <RouterLink
            v-if="$auth.state.profile?.role === 'admin'"
            to="/admin/catalog"
            :aria-current="$route.name === 'admin-catalog' ? 'page' : undefined"
          >
            Exercise catalog
          </RouterLink>
        </nav>
        <main id="main-content" class="main-content" tabindex="-1">
          <p
            v-if="$auth.state.error"
            class="form-message form-message--error"
            role="alert"
          >
            {{ $auth.state.error }}
          </p>
          <RouterView />
        </main>
      </div>
    </template>

    <RouterView v-else />
  </div>
</template>
