const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function plainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? value : null;
}

function exactKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function integer(value, name, minimum, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new TypeError(`invalid_native_companion_${name}`);
  }
  return number;
}

export function normalizeAuthenticatedNativeCompanionTestOptions(optionsInput = {}) {
  const options = plainRecord(optionsInput);
  if (!options || !exactKeys(options, [
    "monitor", "outputWidth", "outputHeight", "durationMs", "codec", "readbackDrainPolicy",
    "readbackCompletionMode", "qualityPolicy",
  ])) {
    throw new TypeError("invalid_native_companion_test_options");
  }
  const monitor = plainRecord(options.monitor);
  if (!monitor || !exactKeys(monitor, ["left", "top", "width", "height"])) {
    throw new TypeError("invalid_native_companion_monitor");
  }
  const outputWidth = integer(options.outputWidth ?? 1280, "output_width", 320, 1920);
  const outputHeight = integer(options.outputHeight ?? 720, "output_height", 180, 1080);
  if ((outputWidth & 1) || (outputHeight & 1)) {
    throw new TypeError("native_companion_nv12_dimensions_must_be_even");
  }
  const codec = String(options.codec ?? "auto").trim().toLowerCase();
  if (!["auto", "vp8", "h264"].includes(codec)) {
    throw new TypeError("invalid_native_companion_codec");
  }
  const readbackDrainPolicy = String(
    options.readbackDrainPolicy ?? "newest_completed_drop",
  ).trim().toLowerCase();
  if (!["newest_completed_drop", "oldest_completed_preserve"].includes(readbackDrainPolicy)) {
    throw new TypeError("invalid_native_companion_readback_drain_policy");
  }
  const readbackCompletionMode = String(
    options.readbackCompletionMode ?? "callback_preserve",
  ).trim().toLowerCase();
  if (!["callback_preserve", "completion_worker"].includes(readbackCompletionMode)) {
    throw new TypeError("invalid_native_companion_readback_completion_mode");
  }
  if (
    readbackCompletionMode === "completion_worker"
    && readbackDrainPolicy !== "oldest_completed_preserve"
  ) {
    throw new TypeError("native_companion_completion_worker_requires_oldest_preserve");
  }
  const qualityPolicy = String(options.qualityPolicy ?? "current").trim().toLowerCase();
  if (!["current", "prefer_resolution"].includes(qualityPolicy)) {
    throw new TypeError("invalid_native_companion_quality_policy");
  }
  return Object.freeze({
    monitor: Object.freeze({
      left: integer(monitor.left, "monitor_left", -100000, 100000),
      top: integer(monitor.top, "monitor_top", -100000, 100000),
      width: integer(monitor.width, "monitor_width", 1, 16384),
      height: integer(monitor.height, "monitor_height", 1, 16384),
    }),
    outputWidth,
    outputHeight,
    durationMs: integer(options.durationMs ?? 20000, "duration", 1000, 600000),
    codec,
    readbackDrainPolicy,
    readbackCompletionMode,
    qualityPolicy,
  });
}

export function evaluateAuthenticatedNativeCompanionContext(contextInput = {}) {
  const context = plainRecord(contextInput) || {};
  const authenticatedUserId = String(context.authenticatedUserId || "").trim().toLowerCase();
  const stateUserId = String(context.stateUserId || "").trim().toLowerCase();
  const activeConversationId = String(context.activeConversationId || "").trim().toLowerCase();
  const controllerConversationId = String(context.controllerConversationId || "").trim().toLowerCase();
  const humanParticipantIds = Array.isArray(context.humanParticipantIds)
    ? Array.from(new Set(context.humanParticipantIds.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean)))
    : [];
  let rejectionReason = "";
  if (context.developmentRuntime !== true || context.electronRuntime !== true) rejectionReason = "development_electron_required";
  else if (!UUID_PATTERN.test(authenticatedUserId) || !String(context.accessToken || "").trim()) rejectionReason = "authenticated_session_required";
  else if (authenticatedUserId !== stateUserId) rejectionReason = "authenticated_user_state_mismatch";
  else if (context.inCall !== true || context.privateOneToOne !== true) rejectionReason = "active_private_call_required";
  else if (!UUID_PATTERN.test(activeConversationId) || activeConversationId !== controllerConversationId) rejectionReason = "active_private_call_context_mismatch";
  else if (context.controllerConnected !== true) rejectionReason = "private_call_room_not_connected";
  else if (humanParticipantIds.length !== 2 || humanParticipantIds.some((value) => !UUID_PATTERN.test(value))) rejectionReason = "private_call_human_participant_count_invalid";
  else if (!humanParticipantIds.includes(authenticatedUserId)) rejectionReason = "authenticated_user_not_in_private_call";
  else if (context.normalScreenShareActive === true) rejectionReason = "normal_screenshare_already_active";
  else if (context.nativeCompanionActive === true) rejectionReason = "native_companion_already_active";
  return Object.freeze({
    ok: !rejectionReason,
    rejectionReason: rejectionReason || null,
    authenticatedUserId: UUID_PATTERN.test(authenticatedUserId) ? authenticatedUserId : null,
    conversationId: UUID_PATTERN.test(activeConversationId) ? activeConversationId : null,
    humanParticipantIds: Object.freeze([...humanParticipantIds]),
  });
}
