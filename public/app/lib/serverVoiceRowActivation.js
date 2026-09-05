export const SERVER_VOICE_ROW_SELECTOR = "[data-server-voice-channel]";

export const SERVER_VOICE_ROW_NON_JOIN_SELECTOR = [
  "[data-server-voice-nonjoin-action]",
  "[data-server-channel-settings]",
  "[data-server-channel-menu-open]",
  "[data-server-category-toggle]",
  "[data-server-create-channel]",
].join(", ");

const clean = (value) => String(value || "").trim();

function describeElement(element = null) {
  if (!element) return "missing";
  const tag = clean(element.tagName).toLowerCase() || "element";
  const classes = clean(element.className).split(/\s+/).filter(Boolean).slice(0, 4);
  return `${tag}${classes.map((name) => `.${name}`).join("")}`.slice(0, 160);
}

function containsElement(root, candidate) {
  if (!root || !candidate) return false;
  if (root === candidate) return true;
  return typeof root.contains === "function" ? root.contains(candidate) : false;
}

function getInputEventEpochMs(event = null, fallbackAt = Date.now()) {
  const timestamp = Number(event?.timeStamp);
  if (!Number.isFinite(timestamp) || timestamp < 0) return fallbackAt;
  // Chromium normally exposes an offset from performance.timeOrigin, while
  // older event implementations may already expose epoch milliseconds.
  if (timestamp > 1_000_000_000_000) return timestamp;
  const timeOrigin = Number(globalThis.performance?.timeOrigin || 0);
  return Number.isFinite(timeOrigin) && timeOrigin > 0
    ? timeOrigin + timestamp
    : fallbackAt;
}

export function resolveServerVoiceRowActivation(event = null, rowRoot = null, {
  dragging = false,
} = {}) {
  const root = rowRoot || event?.currentTarget || null;
  const target = event?.target || root;
  const type = clean(event?.type).toLowerCase() || "click";
  const key = String(event?.key ?? "");
  if (!root || typeof root.getAttribute !== "function") {
    return { accepted: false, reason: "missing-row-root", root, target, type, key };
  }
  if (!root.hasAttribute?.("data-server-voice-channel")) {
    return { accepted: false, reason: "not-voice-row", root, target, type, key };
  }
  if (dragging === true) {
    return { accepted: false, reason: "dragging", root, target, type, key };
  }
  if ((type === "click" || type === "pointerdown") && Number(event?.button || 0) !== 0) {
    return { accepted: false, reason: "non-primary", root, target, type, key };
  }
  if (type === "keydown" && key !== "Enter" && key !== " ") {
    return { accepted: false, reason: "unsupported-key", root, target, type, key };
  }
  if (type === "keydown" && event?.repeat === true) {
    return { accepted: false, reason: "repeated-key", root, target, type, key };
  }
  const nestedAction = typeof target?.closest === "function"
    ? target.closest(SERVER_VOICE_ROW_NON_JOIN_SELECTOR)
    : null;
  if (nestedAction && nestedAction !== root && containsElement(root, nestedAction)) {
    return { accepted: false, reason: "nested-control", root, target, nestedAction, type, key };
  }
  return {
    accepted: true,
    reason: "activate",
    root,
    target,
    type,
    key,
    rootSelector: describeElement(root),
    targetSelector: describeElement(target),
    inputMethod: type === "keydown" ? "keyboard" : "pointer",
  };
}

