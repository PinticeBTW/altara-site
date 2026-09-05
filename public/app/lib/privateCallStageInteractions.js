const privateCallStageBindings = new WeakMap();
const CALL_FOCUS_TARGET_SELECTOR = "[data-call-focus-target], [data-private-call-focus-target-id]";
const CALL_FOCUS_INTERACTIVE_DESCENDANT_SELECTOR = [
  "button",
  "input",
  "select",
  "textarea",
  "a[href]",
  "[contenteditable='true']",
  "[role='menu']",
  "[role='menuitem']",
  "[role='menuitemcheckbox']",
  "[data-private-share-audio-controls]",
  "[data-private-share-audio-trigger]",
].join(", ");

export function resolvePrivateCallFocusToggle({
  clickedTargetId = "",
  focusedTargetId = "",
} = {}) {
  const clicked = String(clickedTargetId || "").trim().toLowerCase();
  const focused = String(focusedTargetId || "").trim().toLowerCase();
  if (!clicked) {
    return Object.freeze({ focusedTargetId: focused || null, action: "ignore" });
  }
  const clear = clicked === focused;
  return Object.freeze({
    focusedTargetId: clear ? null : clicked,
    action: clear ? "clear" : (focused ? "switch" : "focus"),
  });
}

export function resolvePrivateCallFocusTarget({
  surfaceType = "",
  participantUserId = "",
  screenShareTrackKey = "",
} = {}) {
  const type = String(surfaceType || "").trim().toLowerCase();
  if (type === "participant") {
    const userId = String(participantUserId || "").trim().toLowerCase();
    return userId ? `participant:${userId}` : "";
  }
  if (type === "screenshare") {
    const trackKey = String(screenShareTrackKey || "").trim().toLowerCase();
    return trackKey ? `screenshare:${trackKey}` : "";
  }
  return "";
}

export function parsePrivateCallFocusTargetId(value = "") {
  const targetId = String(value || "").trim().toLowerCase();
  const separator = targetId.indexOf(":");
  if (separator <= 0 || separator >= targetId.length - 1) {
    return Object.freeze({ targetId: "", type: "", key: "" });
  }
  const type = targetId.slice(0, separator);
  const key = targetId.slice(separator + 1);
  if ((type !== "participant" && type !== "screenshare") || !key) {
    return Object.freeze({ targetId: "", type: "", key: "" });
  }
  return Object.freeze({ targetId, type, key });
}

function closestWithin(root, target, selector) {
  const element = target && typeof target.closest === "function" ? target : null;
  const match = element?.closest?.(selector) || null;
  return match && root?.contains?.(match) ? match : null;
}

export function isPrivateCallSurfaceInteractiveDescendant(surface = null, target = null) {
  if (!surface || !target || target === surface || typeof target.closest !== "function") return false;
  const interactive = target.closest(CALL_FOCUS_INTERACTIVE_DESCENDANT_SELECTOR);
  return !!(interactive && interactive !== surface && surface.contains?.(interactive));
}

function getCallFocusTargetValue(element) {
  return String(
    element?.getAttribute?.("data-call-focus-target")
    || element?.getAttribute?.("data-private-call-focus-target-id")
    || "",
  ).trim().toLowerCase();
}

function describeFocusElement(element) {
  if (!element) return { tag: null, classes: null };
  return {
    tag: String(element.tagName || "").trim().toLowerCase() || null,
    classes: String(element.className || "").trim() || null,
  };
}

