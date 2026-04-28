import { supabase } from "./supabaseClient.js";

const AUTH_SOFT_TIMEOUT_MS = 10000;
const PROFILE_QUERY_TIMEOUT_MS = 10000;

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

export function enhancePasswordVisibilityToggles(root = document) {
  const scope = root && typeof root.querySelectorAll === "function" ? root : document;
  const inputs = scope.querySelectorAll('input[type="password"]:not([data-password-toggle="off"])');
  inputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    if (input.dataset.passwordToggleBound === "1") return;
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
    btn.textContent = "Show";
    btn.setAttribute("aria-label", "Show password");
    btn.setAttribute("aria-pressed", "false");

    const setVisible = (visible) => {
      const start = Number.isFinite(input.selectionStart) ? input.selectionStart : null;
      const end = Number.isFinite(input.selectionEnd) ? input.selectionEnd : null;
      input.type = visible ? "text" : "password";
      btn.textContent = visible ? "Hide" : "Show";
      btn.setAttribute("aria-label", visible ? "Hide password" : "Show password");
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

function readErrorMessage(err) {
  return String(err?.message || err || "").trim();
}

function looksLikeAuthSessionError(err) {
  const msg = readErrorMessage(err).toLowerCase();
  return (
    msg.includes("auth session missing")
    || msg.includes("jwt")
    || msg.includes("session")
    || msg.includes("refresh token")
  );
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

async function resolveAuthenticatedUser() {
  try {
    await raceWithTimeout(supabase.auth.getSession(), AUTH_SOFT_TIMEOUT_MS, "auth.getSession");
  } catch (_) {
    return null;
  }

  let firstUserResult = null;
  try {
    firstUserResult = await raceWithTimeout(supabase.auth.getUser(), AUTH_SOFT_TIMEOUT_MS, "auth.getUser");
  } catch (_) {
    return null;
  }
  if (firstUserResult?.data?.user) return firstUserResult.data.user;

  if (!looksLikeAuthSessionError(firstUserResult?.error)) return null;

  let refreshResult = null;
  try {
    refreshResult = await raceWithTimeout(
      supabase.auth.refreshSession(),
      AUTH_SOFT_TIMEOUT_MS,
      "auth.refreshSession"
    );
  } catch (_) {
    return null;
  }
  if (refreshResult?.error && !looksLikeAuthSessionError(refreshResult.error)) return null;

  let secondUserResult = null;
  try {
    secondUserResult = await raceWithTimeout(
      supabase.auth.getUser(),
      AUTH_SOFT_TIMEOUT_MS,
      "auth.getUser.retry"
    );
  } catch (_) {
    return null;
  }
  if (secondUserResult?.data?.user) return secondUserResult.data.user;
  return null;
}

export async function requireAuth(redirectUrl) {
  try {
    const user = await resolveAuthenticatedUser();
    if (user) return user;
  } catch (_) {}

  // replace avoids returning to previous protected view via back navigation
  clearStoredAuthState();
  window.location.replace(redirectUrl);
  return null;
}

export async function getMyProfile(uid) {
  const baseSelect = "id, username, display_name, bio, avatar_url";
  let includeStatus = true;
  let includeTheme = true;
  let includeName = true;
  let includeCallTile = true;
  let includeBanner = true;
  let includePronouns = true;
  let lastError = null;

  for (let i = 0; i < 6; i += 1) {
    const select = [
      baseSelect,
      ...(includeStatus ? ["status"] : []),
      ...(includeTheme ? ["theme_settings"] : []),
      ...(includeName ? ["name_color"] : []),
      ...(includeCallTile ? ["call_tile_color"] : []),
      ...(includeBanner ? ["banner_url"] : []),
      ...(includePronouns ? ["pronouns"] : []),
    ].join(", ");

    const result = await raceWithTimeout(
      supabase
        .from("profiles")
        .select(select)
        .eq("id", uid)
        .single(),
      PROFILE_QUERY_TIMEOUT_MS,
      "profiles.getMyProfile"
    );

    if (!result.error) {
      const data = result.data || {};
      if (!includeStatus && typeof data.status === "undefined") data.status = null;
      if (!includeTheme && typeof data.theme_settings === "undefined") data.theme_settings = null;
      if (!includeName && typeof data.name_color === "undefined") data.name_color = null;
      if (!includeCallTile && typeof data.call_tile_color === "undefined") data.call_tile_color = null;
      if (!includeBanner && typeof data.banner_url === "undefined") data.banner_url = null;
      if (!includePronouns && typeof data.pronouns === "undefined") data.pronouns = null;
      return data;
    }

    lastError = result.error;
    const msg = String(result?.error?.message || "").toLowerCase();
    let changed = false;
    if (includeStatus && msg.includes("status") && msg.includes("column")) {
      includeStatus = false;
      changed = true;
    }
    if (includeTheme && msg.includes("theme_settings") && msg.includes("column")) {
      includeTheme = false;
      changed = true;
    }
    if (includeName && msg.includes("name_color") && msg.includes("column")) {
      includeName = false;
      changed = true;
    }
    if (includeCallTile && msg.includes("call_tile_color") && msg.includes("column")) {
      includeCallTile = false;
      changed = true;
    }
    if (includeBanner && msg.includes("banner_url") && msg.includes("column")) {
      includeBanner = false;
      changed = true;
    }
    if (includePronouns && msg.includes("pronouns") && msg.includes("column")) {
      includePronouns = false;
      changed = true;
    }
    if (!changed) break;
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


