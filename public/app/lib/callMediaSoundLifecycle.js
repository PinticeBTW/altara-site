// Consumes accepted call state, never raw microphone track events. Unknown
// fields and newly visible participant sessions establish a silent baseline.
export function createCallMediaSoundLifecycle({ playCue = () => {}, cancelOwner = () => {} } = {}) {
  let scope = "";
  let transportSession = "";
  let epoch = 0;
  const participants = new Map();
  const owners = new Set();
  function reset() {
    ++epoch;
    for (const owner of owners) cancelOwner(owner);
    owners.clear();
    participants.clear();
  }
  function sync({ sessionId = "", conversationId = "", connected = false, members = [] } = {}) {
    const nextScope = connected && sessionId && conversationId ? `${sessionId}:${conversationId}` : "";
    const continuous = scope && scope !== nextScope && nextScope && transportSession === sessionId ? new Map(participants) : null;
    if (scope !== nextScope) { reset(); scope = nextScope; }
    transportSession = nextScope ? sessionId : "";
    if (!scope) return;
    const present = new Set();
    for (const member of members) {
      const id = String(member.userId || "");
      if (!id) continue;
      present.add(id);
      const previous = participants.get(id);
      if (!previous || previous.sessionId !== member.sessionId) {
        const retained = continuous?.get(id);
        // Logical channel moves keep an already accepted state for participants
        // that move together; delayed attributes must not roll it backwards.
        participants.set(id, retained?.sessionId === member.sessionId ? { ...retained } : { ...member });
      }
    }
    for (const id of participants.keys()) if (!present.has(id)) participants.delete(id);
  }
  function observe({ userId, muted, sharing, mutedClock = 0, baseline = false, reason = "accepted_call_state" } = {}) {
    const participant = participants.get(String(userId || ""));
    if (!scope || !participant) return [];
    const played = [];
    for (const [field, value, on, off] of [
      ["muted", muted, "mute", "unmute"],
      ["sharing", sharing, "screen_share_start", "screen_share_stop"],
    ]) {
      if (typeof value !== "boolean") continue;
      if (field === "muted" && Number(mutedClock) > 0) {
        // Sender revisions in the reconnect snapshot fence buffered data packets.
        // Receiver timestamps must never be compared with this sender clock.
        if (!baseline && Number(mutedClock) <= Number(participant.mutedClock || 0)) continue;
        participant.mutedClock = Math.max(Number(participant.mutedClock || 0), Number(mutedClock));
      }
      const previous = participant[field];
      participant[field] = value;
      if (baseline || typeof previous !== "boolean" || previous === value) continue;
      const cue = value ? on : off;
      const currentEpoch = epoch;
      const ownerKey = `call-media:${scope}:${userId}:${field}`;
      owners.add(ownerKey);
      void playCue(cue, {
        ownerKey, replaceOwner: true, ownerType: "call_media", generation: String(epoch), reason,
        isPlaybackCurrent: () => epoch === currentEpoch && !!scope && participants.get(String(userId)) === participant,
      });
      played.push(cue);
    }
    return played;
  }
  return Object.freeze({ sync, observe, clear() { reset(); scope = ""; } });
}
