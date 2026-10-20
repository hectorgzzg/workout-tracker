<template>
  <main class="auth-page">
    <RouterLink class="brand auth-brand" to="/" aria-label="Workout Tracker">
      <span class="brand__mark" aria-hidden="true">WT</span>
      <span>Workout Tracker</span>
    </RouterLink>
    <section class="auth-content" aria-labelledby="register-title">
      <p class="eyebrow">Private, invite-only access</p>
      <h1 id="register-title">Create account</h1>
      <p class="auth-intro">
        Use the details you want associated with your training.
      </p>

      <p
        v-if="!$route.query.token"
        class="form-message form-message--error"
        role="alert"
      >
        This invitation link is missing its token. Ask an administrator for a
        new link.
      </p>
      <p
        v-if="$auth.state.error"
        class="form-message form-message--error"
        role="alert"
      >
        {{ $auth.state.error }}
      </p>
      <p
        v-if="$auth.state.registrationComplete"
        class="form-message"
        role="status"
      >
        Account created. Sign in to continue.
      </p>

      <form
        v-if="!$auth.state.registrationComplete"
        class="auth-form"
        :aria-busy="$auth.state.submitting"
        @submit.prevent="$auth.registerFromForm"
      >
        <label for="register-name">Display name</label>
        <input
          id="register-name"
          type="text"
          name="displayName"
          autocomplete="name"
          maxlength="80"
          required
        />

        <label for="register-email">Email address</label>
        <input
          id="register-email"
          type="email"
          name="email"
          autocomplete="email"
          maxlength="254"
          required
        />

        <label for="register-password">Password</label>
        <input
          id="register-password"
          type="password"
          name="password"
          autocomplete="new-password"
          minlength="12"
          maxlength="256"
          required
        />

        <button
          class="button button--primary"
          type="submit"
          :disabled="$auth.state.submitting || !$route.query.token"
        >
          {{ $auth.state.submitting ? "Creating account…" : "Create account" }}
        </button>
      </form>
      <button
        v-else
        class="button button--primary"
        type="button"
        @click="$auth.returnToSignIn"
      >
        Return to sign in
      </button>
      <p class="auth-switch">
        Already have an account?
        <RouterLink to="/login">Sign in</RouterLink>
      </p>
    </section>
  </main>
</template>