export function resolveCallFocusEventTarget({
  root = null,
  event = null,
  currentTarget = null,
} = {}) {
  const rawTarget = event?.target || null;
  const claimedCurrentTarget = currentTarget && currentTarget !== root ? currentTarget : null;
  const currentTargetFocus = parsePrivateCallFocusTargetId(getCallFocusTargetValue(claimedCurrentTarget));
  const rawClosest = closestWithin(root, rawTarget, CALL_FOCUS_TARGET_SELECTOR);
  const rawClosestFocus = parsePrivateCallFocusTargetId(getCallFocusTargetValue(rawClosest));
  const path = typeof event?.composedPath === "function" ? event.composedPath() : [];
  const pathSurface = path.find((candidate) => {
    if (!candidate || typeof candidate.getAttribute !== "function") return false;
    if (root?.contains && !root.contains(candidate)) return false;
    return !!parsePrivateCallFocusTargetId(getCallFocusTargetValue(candidate)).type;
  }) || null;
  const pathFocus = parsePrivateCallFocusTargetId(getCallFocusTargetValue(pathSurface));
  const resolvedElement = currentTargetFocus.type
    ? claimedCurrentTarget
    : (rawClosestFocus.type ? rawClosest : pathSurface);
  const resolved = currentTargetFocus.type
    ? currentTargetFocus
    : (rawClosestFocus.type ? rawClosestFocus : pathFocus);
  const rawDescription = describeFocusElement(rawTarget);
  const currentDescription = describeFocusElement(claimedCurrentTarget);
  return {
    element: resolvedElement || null,
    targetId: resolved.targetId || "",
    type: resolved.type || "",
    key: resolved.key || "",
    rawTargetTag: rawDescription.tag,
    rawTargetClasses: rawDescription.classes,
    currentTargetClasses: currentDescription.classes,
    closestFocusTarget: rawClosestFocus.targetId || null,
  };
}

function consumeHandledEvent(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.stopImmediatePropagation?.();
}

