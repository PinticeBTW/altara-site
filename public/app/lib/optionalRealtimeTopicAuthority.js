// Preflight only optional legacy topics covered by this existing RLS helper.
// This is admission suppression, never a replacement for Realtime authorization.
export function createOptionalRealtimeTopicAuthority({ client, getOwner, now = Date.now, timeoutMs = 3500 }) {
  const requests = new Map();
  const supported = /^(?:active-server-bots:[^:]+:[^:]+|server-voice-moderation-states:[^:]+|global-bot-channel-messages:[^:]+)$/;
  function cancel(slot) { requests.delete(slot); }
  function check(slot, topic) {
    const owner = getOwner();
    if (!owner || !supported.test(topic)) return Promise.resolve({ allowed: false, isCurrent: () => false });
    const previous = requests.get(slot);
    if (previous?.owner === owner && previous.topic === topic
      && (previous.pending || (!previous.allowed && now() - previous.checkedAt < 15000))) return previous.promise;
    const request = { owner, topic, pending: true, allowed: false, checkedAt: 0 };
    request.isCurrent = () => requests.get(slot) === request && getOwner() === owner;
    requests.set(slot, request);
    request.promise = (async () => {
      let timer;
      const controller = new AbortController();
      try {
        let query = client.rpc("altara_can_use_private_realtime_topic_v1", { p_topic: topic, p_operation: "select" });
        if (typeof query?.abortSignal === "function") query = query.abortSignal(controller.signal);
        const result = await Promise.race([
          query,
          new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve(null); }, timeoutMs); }),
        ]);
        request.allowed = request.isCurrent() && !result?.error && result?.data === true;
      } catch (_) {
        request.allowed = false;
      } finally {
        clearTimeout(timer);
        request.pending = false;
        request.checkedAt = now();
      }
      return request;
    })();
    return request.promise;
  }
  return Object.freeze({ check, cancel });
}
