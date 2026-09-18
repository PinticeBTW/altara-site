import {
  ConnectionError,
  ConnectionErrorReason,
  ConnectionState,
  DeviceUnsupportedError,
  DisconnectReason,
  MediaDeviceFailure,
  NegotiationError,
  PublishTrackError,
  TrackInvalidError,
  UnexpectedConnectionState,
} from "../node_modules/livekit-client/dist/livekit-client.esm.mjs";

export const CALL_ISSUE_SURFACE = Object.freeze({
  NONE: "none",
  STATUS: "status",
  TOAST: "toast",
  DIALOG: "dialog",
});

export const CALL_ISSUE_SEVERITY = Object.freeze({
  EXPECTED: "expected",
  STATUS: "status",
  WARNING: "warning",
  FATAL: "fatal",
});

export const CALL_STATUS_RESTORED_DURATION_MS = 2800;
export const CALL_STATUS_WARNING_DURATION_MS = 5200;

export const CALL_STATUS_COPY = Object.freeze({
  reconnecting: "Connection interrupted \u2014 reconnecting\u2026",
  restored: "Connection restored",
});

const ACTION_RETURN = Object.freeze({ id: "return_to_conversation", label: "Return to conversation" });
const ACTION_RETRY = Object.freeze({ id: "retry", label: "Retry" });

function cleanIdentifier(value) {
  return String(value ?? "").trim();
}

