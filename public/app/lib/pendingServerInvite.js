const PENDING_SERVER_INVITE_VERSION = 1;
export const PENDING_SERVER_INVITE_STORAGE_KEY = "altara.pendingServerInvite.v1";
export const PENDING_SERVER_INVITE_TTL_MS = 24 * 60 * 60 * 1000;
export const SERVER_INVITE_CODE_PATTERN = /^[A-Za-z0-9_-]{6,96}$/;

const INVITE_QUERY_KEYS = Object.freeze(["server_invite", "invite", "serverInvite"]);

function safeNow(now) {
  const value = Number(typeof now === "function" ? now() : Date.now());
  return Number.isFinite(value) ? Math.trunc(value) : Date.now();
}

function safeStorage(storage) {
  try {
    return storage || globalThis.localStorage || null;
  } catch (_) {
    return null;
  }
}

export function normalizePendingServerInviteCode(value) {
  const code = String(value || "").trim();
  return code && SERVER_INVITE_CODE_PATTERN.test(code) ? code : "";
}

function decodePathPart(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try { return decodeURIComponent(raw); } catch (_) { return raw; }
}

function hashSearchParams(hash = "") {
  const body = String(hash || "").replace(/^#\??/, "");
  return body.includes("=") ? new URLSearchParams(body) : new URLSearchParams();
}

export function extractPendingServerInviteCode(urlLike, { allowedWebOrigin = "" } = {}) {
  const raw = String(urlLike || "").trim();
  if (!raw) return "";
  let url;
  try {
    url = new URL(raw, allowedWebOrigin || "https://pending-invite.invalid/");
  } catch (_) {
    return "";
  }

  const protocol = String(url.protocol || "").toLowerCase();
  if (protocol === "altara:") {
    if (url.username || url.password || url.search || url.hash) return "";
    const host = String(url.hostname || url.host || "").trim().toLowerCase();
    const parts = String(url.pathname || "").split("/").map(decodePathPart).filter(Boolean);
    if (host === "invite" && parts.length === 1) return normalizePendingServerInviteCode(parts[0]);
    if (!host && parts.length === 2 && String(parts[0]).toLowerCase() === "invite") {
      return normalizePendingServerInviteCode(parts[1]);
    }
    return "";
  }

  if (protocol !== "http:" && protocol !== "https:") return "";
  if (allowedWebOrigin) {
    let expectedOrigin = "";
    try { expectedOrigin = new URL(allowedWebOrigin).origin; } catch (_) {}
    if (!expectedOrigin || url.origin !== expectedOrigin) return "";
  }

  for (const key of INVITE_QUERY_KEYS) {
    const code = normalizePendingServerInviteCode(url.searchParams.get(key));
    if (code) return code;
  }
  const hashParams = hashSearchParams(url.hash);
  for (const key of INVITE_QUERY_KEYS) {
    const code = normalizePendingServerInviteCode(hashParams.get(key));
    if (code) return code;
  }
  const parts = String(url.pathname || "").split("/").map(decodePathPart).filter(Boolean);
  if (parts.length === 2 && String(parts[0]).toLowerCase() === "invite") {
    return normalizePendingServerInviteCode(parts[1]);
  }
  return "";
}

function normalizePendingRecord(value, nowMs) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (Number(value.v) !== PENDING_SERVER_INVITE_VERSION) return null;
  const code = normalizePendingServerInviteCode(value.code);
  const capturedAt = Number(value.capturedAt);
  const expiresAt = Number(value.expiresAt);
  if (!code || !Number.isFinite(capturedAt) || !Number.isFinite(expiresAt)) return null;
  if (capturedAt <= 0 || expiresAt <= capturedAt || expiresAt - capturedAt > PENDING_SERVER_INVITE_TTL_MS) return null;
  if (expiresAt <= nowMs) return null;
  return { v: PENDING_SERVER_INVITE_VERSION, code, capturedAt: Math.trunc(capturedAt), expiresAt: Math.trunc(expiresAt) };
}