export function installPrivateCallStageInteractionDelegation(root, options = {}) {
  if (!root?.addEventListener) return null;
  const existing = privateCallStageBindings.get(root);
  if (existing) {
    existing.options = options;
    return existing;
  }

  const binding = {
    options,
    clickInstalled: false,
    contextMenuInstalled: false,
    keydownInstalled: false,
  };

  const activateParticipant = (event, inputMethod) => {
    const exactSurface = resolveExactEventSurface(root, event);
    const exactTarget = parsePrivateCallFocusTargetId(
      getCallFocusTargetValue(exactSurface),
    );
    if (exactTarget.type && exactTarget.type !== "participant") return false;
    const card = exactTarget.type === "participant"
      ? exactSurface
      : closestWithin(
          root,
          event?.target,
          "[data-private-call-participant-action='1'][data-call-user-id]",
        );
    if (!card) return false;
    const handled = binding.options?.onParticipantActivate?.({
      root,
      card,
      event,
      inputMethod,
    }) === true;
    if (handled) consumeHandledEvent(event);
    return handled;
  };

  const activateShare = (event, inputMethod) => {
    const exactSurface = resolveExactEventSurface(root, event);
    const exactTarget = parsePrivateCallFocusTargetId(
      getCallFocusTargetValue(exactSurface),
    );
    if (exactTarget.type && exactTarget.type !== "screenshare") return false;
    const panel = exactTarget.type === "screenshare"
      ? exactSurface
      : closestWithin(
          root,
          event?.target,
          "[data-private-call-share-surface='1'][data-server-voice-screenshare-panel='1']",
        );
    if (!panel) return false;
    const handled = binding.options?.onShareActivate?.({
      root,
      panel,
      event,
      inputMethod,
    }) === true;
    if (handled) consumeHandledEvent(event);
    return handled;
  };

  const resolveExactEventSurface = (stageRoot, event) => {
    return resolveCallFocusEventTarget({ root: stageRoot, event }).element;
  };

  const onClick = (event) => {
    const audioButton = closestWithin(root, event?.target, ".callShareAudioButton");
    if (audioButton) {
      const primary = closestWithin(root, audioButton, "[data-server-voice-screenshare-panel='1'], .callSharePrimary, .callMultiShareCell, .callShareSecondary");
      const handled = binding.options?.onAudioButtonActivate?.({
        root,
        primary,
        button: audioButton,
        event,
      }) === true;
      if (handled) consumeHandledEvent(event);
      return;
    }
    const exactSurface = resolveExactEventSurface(root, event);
    const exactTarget = parsePrivateCallFocusTargetId(
      getCallFocusTargetValue(exactSurface),
    );
    if (exactTarget.type === "screenshare") {
      activateShare(event, "pointer");
      return;
    }
    if (exactTarget.type === "participant") {
      activateParticipant(event, "pointer");
      return;
    }
    if (!activateParticipant(event, "pointer")) activateShare(event, "pointer");
  };

  const onKeydown = (event) => {
    if (event?.key !== "Enter" && event?.key !== " ") return;
    const audioButton = closestWithin(root, event?.target, ".callShareAudioButton");
    if (audioButton) {
      const primary = closestWithin(root, audioButton, "[data-server-voice-screenshare-panel='1'], .callSharePrimary, .callMultiShareCell, .callShareSecondary");
      const handled = binding.options?.onAudioButtonActivate?.({
        root,
        primary,
        button: audioButton,
        event,
      }) === true;
      if (handled) consumeHandledEvent(event);
      return;
    }
    const exactSurface = resolveExactEventSurface(root, event);
    const exactTarget = parsePrivateCallFocusTargetId(
      getCallFocusTargetValue(exactSurface),
    );
    if (exactTarget.type === "screenshare") {
      activateShare(event, "keyboard");
      return;
    }
    if (exactTarget.type === "participant") {
      activateParticipant(event, "keyboard");
      return;
    }
    if (!activateParticipant(event, "keyboard")) activateShare(event, "keyboard");
  };

  const onContextMenu = (event) => {
    const primary = closestWithin(root, event?.target, "[data-server-voice-screenshare-panel='1'], .callSharePrimary, .callMultiShareCell, .callShareSecondary");
    if (!primary) return;
    const handled = binding.options?.onShareContextMenu?.({
      root,
      primary,
      event,
    }) === true;
    if (handled) consumeHandledEvent(event);
  };

  // Exact participant/share roots own their event first. Delegation is a
  // bubble fallback for transient nodes that do not yet have a direct owner.
  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKeydown);
  root.addEventListener("contextmenu", onContextMenu);
  binding.clickInstalled = true;
  binding.keydownInstalled = true;
  binding.contextMenuInstalled = true;
  root.setAttribute?.("data-private-call-delegated-click", "1");
  root.setAttribute?.("data-private-call-delegated-contextmenu", "1");
  root.setAttribute?.("data-private-call-delegated-keydown", "1");
  privateCallStageBindings.set(root, binding);
  return binding;
}

export function getPrivateCallStageInteractionDelegationState(root) {
  const binding = root ? privateCallStageBindings.get(root) : null;
  return {
    rootPresent: !!root,
    delegatedClickInstalled: binding?.clickInstalled === true,
    delegatedContextMenuInstalled: binding?.contextMenuInstalled === true,
    delegatedKeydownInstalled: binding?.keydownInstalled === true,
  };
}

function isPrivateCallParticipantCard(element) {
  if (!element?.matches?.("[data-call-grid-entry='1'][data-call-user-id]")) return false;
  const mediaType = String(element.getAttribute("data-call-media-type") || "").trim().toLowerCase();
  const tileType = String(element.getAttribute("data-call-tile-type") || "").trim().toLowerCase();
  return mediaType !== "share" && tileType !== "screenshare";
}

