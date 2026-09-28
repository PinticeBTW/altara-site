// Presentation only. A server snapshot, never the client clock, releases a wait.
export function createGroupDmRejoinWait({ read, isCurrent, onSnapshot, onStop = () => {},
  schedule = (fn, ms) => setTimeout(fn, ms), cancel = id => clearTimeout(id),
  now = () => Date.now(), intervalMs = 750, timeoutMs = 30000 } = {}) {
  let stopped = false, timer = null;
  const deadline = now() + timeoutMs;
  function stop(reason = 'cancelled') {
    if (stopped) return;
    stopped = true;
    if (timer !== null) cancel(timer);
    onStop(reason);
  }
  async function tick() {
    if (stopped) return;
    if (!isCurrent()) return stop('context_changed');
    if (now() >= deadline) return stop('timeout');
    try {
      const snapshot = await read();
      if (stopped) return;
      if (!isCurrent()) return stop('context_changed');
      onSnapshot(snapshot);
      if (snapshot?.active === false) return stop('ended');
      if (snapshot?.localRejoinBlocked === false && snapshot.localPresent !== true) return stop('ready');
    } catch (_) { /* Keep waiting; failure is not readiness. */ }
    if (!stopped) timer = schedule(tick, intervalMs);
  }
  timer = schedule(tick, intervalMs);
  return { stop };
}
