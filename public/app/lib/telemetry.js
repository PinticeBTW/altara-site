import {
  BR_TELEMETRY_BATCH_SIZE,
  BR_TELEMETRY_MAX_QUEUE,
  BR_TELEMETRY_SCHEMA_VERSION,
} from "./telemetryConfig.js";

export const TELEMETRY_MODES = Object.freeze({
  DISABLED: "disabled",
  RESTRICTED: "restricted",
  ENABLED: "enabled",
});

export const TELEMETRY_CATEGORIES = Object.freeze({
  OPTIONAL_PRODUCT: "optional_product",
  OPERATIONAL: "operational",
});

const FUNNEL_EVENTS = new Set([
  "invite_opened",
  "signup_started",
  "signup_submitted",
  "auth_completed",
  "email_confirmation_required",
  "email_confirmation_completed",
  "account_policy_required",
  "account_policy_completed",
  "shell_ready",
  "pending_invite_restored",
  "server_join_started",
  "server_join_completed",
  "first_useful_action_available",
  "first_useful_action_completed",
  "funnel_error",
  "referral_attributed",
  "referral_failed",
]);
const TERMINAL_INVITE_FAILURES = new Set(["invite_invalid", "invite_expired", "invite_revoked", "invite_max_uses", "banned"]);

const FAILURE_REASONS = Object.freeze([
  "auth_validation",
  "email_confirmation_pending",
  "invite_invalid",
  "invite_expired",
  "invite_revoked",
  "invite_max_uses",
  "server_limit",
  "banned",
  "policy_incomplete",
  "policy_underage",
  "network_error",
  "backend_error",
  "unknown",
]);

const ERROR_CODES = Object.freeze([
  "abort_error",
  "auth_error",
  "backend_error",
  "network_error",
  "permission_denied",
  "reference_error",
  "syntax_error",
  "type_error",
  "unhandled_rejection",
  "runtime_error",
  "renderer_process_gone",
  "main_uncaught_exception",
  "main_unhandled_rejection",
  "unknown",
]);

const textCode = (max = 64) => Object.freeze({ type: "code", max });
const enumOf = (...values) => Object.freeze({ type: "enum", values: Object.freeze(values.flat()) });
const booleanField = Object.freeze({ type: "boolean" });