export function mountPrivateCallMultiShareStageDom({
  root = null,
  primary = null,
  rail = null,
  grid = null,
  panels = [],
  participantCards = [],
} = {}) {
  const sharePanels = Array.from(new Set((Array.isArray(panels) ? panels : []).filter(Boolean)));
  const participants = Array.from(new Set(
    (Array.isArray(participantCards) ? participantCards : []).filter(isPrivateCallParticipantCard),
  ));
  if (!root || !primary || !rail || !grid || sharePanels.length < 2) {
    return { mounted: false, reason: "multi_share_dom_missing", shareCount: sharePanels.length };
  }
  if (primary.parentElement !== root) root.insertBefore(primary, rail);
  primary.hidden = false;
  primary.setAttribute("aria-hidden", "false");
  sharePanels.forEach((panel) => {
    panel.classList.remove("callSharePrimary", "callShareSecondary");
    panel.classList.add("callMultiShareCell");
    if (panel.parentElement !== primary) primary.appendChild(panel);
  });
  participants.forEach((card) => {
    card.classList.remove("is-private-call-focused-primary");
    card.setAttribute("aria-pressed", "false");
    if (card.parentElement !== rail) rail.appendChild(card);
  });
  root.hidden = false;
  root.setAttribute("aria-hidden", "false");
  root.setAttribute("data-call-share-layout", "multi-share-stage");
  grid.hidden = true;
  grid.setAttribute("aria-hidden", "true");
  return {
    mounted: true,
    reason: "multi_share_dom_mounted",
    shareCount: sharePanels.length,
    participantCount: participants.length,
    videos: sharePanels.map((panel) => panel.querySelector?.("video") || null).filter(Boolean),
  };
}

export function mountPrivateCallScreenFocusDom({
  root = null,
  participantPrimary = null,
  multiPrimary = null,
  rail = null,
  grid = null,
  panels = [],
  participantCards = [],
  focusedPanel = null,
} = {}) {
  const sharePanels = Array.from(new Set((Array.isArray(panels) ? panels : []).filter(Boolean)));
  const participants = Array.from(new Set(
    (Array.isArray(participantCards) ? participantCards : []).filter(isPrivateCallParticipantCard),
  ));
  const focused = focusedPanel && sharePanels.includes(focusedPanel) ? focusedPanel : sharePanels[0] || null;
  if (!root || !participantPrimary || !multiPrimary || !rail || !grid || !focused) {
    return { mounted: false, reason: "screen_focus_dom_missing", shareCount: sharePanels.length };
  }
  participantPrimary.hidden = true;
  participantPrimary.setAttribute("aria-hidden", "true");
  multiPrimary.hidden = true;
  multiPrimary.setAttribute("aria-hidden", "true");
  focused.classList.add("callSharePrimary");
  focused.classList.remove("callMultiShareCell", "callShareSecondary");
  if (focused.parentElement !== root) root.insertBefore(focused, rail);
  sharePanels.filter((panel) => panel !== focused).forEach((panel) => {
    panel.classList.remove("callSharePrimary", "callMultiShareCell");
    panel.classList.add("callShareSecondary");
    if (panel.parentElement !== rail) rail.appendChild(panel);
  });
  participants.forEach((card) => {
    card.classList.remove("is-private-call-focused-primary");
    card.setAttribute("aria-pressed", "false");
    if (card.parentElement !== rail) rail.appendChild(card);
  });
  root.hidden = false;
  root.setAttribute("aria-hidden", "false");
  root.setAttribute("data-call-share-layout", "media-focus");
  root.setAttribute("data-call-focus-kind", "screen");
  grid.hidden = true;
  grid.setAttribute("aria-hidden", "true");
  return {
    mounted: true,
    reason: "screen_focus_dom_mounted",
    shareCount: sharePanels.length,
    participantCount: participants.length,
    focusedPanel: focused,
    videos: sharePanels.map((panel) => panel.querySelector?.("video") || null).filter(Boolean),
    secondaryItemTypes: Array.from(rail.children).map((element) => (
      sharePanels.includes(element) ? "screen" : (isPrivateCallParticipantCard(element) ? "participant" : "unknown")
    )),
  };
}