export function createPendingServerInviteStore({ storage = null, now = Date.now } = {}) {
  const target = safeStorage(storage);
  const removeRaw = () => {
    try { target?.removeItem?.(PENDING_SERVER_INVITE_STORAGE_KEY); } catch (_) {}
  };
  const read = () => {
    if (!target) return null;
    let parsed = null;
    try { parsed = JSON.parse(target.getItem(PENDING_SERVER_INVITE_STORAGE_KEY) || "null"); } catch (_) {}
    const record = normalizePendingRecord(parsed, safeNow(now));
    if (!record && parsed) removeRaw();
    return record;
  };
  const remember = (codeInput, bounds = null) => {
    const code = normalizePendingServerInviteCode(codeInput);
    if (!code || !target) return null;
    const existing = read();
    if (existing && existing.code.toLowerCase() === code.toLowerCase()) return existing;
    const nowMs = safeNow(now);
    const hasBounds = bounds && (bounds.capturedAt != null || bounds.expiresAt != null);
    const capturedAt = hasBounds ? Number(bounds.capturedAt) : nowMs;
    const expiresAt = hasBounds ? Number(bounds.expiresAt) : capturedAt + PENDING_SERVER_INVITE_TTL_MS;
    const record = normalizePendingRecord({
      v: PENDING_SERVER_INVITE_VERSION, code, capturedAt, expiresAt,
    }, nowMs);
    if (!record) return null;
    if (existing && existing.capturedAt > record.capturedAt) return existing;
    try {
      target.setItem(PENDING_SERVER_INVITE_STORAGE_KEY, JSON.stringify(record));
      return read();
    } catch (_) {
      return null;
    }
  };
  const clear = (expectedCode = "") => {
    const expected = normalizePendingServerInviteCode(expectedCode);
    const current = read();
    if (expected && current && current.code.toLowerCase() !== expected.toLowerCase()) return false;
    removeRaw();
    return !!current;
  };
  return { read, remember, clear, has: () => !!read() };
}

export function readPendingServerInvite(options = {}) {
  return createPendingServerInviteStore(options).read();
}

export function rememberPendingServerInvite(code, options = {}) {
  const { capturedAt = null, expiresAt = null, ...storeOptions } = options || {};
  return createPendingServerInviteStore(storeOptions).remember(code, { capturedAt, expiresAt });
}

// Candidates remain in memory until the server confirms their status.
let preflightValidator = async () => ({ status: "unavailable" });
let validationEpoch = 0;
let validationState = { status: "idle" };
let validationCandidate = null;
let validationFlight = null;
const validationListeners = new Set();
export function configurePendingServerInviteValidation(validate) { preflightValidator = validate; }
export function getPendingServerInviteValidationState() { return { ...validationState }; }
export function onPendingServerInviteValidationChange(listener) {
  validationListeners.add(listener);
  return () => validationListeners.delete(listener);
}
function publishValidation(status) {
  validationState = { status };
  for (const listener of validationListeners) { try { listener({ status }); } catch (_) {} }
}
export function clearPendingServerInvite(code = "", options = {}) {
  const expected = normalizePendingServerInviteCode(code);
  if (!expected || validationCandidate?.code.toLowerCase() === expected.toLowerCase()) {
    validationEpoch += 1;
    const candidate = validationCandidate;
    validationCandidate = null;
    validationFlight = null;
    try { void Promise.resolve(candidate?.options?.bridge?.ackPendingServerInvite?.(candidate.code)).catch(() => {}); } catch (_) {}
    publishValidation("idle");
  }
  return createPendingServerInviteStore(options).clear(code);
}

// Carry an unverified candidate only through the fixed local auth navigation.
// It is not a saved invite and the destination must validate it again.
export function pendingServerInviteAuthUrl(defaultUrl, targetWindow = globalThis.window) {
  if (!validationCandidate || validationState.status === "saved" || validationState.status === "idle") return defaultUrl;
  try {
    const url = new URL(defaultUrl, targetWindow.location.href);
    if (url.origin !== targetWindow.location.origin || !/\/(login|register)\.html$/.test(url.pathname)) return defaultUrl;
    url.searchParams.set("server_invite", validationCandidate.code || "!");
    return url.href;
  } catch (_) { return defaultUrl; }
}

export function retryPendingServerInviteValidation() {
  const candidate = validationCandidate;
  return candidate ? validateAndRememberPendingServerInvite(candidate.code, candidate.options) : Promise.resolve(null);
}