export const TELEMETRY_EVENT_DEFINITIONS = Object.freeze({
  session_started: Object.freeze({
    category: TELEMETRY_CATEGORIES.OPERATIONAL,
    properties: Object.freeze({ entrypoint: enumOf("app", "login", "register", "invite", "unknown") }),
  }),
  invite_opened: Object.freeze({
    category: TELEMETRY_CATEGORIES.OPTIONAL_PRODUCT,
    properties: Object.freeze({ path: enumOf("web", "desktop", "unknown") }),
  }),
  signup_started: Object.freeze({
    category: TELEMETRY_CATEGORIES.OPTIONAL_PRODUCT,
    properties: Object.freeze({ path: enumOf("invite", "organic") }),
  }),
  signup_submitted: Object.freeze({
    category: TELEMETRY_CATEGORIES.OPTIONAL_PRODUCT,
    properties: Object.freeze({ path: enumOf("invite", "organic") }),
  }),
  auth_completed: Object.freeze({
    category: TELEMETRY_CATEGORIES.OPTIONAL_PRODUCT,
    properties: Object.freeze({ method: enumOf("password", "signup_session", "email_confirmation", "oauth", "session_restore", "unknown") }),
  }),
  email_confirmation_required: Object.freeze({ category: TELEMETRY_CATEGORIES.OPTIONAL_PRODUCT, properties: Object.freeze({}) }),
  email_confirmation_completed: Object.freeze({ category: TELEMETRY_CATEGORIES.OPTIONAL_PRODUCT, properties: Object.freeze({}) }),
  account_policy_required: Object.freeze({
    category: TELEMETRY_CATEGORIES.OPTIONAL_PRODUCT,
    properties: Object.freeze({ reason_code: enumOf("missing_region", "missing_dob", "missing_terms", "missing_privacy", "outdated_policy", "underage", "policy_unavailable", "unknown") }),
  }),
  account_policy_completed: Object.freeze({ category: TELEMETRY_CATEGORIES.OPTIONAL_PRODUCT, properties: Object.freeze({}) }),
  shell_ready: Object.freeze({ category: TELEMETRY_CATEGORIES.OPTIONAL_PRODUCT, properties: Object.freeze({}) }),
  pending_invite_restored: Object.freeze({ category: TELEMETRY_CATEGORIES.OPTIONAL_PRODUCT, properties: Object.freeze({}) }),
  server_join_started: Object.freeze({ category: TELEMETRY_CATEGORIES.OPTIONAL_PRODUCT, properties: Object.freeze({}) }),
  server_join_completed: Object.freeze({
    category: TELEMETRY_CATEGORIES.OPTIONAL_PRODUCT,
    properties: Object.freeze({ result: enumOf("joined", "already_member") }),
  }),
  first_useful_action_available: Object.freeze({
    category: TELEMETRY_CATEGORIES.OPTIONAL_PRODUCT,
    properties: Object.freeze({ action_type: enumOf("message_composer", "text_channel", "voice_channel") }),
  }),
  first_useful_action_completed: Object.freeze({
    category: TELEMETRY_CATEGORIES.OPTIONAL_PRODUCT,
    properties: Object.freeze({ action_type: enumOf("message_sent", "channel_opened", "voice_joined") }),
  }),
  referral_attributed: Object.freeze({
    category: TELEMETRY_CATEGORIES.OPTIONAL_PRODUCT,
    properties: Object.freeze({ source: enumOf("server_invite"), campaign: enumOf("br-launch"), campaign_version: enumOf("1"), outcome: enumOf("attributed") }),
  }),
  referral_failed: Object.freeze({
    category: TELEMETRY_CATEGORIES.OPTIONAL_PRODUCT,
    properties: Object.freeze({ source: enumOf("server_invite"), campaign: enumOf("br-launch"), campaign_version: enumOf("1"), outcome: enumOf("self_referral", "outside_window", "inviter_unavailable", "account_unavailable") }),
  }),
  funnel_error: Object.freeze({
    category: TELEMETRY_CATEGORIES.OPTIONAL_PRODUCT,
    properties: Object.freeze({ stage: textCode(48), reason_code: enumOf(FAILURE_REASONS) }),
  }),
  client_error: Object.freeze({
    category: TELEMETRY_CATEGORIES.OPERATIONAL,
    properties: Object.freeze({
      error_code: enumOf(ERROR_CODES),
      component: textCode(48),
      operation: textCode(48),
      fingerprint: textCode(80),
      sanitized_stack: Object.freeze({ type: "stack", max: 2048 }),
      process_type: enumOf("web", "renderer", "main"),
    }),
  }),
  client_crash: Object.freeze({
    category: TELEMETRY_CATEGORIES.OPERATIONAL,
    properties: Object.freeze({
      error_code: enumOf(ERROR_CODES),
      component: textCode(48),
      operation: textCode(48),
      fingerprint: textCode(80),
      sanitized_stack: Object.freeze({ type: "stack", max: 2048 }),
      process_type: enumOf("renderer", "main"),
      crash_reason: textCode(48),
    }),
  }),
});