export function bindServerVoiceRowActivation(rowRoot, {
  isDragging = () => false,
  onActivate = () => false,
  onTrace = () => {},
  now = () => Date.now(),
} = {}) {
  if (!rowRoot || typeof rowRoot.addEventListener !== "function") return () => {};
  let lastKeyboardActivationAt = 0;
  let pendingPointerActivation = null;

  const trace = (event, details = {}) => {
    try {
      onTrace({
        event,
        rootSelector: describeElement(rowRoot),
        ...details,
      });
    } catch (_) {}
  };

  const dispatch = (event, activation) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    trace("activation-dispatched", {
      inputMethod: activation.inputMethod,
      targetSelector: activation.targetSelector,
    });
    let result;
    try {
      result = onActivate({ ...activation, event, rowRoot });
    } catch (error) {
      trace("activation-rejected", {
        category: clean(error?.code || error?.name || "dispatch_failed").slice(0, 80),
      });
      return false;
    }
    Promise.resolve(result).then((settled) => {
      trace(settled === false ? "activation-failed" : "activation-settled", {
        result: settled === false ? "failed" : "accepted",
      });
    }, (error) => {
      trace("activation-rejected", {
        category: clean(error?.code || error?.name || "dispatch_failed").slice(0, 80),
      });
    });
    return result;
  };

  const onClick = (event) => {
    const rowHandlerEnteredAt = now();
    const clickAt = getInputEventEpochMs(event, rowHandlerEnteredAt);
    trace("handler-entered", {
      eventType: "click",
      targetSelector: describeElement(event?.target),
    });
    if (
      Number(event?.detail || 0) === 0
      && lastKeyboardActivationAt > 0
      && Math.max(0, now() - lastKeyboardActivationAt) < 750
    ) {
      trace("activation-ignored", { reason: "keyboard-synthetic-click" });
      return;
    }
    const activation = resolveServerVoiceRowActivation(event, event?.currentTarget || rowRoot, {
      dragging: isDragging(),
    });
    if (!activation.accepted) {
      pendingPointerActivation = null;
      trace("activation-ignored", { reason: activation.reason });
      return;
    }
    const capturedPointer = pendingPointerActivation;
    pendingPointerActivation = null;
    dispatch(event, {
      ...activation,
      pointerDownAt: Number(capturedPointer?.pointerDownAt || 0),
      clickAt,
      rowHandlerEnteredAt,
    });
  };

  const onPointerdown = (event) => {
    const pointerHandlerEnteredAt = now();
    const pointerDownAt = getInputEventEpochMs(event, pointerHandlerEnteredAt);
    const activation = resolveServerVoiceRowActivation(event, event?.currentTarget || rowRoot, {
      dragging: isDragging(),
    });
    if (!activation.accepted) {
      pendingPointerActivation = null;
      return;
    }
    pendingPointerActivation = {
      pointerDownAt,
      targetSelector: activation.targetSelector,
    };
    trace("pointerdown-captured", {
      inputMethod: "pointer",
      targetSelector: activation.targetSelector,
    });
  };

  const onPointercancel = () => {
    pendingPointerActivation = null;
  };

  const onKeydown = (event) => {
    trace("handler-entered", {
      eventType: "keydown",
      key: clean(event?.key).slice(0, 20),
      targetSelector: describeElement(event?.target),
    });
    const activation = resolveServerVoiceRowActivation(event, event?.currentTarget || rowRoot, {
      dragging: isDragging(),
    });
    if (!activation.accepted) {
      if (activation.reason !== "unsupported-key") {
        trace("activation-ignored", { reason: activation.reason });
      }
      return;
    }
    const rowHandlerEnteredAt = now();
    lastKeyboardActivationAt = rowHandlerEnteredAt;
    dispatch(event, {
      ...activation,
      pointerDownAt: 0,
      clickAt: rowHandlerEnteredAt,
      rowHandlerEnteredAt,
    });
  };

  rowRoot.addEventListener("pointerdown", onPointerdown);
  rowRoot.addEventListener("pointercancel", onPointercancel);
  rowRoot.addEventListener("click", onClick);
  rowRoot.addEventListener("keydown", onKeydown);
  return () => {
    pendingPointerActivation = null;
    rowRoot.removeEventListener?.("pointerdown", onPointerdown);
    rowRoot.removeEventListener?.("pointercancel", onPointercancel);
    rowRoot.removeEventListener?.("click", onClick);
    rowRoot.removeEventListener?.("keydown", onKeydown);
  };
}
