const NATIVE_SCREENSHARE_COMPANION_TYPE = "native_screenshare_companion";
const NATIVE_SCREENSHARE_COMPANION_SOURCE = "screen_share";
const NATIVE_SCREENSHARE_COMPANION_MARKER = ":native-screen:";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_PATTERN = /^[0-9a-f]{24}$/i;

function normalize(value) {
  return String(value || "").trim();
}

function parseJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

export function parseNativeScreenshareCompanionIdentity(value) {
  const identity = normalize(value);
  const markerIndex = identity.indexOf(NATIVE_SCREENSHARE_COMPANION_MARKER);
  if (markerIndex <= 0 || markerIndex !== identity.lastIndexOf(NATIVE_SCREENSHARE_COMPANION_MARKER)) return null;
  const ownerUserId = identity.slice(0, markerIndex);
  const sessionId = identity.slice(markerIndex + NATIVE_SCREENSHARE_COMPANION_MARKER.length);
  if (!UUID_PATTERN.test(ownerUserId) || !SESSION_PATTERN.test(sessionId)) return null;
  return { identity, ownerUserId, sessionId };
}

export function resolveNativeScreenshareCompanion(participant = null) {
  const parsedIdentity = parseNativeScreenshareCompanionIdentity(participant?.identity || "");
  if (!parsedIdentity) return null;
  const metadata = parseJsonObject(participant?.metadata);
  const attributes = participant?.attributes && typeof participant.attributes === "object"
    ? participant.attributes
    : {};
  const type = normalize(attributes.participant_type || metadata.type || metadata.participantType);
  const ownerUserId = normalize(attributes.owner_user_id || metadata.owner_user_id || metadata.ownerUserId);
  const sessionId = normalize(attributes.session_id || metadata.session_id || metadata.sessionId);
  const source = normalize(attributes.source || metadata.source);
  if (
    type !== NATIVE_SCREENSHARE_COMPANION_TYPE
    || ownerUserId !== parsedIdentity.ownerUserId
    || sessionId !== parsedIdentity.sessionId
    || source !== NATIVE_SCREENSHARE_COMPANION_SOURCE
  ) return null;
  return Object.freeze({ ...parsedIdentity, type, source });
}

export function isNativeScreenshareCompanionParticipant(participant = null) {
  return !!resolveNativeScreenshareCompanion(participant);
}

export const LIVEKIT_TECHNICAL_PARTICIPANT_CONTRACT = Object.freeze({
  nativeScreenshareType: NATIVE_SCREENSHARE_COMPANION_TYPE,
  nativeScreenshareSource: NATIVE_SCREENSHARE_COMPANION_SOURCE,
  identityMarker: NATIVE_SCREENSHARE_COMPANION_MARKER,
});