export function validateAndRememberPendingServerInvite(codeInput, options = {}) {
  const code = normalizePendingServerInviteCode(codeInput);
  if (validationFlight && validationCandidate?.code.toLowerCase() === code.toLowerCase()
      && validationCandidate.options.storage === options.storage) return validationFlight;
  const epoch = ++validationEpoch;
  validationCandidate = { code, options };
  publishValidation(code ? "checking" : "invalid");
  if (!code) { validationFlight = null; return Promise.resolve(null); }
  const candidate = validationCandidate;
  const flight = (async () => {
    // Defer so a synchronous validator cannot leave a completed flight installed.
    await Promise.resolve();
    let status = "unavailable";
    try { status = (await (options.validate || preflightValidator)(code))?.status || status; } catch (_) {}
    if (epoch !== validationEpoch) return null;
    const terminal = ["invalid", "expired", "revoked", "exhausted", "server_unavailable"].includes(status);
    if (terminal) {
      createPendingServerInviteStore(options).clear(code);
      try { await options.bridge?.ackPendingServerInvite?.(code); } catch (_) {}
      if (epoch === validationEpoch) publishValidation(status);
      return null;
    }
    if (status !== "valid") { publishValidation("unavailable"); return null; }
    const record = rememberPendingServerInvite(code, options);
    if (!record || record.code.toLowerCase() !== code.toLowerCase()) {
      publishValidation("unavailable");
      return null;
    }
    try { await options.bridge?.ackPendingServerInvite?.(code); } catch (_) {}
    if (epoch !== validationEpoch) return null;
    validationCandidate = candidate;
    publishValidation("saved");
    return record;
  })();
  validationFlight = flight;
  void flight.finally(() => { if (epoch === validationEpoch) validationFlight = null; });
  return flight;
}

export function isPendingServerInviteEntry(urlLike, { allowedWebOrigin = "" } = {}) {
  try {
    const url = new URL(String(urlLike || ""), allowedWebOrigin || "https://pending-invite.invalid/");
    if (url.protocol === "altara:") return url.hostname === "invite" || /^\/invite(?:\/|$)/i.test(url.pathname);
    if (!["https:", "http:"].includes(url.protocol) || (allowedWebOrigin && url.origin !== allowedWebOrigin)) return false;
    return INVITE_QUERY_KEYS.some(key => url.searchParams.has(key) || hashSearchParams(url.hash).has(key))
      || /^\/invite(?:\/|$)/i.test(url.pathname);
  } catch (_) { return false; }
}

export function capturePendingServerInviteFromUrl(urlLike, options = {}) {
  const code = extractPendingServerInviteCode(urlLike, options);
  return code || isPendingServerInviteEntry(urlLike, options)
    ? validateAndRememberPendingServerInvite(code, options) : Promise.resolve(null);
}

export function removeInviteEntryFromCurrentUrl({ window: targetWindow = globalThis.window } = {}) {
  if (!targetWindow?.location?.href) return false;
  try {
    const url = new URL(targetWindow.location.href);
    let changed = false;
    for (const key of INVITE_QUERY_KEYS) {
      if (url.searchParams.has(key)) { url.searchParams.delete(key); changed = true; }
    }
    const hashParams = hashSearchParams(url.hash);
    for (const key of INVITE_QUERY_KEYS) {
      if (hashParams.has(key)) { hashParams.delete(key); changed = true; }
    }
    const pathParts = String(url.pathname || "").split("/").filter(Boolean);
    if (pathParts.length === 2 && String(pathParts[0]).toLowerCase() === "invite"
        && normalizePendingServerInviteCode(decodePathPart(pathParts[1]))) {
      url.pathname = "/";
      changed = true;
    }
    if (!changed) return false;
    const nextHash = hashParams.toString();
    const next = `${url.pathname}${url.searchParams.toString() ? `?${url.searchParams}` : ""}${nextHash ? `#${nextHash}` : ""}`;
    targetWindow.history?.replaceState?.(targetWindow.history.state || null, "", next);
    return true;
  } catch (_) {
    return false;
  }
}

export async function capturePendingServerInviteFromCurrentLocation({ window: targetWindow = globalThis.window, ...options } = {}) {
  const href = String(targetWindow?.location?.href || "").trim();
  const origin = String(targetWindow?.location?.origin || "").trim();
  const record = await capturePendingServerInviteFromUrl(href, { ...options, allowedWebOrigin: origin });
  const status = getPendingServerInviteValidationState().status;
  if (record || ["invalid", "expired", "revoked", "exhausted", "server_unavailable"].includes(status)) {
    removeInviteEntryFromCurrentUrl({ window: targetWindow });
  }
  return record;
}

