import { supabase } from "./supabaseClient.js";

import {
  ALTARA_AUTH_STATE,
  classifyAuthFailure,
  getSafeAuthErrorCode,
} from "./lib/offlineCoordinator.js";

const AUTH_SOFT_TIMEOUT_MS = 10000;
const PROFILE_QUERY_TIMEOUT_MS = 10000;
const PROFILE_BASE_SELECT_COLUMNS = ["id", "username", "display_name", "bio", "avatar_url", "theme_settings", "pronouns", "created_at"];
const PROFILE_OPTIONAL_SELECT_COLUMNS = ["bio", "status", "theme_settings", "name_color", "call_tile_color", "banner_url", "pronouns", "connected_accounts"];
const unavailableProfileColumns = new Set();

function isMissingProfileColumnError(error) {
  const msg = String(error?.message || error?.details || error?.hint || "").toLowerCase();
  const code = String(error?.code || "").trim().toUpperCase();
  return code === "PGRST204" || code === "42703" || ((msg.includes("column") || msg.includes("schema cache")) && (msg.includes("not found") || msg.includes("could not find") || msg.includes("does not exist")));
}

function getMissingProfileColumnsFromError(error, attemptedColumns = []) {
  const msg = String(error?.message || error?.details || error?.hint || "").toLowerCase();
  const code = String(error?.code || "").trim().toUpperCase();
  const attempted = (Array.isArray(attemptedColumns) ? attemptedColumns : [])
    .map((column) => String(column || "").trim())
    .filter((column) => PROFILE_OPTIONAL_SELECT_COLUMNS.includes(column));
  const exact = attempted.filter((column) => msg.includes(column.toLowerCase()) && (msg.includes("column") || msg.includes("schema cache") || code === "PGRST204" || code === "42703"));
  if (exact.length) return Array.from(new Set(exact));
  if (isMissingProfileColumnError(error)) return attempted;
  return [];
}

function buildProfileSelect(optionalColumns = []) {
  const columns = [
    ...PROFILE_BASE_SELECT_COLUMNS,
    ...optionalColumns.filter((column) => !unavailableProfileColumns.has(column)),
  ];
  const unique = Array.from(new Set(columns));
  return { columns: unique, select: unique.join(", ") };
}

export function $(id) { return document.getElementById(id); }

export function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function escapeAttr(s) {
  return esc(s).replaceAll("`", "&#096;");
}

export const LIMITS = Object.freeze({
  usernameMin: 3,
  usernameMax: 20,
  displayNameMax: 32,
  bioMax: 280,
  passwordMin: 6,
});

export function setDebug(obj) {
  const pre = document.getElementById("debug");
  if (!pre) return;
  pre.textContent = JSON.stringify(obj, null, 2);
}

export function enhancePasswordVisibilityToggles(root = document, { t = null } = {}) {
  const scope = root && typeof root.querySelectorAll === "function" ? root : document;
  const inputs = scope.querySelectorAll('input[type="password"]:not([data-password-toggle="off"]), input[data-password-toggle-bound="1"]');
  inputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    const copy = (visible) => ({
      text: typeof t === "function" ? t(visible ? "password.hide" : "password.show", visible ? "Hide" : "Show") : (visible ? "Hide" : "Show"),
      label: typeof t === "function" ? t(visible ? "password.hideAria" : "password.showAria", visible ? "Hide password" : "Show password") : (visible ? "Hide password" : "Show password"),
    });
    if (input.dataset.passwordToggleBound === "1") {
      const existing = input.parentElement?.querySelector?.("[data-password-visibility-toggle]");
      if (existing instanceof HTMLButtonElement) {
        const localized = copy(input.type !== "password");
        existing.textContent = localized.text;
        existing.setAttribute("aria-label", localized.label);
      }
      return;
    }
    input.dataset.passwordToggleBound = "1";

    const parent = input.parentElement;
    if (!parent) return;

    let wrap = parent;
    if (!parent.classList.contains("passwordToggleWrap")) {
      wrap = document.createElement("div");
      wrap.className = "passwordToggleWrap";
      parent.insertBefore(wrap, input);
      wrap.appendChild(input);
    }

    input.classList.add("passwordToggleInput");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "passwordToggleBtn";
    btn.dataset.passwordVisibilityToggle = "1";
    btn.textContent = copy(false).text;
    btn.setAttribute("aria-label", copy(false).label);
    btn.setAttribute("aria-pressed", "false");

    const setVisible = (visible) => {
      const start = Number.isFinite(input.selectionStart) ? input.selectionStart : null;
      const end = Number.isFinite(input.selectionEnd) ? input.selectionEnd : null;
      input.type = visible ? "text" : "password";
      const localized = copy(visible);
      btn.textContent = localized.text;
      btn.setAttribute("aria-label", localized.label);
      btn.setAttribute("aria-pressed", visible ? "true" : "false");
      wrap.classList.toggle("is-visible", visible);
      try {
        if (start !== null && end !== null) input.setSelectionRange(start, end);
      } catch (_) {}
    };

    btn.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
    });
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      const nextVisible = input.type === "password";
      setVisible(nextVisible);
      try {
        input.focus({ preventScroll: true });
      } catch (_) {
        try { input.focus(); } catch (_) {}
      }
    });

    wrap.appendChild(btn);
  });
}

