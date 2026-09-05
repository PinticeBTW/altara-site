function inputEventEpochMs(event = null, fallbackAt = Date.now()) {
  const timestamp = Number(event?.timeStamp);
  if (!Number.isFinite(timestamp) || timestamp < 0) return fallbackAt;
  if (timestamp > 1_000_000_000_000) return timestamp;
  const timeOrigin = Number(globalThis.performance?.timeOrigin || 0);
  return Number.isFinite(timeOrigin) && timeOrigin > 0
    ? timeOrigin + timestamp
    : fallbackAt;
}

export function createServerVoiceHangupActivationTracker({ now = () => Date.now() } = {}) {
  let pointerDownAt = 0;

  const capturePointerDown = (event = null) => {
    if (Number(event?.button || 0) !== 0) {
      pointerDownAt = 0;
      return false;
    }
    pointerDownAt = inputEventEpochMs(event, now());
    return true;
  };

  const cancel = () => {
    pointerDownAt = 0;
  };

  const captureActivation = (event = null) => {
    const hangupHandlerEnteredAt = now();
    const hangupClickAt = inputEventEpochMs(event, hangupHandlerEnteredAt);
    const timing = Object.freeze({
      hangupPointerDownAt: Number(pointerDownAt || 0),
      hangupClickAt,
      hangupHandlerEnteredAt,
      inputMethod: Number(event?.detail || 0) === 0 ? "keyboard" : "pointer",
    });
    pointerDownAt = 0;
    return timing;
  };

  return Object.freeze({ capturePointerDown, captureActivation, cancel });
}