const SENSITIVE_KEY = /(?:^|_)(?:email|e_mail|username|display_name|dob|birth|exact_age|message|content|body|invite_code|invite_url|url|token|jwt|secret|password|server_name|channel_name|filename|file_name|query|clipboard|access_token|refresh_token)(?:$|_)/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE = /^[a-z0-9][a-z0-9_.-]*$/i;
const RELEASE = /^(?:\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?|local-development)$/i;
const LOCALES = new Set(["en", "pt-PT", "pt-BR", "unknown"]);
const PLATFORMS = new Set(["web", "electron_renderer", "electron_main"]);
const OS_FAMILIES = new Set(["windows", "macos", "linux", "web", "unknown"]);
const POLICY_REGIONS = new Set(["br", "non_br", "unknown"]);
const JOURNEY_KINDS = new Set(["invite", "organic", "auth"]);
const JOURNEY_STORAGE_KEY = "altara_telemetry_journey_v1";
const SESSION_STORAGE_KEY = "altara_telemetry_session_v1";
const MODE_GUARD_STORAGE_KEY = "altara_telemetry_mode_guard_v1";
const JOURNEY_TTL_MS = 48 * 60 * 60 * 1000;

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function containsSensitiveKey(value, depth = 0) {
  if (depth > 4 || !value || typeof value !== "object") return false;
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(String(key))) return true;
    if (containsSensitiveKey(child, depth + 1)) return true;
  }
  return false;
}

function normalizeCode(value, max = 64) {
  const code = String(value || "").trim().toLowerCase();
  return code && code.length <= max && CODE.test(code) ? code : "";
}

function validateProperty(name, value, rule) {
  if (rule.type === "boolean") {
    if (typeof value !== "boolean") throw new TypeError(`invalid telemetry property: ${name}`);
    return value;
  }
  if (rule.type === "enum") {
    const normalized = String(value || "").trim().toLowerCase();
    if (!rule.values.includes(normalized)) throw new TypeError(`invalid telemetry property: ${name}`);
    return normalized;
  }
  if (rule.type === "code") {
    const normalized = normalizeCode(value, rule.max);
    if (!normalized) throw new TypeError(`invalid telemetry property: ${name}`);
    return normalized;
  }
  if (rule.type === "stack") {
    const stack = String(value || "").trim();
    const frames = stack ? stack.split("\n") : [];
    const validFrames = frames.length <= 8 && frames.every((frame) =>
      /^[a-z0-9_$.[\]<>-]+@[a-z0-9_.-]+\.(?:js|mjs|cjs|ts|html):\d{1,7}:\d{1,5}$/i.test(frame)
    );
    if (stack.length > rule.max || !validFrames || /https?:|file:|[?&=]|\\users\\|\b(?:bearer|eyj[a-z0-9_-]{8,})\b/i.test(stack)) {
      throw new TypeError(`invalid telemetry property: ${name}`);
    }
    return stack;
  }
  throw new TypeError(`unknown telemetry property rule: ${name}`);
}

export function sanitizeTelemetryProperties(eventName, input = {}) {
  const definition = TELEMETRY_EVENT_DEFINITIONS[eventName];
  if (!definition) throw new TypeError("unknown telemetry event");
  const properties = asObject(input);
  if (containsSensitiveKey(properties)) throw new TypeError("sensitive telemetry property rejected");
  const allowed = definition.properties;
  for (const key of Object.keys(properties)) {
    if (!Object.hasOwn(allowed, key)) throw new TypeError(`unknown telemetry property: ${key}`);
  }
  for (const key of Object.keys(allowed)) {
    if (!Object.hasOwn(properties, key)) throw new TypeError(`missing telemetry property: ${key}`);
  }
  const result = {};
  for (const [key, value] of Object.entries(properties)) {
    result[key] = validateProperty(key, value, allowed[key]);
  }
  return Object.freeze(result);
}

export function mapTelemetryFailureReason(value = null) {
  const text = String(value?.code || value?.status || value?.message || value || "").toLowerCase();
  if (/email.*confirm|confirm.*email/.test(text)) return "email_confirmation_pending";
  if (/invite.*invalid|invalid.*invite/.test(text)) return "invite_invalid";
  if (/invite.*expir|expired/.test(text)) return "invite_expired";
  if (/invite.*revok|revoked/.test(text)) return "invite_revoked";
  if (/max.*use|exhaust/.test(text)) return "invite_max_uses";
  if (/capacity|server.*limit|account.*limit/.test(text)) return "server_limit";
  if (/banned|global_ban|server_ban/.test(text)) return "banned";
  if (/underage/.test(text)) return "policy_underage";
  if (/policy|missing_(?:dob|region|terms|privacy)/.test(text)) return "policy_incomplete";
  if (/network|fetch|offline|timeout/.test(text)) return "network_error";
  if (/auth|credential|password|validation/.test(text)) return "auth_validation";
  if (text) return "backend_error";
  return "unknown";
}