function clearStoredAuthState() {
  const shouldRemove = (key) => {
    const k = String(key || "").toLowerCase();
    return k.includes("-auth-token") || k.includes("-code-verifier");
  };

  try {
    for (const key of Object.keys(localStorage || {})) {
      if (!shouldRemove(key)) continue;
      localStorage.removeItem(key);
    }
  } catch (_) {}

  try {
    for (const key of Object.keys(sessionStorage || {})) {
      if (!shouldRemove(key)) continue;
      sessionStorage.removeItem(key);
    }
  } catch (_) {}
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function raceWithTimeout(promiseLike, timeoutMs, label = "operation") {
  const safeMs = Math.max(1500, Number(timeoutMs) || 10000);
  let timeoutId = null;
  try {
    return await Promise.race([
      Promise.resolve(promiseLike),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} timeout (${safeMs}ms)`)), safeMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function withTimeout(promiseLike, timeoutMs = 3500) {
  try {
    await Promise.race([
      Promise.resolve(promiseLike),
      delay(timeoutMs),
    ]);
  } catch (_) {}
}

let lastAuthResolution = {
  category: ALTARA_AUTH_STATE.NO_LOCAL_SESSION,
  user: null,
  sessionPresent: false,
  safeErrorCode: "",
};

function getAuthNavigatorOnline() {
  try {
    return typeof navigator === "undefined" ? true : navigator.onLine !== false;
  } catch (_) {
    return true;
  }
}

function setLastAuthResolution(category, {
  user = null,
  sessionPresent = false,
  error = null,
} = {}) {
  lastAuthResolution = {
    category,
    user: user || null,
    sessionPresent: !!sessionPresent,
    safeErrorCode: error ? getSafeAuthErrorCode(error, category) : "",
  };
  return { ...lastAuthResolution, error: error || null };
}

function classifyAuthRequestFailure(error) {
  return classifyAuthFailure(error, {
    navigatorOnline: getAuthNavigatorOnline(),
    authOperation: true,
  });
}

async function resolveAuthenticatedSessionState({ cachedSession = null } = {}) {
  let localSession = cachedSession || null;
  if (localSession?.user && getAuthNavigatorOnline() === false) {
    return setLastAuthResolution(ALTARA_AUTH_STATE.NETWORK_INDETERMINATE, {
      user: localSession.user,
      sessionPresent: true,
      error: new Error("network_offline"),
    });
  }

  let sessionResult = null;
  try {
    sessionResult = await raceWithTimeout(supabase.auth.getSession(), AUTH_SOFT_TIMEOUT_MS, "auth.getSession");
  } catch (error) {
    const category = classifyAuthRequestFailure(error);
    return setLastAuthResolution(category, {
      user: localSession?.user || null,
      sessionPresent: !!localSession,
      error,
    });
  }
  if (sessionResult?.error) {
    const category = classifyAuthRequestFailure(sessionResult.error);
    return setLastAuthResolution(category, {
      user: localSession?.user || null,
      sessionPresent: !!localSession,
      error: sessionResult.error,
    });
  }
  localSession = sessionResult?.data?.session || localSession || null;
  if (!localSession?.user) {
    return setLastAuthResolution(ALTARA_AUTH_STATE.NO_LOCAL_SESSION);
  }

  if (getAuthNavigatorOnline() === false) {
    return setLastAuthResolution(ALTARA_AUTH_STATE.NETWORK_INDETERMINATE, {
      user: localSession.user,
      sessionPresent: true,
      error: new Error("network_offline"),
    });
  }

  let firstUserResult = null;
  try {
    firstUserResult = await raceWithTimeout(supabase.auth.getUser(), AUTH_SOFT_TIMEOUT_MS, "auth.getUser");
  } catch (error) {
    const category = classifyAuthRequestFailure(error);
    return setLastAuthResolution(category, {
      user: localSession.user,
      sessionPresent: true,
      error,
    });
  }
  if (firstUserResult?.data?.user) {
    return setLastAuthResolution(ALTARA_AUTH_STATE.VALID_SESSION, {
      user: firstUserResult.data.user,
      sessionPresent: true,
    });
  }
  if (firstUserResult?.error) {
    const firstCategory = classifyAuthRequestFailure(firstUserResult.error);
    if (
      firstCategory === ALTARA_AUTH_STATE.NETWORK_INDETERMINATE
      || firstCategory === ALTARA_AUTH_STATE.BACKEND_TEMPORARILY_UNAVAILABLE
      || firstCategory === ALTARA_AUTH_STATE.UNEXPECTED_BOOT_ERROR
    ) {
      return setLastAuthResolution(firstCategory, {
        user: localSession.user,
        sessionPresent: true,
        error: firstUserResult.error,
      });
    }
  }

  let refreshResult = null;
  try {
    refreshResult = await raceWithTimeout(
      supabase.auth.refreshSession(),
      AUTH_SOFT_TIMEOUT_MS,
      "auth.refreshSession"
    );
  } catch (error) {
    const category = classifyAuthRequestFailure(error);
    return setLastAuthResolution(category, {
      user: localSession.user,
      sessionPresent: true,
      error,
    });
  }
  if (refreshResult?.error) {
    const category = classifyAuthRequestFailure(refreshResult.error);
    return setLastAuthResolution(category, {
      user: localSession.user,
      sessionPresent: true,
      error: refreshResult.error,
    });
  }
  const refreshedSession = refreshResult?.data?.session || null;
  if (refreshedSession?.user) localSession = refreshedSession;

  let secondUserResult = null;
  try {
    secondUserResult = await raceWithTimeout(
      supabase.auth.getUser(),
      AUTH_SOFT_TIMEOUT_MS,
      "auth.getUser.retry"
    );
  } catch (error) {
    const category = classifyAuthRequestFailure(error);
    return setLastAuthResolution(category, {
      user: localSession.user,
      sessionPresent: true,
      error,
    });
  }
  if (secondUserResult?.data?.user) {
    return setLastAuthResolution(ALTARA_AUTH_STATE.VALID_SESSION, {
      user: secondUserResult.data.user,
      sessionPresent: true,
    });
  }
  const finalError = secondUserResult?.error || firstUserResult?.error || new Error("auth_user_validation_empty");
  const finalCategory = classifyAuthRequestFailure(finalError);
  return setLastAuthResolution(finalCategory, {
    user: localSession.user,
    sessionPresent: true,
    error: finalError,
  });
}

export function getLastAuthResolution() {
  return { ...lastAuthResolution };
}

export async function resolveAuthState(options = {}) {
  return resolveAuthenticatedSessionState(options);
}

export function clearConclusiveInvalidAuthStateAndRedirect(redirectUrl = "./login.html") {
  clearStoredAuthState();
  window.location.replace(redirectUrl);
}

export async function requireAuth(redirectUrl, options = {}) {
  const resolution = await resolveAuthenticatedSessionState(options);
  if (
    resolution.category === ALTARA_AUTH_STATE.VALID_SESSION
    || resolution.category === ALTARA_AUTH_STATE.NETWORK_INDETERMINATE
    || resolution.category === ALTARA_AUTH_STATE.BACKEND_TEMPORARILY_UNAVAILABLE
  ) {
    return resolution.user || null;
  }
  if (resolution.category === ALTARA_AUTH_STATE.NO_LOCAL_SESSION) {
    window.location.replace(redirectUrl);
    return null;
  }
  if (resolution.category === ALTARA_AUTH_STATE.CONCLUSIVELY_INVALID_SESSION) {
    clearConclusiveInvalidAuthStateAndRedirect(redirectUrl);
    return null;
  }

  const safeError = new Error("ALTARA could not validate the saved session yet.");
  safeError.code = resolution.safeErrorCode || "auth_boot_unexpected";
  safeError.authStateCategory = ALTARA_AUTH_STATE.UNEXPECTED_BOOT_ERROR;
  throw safeError;
}

export async function getMyProfile(uid) {
  const id = String(uid || "").trim();
  if (!id) return {};
  let optionalColumns = [...PROFILE_OPTIONAL_SELECT_COLUMNS];
  let lastError = null;

  for (let i = 0; i < 4; i += 1) {
    const selectState = buildProfileSelect(optionalColumns);

    const result = await raceWithTimeout(
      supabase
        .from("profiles")
        .select(selectState.select)
        .eq("id", id)
        .single(),
      PROFILE_QUERY_TIMEOUT_MS,
      "profiles.getMyProfile"
    );

    if (!result.error) {
      const data = result.data || {};
      PROFILE_OPTIONAL_SELECT_COLUMNS.forEach((column) => {
        if (typeof data[column] === "undefined") data[column] = null;
      });
      return data;
    }

    lastError = result.error;
    const missingColumns = getMissingProfileColumnsFromError(result.error, selectState.columns);
    if (!missingColumns.length) break;
    missingColumns.forEach((column) => unavailableProfileColumns.add(column));
    optionalColumns = optionalColumns.filter((column) => !missingColumns.includes(column));
  }

  throw lastError;
}

export async function logout() {
  await withTimeout(supabase.auth.signOut({ scope: "local" }), 2500);
  await withTimeout(supabase.auth.signOut(), 2500);
  clearStoredAuthState();
  const loginTarget = "./login.html";
  try { window.location.replace(loginTarget); } catch (_) {}
  setTimeout(() => {
    try { window.location.href = loginTarget; } catch (_) {}
  }, 180);
}