export function mountPrivateCallParticipantFocusDom({
  root = null,
  primary = null,
  rail = null,
  grid = null,
  panel = null,
  panels = [],
  participantId = "",
} = {}) {
  const normalizedParticipantId = String(participantId || "").trim().toLowerCase();
  const viewport = root?.parentElement || null;
  if (!root || !primary || !rail || !grid || !viewport || !normalizedParticipantId) {
    return { mounted: false, reason: "focus_dom_missing" };
  }

  const participantCards = Array.from(
    viewport.querySelectorAll("[data-call-grid-entry='1'][data-call-user-id]"),
  ).filter(isPrivateCallParticipantCard);
  const focusedCard = participantCards.find((card) => (
    String(card.getAttribute("data-call-user-id") || "").trim().toLowerCase() === normalizedParticipantId
  )) || null;
  if (!focusedCard) {
    // A participant snapshot may be replaced between the focus state write and
    // the next reconciliation. Preserve an already-mounted dedicated owner;
    // never hand participant focus back to the legacy canvas for that gap.
    const mountedCard = primary.querySelector?.(
      "[data-call-grid-entry='1'][data-call-user-id]",
    ) || null;
    const mountedId = String(
      mountedCard?.getAttribute?.("data-call-user-id") || "",
    ).trim().toLowerCase();
    if (mountedCard && mountedId === normalizedParticipantId) {
      primary.hidden = false;
      primary.setAttribute("aria-hidden", "false");
      primary.setAttribute("data-focused-participant-id", normalizedParticipantId);
      root.hidden = false;
      root.setAttribute("aria-hidden", "false");
      root.setAttribute("data-call-share-layout", "media-focus");
      root.setAttribute("data-call-focus-kind", "participant");
      grid.hidden = true;
      grid.setAttribute("aria-hidden", "true");
      return {
        mounted: true,
        reason: "participant_focus_dom_preserved",
        participantCount: 1,
        focusedCard: mountedCard,
        secondaryItemTypes: Array.from(rail.children).map((element) => (
          isPrivateCallParticipantCard(element) ? "participant" : "screen"
        )),
      };
    }
    return {
      mounted: false,
      reason: "focused_participant_dom_missing",
      participantCount: participantCards.length,
    };
  }

  if (primary.parentElement !== root) root.insertBefore(primary, rail);
  participantCards.forEach((card) => {
    const focused = card === focusedCard;
    card.classList.toggle("is-private-call-focused-primary", focused);
    card.setAttribute("aria-pressed", focused ? "true" : "false");
    if (!focused && card.parentElement !== rail) rail.appendChild(card);
  });
  if (focusedCard.parentElement !== primary) primary.appendChild(focusedCard);

  const sharePanels = Array.from(new Set([
    ...(Array.isArray(panels) ? panels : []),
    panel,
  ].filter(Boolean)));
  if (panel && panel.parentElement !== rail) rail.appendChild(panel);
  sharePanels.forEach((sharePanel) => {
    sharePanel.classList.remove("callSharePrimary", "callMultiShareCell");
    sharePanel.classList.add("callShareSecondary");
    if (sharePanel.parentElement !== rail) rail.appendChild(sharePanel);
  });

  primary.hidden = false;
  primary.setAttribute("aria-hidden", "false");
  primary.setAttribute("data-focused-participant-id", normalizedParticipantId);
  root.hidden = false;
  root.setAttribute("aria-hidden", "false");
  root.setAttribute("data-call-share-layout", "media-focus");
  root.setAttribute("data-call-focus-kind", "participant");
  grid.hidden = true;
  grid.setAttribute("aria-hidden", "true");

  return {
    mounted: true,
    reason: "participant_focus_dom_mounted",
    participantCount: participantCards.length,
    focusedCard,
    secondaryItemTypes: Array.from(rail.children).map((element) => (
      sharePanels.includes(element) ? "screen" : (isPrivateCallParticipantCard(element) ? "participant" : "unknown")
    )),
  };
}
