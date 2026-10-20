<template>
  <main class="auth-page">
    <RouterLink class="brand auth-brand" to="/" aria-label="Workout Tracker">
      <span class="brand__mark" aria-hidden="true">WT</span>
      <span>Workout Tracker</span>
    </RouterLink>
    <section class="auth-content" aria-labelledby="sign-in-title">
      <p class="eyebrow">Your training, in one place</p>
      <h1 id="sign-in-title">Sign in</h1>
      <p class="auth-intro">Pick up where your training left off.</p>

      <p
        v-if="$auth.state.error"
        class="form-message form-message--error"
        role="alert"
      >
        {{ $auth.state.error }}
        <button
          v-if="$auth.state.status === 'error'"
          class="text-button"
          type="button"
          @click="$auth.retryProfile"
        >
          Retry
        </button>
      </p>
      <p
        v-if="$route.query.registered === '1'"
        class="form-message"
        role="status"
      >
        Account created. Sign in to continue.
      </p>

      <form
        class="auth-form"
        :aria-busy="$auth.state.submitting"
        @submit.prevent="$auth.signInFromForm"
      >
        <label for="login-email">Email address</label>
        <input
          id="login-email"
          type="email"
          name="email"
          autocomplete="email"
          required
        />

        <label for="login-password">Password</label>
        <input
          id="login-password"
          type="password"
          name="password"
          autocomplete="current-password"
          required
        />

        <button
          class="button button--primary"
          type="submit"
          :disabled="$auth.state.submitting"
        >
          {{ $auth.state.submitting ? "Signing in…" : "Sign in" }}
        </button>
      </form>
      <p class="auth-switch">
        Have an invitation?
        <RouterLink to="/register">Create an account</RouterLink>
      </p>
    </section>
  </main>
</template>
