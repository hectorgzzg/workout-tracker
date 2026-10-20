import { reactive } from "vue";

const apiOrigin = import.meta.env?.VITE_API_ORIGIN ?? "";

export const authState = reactive({
  status: "loading",
  profile: null,
  error: "",
  submitting: false,
  registrationComplete: false,
});

let profileRequest;

async function requestApi(path, options = {}) {
  let response;
  try {
    response = await fetch(`${apiOrigin}${path}`, {
      credentials: "include",
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error("The account service could not be reached. Try again.");
  }

  const payload =
    response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      payload?.error ?? "The request could not be completed.",
    );
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function loadCurrentProfile({ retry = false } = {}) {
  if (
    !retry &&
    (authState.status === "anonymous" || authState.status === "authenticated")
  ) {
    return Promise.resolve(authState.profile);
  }
  if (profileRequest) return profileRequest;

  authState.status = "loading";
  authState.error = "";
  profileRequest = requestApi("/api/profile")
    .then((profile) => {
      authState.profile = profile;
      authState.status = "authenticated";
      return profile;
    })
    .catch((error) => {
      authState.profile = null;
      if (error.status === 401) {
        authState.status = "anonymous";
        authState.error = "";
      } else {
        authState.status = "error";
        authState.error = error.message;
      }
      return null;
    })
    .finally(() => {
      profileRequest = null;
    });
  return profileRequest;
}

export async function signIn({ email, password }) {
  authState.error = "";
  try {
    const profile = await requestApi("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    authState.profile = profile;
    authState.status = "authenticated";
    return profile;
  } catch (error) {
    authState.error = error.message;
    throw error;
  }
}

export function registerAccount({ displayName, email, password, token }) {
  return requestApi("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ displayName, email, password, token }),
  });
}

export async function signOut() {
  await requestApi("/api/auth/logout", { method: "POST" });
  authState.profile = null;
  authState.status = "anonymous";
  authState.error = "";
}

export function createAuthFacade(router) {
  return {
    state: authState,
    async signInFromForm(event) {
      const form = new FormData(event.currentTarget);
      authState.submitting = true;
      try {
        await signIn({
          email: form.get("email"),
          password: form.get("password"),
        });
        const redirect = router.currentRoute.value.query.redirect;
        const destination =
          typeof redirect === "string" &&
          redirect.startsWith("/") &&
          !redirect.startsWith("//")
            ? redirect
            : "/";
        await router.replace(destination);
      } catch (error) {
        authState.error = error.message;
      } finally {
        authState.submitting = false;
      }
    },
    async registerFromForm(event) {
      const form = new FormData(event.currentTarget);
      authState.error = "";
      authState.submitting = true;
      try {
        await registerAccount({
          displayName: form.get("displayName"),
          email: form.get("email"),
          password: form.get("password"),
          token: router.currentRoute.value.query.token,
        });
        authState.registrationComplete = true;
      } catch (error) {
        authState.error = error.message;
      } finally {
        authState.submitting = false;
      }
    },
    async signOutFromApp() {
      authState.submitting = true;
      try {
        await signOut();
        await router.replace({ name: "login" });
      } catch (error) {
        authState.error = error.message;
      } finally {
        authState.submitting = false;
      }
    },
    returnToSignIn() {
      authState.registrationComplete = false;
      return router.replace({ path: "/login", query: { registered: "1" } });
    },
    retryProfile() {
      return loadCurrentProfile({ retry: true });
    },
  };
}
