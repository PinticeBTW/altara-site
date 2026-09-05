export const DM_TIMELINE_SCROLL_MODE = Object.freeze({
  FOLLOW_LATEST: "FOLLOW_LATEST",
  READING_HISTORY: "READING_HISTORY",
  TARGET_MESSAGE: "TARGET_MESSAGE",
});

const safeReason = (value = "") => String(value || "").trim().slice(0, 80);
const safeDirection = (value = "") => {
  const direction = String(value || "").trim().toLowerCase();
  return direction === "up" || direction === "down" ? direction : "";
};

export function createDmTimelineScrollModeController() {
  let state = makeInitialState();

  function makeInitialState() {
    return {
      conversationId: "",
      generation: 0,
      scrollMode: DM_TIMELINE_SCROLL_MODE.FOLLOW_LATEST,
      followLatest: true,
      lastUserScrollDirection: "",
      lastFollowCancelReason: "",
      lastTransitionReason: "initial",
      programmaticScrollCount: 0,
      layoutBottomCorrections: 0,
      olderPrependAnchorRestores: 0,
      jumpToLatestVisible: false,
    };
  }

  function applyMode(mode, reason = "") {
    state.scrollMode = mode;
    state.followLatest = mode === DM_TIMELINE_SCROLL_MODE.FOLLOW_LATEST;
    state.lastTransitionReason = safeReason(reason);
    return snapshot();
  }

  function beginNormalOpen({ conversationId = "", generation = 0 } = {}) {
    state = makeInitialState();
    state.conversationId = String(conversationId || "").trim().toLowerCase();
    state.generation = Math.max(0, Math.round(Number(generation) || 0));
    return applyMode(DM_TIMELINE_SCROLL_MODE.FOLLOW_LATEST, "normal_dm_open");
  }

  function beginTargetMessage(reason = "explicit_message_target") {
    return applyMode(DM_TIMELINE_SCROLL_MODE.TARGET_MESSAGE, reason);
  }

  function followLatest(reason = "follow_latest") {
    state.lastFollowCancelReason = "";
    state.jumpToLatestVisible = false;
    return applyMode(DM_TIMELINE_SCROLL_MODE.FOLLOW_LATEST, reason);
  }

  function registerUserScroll(direction = "", reason = "user_scroll") {
    const normalizedDirection = safeDirection(direction);
    if (normalizedDirection) state.lastUserScrollDirection = normalizedDirection;
    if (normalizedDirection !== "up") return false;
    state.lastFollowCancelReason = safeReason(reason) || "user_scroll_up";
    applyMode(DM_TIMELINE_SCROLL_MODE.READING_HISTORY, state.lastFollowCancelReason);
    return true;
  }

  function noteProgrammaticScroll() {
    state.programmaticScrollCount += 1;
    return state.programmaticScrollCount;
  }

  function noteLayoutBottomCorrection() {
    state.layoutBottomCorrections += 1;
    return state.layoutBottomCorrections;
  }

  function noteOlderPrependAnchorRestore() {
    state.olderPrependAnchorRestores += 1;
    return state.olderPrependAnchorRestores;
  }

  function setJumpToLatestVisible(visible) {
    state.jumpToLatestVisible = visible === true;
    return state.jumpToLatestVisible;
  }

  function isFollowingLatest() {
    return state.scrollMode === DM_TIMELINE_SCROLL_MODE.FOLLOW_LATEST;
  }

  function isReadingHistory() {
    return state.scrollMode === DM_TIMELINE_SCROLL_MODE.READING_HISTORY;
  }

  function isTargetMessage() {
    return state.scrollMode === DM_TIMELINE_SCROLL_MODE.TARGET_MESSAGE;
  }

  function shouldShowJumpToLatest(distanceFromBottom = 0, threshold = 0) {
    if (isFollowingLatest()) return false;
    return Number(distanceFromBottom || 0) > Math.max(0, Number(threshold || 0));
  }

  function snapshot() {
    return { ...state };
  }

  return {
    beginNormalOpen,
    beginTargetMessage,
    followLatest,
    registerUserScroll,
    noteProgrammaticScroll,
    noteLayoutBottomCorrection,
    noteOlderPrependAnchorRestore,
    setJumpToLatestVisible,
    isFollowingLatest,
    isReadingHistory,
    isTargetMessage,
    shouldShowJumpToLatest,
    snapshot,
  };
}
