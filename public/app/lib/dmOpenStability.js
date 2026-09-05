const clampCount = (value = 0) => Math.max(0, Math.round(Number(value) || 0));

const safeMetric = (value = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function hashDmOpenConversationId(value = "") {
  const input = String(value || "").trim().toLowerCase();
  if (!input) return null;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `dm-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function createDmOpenStabilityTracker({
  now = () => ((typeof performance !== "undefined" && typeof performance.now === "function")
    ? performance.now()
    : Date.now()),
  phaseLimit = 64,
} = {}) {
  let rawConversationId = "";
  let state = makeInitialState();

  function makeInitialState() {
    return {
      conversationId: null,
      phase: "idle",
      openGeneration: 0,
      openedAt: 0,
      rowCount: 0,
      mediaRowCount: 0,
      hydrationCount: 0,
      scrollTop: 0,
      scrollHeight: 0,
      clientHeight: 0,
      distanceFromBottom: 0,
      scrollMode: "FOLLOW_LATEST",
      followLatest: true,
      lastUserScrollDirection: "",
      lastFollowCancelReason: "",
      paginationEnabled: false,
      paginationRequestsDuringOpen: 0,
      userScrolledUp: false,
      programmaticScrollCount: 0,
      layoutShiftCount: 0,
      layoutBottomCorrections: 0,
      olderPrependAnchorRestores: 0,
      jumpToLatestVisible: false,
      mediaPending: 0,
      hydrationPending: 0,
      initialAnchorComplete: false,
      timelineRebuildCount: 0,
      systemRowsProjected: 0,
      systemRowsFirstPaint: 0,
      systemRowsLateInserted: 0,
      systemRowsProfileHydrated: 0,
      systemRowTimelineRebuilds: 0,
      phases: [],
    };
  }

  function sameOpen(conversationId = "", generation = 0) {
    return !!(
      rawConversationId
      && String(conversationId || "").trim().toLowerCase() === rawConversationId
      && Number(generation || 0) === Number(state.openGeneration || 0)
    );
  }

  function mergeMetrics(metrics = {}) {
    const patch = {};
    for (const key of ["scrollTop", "scrollHeight", "clientHeight", "distanceFromBottom"]) {
      const value = safeMetric(metrics?.[key]);
      if (value !== null) patch[key] = value;
    }
    for (const key of ["rowCount", "mediaRowCount", "hydrationCount", "mediaPending", "hydrationPending"]) {
      if (metrics?.[key] !== undefined) patch[key] = clampCount(metrics[key]);
    }
    Object.assign(state, patch);
  }

  function recordPhase(name = "event", metrics = {}) {
    const safeName = String(name || "event").trim().toLowerCase().slice(0, 80) || "event";
    mergeMetrics(metrics);
    state.phase = safeName;
    const entry = {
      name: safeName,
      at: safeMetric(now()) ?? 0,
      scrollTop: state.scrollTop,
      scrollHeight: state.scrollHeight,
      clientHeight: state.clientHeight,
      distanceFromBottom: state.distanceFromBottom,
      rowCount: state.rowCount,
      mediaRowCount: state.mediaRowCount,
      hydrationCount: state.hydrationCount,
      paginationRequestCount: state.paginationRequestsDuringOpen,
    };
    state.phases.push(entry);
    if (state.phases.length > Math.max(16, clampCount(phaseLimit) || 64)) {
      state.phases.splice(0, state.phases.length - Math.max(16, clampCount(phaseLimit) || 64));
    }
    return entry;
  }

  function begin({ conversationId = "", generation = 0, metrics = {} } = {}) {
    rawConversationId = String(conversationId || "").trim().toLowerCase();
    state = makeInitialState();
    state.conversationId = hashDmOpenConversationId(rawConversationId);
    state.openGeneration = clampCount(generation);
    state.openedAt = safeMetric(now()) ?? 0;
    recordPhase("open_started", metrics);
    return snapshot();
  }

  function markInitialAnchorComplete(metrics = {}) {
    state.initialAnchorComplete = true;
    if (state.userScrolledUp) state.paginationEnabled = true;
    return recordPhase("initial_anchor_complete", metrics);
  }

  function markUserScrollIntent(kind = "wheel", { upward = true, metrics = {} } = {}) {
    if (!upward) return false;
    state.userScrolledUp = true;
    state.scrollMode = "READING_HISTORY";
    state.followLatest = false;
    state.lastUserScrollDirection = "up";
    state.lastFollowCancelReason = String(kind || "user_scroll").slice(0, 80);
    state.paginationEnabled = state.initialAnchorComplete === true;
    recordPhase(`user_scroll_${String(kind || "input").slice(0, 32)}`, metrics);
    return true;
  }

  function noteProgrammaticScroll(reason = "anchor", metrics = {}) {
    state.programmaticScrollCount += 1;
    recordPhase(`programmatic_scroll_${String(reason || "anchor").slice(0, 36)}`, metrics);
  }

  function syncScrollMode(scrollState = {}) {
    const mode = String(scrollState?.scrollMode || "").trim().toUpperCase();
    if (["FOLLOW_LATEST", "READING_HISTORY", "TARGET_MESSAGE"].includes(mode)) {
      state.scrollMode = mode;
      state.followLatest = mode === "FOLLOW_LATEST";
    }
    if (scrollState?.lastUserScrollDirection !== undefined) {
      state.lastUserScrollDirection = String(scrollState.lastUserScrollDirection || "").slice(0, 16);
    }
    if (scrollState?.lastFollowCancelReason !== undefined) {
      state.lastFollowCancelReason = String(scrollState.lastFollowCancelReason || "").slice(0, 80);
    }
    for (const key of ["programmaticScrollCount", "layoutBottomCorrections", "olderPrependAnchorRestores"]) {
      if (scrollState?.[key] !== undefined) state[key] = clampCount(scrollState[key]);
    }
    if (scrollState?.jumpToLatestVisible !== undefined) {
      state.jumpToLatestVisible = scrollState.jumpToLatestVisible === true;
    }
    return snapshot();
  }

  function noteLayoutShift(reason = "resize", metrics = {}) {
    state.layoutShiftCount += 1;
    recordPhase(`layout_shift_${String(reason || "resize").slice(0, 36)}`, metrics);
  }

  function noteTimelineRender({ replaced = false, metrics = {}, reason = "render" } = {}) {
    if (replaced) state.timelineRebuildCount += 1;
    recordPhase(`timeline_${String(reason || "render").slice(0, 48)}`, metrics);
  }

  function noteSystemRows({ projected = 0, firstPaint = 0, lateInserted = 0, profileHydrated = 0, timelineRebuilds = 0 } = {}) {
    state.systemRowsProjected += clampCount(projected);
    state.systemRowsFirstPaint += clampCount(firstPaint);
    state.systemRowsLateInserted += clampCount(lateInserted);
    state.systemRowsProfileHydrated += clampCount(profileHydrated);
    state.systemRowTimelineRebuilds += clampCount(timelineRebuilds);
    return recordPhase("system_rows", {});
  }

  function shouldRequestOlder({ conversationId = "", generation = 0, scrollTop = 0, threshold = 0 } = {}) {
    return !!(
      sameOpen(conversationId, generation)
      && state.initialAnchorComplete
      && state.paginationEnabled
      && state.userScrolledUp
      && Number(scrollTop || 0) <= Math.max(0, Number(threshold || 0))
    );
  }

  function notePaginationRequest(metrics = {}) {
    state.paginationRequestsDuringOpen += 1;
    recordPhase("pagination_requested", metrics);
    return state.paginationRequestsDuringOpen;
  }

  function snapshot(metrics = null) {
    if (metrics && typeof metrics === "object") mergeMetrics(metrics);
    return {
      ...state,
      phases: state.phases.map((entry) => ({ ...entry })),
    };
  }

  return {
    begin,
    recordPhase,
    markInitialAnchorComplete,
    markUserScrollIntent,
    noteProgrammaticScroll,
    syncScrollMode,
    noteLayoutShift,
    noteTimelineRender,
    noteSystemRows,
    shouldRequestOlder,
    notePaginationRequest,
    sameOpen,
    snapshot,
  };
}