export async function capturePendingServerInviteFromDesktopPayload(payload, options = {}) {
  const rawUrl = typeof payload === "string"
    ? payload.trim()
    : String(payload?.url || payload?.deepLink || payload?.deep_link || "").trim();
  const code = extractPendingServerInviteCode(rawUrl);
  if (!code && !isPendingServerInviteEntry(rawUrl)) return null;
  const hasProviderBounds = payload && typeof payload === "object"
    && (payload.capturedAt != null || payload.expiresAt != null);
  if (hasProviderBounds && !normalizePendingRecord({ v: 1, code, capturedAt: payload.capturedAt, expiresAt: payload.expiresAt }, safeNow(options.now))) return null;
  return validateAndRememberPendingServerInvite(code, {
    ...options,
    ...(hasProviderBounds ? { capturedAt: payload.capturedAt, expiresAt: payload.expiresAt } : {}),
  });
}

export const TERMINAL_PENDING_INVITE_STATUSES = Object.freeze(new Set([
  "invalid", "revoked", "expired", "exhausted", "banned", "server_unavailable", "underage",
]));

export function classifyPendingServerInviteError(error = null) {
  const raw = [error?.message, error?.details, error?.hint, error?.code]
    .map((value) => String(value || "").trim().toLowerCase()).filter(Boolean).join(" ");
  let status = "temporary_error";
  if (/invite_not_found|invite_ambiguous|invalid_invite|invalid invite/.test(raw)) status = "invalid";
  else if (/invite_revoked|revoked/.test(raw)) status = "revoked";
  else if (/invite_expired|expired/.test(raw)) status = "expired";
  else if (/invite_exhausted|maximum number of uses|max uses|usage limit/.test(raw)) status = "exhausted";
  else if (/server_banned|global_banned|banned from/.test(raw)) status = "banned";
  else if (/server_not_active|server_not_found|server deleted/.test(raw)) status = "server_unavailable";
  else if (/underage|age_ineligible/.test(raw)) status = "underage";
  else if (/member_timed_out|timed out/.test(raw)) status = "timed_out";
  else if (/account_policy|policy_completion|missing_dob|missing_terms|missing_privacy/.test(raw)) status = "policy_required";
  else if (/server_member_limit|server_full|server_limit_reached|user_server_limit|limit_exceeded/.test(raw)) status = "capacity";
  else if (/email_not_confirmed|email not confirmed/.test(raw)) status = "email_unconfirmed";
  else if (/failed to fetch|network|timeout|temporar|unavailable|pgrst000/.test(raw)) status = "temporary_error";
  return {
    status,
    terminal: TERMINAL_PENDING_INVITE_STATUSES.has(status),
    retryable: ["temporary_error", "capacity", "policy_required", "email_unconfirmed", "timed_out"].includes(status),
  };
}

export function pendingServerInviteMessage(statusInput = "", translate = null) {
  const status = String(statusInput || "").trim().toLowerCase();
  const messages = ({
    invalid: "This invite is invalid.",
    revoked: "This invite has been revoked.",
    expired: "This invite has expired.",
    exhausted: "This invite has reached its maximum number of uses.",
    banned: "You cannot join this server.",
    server_unavailable: "This server is no longer available.",
    underage: "This account is not eligible to use ALTARA in its policy region.",
    policy_required: "Complete your account information, then retry this invite.",
    capacity: "This server or account has reached its current limit. You can retry later.",
    timed_out: "You cannot join this server while your timeout is active. You can retry later.",
    email_unconfirmed: "Confirm your email, then return to ALTARA to continue.",
    temporary_error: "ALTARA could not join this server right now. Check your connection and retry.",
  });
  const fallback = messages[status] || "ALTARA could not join this server right now.";
  if (typeof translate !== "function") return fallback;
  return translate(messages[status] ? `invite.error.${status}` : "invite.error.generic", fallback);
}

export function createInviteJourneyRecorder({ now = Date.now } = {}) {
  let milestones = {};
  const mark = (name, at = safeNow(now)) => {
    const key = String(name || "").trim();
    if (!/^T[0-6]$/.test(key) || milestones[key]) return snapshot();
    milestones = { ...milestones, [key]: Math.trunc(Number(at)) };
    return snapshot();
  };
  const start = (capturedAt) => {
    const at = Number(capturedAt);
    if (Number.isFinite(at) && at > 0) milestones = { ...milestones, T0: Math.trunc(at) };
    return snapshot();
  };
  const snapshot = () => {
    const ordered = Object.fromEntries(Object.entries(milestones).sort(([a], [b]) => a.localeCompare(b)));
    const durationsMs = {};
    if (ordered.T0) {
      for (const key of Object.keys(ordered)) {
        if (key !== "T0") durationsMs[`${key}-T0`] = Math.max(0, ordered[key] - ordered.T0);
      }
    }
    return { milestones: ordered, durationsMs };
  };
  return { start, mark, snapshot, reset: () => { milestones = {}; } };
}
