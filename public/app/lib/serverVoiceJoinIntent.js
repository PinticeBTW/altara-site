const clean = (value) => String(value || "").trim();

export function normalizeServerVoiceJoinIntentSource(source = "unknown") {
  const value = clean(source).toLowerCase().replace(/_/g, "-");
  if (["sidebar", "channel-row", "voice-channel-row"].includes(value)) return "channel-row";
  if (["center-button", "central-button", "enter-card"].includes(value)) return "enter-card";
  if (["detached-rejoin", "rejoin-banner", "recovery-banner"].includes(value)) return "detached-rejoin";
  return value || "unknown";
}

export function resolveServerVoiceJoinIntentAction({
  phase = "idle",
  currentServerId = "",
  currentChannelId = "",
  targetServerId = "",
  targetChannelId = "",
  transportConnected = false,
  detachedSameChannel = false,
} = {}) {
  const normalizedPhase = clean(phase).toLowerCase() || "idle";
  const sameChannel = !!(
    clean(currentServerId)
    && clean(currentChannelId)
    && clean(currentServerId) === clean(targetServerId)
    && clean(currentChannelId) === clean(targetChannelId)
  );

  if (normalizedPhase === "leaving") {
    return Object.freeze({ action: "blocked-leaving", sameChannel });
  }
  if (normalizedPhase === "joining") {
    return Object.freeze({ action: sameChannel ? "join-reuse" : "blocked-joining-other", sameChannel });
  }
  if (detachedSameChannel) {
    return Object.freeze({ action: "detached-rejoin", sameChannel: true });
  }
  if (normalizedPhase === "connected" && sameChannel) {
    return Object.freeze({ action: "focus-connected", sameChannel: true });
  }
  if (normalizedPhase === "connected") {
    return Object.freeze({ action: "switch-channel", sameChannel: false });
  }
  return Object.freeze({ action: "join", sameChannel });
}

export function isServerVoiceOperationGloballyActive({
  phase = "idle",
  joinPipelineEntered = false,
  controllerActive = false,
  inCall = false,
} = {}) {
  if (controllerActive === true || inCall === true) return true;
  const normalizedPhase = clean(phase).toLowerCase() || "idle";
  if (normalizedPhase === "connected" || normalizedPhase === "leaving") return true;
  return normalizedPhase === "joining" && joinPipelineEntered === true;
}

export function shouldHandleServerVoiceRowActivation({
  defaultPrevented = false,
  button = 0,
  dragging = false,
  nestedNonJoinControl = false,
} = {}) {
  return !defaultPrevented
    && Number(button || 0) === 0
    && dragging !== true
    && nestedNonJoinControl !== true;
}
