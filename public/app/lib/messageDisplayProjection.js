const PRIVATE_CALL_SOURCE_RE = /^private_call_generation:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(?:started|ended|missed|declined|cancelled)$/i;
const SERVER_EVENT_SOURCE_RE = /^(?:server_voice_session|server_membership_event):/;

export const MESSAGE_KIND = Object.freeze({
  PLAINTEXT: "PLAINTEXT",
  SYSTEM_CALL_STARTED: "SYSTEM_CALL_STARTED",
  SYSTEM_CALL_ENDED: "SYSTEM_CALL_ENDED",
  SYSTEM_CALL_MISSED: "SYSTEM_CALL_MISSED",
  SYSTEM_CALL_DECLINED: "SYSTEM_CALL_DECLINED",
  SYSTEM_CALL_CANCELLED: "SYSTEM_CALL_CANCELLED",
  OTHER_TRUSTED_SYSTEM: "OTHER_TRUSTED_SYSTEM",
  LEGACY_CALL_RECORD: "LEGACY_CALL_RECORD",
});

export function normalizeTrustedMessageEventType(value = "") {
  const type = String(value || "").trim().toLowerCase();
  return type === "call_event" || type === "system_event" || type === "system"
    ? type
    : null;
}

export function normalizeTrustedMessageEventSourceId(value = "") {
  const sourceId = String(value || "").trim();
  if (!sourceId || sourceId.length > 160) return null;
  return SERVER_EVENT_SOURCE_RE.test(sourceId) || PRIVATE_CALL_SOURCE_RE.test(sourceId)
    ? sourceId
    : null;
}

export function isTrustedMessageEventRow(message = {}, parsed = null) {
  const trustedType = normalizeTrustedMessageEventType(message?.trusted_event_type);
  const rawSource = String(message?.trusted_event_source_id || "").trim();
  const trustedSource = normalizeTrustedMessageEventSourceId(message?.trusted_event_source_id);
  const parsedType = String(parsed?.type || "").trim().toLowerCase();
  return !!(trustedType && trustedType === parsedType && (!rawSource || trustedSource));
}

export function classifyMessageKind(message = {}, parsed = null) {
  const parsedType = String(parsed?.type || "").trim().toLowerCase();
  if (!isTrustedMessageEventRow(message, parsed)) {
    return parsedType === "call_event"
      ? MESSAGE_KIND.LEGACY_CALL_RECORD
      : MESSAGE_KIND.PLAINTEXT;
  }
  if (parsedType !== "call_event") return MESSAGE_KIND.OTHER_TRUSTED_SYSTEM;
  const event = String(parsed?.event || "").trim().toLowerCase();
  if (event === "ended") return MESSAGE_KIND.SYSTEM_CALL_ENDED;
  if (event === "missed") return MESSAGE_KIND.SYSTEM_CALL_MISSED;
  if (event === "declined") return MESSAGE_KIND.SYSTEM_CALL_DECLINED;
  if (event === "cancelled") return MESSAGE_KIND.SYSTEM_CALL_CANCELLED;
  return MESSAGE_KIND.SYSTEM_CALL_STARTED;
}

export function createMessageDisplayProjection(message = {}, parsed = null, {
  fallbackActor = "Someone",
} = {}) {
  const kind = classifyMessageKind(message, parsed);
  const createdAt = String(message?.created_at || message?.createdAt || "");
  if (kind === MESSAGE_KIND.LEGACY_CALL_RECORD) {
    return Object.freeze({
      kind,
      trusted: false,
      presentationOnly: true,
      createdAt,
    });
  }
  if (!kind.startsWith("SYSTEM_") && kind !== MESSAGE_KIND.OTHER_TRUSTED_SYSTEM) return null;
  const rawDuration = parsed?.durationMs;
  const duration = rawDuration === null || rawDuration === undefined
    ? Number.NaN
    : Number(rawDuration);
  return Object.freeze({
    kind,
    trusted: true,
    presentationOnly: false,
    eventType: String(parsed?.type || "").trim().toLowerCase(),
    event: String(parsed?.event || "").trim().toLowerCase(),
    phase: String(parsed?.phase || "").trim().toLowerCase(),
    actorLabel: String(parsed?.actor || fallbackActor || "Someone").trim() || "Someone",
    durationMs: Number.isFinite(duration) && duration >= 0 ? Math.round(duration) : null,
    createdAt,
  });
}

export function createTrustedSystemDisplayProjection(message = {}, parsed = null, options = {}) {
  const projection = createMessageDisplayProjection(message, parsed, options);
  return projection?.trusted === true ? projection : null;
}