export function mapTelemetryErrorCode(value = null, fallback = "runtime_error") {
  const error = value?.reason || value?.error || value || null;
  const name = String(error?.name || "").toLowerCase();
  const text = String(error?.code || error?.message || error || "").toLowerCase();
  if (name === "referenceerror" || text.includes("referenceerror")) return "reference_error";
  if (name === "typeerror" || text.includes("typeerror")) return "type_error";
  if (name === "syntaxerror" || text.includes("syntaxerror")) return "syntax_error";
  if (name === "aborterror" || text.includes("aborterror")) return "abort_error";
  if (name === "notallowederror" || /permission|42501/.test(text)) return "permission_denied";
  if (/network|fetch|offline|timeout/.test(text)) return "network_error";
  if (/auth|credential|jwt/.test(text)) return "auth_error";
  return ERROR_CODES.includes(fallback) ? fallback : "unknown";
}

function stackFrame(line = "") {
  const raw = String(line || "").trim().replace(/[?#].*$/, "");
  const match = raw.match(/^at\s+(?:(?<fn>[a-z0-9_$.[\]<>-]+)\s+\()?[^\n]*?[\\/](?<file>[a-z0-9_.-]+\.(?:js|mjs|cjs|ts|html)):(?<line>\d{1,7})(?::(?<column>\d{1,5}))?\)?$/i)
    || raw.match(/^at\s+(?<fn>[a-z0-9_$.[\]<>-]+):(?<line>\d{1,7})(?::(?<column>\d{1,5}))?$/i);
  if (!match?.groups) return "";
  const fn = normalizeCode(String(match.groups.fn || "anonymous").replace(/\[as\s+[^\]]+\]/i, ""), 80) || "anonymous";
  const file = String(match.groups.file || "runtime").toLowerCase();
  return `${fn}@${file}:${Number(match.groups.line) || 0}:${Number(match.groups.column) || 0}`;
}

export function sanitizeTelemetryStack(value = null) {
  const stack = String(value?.stack || value?.reason?.stack || value?.error?.stack || "");
  const frames = stack.split(/\r?\n/).map(stackFrame).filter(Boolean).slice(0, 8);
  return frames.join("\n").slice(0, 2048);
}

function hashText(value = "") {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function availableStorage(explicit, fallbackName) {
  if (explicit) return explicit;
  try { return globalThis[fallbackName] || null; } catch (_) { return null; }
}

function createUuid(randomUUID = () => globalThis.crypto?.randomUUID?.()) {
  try {
    const value = String(randomUUID?.() || "").trim().toLowerCase();
    return UUID.test(value) ? value : "";
  } catch (_) {
    return "";
  }
}

function readJson(storage, key) {
  try {
    const value = JSON.parse(storage?.getItem?.(key) || "null");
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch (_) { return null; }
}

function writeJson(storage, key, value) {
  try { storage?.setItem?.(key, JSON.stringify(value)); return true; } catch (_) { return false; }
}

function normalizeContext(input = {}) {
  const source = asObject(input);
  const platform = PLATFORMS.has(source.platform) ? source.platform : "web";
  const osFamily = OS_FAMILIES.has(source.osFamily) ? source.osFamily : (platform === "web" ? "web" : "unknown");
  const locale = LOCALES.has(source.locale) ? source.locale : "unknown";
  const policyRegion = POLICY_REGIONS.has(source.policyRegion) ? source.policyRegion : "unknown";
  const release = RELEASE.test(String(source.release || "")) ? String(source.release) : "";
  return { platform, os_family: osFamily, locale, policy_region: policyRegion, release };
}

function normalizeMode(mode) {
  return Object.values(TELEMETRY_MODES).includes(mode) ? mode : TELEMETRY_MODES.DISABLED;
}

export function buildTelemetryEvent({
  name,
  properties = {},
  context = {},
  sessionId,
  journeyId = "",
  journeyKind = "",
  sequence,
  occurredAt = new Date().toISOString(),
  durationMs = null,
  eventId,
}) {
  const definition = TELEMETRY_EVENT_DEFINITIONS[name];
  if (!definition) throw new TypeError("unknown telemetry event");
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.release) throw new TypeError("telemetry release unavailable");
  if (!UUID.test(String(eventId || "")) || !UUID.test(String(sessionId || ""))) throw new TypeError("invalid telemetry identifier");
  if (journeyId && !UUID.test(String(journeyId))) throw new TypeError("invalid telemetry journey");
  if (journeyKind && !JOURNEY_KINDS.has(journeyKind)) throw new TypeError("invalid telemetry journey kind");
  const timestamp = new Date(occurredAt);
  if (!Number.isFinite(timestamp.getTime())) throw new TypeError("invalid telemetry timestamp");
  const safeDuration = durationMs == null ? null : Math.max(0, Math.min(24 * 60 * 60 * 1000, Math.round(Number(durationMs))));
  if (durationMs != null && !Number.isFinite(safeDuration)) throw new TypeError("invalid telemetry duration");
  return Object.freeze({
    event_id: String(eventId).toLowerCase(),
    event_name: name,
    category: definition.category,
    schema_version: BR_TELEMETRY_SCHEMA_VERSION,
    occurred_at: timestamp.toISOString(),
    platform: normalizedContext.platform,
    os_family: normalizedContext.os_family,
    release: normalizedContext.release,
    locale: normalizedContext.locale,
    policy_region: normalizedContext.policy_region,
    session_id: String(sessionId).toLowerCase(),
    journey_id: journeyId ? String(journeyId).toLowerCase() : null,
    journey_kind: journeyKind || null,
    sequence: Math.max(1, Math.trunc(Number(sequence) || 1)),
    duration_ms: safeDuration,
    properties: sanitizeTelemetryProperties(name, properties),
  });
}

export function createTelemetryClient({
  enabled = false,
  mode = TELEMETRY_MODES.DISABLED,
  context = {},
  transport = null,
  inspector = null,
  localStorage = null,
  sessionStorage = null,
  now = () => Date.now(),
  randomUUID = () => globalThis.crypto?.randomUUID?.(),
  maxQueue = BR_TELEMETRY_MAX_QUEUE,
  batchSize = BR_TELEMETRY_BATCH_SIZE,
  flushDelayMs = 750,
} = {}) {
  const durable = availableStorage(localStorage, "localStorage");
  const sessionStore = availableStorage(sessionStorage, "sessionStorage");
  const sessionId = enabled ? (() => {
    const existing = String(readJson(sessionStore, SESSION_STORAGE_KEY)?.id || "").toLowerCase();
    if (UUID.test(existing)) return existing;
    const created = createUuid(randomUUID);
    if (created) writeJson(sessionStore, SESSION_STORAGE_KEY, { id: created });
    return created;
  })() : "";
  let requestedMode = enabled ? normalizeMode(mode) : TELEMETRY_MODES.DISABLED;
  const persistedGuard = enabled ? readJson(durable, MODE_GUARD_STORAGE_KEY) : null;
  let restrictionGuardActive = persistedGuard?.mode === TELEMETRY_MODES.RESTRICTED;
  let currentMode = restrictionGuardActive && requestedMode === TELEMETRY_MODES.ENABLED
    ? TELEMETRY_MODES.RESTRICTED
    : requestedMode;
  let currentContext = normalizeContext(context);
  let queue = [];
  let deferred = [];
  let sequence = 0;
  let flushTimer = null;
  let flushing = false;
  let activeBatch = [];
  let failedFlushes = 0;
  const sessionDedupe = new Set();

  function inspect(kind, value) {
    try { inspector?.(Object.freeze({ kind, value })); } catch (_) {}
  }

  function readJourney() {
    const value = readJson(durable, JOURNEY_STORAGE_KEY);
    const valid = value && UUID.test(String(value.id || "")) && JOURNEY_KINDS.has(value.kind)
      && Number.isFinite(Number(value.started_at)) && now() - Number(value.started_at) >= 0
      && now() - Number(value.started_at) <= JOURNEY_TTL_MS;
    if (!valid) return null;
    return {
      id: String(value.id).toLowerCase(),
      kind: value.kind,
      started_at: Math.trunc(Number(value.started_at)),
      seen: Array.isArray(value.seen) ? value.seen.filter((item) => typeof item === "string").slice(-64) : [],
    };
  }

  function startJourney(kind, { replace = false } = {}) {
    if (currentMode === TELEMETRY_MODES.DISABLED || !JOURNEY_KINDS.has(kind)) return null;
    const existing = readJourney();
    if (!replace && existing && (existing.kind === kind || (existing.kind === "invite" && kind !== "invite"))) return existing;
    const id = createUuid(randomUUID);
    if (!id) return null;
    const value = { id, kind, started_at: Math.trunc(now()), seen: [] };
    writeJson(durable, JOURNEY_STORAGE_KEY, value);
    return value;
  }

  function markJourneySeen(journey, key) {
    if (!journey || journey.seen.includes(key)) return false;
    journey.seen = [...journey.seen, key].slice(-64);
    writeJson(durable, JOURNEY_STORAGE_KEY, journey);
    return true;
  }

  function scheduleFlush() {
    if (flushTimer || typeof transport !== "function") return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush();
    }, Math.max(0, Number(flushDelayMs) || 0));
    flushTimer?.unref?.();
  }

  function acceptsCategory(category) {
    return currentMode === TELEMETRY_MODES.ENABLED
      || (currentMode === TELEMETRY_MODES.RESTRICTED && category === TELEMETRY_CATEGORIES.OPERATIONAL);
  }

  function applyMode(nextMode) {
    currentMode = enabled ? normalizeMode(nextMode) : TELEMETRY_MODES.DISABLED;
    queue = queue.filter((entry) => acceptsCategory(entry.event.category));
    deferred = deferred.filter((raw) => acceptsCategory(TELEMETRY_EVENT_DEFINITIONS[raw.name]?.category));
    if (currentMode === TELEMETRY_MODES.DISABLED) {
      try { durable?.removeItem?.(JOURNEY_STORAGE_KEY); } catch (_) {}
    }
    return currentMode;
  }

  function setRequestedMode(nextMode) {
    requestedMode = enabled ? normalizeMode(nextMode) : TELEMETRY_MODES.DISABLED;
    return applyMode(restrictionGuardActive && requestedMode === TELEMETRY_MODES.ENABLED
      ? TELEMETRY_MODES.RESTRICTED
      : requestedMode);
  }

  function commitRaw(raw) {
    let event;
    try {
      event = buildTelemetryEvent({ ...raw, context: currentContext });
    } catch (error) {
      inspect("rejected", { event_name: raw.name, reason: String(error?.message || "invalid_event") });
      return false;
    }
    if (!acceptsCategory(event.category)) {
      inspect("dropped", { event_name: raw.name, reason: "disabled_or_restricted" });
      return false;
    }
    queue.push({ event, attempts: 0 });
    if (queue.length > Math.max(1, maxQueue)) queue.splice(0, queue.length - Math.max(1, maxQueue));
    inspect("event", event);
    scheduleFlush();
    return true;
  }

  function enqueue(name, properties, { journey = null, durationMs = null, dedupeKey = "" } = {}) {
    const definition = TELEMETRY_EVENT_DEFINITIONS[name];
    if (!definition || !sessionId || !acceptsCategory(definition.category)) {
      inspect("dropped", { event_name: name, reason: !definition ? "unknown_event" : "disabled_or_restricted" });
      return false;
    }
    if (dedupeKey && sessionDedupe.has(dedupeKey)) return false;
    const eventId = createUuid(randomUUID);
    if (!eventId) return false;
    try {
      sanitizeTelemetryProperties(name, properties);
    } catch (error) {
      inspect("rejected", { event_name: name, reason: String(error?.message || "invalid_event") });
      return false;
    }
    if (dedupeKey) sessionDedupe.add(dedupeKey);
    const raw = {
      name,
      properties,
      sessionId,
      journeyId: journey?.id || "",
      journeyKind: journey?.kind || "",
      sequence: ++sequence,
      occurredAt: new Date(now()).toISOString(),
      durationMs,
      eventId,
    };
    if (!currentContext.release) {
      deferred.push(raw);
      if (deferred.length > Math.max(1, maxQueue)) deferred.splice(0, deferred.length - Math.max(1, maxQueue));
      inspect("deferred", { event_name: name, reason: "release_pending" });
      return true;
    }
    return commitRaw(raw);
  }

  function track(name, properties = {}, options = {}) {
    return enqueue(name, properties, options);
  }

  function trackFunnel(name, properties = {}) {
    if (!FUNNEL_EVENTS.has(name) || currentMode !== TELEMETRY_MODES.ENABLED) return false;
    let journey = readJourney();
    const kind = name === "invite_opened" || properties.path === "invite"
      ? "invite"
      : (name.startsWith("signup_") ? "organic" : "auth");
    if (name === "invite_opened" && journey?.kind !== "invite") journey = startJourney("invite", { replace: true });
    const canBeginJourney = name === "invite_opened" || name === "signup_started" || name === "auth_completed";
    if (!journey && !canBeginJourney) return false;
    journey ||= startJourney(kind);
    if (!journey) return false;
    const reasonSuffix = name === "funnel_error" ? `:${String(properties.reason_code || "unknown")}:${String(properties.stage || "unknown")}` : "";
    const seenKey = `${name}${reasonSuffix}`;
    if (!markJourneySeen(journey, seenKey)) return false;
    const accepted = enqueue(name, properties, { journey, durationMs: Math.max(0, now() - journey.started_at) });
    const journeyEnded = name === "first_useful_action_completed"
      || (name === "funnel_error" && TERMINAL_INVITE_FAILURES.has(properties.reason_code));
    if (accepted && journeyEnded) {
      try { durable?.removeItem?.(JOURNEY_STORAGE_KEY); } catch (_) {}
    }
    return accepted;
  }

  function timing(name, durationMs, properties = {}) {
    return enqueue(name, properties, { durationMs });
  }

  function error(value, {
    crash = false,
    component = "runtime",
    operation = "execute",
    processType = "web",
    errorCode = "",
    crashReason = "unknown",
  } = {}) {
    const code = mapTelemetryErrorCode(value, errorCode || (value?.reason ? "unhandled_rejection" : "runtime_error"));
    const stack = sanitizeTelemetryStack(value);
    const safeComponent = normalizeCode(component, 48) || "runtime";
    const safeOperation = normalizeCode(operation, 48) || "execute";
    const safeProcess = ["web", "renderer", "main"].includes(processType) ? processType : "web";
    const fingerprint = hashText(`${code}|${safeComponent}|${safeOperation}|${stack}`);
    const properties = {
      error_code: code,
      component: safeComponent,
      operation: safeOperation,
      fingerprint,
      sanitized_stack: stack,
      process_type: safeProcess,
      ...(crash ? { crash_reason: normalizeCode(crashReason, 48) || "unknown" } : {}),
    };
    return enqueue(crash ? "client_crash" : "client_error", properties);
  }

  async function flush(options = {}) {
    queue = queue.filter((entry) => acceptsCategory(entry.event.category));
    const keepalive = options?.keepalive === true;
    if (currentMode === TELEMETRY_MODES.DISABLED || typeof transport !== "function") return false;
    if (flushing && keepalive) {
      const stillAuthorizedActive = activeBatch.filter((entry) => acceptsCategory(entry.event.category));
      const emergency = [...queue, ...stillAuthorizedActive].slice(0, Math.max(1, batchSize));
      if (!emergency.length) return false;
      try {
        await transport(Object.freeze(emergency.map((entry) => entry.event)), Object.freeze({ keepalive: true }));
        const deliveredQueued = new Set(emergency.filter((entry) => queue.includes(entry)));
        queue = queue.filter((entry) => !deliveredQueued.has(entry));
        inspect("flush", { accepted: emergency.length, keepalive: true, concurrent: true });
        return true;
      } catch (_) {
        inspect("flush_failed", { count: emergency.length, keepalive: true, concurrent: true });
        return false;
      }
    }
    if (flushing || !queue.length) return false;
    flushing = true;
    const selected = queue.splice(0, Math.max(1, batchSize));
    activeBatch = selected;
    try {
      await transport(Object.freeze(selected.map((entry) => entry.event)), Object.freeze({ keepalive }));
      failedFlushes = 0;
      inspect("flush", { accepted: selected.length });
      if (queue.length) scheduleFlush();
      return true;
    } catch (_) {
      failedFlushes += 1;
      for (const entry of selected) entry.attempts += 1;
      queue = [...selected.filter((entry) => entry.attempts < 2 && acceptsCategory(entry.event.category)), ...queue];
      if (queue.length > Math.max(1, maxQueue)) queue.splice(Math.max(1, maxQueue));
      inspect("flush_failed", { count: selected.length });
      if (queue.length && failedFlushes < 2) {
        flushTimer = setTimeout(() => { flushTimer = null; void flush(); }, 5000);
        flushTimer?.unref?.();
      }
      return false;
    } finally {
      activeBatch = [];
      flushing = false;
    }
  }

  function setContext(patch = {}) {
    currentContext = normalizeContext({
      platform: patch.platform ?? currentContext.platform,
      osFamily: patch.osFamily ?? currentContext.os_family,
      release: patch.release ?? currentContext.release,
      locale: patch.locale ?? currentContext.locale,
      policyRegion: patch.policyRegion ?? currentContext.policy_region,
    });
    if (currentContext.release && deferred.length) {
      const pending = deferred;
      deferred = [];
      for (const raw of pending) commitRaw(raw);
    }
    return { ...currentContext };
  }

  function identifyMinimal({ accountClass = "unknown", policyRegion = "unknown" } = {}) {
    const safeClass = ["br_minor", "adult_or_non_br", "unknown"].includes(accountClass) ? accountClass : "unknown";
    setContext({ policyRegion });
    if (safeClass === "br_minor") {
      writeJson(durable, MODE_GUARD_STORAGE_KEY, { mode: TELEMETRY_MODES.RESTRICTED });
      restrictionGuardActive = true;
      applyMode(requestedMode === TELEMETRY_MODES.DISABLED ? TELEMETRY_MODES.DISABLED : TELEMETRY_MODES.RESTRICTED);
    } else if (safeClass === "adult_or_non_br") {
      try { durable?.removeItem?.(MODE_GUARD_STORAGE_KEY); } catch (_) {}
      restrictionGuardActive = false;
      applyMode(requestedMode);
    }
    return Object.freeze({ account_class: safeClass, mode: currentMode });
  }

  function endJourney() {
    const existing = readJourney();
    try { durable?.removeItem?.(JOURNEY_STORAGE_KEY); } catch (_) {}
    return existing !== null;
  }

  return Object.freeze({
    track,
    timing,
    error,
    endJourney,
    identifyMinimal,
    flush,
    trackFunnel,
    startSession: (entrypoint = "unknown") => enqueue("session_started", { entrypoint }, { dedupeKey: "session_started" }),
    startJourney,
    setContext,
    setMode: setRequestedMode,
    getState: () => Object.freeze({ mode: currentMode, queue_size: queue.length + deferred.length, session_id: sessionId, context: { ...currentContext }, journey: readJourney() }),
  });
}
