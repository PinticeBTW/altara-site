function normalizeKeyPart(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeSessionId(value) {
  return String(value || "").trim();
}

function hasOwn(input, key) {
  return !!input && Object.prototype.hasOwnProperty.call(input, key);
}

function readKnownBoolean(input, valueKeys, knownKeys = []) {
  for (const key of knownKeys) {
    if (hasOwn(input, key) && typeof input[key] === "boolean") {
      if (!input[key]) return { known: false, value: false };
      break;
    }
  }
  for (const key of valueKeys) {
    if (hasOwn(input, key) && input[key] != null) {
      return { known: true, value: input[key] === true };
    }
  }
  return { known: false, value: false };
}

function normalizeState(input = {}) {
  const selfMutedField = readKnownBoolean(
    input,
    ["selfMuted", "self_muted"],
    ["hasSelfMuted", "has_self_muted"],
  );
  const selfDeafenedField = readKnownBoolean(
    input,
    ["selfDeafened", "self_deafened", "deafened"],
    ["hasSelfDeafened", "has_self_deafened"],
  );
  const microphoneField = readKnownBoolean(
    input,
    ["micMuted", "mic_muted"],
    ["hasMicMuted", "has_mic_muted"],
  );
  const cameraField = readKnownBoolean(
    input,
    ["cameraEnabled", "camera_enabled"],
    ["hasCameraEnabled", "has_camera_enabled"],
  );
  const screenShareField = readKnownBoolean(
    input,
    ["screenShareEnabled", "screen_share_enabled"],
    ["hasScreenShareEnabled", "has_screen_share_enabled"],
  );
  const selfDeafened = selfDeafenedField.known && selfDeafenedField.value;
  const hasSelfMuted = selfMutedField.known || selfDeafened;
  const selfMuted = selfDeafened || (selfMutedField.known && selfMutedField.value);
  const hasMicMuted = microphoneField.known || hasSelfMuted;
  return Object.freeze({
    hasSelfMuted,
    selfMuted,
    hasSelfDeafened: selfDeafenedField.known,
    selfDeafened,
    hasMicMuted,
    micMuted: selfDeafened || selfMuted || (microphoneField.known && microphoneField.value),
    deafened: selfDeafened,
    hasCameraEnabled: cameraField.known,
    cameraEnabled: cameraField.known && cameraField.value,
    hasScreenShareEnabled: screenShareField.known,
    screenShareEnabled: screenShareField.known && screenShareField.value,
  });
}

function mergeKnownState(previous = null, incoming = {}) {
  const next = normalizeState(incoming);
  if (!previous) return next;
  const current = normalizeState(previous);
  const choose = (knownKey, valueKey) => next[knownKey]
    ? next[valueKey]
    : (current[knownKey] ? current[valueKey] : null);
  return normalizeState({
    hasSelfMuted: next.hasSelfMuted || current.hasSelfMuted,
    selfMuted: choose("hasSelfMuted", "selfMuted"),
    hasSelfDeafened: next.hasSelfDeafened || current.hasSelfDeafened,
    selfDeafened: choose("hasSelfDeafened", "selfDeafened"),
    hasMicMuted: next.hasMicMuted || current.hasMicMuted,
    micMuted: choose("hasMicMuted", "micMuted"),
    hasCameraEnabled: next.hasCameraEnabled || current.hasCameraEnabled,
    cameraEnabled: choose("hasCameraEnabled", "cameraEnabled"),
    hasScreenShareEnabled: next.hasScreenShareEnabled || current.hasScreenShareEnabled,
    screenShareEnabled: choose("hasScreenShareEnabled", "screenShareEnabled"),
  });
}

function statesConflict(current = {}, incoming = {}) {
  const left = normalizeState(current);
  const right = normalizeState(incoming);
  return [
    ["hasSelfMuted", "selfMuted"],
    ["hasSelfDeafened", "selfDeafened"],
    ["hasCameraEnabled", "cameraEnabled"],
    ["hasScreenShareEnabled", "screenShareEnabled"],
  ].some(([knownKey, valueKey]) => (
    left[knownKey]
    && right[knownKey]
    && left[valueKey] !== right[valueKey]
  ));
}

function hasKnownState(input = {}) {
  const state = normalizeState(input);
  return state.hasSelfMuted
    || state.hasSelfDeafened
    || state.hasCameraEnabled
    || state.hasScreenShareEnabled;
}

function getSourceRank(source = "fallback") {
  const value = String(source || "fallback").trim().toLowerCase();
  if (value === "direct") return 4;
  if (value.startsWith("membership") || value.startsWith("snapshot")) return 3;
  if (value.startsWith("livekit-attributes")) return 2;
  if (value.startsWith("livekit-track")) return 1;
  return 0;
}

function isTrustedSessionRevisionSource(source = "") {
  const value = String(source || "").trim().toLowerCase();
  return value.startsWith("membership") || value.startsWith("snapshot");
}

/**
 * Keeps peer media state fenced by the peer's membership session and sender
 * revision. Missing fields are unknown/unchanged; they never become false.
 */
export function createServerVoiceMediaStateOrderFence({
  directGuardMs = 20_000,
  now = () => Date.now(),
} = {}) {
  const latestByParticipant = new Map();
  const guardMs = Math.max(1_000, Number(directGuardMs) || 20_000);

  const makeKey = (conversationId, userId) => {
    const convId = normalizeKeyPart(conversationId);
    const uid = normalizeKeyPart(userId);
    return convId && uid ? `${convId}:${uid}` : "";
  };

  const readCurrent = (key, at) => {
    const current = latestByParticipant.get(key) || null;
    if (!current) return null;
    if (current.sessionId) return current;
    if (at - current.receivedAt <= guardMs) return current;
    latestByParticipant.delete(key);
    return null;
  };

  const remember = ({
    key,
    sessionId = "",
    stateClock = 0,
    receivedAt = now(),
    source = "fallback",
    state = {},
    previous = null,
    preserveMissing = false,
  }) => {
    const normalized = preserveMissing ? mergeKnownState(previous, state) : normalizeState(state);
    const current = Object.freeze({
      sessionId: normalizeSessionId(sessionId),
      stateClock: Number(stateClock || 0) || Number(receivedAt || 0) || Number(now()),
      receivedAt: Number(receivedAt || 0) || Number(now()),
      source: String(source || "fallback").trim().toLowerCase() || "fallback",
      sourceRank: getSourceRank(source),
      ...normalized,
    });
    latestByParticipant.set(key, current);
    return current;
  };

  return Object.freeze({
    acceptDirect({
      conversationId = "",
      userId = "",
      sessionId = "",
      stateClock = 0,
      receivedAt = now(),
      selfMuted = null,
      selfDeafened = null,
    } = {}) {
      const key = makeKey(conversationId, userId);
      if (!key) return Object.freeze({ apply: false, reason: "invalid_identity" });
      const observedAt = Number(receivedAt || 0) || Number(now());
      const clock = Number(stateClock || 0) || observedAt;
      const session = normalizeSessionId(sessionId);
      const previous = readCurrent(key, observedAt);
      if (previous?.sessionId && session && previous.sessionId !== session) {
        return Object.freeze({
          apply: false,
          reason: "direct_session_mismatch",
          stateClock: clock,
          previousStateClock: previous.stateClock,
        });
      }
      if (previous && clock <= previous.stateClock) {
        return Object.freeze({
          apply: false,
          reason: clock === previous.stateClock ? "duplicate_direct_clock" : "stale_direct_clock",
          stateClock: clock,
          previousStateClock: previous.stateClock,
        });
      }
      const current = remember({
        key,
        sessionId: session || previous?.sessionId || "",
        stateClock: clock,
        receivedAt: observedAt,
        source: "direct",
        previous,
        preserveMissing: true,
        state: { selfMuted, selfDeafened },
      });
      return Object.freeze({ apply: true, reason: "direct_current", ...current });
    },

    acceptFallback({
      conversationId = "",
      userId = "",
      sessionId = "",
      observedAt = now(),
      selfMuted = null,
      selfDeafened = null,
      source = "fallback",
      revision = 0,
      cameraEnabled = null,
      screenShareEnabled = null,
    } = {}) {
      const key = makeKey(conversationId, userId);
      if (!key) return Object.freeze({ apply: false, reason: "invalid_identity" });
      const at = Number(observedAt || 0) || Number(now());
      const current = readCurrent(key, at);
      const explicitRevision = Number(revision || 0);
      const fallbackClock = explicitRevision || at;
      const session = normalizeSessionId(sessionId);
      const incomingState = normalizeState({ selfMuted, selfDeafened, cameraEnabled, screenShareEnabled });
      if (!current) {
        const accepted = remember({
          key,
          sessionId: session,
          stateClock: fallbackClock,
          receivedAt: at,
          source,
          state: incomingState,
        });
        return Object.freeze({ apply: true, reason: `${source}_available`, ...accepted });
      }
      if (session && current.sessionId && session !== current.sessionId) {
        // Sender revisions are scoped to a membership session. Only the
        // authoritative membership/snapshot plane may establish a replacement
        // session, and its clock must not be compared with the old session.
        if (!isTrustedSessionRevisionSource(source)) {
          return Object.freeze({
            apply: false,
            reason: "replacement_session_requires_authority",
            stateClock: fallbackClock,
            previousStateClock: current.stateClock,
          });
        }
        const accepted = remember({
          key,
          sessionId: session,
          stateClock: fallbackClock,
          receivedAt: at,
          source,
          state: incomingState,
        });
        return Object.freeze({ apply: true, reason: "replacement_session_fallback", ...accepted });
      }

      const conflict = statesConflict(current, incomingState);
      const incomingHasKnownState = hasKnownState(incomingState);
      const incomingSourceRank = getSourceRank(source);
      const trustedNewerRevision = explicitRevision
        && fallbackClock > current.stateClock
        && isTrustedSessionRevisionSource(source);
      if (current.source === "direct" && conflict && !trustedNewerRevision) {
        return Object.freeze({
          apply: false,
          reason: "current_direct_state_wins",
          stateClock: current.stateClock,
          directAgeMs: Math.max(0, at - current.receivedAt),
        });
      }
      if (explicitRevision && fallbackClock < current.stateClock) {
        return Object.freeze({
          apply: false,
          reason: "stale_fallback_revision",
          stateClock: fallbackClock,
          previousStateClock: current.stateClock,
        });
      }
      if (
        conflict
        && incomingSourceRank < Number(current.sourceRank || 0)
        && !trustedNewerRevision
      ) {
        return Object.freeze({
          apply: false,
          reason: "higher_priority_fallback_wins",
          stateClock: fallbackClock,
          previousStateClock: current.stateClock,
        });
      }
      const accepted = remember({
        key,
        sessionId: session || current.sessionId,
        stateClock: incomingHasKnownState
          ? Math.max(current.stateClock, fallbackClock)
          : current.stateClock,
        receivedAt: at,
        source: incomingHasKnownState && (trustedNewerRevision || incomingSourceRank >= Number(current.sourceRank || 0))
          ? source
          : current.source,
        previous: current,
        preserveMissing: true,
        state: incomingState,
      });
      return Object.freeze({
        apply: true,
        reason: !incomingHasKnownState
          ? `${source}_partial_unchanged`
          : (trustedNewerRevision ? `${source}_newer_revision` : `${source}_current`),
        ...accepted,
      });
    },

    confirmTrack({
      conversationId = "",
      userId = "",
      sessionId = "",
      observedAt = now(),
      muted = false,
    } = {}) {
      const key = makeKey(conversationId, userId);
      if (!key) return Object.freeze({ apply: false, reason: "invalid_identity" });
      const at = Number(observedAt || 0) || Number(now());
      const current = readCurrent(key, at);
      const session = normalizeSessionId(sessionId);
      if (current?.sessionId && session && current.sessionId !== session) {
        return Object.freeze({ apply: false, reason: "track_session_mismatch", ...current });
      }
      if (!current) {
        if (muted !== true) return Object.freeze({ apply: false, reason: "track_unmuted_unknown" });
        const accepted = remember({
          key,
          sessionId: session,
          stateClock: at,
          receivedAt: at,
          source: "livekit-track",
          state: { micMuted: true, selfMuted: true, selfDeafened: null },
        });
        return Object.freeze({ apply: true, reason: "track_muted_available", ...accepted, trackMuted: true });
      }
      if (current.selfMuted === true && muted !== true) {
        return Object.freeze({ apply: false, reason: "explicit_media_state_wins", ...current });
      }
      if (muted === true && current.hasSelfMuted !== true) {
        const accepted = remember({
          key,
          sessionId: session || current.sessionId,
          stateClock: Math.max(current.stateClock, at),
          receivedAt: at,
          source: current.source,
          previous: current,
          preserveMissing: true,
          state: { micMuted: true, selfMuted: true, selfDeafened: null },
        });
        return Object.freeze({ apply: true, reason: "track_muted_confirmed", ...accepted, trackMuted: true });
      }
      return Object.freeze({
        apply: true,
        reason: muted ? "track_muted_confirmed" : "track_unmuted_confirmed",
        ...current,
        micMuted: muted === true || current.selfMuted === true || current.selfDeafened === true,
        trackMuted: muted === true,
      });
    },

    transfer({ fromConversationId = "", toConversationId = "", userId = "", sessionId = "" } = {}) {
      const fromKey = makeKey(fromConversationId, userId);
      const toKey = makeKey(toConversationId, userId);
      if (!fromKey || !toKey || fromKey === toKey) return false;
      const current = readCurrent(fromKey, Number(now()));
      if (!current) return false;
      const session = normalizeSessionId(sessionId);
      if (session && current.sessionId && session !== current.sessionId) return false;
      latestByParticipant.set(toKey, current);
      latestByParticipant.delete(fromKey);
      return true;
    },

    clear({ conversationId = "", userId = "", sessionId = "" } = {}) {
      const key = makeKey(conversationId, userId);
      if (!key) return false;
      const current = latestByParticipant.get(key) || null;
      const session = normalizeSessionId(sessionId);
      if (session && current?.sessionId && session !== current.sessionId) return false;
      return latestByParticipant.delete(key);
    },

    getSnapshot({ conversationId = "", userId = "" } = {}) {
      const key = makeKey(conversationId, userId);
      if (!key) return null;
      const current = readCurrent(key, Number(now()));
      return current ? Object.freeze({
        sessionId: current.sessionId,
        stateClock: current.stateClock,
        receivedAt: current.receivedAt,
        selfMuted: current.selfMuted,
        selfDeafened: current.selfDeafened,
      }) : null;
    },

    getEffectiveSnapshot({ conversationId = "", userId = "" } = {}) {
      const key = makeKey(conversationId, userId);
      if (!key) return null;
      const current = readCurrent(key, Number(now()));
      return current ? Object.freeze({ ...current }) : null;
    },

    get size() {
      return latestByParticipant.size;
    },
  });
}
