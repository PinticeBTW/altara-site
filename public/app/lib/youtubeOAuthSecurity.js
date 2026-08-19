export const YOUTUBE_OAUTH_CALLBACK_TYPE = "altara:youtube-callback";
export const YOUTUBE_OAUTH_FLOW_MAX_AGE_MS = 10 * 60 * 1000;

export function isValidYouTubeOAuthState(value = "") {
  return /^[A-Za-z0-9_-]{43}$/.test(String(value || ""));
}

export function readYouTubeOAuthStateFromAuthorizationUrl(value = "") {
  try {
    const url = new URL(String(value || ""));
    const state = String(url.searchParams.get("state") || "");
    if (
      url.origin !== "https://accounts.google.com"
      || url.pathname !== "/o/oauth2/v2/auth"
      || !isValidYouTubeOAuthState(state)
    ) {
      return "";
    }
    return state;
  } catch (_) {
    return "";
  }
}

export function parseYouTubeDesktopCallbackStatus(value = "") {
  const match = /^youtube-(connected|error)\.([A-Za-z0-9_-]{43})$/.exec(String(value || ""));
  if (!match) return null;
  return { status: match[1], oauthState: match[2] };
}

export function consumeTrustedYouTubeCallbackMessage(pending, event, options = {}) {
  if (!pending || !event) return rejected(pending, "missing_flow");
  const payload = event.data && typeof event.data === "object" ? event.data : null;
  const now = Number(options.now ?? Date.now());
  const maxAgeMs = Number(options.maxAgeMs ?? YOUTUBE_OAUTH_FLOW_MAX_AGE_MS);
  const ageMs = now - Number(pending.startedAt || 0);
  const expectedState = String(pending.state || "");
  const callbackOrigin = String(pending.callbackOrigin || "");

  if (String(payload?.type || "") !== YOUTUBE_OAUTH_CALLBACK_TYPE) {
    return rejected(pending, "wrong_type");
  }
  if (String(payload?.provider || "") !== "youtube") {
    return rejected(pending, "wrong_provider");
  }
  if (!callbackOrigin || String(event.origin || "") !== callbackOrigin) {
    return rejected(pending, "wrong_origin");
  }
  if (!pending.popup || event.source !== pending.popup) {
    return rejected(pending, "wrong_source");
  }
  if (!isValidYouTubeOAuthState(expectedState) || String(payload?.state || "") !== expectedState) {
    return rejected(pending, "wrong_state");
  }
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > maxAgeMs) {
    return rejected(pending, "expired");
  }

  return { accepted: true, pending: null, reason: "", state: expectedState };
}

export function consumeTrustedYouTubeReturnSignal(pending, signal, options = {}) {
  if (!pending || !signal) return rejected(pending, "missing_flow");
  const now = Number(options.now ?? Date.now());
  const maxAgeMs = Number(options.maxAgeMs ?? YOUTUBE_OAUTH_FLOW_MAX_AGE_MS);
  const ageMs = now - Number(pending.startedAt || 0);
  const expectedState = String(pending.state || "");

  if (String(signal.provider || "") !== "youtube") {
    return rejected(pending, "wrong_provider");
  }
  if (!isValidYouTubeOAuthState(expectedState) || String(signal.oauthState || "") !== expectedState) {
    return rejected(pending, "wrong_state");
  }
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > maxAgeMs) {
    return rejected(pending, "expired");
  }

  return { accepted: true, pending: null, reason: "", state: expectedState };
}

function rejected(pending, reason) {
  return { accepted: false, pending: pending || null, reason, state: "" };
}