function cleanToken(value) {
  return cleanIdentifier(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function hasToken(value, tokens) {
  const normalized = cleanToken(value);
  return tokens.some((token) => normalized === token || normalized.includes(token));
}

function safeErrorName(error) {
  const name = cleanIdentifier(error?.name || error?.constructor?.name || "");
  return /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(name) ? name : null;
}

function safeErrorCode(error) {
  const code = error?.code;
  if (typeof code === "number" && Number.isFinite(code)) return code;
  const value = cleanIdentifier(code);
  return /^[A-Z][A-Z0-9_]{0,63}$/.test(value) ? value : null;
}

function safeStatus(error) {
  const status = Number(error?.status ?? error?.responseStatus ?? error?.httpStatus);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}

function reasonNameFromConnectionError(error) {
  const isConnectionError = error instanceof ConnectionError
    || cleanIdentifier(error?.name).toLowerCase() === "connectionerror";
  if (!isConnectionError) return null;
  const reason = error?.reason;
  if (typeof reason === "number" && ConnectionErrorReason[reason]) {
    return ConnectionErrorReason[reason];
  }
  const value = cleanIdentifier(error?.reasonName || reason);
  const match = Object.keys(ConnectionErrorReason).find((key) => (
    Number.isNaN(Number(key)) && key.toLowerCase() === value.toLowerCase()
  ));
  return match || null;
}

function resolveDisconnectReason(error, suppliedReason) {
  const isConnectionError = error instanceof ConnectionError
    || cleanIdentifier(error?.name).toLowerCase() === "connectionerror";
  const candidates = [
    suppliedReason,
    error?.disconnectReason,
    error?.disconnect_reason,
    error?.disconnectReasonCode,
    error?.disconnect_reason_code,
    error?.disconnectReasonName,
    error?.disconnect_reason_name,
    error?.reasonCode,
    error?.reason_code,
    error?.reasonName,
    error?.reason_name,
  ];
  if (!isConnectionError && typeof error?.reason === "string") candidates.push(error.reason);
  if (isConnectionError && reasonNameFromConnectionError(error) === "LeaveRequest") {
    candidates.push(error?.context);
  }
  for (const candidate of candidates) {
    if (candidate == null || cleanIdentifier(candidate) === "") continue;
    const numberValue = Number(candidate);
    if (Number.isInteger(numberValue) && DisconnectReason[numberValue]) {
      return {
        code: numberValue,
        name: DisconnectReason[numberValue],
      };
    }
    const nameValue = cleanIdentifier(candidate).toUpperCase();
    if (nameValue && Number.isInteger(DisconnectReason[nameValue])) {
      return {
        code: DisconnectReason[nameValue],
        name: nameValue,
      };
    }
  }
  return { code: null, name: null };
}

function errorMarkerValues(error) {
  return [
    error?.category,
    error?.kind,
    error?.reason,
    error?.reasonName,
    error?.state,
    error?.type,
    error?.code,
  ].map(cleanToken).filter(Boolean);
}

function markerIncludes(markers, tokens) {
  return markers.some((marker) => tokens.some((token) => marker === token || marker.includes(token)));
}

function mediaTargetFor(operation, stage) {
  const context = `${cleanToken(operation)}_${cleanToken(stage)}`;
  if (/(screen_?share|screenshare|display|capture)/.test(context)) return "screen_share";
  if (/(camera|webcam|video)/.test(context)) return "camera";
  if (/(microphone|(^|_)mic(_|$)|audio|media_device)/.test(context)) return "microphone";
  return "";
}

function connectionContextFor(operation, stage) {
  return hasToken(`${operation}_${stage}`, [
    "call_create",
    "call_join",
    "connect",
    "connection",
    "livekit",
    "reconnect",
    "room",
    "session",
    "token",
  ]);
}

function makeDiagnostics(error, {
  operation,
  stage,
  terminal,
  expected,
  recoveryAttempted,
  connectionReason,
  disconnectReason,
  mediaFailure,
}) {
  return Object.freeze({
    originalName: safeErrorName(error),
    originalCode: safeErrorCode(error),
    httpStatus: safeStatus(error),
    connectionReason: connectionReason || null,
    disconnectReason: disconnectReason || null,
    mediaFailure: mediaFailure || null,
    operation: cleanToken(operation) || "unknown",
    stage: cleanToken(stage) || "unknown",
    terminal: terminal === true,
    expected: expected === true,
    recoveryAttempted: recoveryAttempted === true,
  });
}

function freezeActions(actions) {
  return Object.freeze((Array.isArray(actions) ? actions : []).map((action) => Object.freeze({ ...action })));
}

function makeIssue({
  category,
  severity,
  surface,
  title,
  message,
  temporary = false,
  recoverable = false,
  autoDismissMs = null,
  actions = [],
  diagnostics,
}) {
  const fatal = severity === CALL_ISSUE_SEVERITY.FATAL;
  return Object.freeze({
    kind: "private_call_issue",
    category,
    dedupeKey: category,
    severity,
    surface,
    title: String(title || ""),
    message: String(message || ""),
    temporary: temporary === true,
    recoverable: recoverable === true,
    fatal,
    blocking: fatal,
    autoDismissMs: Number.isFinite(autoDismissMs) && autoDismissMs > 0 ? autoDismissMs : null,
    role: surface === CALL_ISSUE_SURFACE.DIALOG ? "dialog" : (surface === CALL_ISSUE_SURFACE.NONE ? null : "status"),
    ariaLive: surface === CALL_ISSUE_SURFACE.DIALOG ? "assertive" : (surface === CALL_ISSUE_SURFACE.NONE ? null : "polite"),
    actions: freezeActions(actions),
    diagnostics,
  });
}

function expectedIssue(category, title, diagnostics) {
  return makeIssue({
    category,
    severity: CALL_ISSUE_SEVERITY.EXPECTED,
    surface: CALL_ISSUE_SURFACE.NONE,
    title,
    message: "",
    diagnostics,
  });
}

function warningIssue(category, title, message, diagnostics, { autoDismissMs = CALL_STATUS_WARNING_DURATION_MS } = {}) {
  return makeIssue({
    category,
    severity: CALL_ISSUE_SEVERITY.WARNING,
    surface: CALL_ISSUE_SURFACE.TOAST,
    title,
    message,
    recoverable: true,
    autoDismissMs,
    diagnostics,
  });
}

function fatalIssue(category, title, message, diagnostics, actions = [ACTION_RETURN]) {
  return makeIssue({
    category,
    severity: CALL_ISSUE_SEVERITY.FATAL,
    surface: CALL_ISSUE_SURFACE.DIALOG,
    title,
    message,
    diagnostics,
    actions,
  });
}

function reconnectingIssue(diagnostics) {
  return makeIssue({
    category: "connection_reconnecting",
    severity: CALL_ISSUE_SEVERITY.STATUS,
    surface: CALL_ISSUE_SURFACE.STATUS,
    title: "Reconnecting",
    message: CALL_STATUS_COPY.reconnecting,
    temporary: true,
    recoverable: true,
    diagnostics,
  });
}

function restoredIssue(diagnostics) {
  return makeIssue({
    category: "connection_restored",
    severity: CALL_ISSUE_SEVERITY.STATUS,
    surface: CALL_ISSUE_SURFACE.TOAST,
    title: CALL_STATUS_COPY.restored,
    message: "",
    temporary: true,
    recoverable: true,
    autoDismissMs: CALL_STATUS_RESTORED_DURATION_MS,
    diagnostics,
  });
}

function mediaFailureCopy(target, failure) {
  if (target === "camera") {
    if (failure === MediaDeviceFailure.PermissionDenied) {
      return ["Camera access is blocked", "Allow camera access in system settings, then try again."];
    }
    if (failure === MediaDeviceFailure.NotFound) {
      return ["Camera unavailable", "The camera is unavailable on this device. Choose an available camera from the camera menu, then try again."];
    }
    if (failure === MediaDeviceFailure.DeviceInUse) {
      return ["Camera is busy", "Another app is using the camera. Close it there, then try again."];
    }
    return ["Camera couldn't start", "Check the camera connection, then try again."];
  }
  if (target === "screen_share") {
    if (failure === MediaDeviceFailure.PermissionDenied) {
      return ["Screen sharing isn't allowed", "Check screen-recording permission, then try again."];
    }
    if (failure === MediaDeviceFailure.NotFound) {
      return ["Share source unavailable", "That screen or window is no longer available. Choose another source."];
    }
    if (failure === MediaDeviceFailure.DeviceInUse) {
      return ["Share source unavailable", "That screen or window couldn't be captured. Choose another source."];
    }
    return ["Screen sharing couldn't start", "Choose a source and try again."];
  }
  if (failure === MediaDeviceFailure.PermissionDenied) {
    return ["Microphone access is blocked", "Allow microphone access in system settings, then try again."];
  }
  if (failure === MediaDeviceFailure.NotFound) {
    return ["Microphone unavailable", "No microphone is available. Check the audio device and try again."];
  }
  if (failure === MediaDeviceFailure.DeviceInUse) {
    return ["Microphone is busy", "Another app is using the microphone. Close it there, then try again."];
  }
  return ["Microphone couldn't start", "Check the audio device, then try again."];
}

function mediaFailureCategory(failure) {
  if (failure === MediaDeviceFailure.PermissionDenied) return "permission_denied";
  if (failure === MediaDeviceFailure.NotFound) return "not_found";
  if (failure === MediaDeviceFailure.DeviceInUse) return "device_in_use";
  return "other";
}

/**
 * Builds a stable key for fencing delayed callbacks to one Private Call.
 * A call generation or transport controller is required in addition to the
 * conversation because a conversation can host multiple sequential calls.
 */
export function buildCallStatusSessionKey({
  conversationId = "",
  callGeneration = "",
  controllerId = "",
} = {}) {
  const conversation = cleanIdentifier(conversationId);
  const generation = cleanIdentifier(callGeneration);
  const controller = cleanIdentifier(controllerId);
  if (!conversation || (!generation && !controller)) return "";
  return JSON.stringify(["private_call_status_v1", conversation, generation, controller]);
}

/**
 * Converts call/media failures into safe presentation data. Exception messages,
 * room URLs, participant IDs, tokens, and stack traces are deliberately absent
 * from the returned issue and its diagnostics.
 */
export function normalizeCallIssue(error = null, {
  operation = "unknown",
  stage = "unknown",
  terminal = false,
  expected = false,
  recoveryAttempted = false,
  disconnectReason: suppliedDisconnectReason = null,
} = {}) {
  const operationToken = cleanToken(operation);
  const stageToken = cleanToken(stage);
  const contextToken = `${operationToken}_${stageToken}`;
  const markers = errorMarkerValues(error);
  const name = safeErrorName(error) || "";
  const lowerName = name.toLowerCase();
  const connectionReason = reasonNameFromConnectionError(error);
  const disconnect = resolveDisconnectReason(error, suppliedDisconnectReason);
  const mediaTarget = mediaTargetFor(operationToken, stageToken);
  let mediaFailure = null;
  if (mediaTarget) {
    try {
      mediaFailure = MediaDeviceFailure.getFailure(error) || null;
    } catch (_) {
      mediaFailure = null;
    }
  }
  if (mediaTarget === "camera"
    && ["overconstrainederror", "constraintnotsatisfiederror"].includes(lowerName)
    && String(error?.constraint || error?.constraintName || "").toLowerCase() === "deviceid") {
    mediaFailure = MediaDeviceFailure.NotFound;
  }
  if ((!mediaFailure || mediaFailure === MediaDeviceFailure.Other) && markerIncludes(markers, [
    "permission_denied",
    "policy_denied",
    "screen_recording_denied",
    "system_denied",
  ])) {
    mediaFailure = MediaDeviceFailure.PermissionDenied;
  } else if ((!mediaFailure || mediaFailure === MediaDeviceFailure.Other) && markerIncludes(markers, ["device_not_found", "source_unavailable"])) {
    mediaFailure = MediaDeviceFailure.NotFound;
  } else if ((!mediaFailure || mediaFailure === MediaDeviceFailure.Other) && markerIncludes(markers, ["device_in_use", "source_start_failed"])) {
    mediaFailure = MediaDeviceFailure.DeviceInUse;
  }

  const explicitlyExpected = expected === true || error?.expected === true;
  const isScreenShare = mediaTarget === "screen_share";
  const pickerCancelled = isScreenShare && (
    error?.__sharePickerCancelled === true
    || markerIncludes(markers, ["user_cancelled", "picker_cancelled", "selection_cancelled"])
    || lowerName === "aborterror"
    || (
      lowerName === "notallowederror"
      && mediaFailure !== MediaDeviceFailure.PermissionDenied
      && hasToken(contextToken, ["picker", "chooser", "selection"])
    )
  );
  const normalCallOutcome = markerIncludes(markers, [
    "already_ended",
    "call_cancelled",
    "call_declined",
    "call_missed",
    "conversation_busy",
    "remote_participant_left",
    "user_busy",
    "user_declined",
    "user_unavailable",
  ]) || hasToken(contextToken, [
    "already_ended",
    "call_cancelled",
    "call_declined",
    "call_missed",
    "conversation_busy",
    "remote_participant_left",
  ]);
  const requestedLeave = hasToken(contextToken, [
    "client_initiated",
    "explicit_leave",
    "local_leave",
    "user_cancelled",
    "user_leave",
  ]) || disconnect.name === "CLIENT_INITIATED";
  const diagnostics = makeDiagnostics(error, {
    operation,
    stage,
    terminal,
    expected: explicitlyExpected || pickerCancelled || normalCallOutcome || requestedLeave,
    recoveryAttempted,
    connectionReason,
    disconnectReason: disconnect.name,
    mediaFailure,
  });

  if (pickerCancelled) {
    return expectedIssue("screen_share_cancelled", "Screen sharing cancelled", diagnostics);
  }
  if (cleanIdentifier(error?.message) === "private_call_participant_busy"
      || markers.includes("private_call_participant_busy")) {
    return warningIssue(
      "private_call_participant_busy",
      "Call busy",
      "The call service refused a conflicting call operation. Try again after it finishes.",
      { ...diagnostics, expected: true },
    );
  }
  if (explicitlyExpected || normalCallOutcome || requestedLeave) {
    if (isScreenShare && hasToken(contextToken, ["track_ended", "share_ended", "stop_share"])) {
      return expectedIssue("screen_share_ended", "Screen sharing ended", diagnostics);
    }
    if (hasToken(contextToken, ["remote_participant_left"])) {
      return expectedIssue("remote_participant_left", "The other participant left", diagnostics);
    }
    return expectedIssue("call_action_completed", "Call action completed", diagnostics);
  }

  if (hasToken(contextToken, ["microphone_device_fallback"])) {
    return warningIssue(
      "microphone_device_fallback",
      "Microphone changed",
      "The selected microphone is unavailable. Using the default microphone.",
      diagnostics,
    );
  }
  if (hasToken(contextToken, ["camera_device_fallback"])) {
    return warningIssue(
      "camera_device_fallback",
      "Camera changed",
      "The selected camera is unavailable. Using another camera.",
      diagnostics,
    );
  }
  if (hasToken(contextToken, ["audio_output_fallback"])) {
    return warningIssue(
      "audio_output_fallback",
      "Speaker changed",
      "The selected speaker is unavailable. Using the default speaker.",
      diagnostics,
    );
  }
  if (hasToken(contextToken, ["audio_output_unavailable"])) {
    return warningIssue(
      "audio_output_unavailable",
      "Speaker unavailable",
      "Choose another audio output in settings.",
      diagnostics,
    );
  }
  if (hasToken(contextToken, ["audio_device_change"])) {
    return warningIssue(
      "audio_device_disconnected",
      "Audio device disconnected",
      "A selected audio device is unavailable. Check your call device settings.",
      diagnostics,
    );
  }
  if (isScreenShare && hasToken(contextToken, ["source_enumeration"])) {
    const captureCode = safeErrorCode(error);
    if (captureCode === "SCREEN_RECORDING_RESTRICTED") {
      return warningIssue("screen_recording_restricted", "Screen recording is restricted",
        "Screen recording is restricted by macOS. Check this Mac's privacy policy or contact its administrator.", diagnostics);
    }
    if (captureCode === "SCREEN_RECORDING_PERMISSION_REQUIRED") {
      const appName = hasToken(stageToken, ["mac_dev"]) ? "Altara DEV" : "Altara";
      return warningIssue("screen_recording_permission_required", "Allow screen recording",
        `Allow ${appName} in System Settings → Privacy & Security → Screen & System Audio Recording, then quit ${appName} (⌘Q) and reopen it.`, diagnostics);
    }
    return warningIssue(
      "screen_share_sources_unavailable",
      "Share sources unavailable",
      "Couldn't load screens or windows — click Refresh to try again.",
      diagnostics,
    );
  }
  if (isScreenShare && hasToken(contextToken, ["remote_presentation_timeout"])) {
    return warningIssue(
      "screen_share_remote_unavailable",
      "Shared screen unavailable",
      "The shared screen couldn't be displayed. Ask them to share again.",
      diagnostics,
    );
  }

  const status = safeStatus(error);
  const connectionCode = safeErrorCode(error);
  const unambiguousAuthCode = typeof connectionCode === "string" && [
    "AUTH_FAILED",
    "INVALID_TOKEN",
    "SESSION_EXPIRED",
    "SUPABASE_AUTH_REQUIRED",
    "TOKEN_EXPIRED",
    "UNAUTHENTICATED",
  ].includes(connectionCode);
  const connectionPermissionCode = connectionCode === "PERMISSION_DENIED"
    && connectionContextFor(operationToken, stageToken);
  const authFailure = connectionReason === "NotAllowed"
    || ((status === 401 || status === 403) && connectionContextFor(operationToken, stageToken))
    || unambiguousAuthCode
    || connectionPermissionCode
    || markerIncludes(markers, ["auth_failed", "invalid_token", "session_expired", "token_expired", "unauthenticated"]);
  if (authFailure) {
    return fatalIssue(
      "call_access_expired",
      "Unable to join call",
      "Your call access has expired. Return to the conversation and try again.",
      diagnostics,
      [ACTION_RETURN],
    );
  }

  const reconnectContext = hasToken(contextToken, ["reconnect", "signal_reconnect"]);
  const definitiveDisconnect = [
    "DUPLICATE_IDENTITY",
    "JOIN_FAILURE",
    "MEDIA_FAILURE",
    "PARTICIPANT_REMOVED",
    "ROOM_CLOSED",
    "ROOM_DELETED",
    "STATE_MISMATCH",
  ].includes(disconnect.name);
  if (definitiveDisconnect) {
    return fatalIssue(
      "call_connection_ended",
      "Call ended",
      "This call connection can no longer continue.",
      diagnostics,
      [ACTION_RETURN],
    );
  }
  if (reconnectContext && terminal !== true) {
    return reconnectingIssue(diagnostics);
  }
  if ((reconnectContext && terminal === true) || (terminal === true && connectionContextFor(operationToken, stageToken))) {
    return fatalIssue(
      "connection_reconnect_exhausted",
      "Call connection lost",
      "We couldn't restore the call connection.",
      diagnostics,
      [ACTION_RETRY, ACTION_RETURN],
    );
  }
  if (isScreenShare && hasToken(contextToken, ["screen_share_audio_fallback", "share_audio_unavailable"])) {
    return warningIssue(
      "screen_share_audio_unavailable",
      "Screen-share audio unavailable",
      "Screen sharing will continue without audio.",
      diagnostics,
    );
  }
  if (mediaTarget && mediaFailure && mediaFailure !== MediaDeviceFailure.Other) {
    const [title, message] = mediaFailureCopy(mediaTarget, mediaFailure);
    return warningIssue(`${mediaTarget}_${mediaFailureCategory(mediaFailure)}`, title, message, diagnostics);
  }

  const unsupportedCapture = error instanceof DeviceUnsupportedError
    || error instanceof TrackInvalidError
    || lowerName === "overconstrainederror"
    || lowerName === "constraintnotsatisfiederror"
    || lowerName === "notsupportederror"
    || markerIncludes(markers, ["constraints_rejected", "unsupported_codec", "unsupported_constraints"]);
  if (unsupportedCapture && isScreenShare) {
    return warningIssue(
      "screen_share_setting_unsupported",
      "Share setting unavailable",
      "This screen-share setting isn't supported. Try a lower quality.",
      diagnostics,
    );
  }

  if (hasToken(contextToken, ["quality_fallback", "codec_fallback", "fallback_applied"])) {
    return warningIssue(
      "screen_share_fallback_applied",
      "Share quality adjusted",
      "That quality isn't available. Screen sharing will continue with a compatible setting.",
      diagnostics,
    );
  }

  if (isScreenShare && hasToken(contextToken, ["screen_share_switch", "replace_share_source"])) {
    return warningIssue(
      "screen_share_switch_failed",
      "Couldn't switch share source",
      "Your current screen share is still live; choose another source to retry.",
      diagnostics,
    );
  }

  const publicationFailure = error instanceof PublishTrackError
    || markerIncludes(markers, ["livekit_publish_failed", "publication_failed"])
    || hasToken(contextToken, ["publish_screen_share", "screen_share_publish"]);
  if (isScreenShare && publicationFailure) {
    return warningIssue(
      "screen_share_publish_failed",
      "Screen sharing couldn't start",
      "The share couldn't be sent. Try again.",
      diagnostics,
    );
  }
  if (isScreenShare && hasToken(contextToken, ["unpublish", "stop_share_cleanup"])) {
    return warningIssue(
      "screen_share_stop_failed",
      "Screen sharing is still stopping",
      "Cleanup is taking longer than expected.",
      diagnostics,
    );
  }
  if (isScreenShare) {
    return warningIssue(
      "screen_share_capture_failed",
      "Screen sharing couldn't start",
      "Choose a source and try again.",
      diagnostics,
    );
  }
  if (mediaTarget && mediaFailure) {
    const [title, message] = mediaFailureCopy(mediaTarget, mediaFailure);
    return warningIssue(`${mediaTarget}_${mediaFailureCategory(mediaFailure)}`, title, message, diagnostics);
  }

  const typedConnectionFailure = error instanceof ConnectionError
    || error instanceof NegotiationError
    || error instanceof UnexpectedConnectionState
    || lowerName === "connectionerror";
  const initialJoin = hasToken(contextToken, ["call_create", "call_join", "initial_connect", "room_connect"]);
  if (typedConnectionFailure) {
    return fatalIssue(
      "call_connection_failed",
      "Couldn't connect to call",
      "Check your connection and try again.",
      diagnostics,
      [ACTION_RETRY, ACTION_RETURN],
    );
  }

  if (initialJoin && connectionContextFor(operationToken, stageToken)) {
    return warningIssue(
      "call_start_failed",
      "Couldn't start call",
      "The call couldn't start; check your connection and try again.",
      diagnostics,
    );
  }

  if (terminal === true) {
    return fatalIssue(
      "call_unexpected_failure",
      "Call ended unexpectedly",
      "Something went wrong with the call.",
      diagnostics,
      [ACTION_RETURN],
    );
  }
  return warningIssue(
    "call_recoverable_failure",
    "Call needs attention",
    "Something went wrong. Try again.",
    diagnostics,
  );
}

function cloneIssue(issue) {
  if (!issue) return null;
  return {
    ...issue,
    actions: issue.actions.map((action) => ({ ...action })),
    diagnostics: { ...issue.diagnostics },
  };
}

function normalizedSessionMetadata(metadata) {
  return Object.freeze({
    conversationId: cleanIdentifier(metadata?.conversationId),
    callGeneration: cleanIdentifier(metadata?.callGeneration),
    controllerId: cleanIdentifier(metadata?.controllerId),
  });
}

/**
 * Owns presentation state only; it does not alter LiveKit reconnect policy,
 * timers, transport membership, or call lifecycle. Every mutation requires the
 * key returned by activateSession so delayed callbacks cannot cross calls.
 */
export function createCallStatusController({
  onChange = () => {},
  setTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimer = (timer) => globalThis.clearTimeout(timer),
} = {}) {
  let activeSessionKey = "";
  let sessionMetadata = null;
  let connectionState = null;
  let reconnecting = false;
  let reconnectCycle = 0;
  let lifecycleVersion = 0;
  let statusIssue = null;
  let toastIssue = null;
  let fatalIssueState = null;
  const timers = { status: null, toast: null };
  const slotVersions = { status: 0, toast: 0 };

  function cancelSlotTimer(slot) {
    if (timers[slot] != null) {
      try { clearTimer(timers[slot]); } catch (_) {}
      timers[slot] = null;
    }
    slotVersions[slot] += 1;
  }

  function cancelTimers() {
    cancelSlotTimer("status");
    cancelSlotTimer("toast");
  }

  function getSnapshot() {
    return {
      active: !!activeSessionKey,
      sessionKey: activeSessionKey || null,
      session: sessionMetadata ? { ...sessionMetadata } : null,
      connectionState,
      reconnecting,
      reconnectCycle,
      status: cloneIssue(statusIssue),
      toast: cloneIssue(toastIssue),
      fatal: cloneIssue(fatalIssueState),
      hasVisibleIssue: !!(statusIssue || toastIssue || fatalIssueState),
    };
  }

  function emit(reason) {
    try { onChange(getSnapshot(), { reason }); } catch (_) {}
  }

  function isCurrent(sessionKey) {
    const candidate = cleanIdentifier(sessionKey);
    return !!candidate && candidate === activeSessionKey;
  }

  function scheduleAutoDismiss(slot, issue, sessionKey) {
    if (!issue?.autoDismissMs) return;
    cancelSlotTimer(slot);
    const scheduledLifecycle = lifecycleVersion;
    const scheduledSlotVersion = slotVersions[slot];
    try {
      timers[slot] = setTimer(() => {
        if (
          scheduledLifecycle !== lifecycleVersion
          || scheduledSlotVersion !== slotVersions[slot]
          || !isCurrent(sessionKey)
        ) return;
        const current = slot === "status" ? statusIssue : toastIssue;
        if (!current || current.dedupeKey !== issue.dedupeKey) return;
        timers[slot] = null;
        slotVersions[slot] += 1;
        if (slot === "status") statusIssue = null;
        else toastIssue = null;
        emit(`${slot}_auto_dismissed`);
      }, issue.autoDismissMs);
    } catch (_) {
      timers[slot] = null;
    }
  }

  function activateSession(metadata = {}) {
    const nextMetadata = normalizedSessionMetadata(metadata);
    const nextKey = buildCallStatusSessionKey(nextMetadata);
    if (!nextKey) {
      throw new TypeError("A conversationId and callGeneration or controllerId are required");
    }
    if (nextKey === activeSessionKey) return activeSessionKey;
    lifecycleVersion += 1;
    cancelTimers();
    activeSessionKey = nextKey;
    sessionMetadata = nextMetadata;
    connectionState = null;
    reconnecting = false;
    reconnectCycle = 0;
    statusIssue = null;
    toastIssue = null;
    fatalIssueState = null;
    emit("session_activated");
    return activeSessionKey;
  }

  function showIssue(issue, { sessionKey = "" } = {}) {
    if (!isCurrent(sessionKey) || !issue || issue.kind !== "private_call_issue") return false;
    if (issue.surface === CALL_ISSUE_SURFACE.NONE) return false;
    if (fatalIssueState && issue.surface !== CALL_ISSUE_SURFACE.DIALOG) return false;

    if (issue.surface === CALL_ISSUE_SURFACE.DIALOG) {
      if (fatalIssueState?.dedupeKey === issue.dedupeKey) return false;
      cancelTimers();
      statusIssue = null;
      toastIssue = null;
      reconnecting = false;
      fatalIssueState = issue;
      emit("fatal_issue_shown");
      return true;
    }

    const slot = issue.surface === CALL_ISSUE_SURFACE.STATUS ? "status" : "toast";
    const current = slot === "status" ? statusIssue : toastIssue;
    if (current?.dedupeKey === issue.dedupeKey) return false;
    if (
      slot === "toast"
      && statusIssue?.dedupeKey === issue.dedupeKey
    ) return false;

    cancelSlotTimer(slot);
    if (slot === "status") statusIssue = issue;
    else toastIssue = issue;
    if (issue.category === "connection_reconnecting") reconnecting = true;
    if (issue.category === "connection_restored") {
      reconnecting = false;
      statusIssue = null;
      cancelSlotTimer("status");
    }
    scheduleAutoDismiss(slot, issue, sessionKey);
    emit(`${slot}_issue_shown`);
    return true;
  }

  function handleConnectionState(state, { sessionKey = "" } = {}) {
    if (!isCurrent(sessionKey) || fatalIssueState) return false;
    const nextState = cleanIdentifier(state);
    const nextStateToken = cleanToken(nextState);
    const isReconnectState = nextStateToken === cleanToken(ConnectionState.Reconnecting)
      || nextStateToken === cleanToken(ConnectionState.SignalReconnecting);
    if (isReconnectState) {
      connectionState = nextState;
      if (reconnecting) return false;
      reconnecting = true;
      reconnectCycle += 1;
      if (toastIssue?.category === "connection_restored") {
        cancelSlotTimer("toast");
        toastIssue = null;
      }
      const issue = reconnectingIssue(makeDiagnostics(null, {
        operation: "room_connection",
        stage: nextState,
        terminal: false,
        expected: false,
        recoveryAttempted: true,
        connectionReason: null,
        disconnectReason: null,
        mediaFailure: null,
      }));
      return showIssue(issue, { sessionKey });
    }

    if (nextStateToken === cleanToken(ConnectionState.Connected)) {
      const wasReconnecting = reconnecting;
      const stateChanged = connectionState !== nextState;
      connectionState = nextState;
      if (!wasReconnecting) {
        if (stateChanged) emit("connection_state_changed");
        return stateChanged;
      }
      reconnecting = false;
      if (statusIssue?.category === "connection_reconnecting") {
        cancelSlotTimer("status");
        statusIssue = null;
      }
      const issue = restoredIssue(makeDiagnostics(null, {
        operation: "room_connection",
        stage: "reconnected",
        terminal: false,
        expected: false,
        recoveryAttempted: true,
        connectionReason: null,
        disconnectReason: null,
        mediaFailure: null,
      }));
      return showIssue(issue, { sessionKey });
    }

    const stateChanged = connectionState !== nextState;
    connectionState = nextState || null;
    if (stateChanged) emit("connection_state_changed");
    return stateChanged;
  }

  function clearSession(sessionKey) {
    if (!isCurrent(sessionKey)) return false;
    lifecycleVersion += 1;
    cancelTimers();
    activeSessionKey = "";
    sessionMetadata = null;
    connectionState = null;
    reconnecting = false;
    reconnectCycle = 0;
    statusIssue = null;
    toastIssue = null;
    fatalIssueState = null;
    emit("session_cleared");
    return true;
  }

  function clearAll() {
    const hadState = !!(
      activeSessionKey
      || statusIssue
      || toastIssue
      || fatalIssueState
      || connectionState
    );
    lifecycleVersion += 1;
    cancelTimers();
    activeSessionKey = "";
    sessionMetadata = null;
    connectionState = null;
    reconnecting = false;
    reconnectCycle = 0;
    statusIssue = null;
    toastIssue = null;
    fatalIssueState = null;
    if (hadState) emit("all_cleared");
    return hadState;
  }

  return Object.freeze({
    activateSession,
    clearAll,
    clearSession,
    getSnapshot,
    handleConnectionState,
    isCurrent,
    showIssue,
  });
}
