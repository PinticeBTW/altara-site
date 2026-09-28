const MAX_RECORDS = 512;
const MAX_DATE_MS = 8_640_000_000_000_000;

function normalizeId(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeIdentity(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const serverId = normalizeId(input.serverId);
  const userId = normalizeId(input.userId);
  const sessionId = typeof input.sessionId === "string" ? input.sessionId.trim() : "";
  if (!serverId || !userId || !sessionId || serverId.length > 128 || userId.length > 128 || sessionId.length > 256) return null;
  return { serverId, userId, sessionId, key: JSON.stringify([serverId, userId, sessionId]) };
}

/**
 * Ephemeral screen-share status on the existing server voice control plane.
 * A signal never creates or renews membership: callers must supply the current
 * authoritative member session and lease before it can produce a LIVE badge.
 */
export function createServerVoiceScreenShareProjection({
  now = () => Date.now(),
  leaseMs = 35_000,
  onChange = () => {},
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  const lease = Number.isFinite(leaseMs) && leaseMs > 0 ? Math.min(leaseMs, 300_000) : 35_000;
  const records = new Map();
  let expiryTimer = null;
  let disposed = false;

  const notify = (reason, record = null) => onChange({ reason, record });
  const cancelExpiry = () => {
    if (expiryTimer !== null) clearTimer(expiryTimer);
    expiryTimer = null;
  };

  const scheduleExpiry = () => {
    cancelExpiry();
    if (disposed) return;
    let nextExpiry = Infinity;
    for (const record of records.values()) {
      if (record.screenShareActive && !record.expiryNotified) nextExpiry = Math.min(nextExpiry, record.expiresAt);
    }
    if (!Number.isFinite(nextExpiry)) return;
    expiryTimer = setTimer(() => {
      expiryTimer = null;
      if (disposed) return;
      const at = now();
      let expired = false;
      for (const record of records.values()) {
        if (record.screenShareActive && !record.expiryNotified && record.expiresAt <= at) {
          record.expiryNotified = true;
          expired = true;
        }
      }
      scheduleExpiry();
      if (expired) notify("lease_expired");
    }, Math.max(0, nextExpiry - now()));
    expiryTimer?.unref?.();
  };

  const makeRoom = (at) => {
    if (records.size < MAX_RECORDS) return true;
    // Keep STOP high-water marks through the signal lease. Under pressure only
    // records that can no longer display LIVE are eligible for removal.
    const removable = [...records.values()]
      .filter((record) => record.retainUntil <= at && (!record.screenShareActive || record.expiresAt <= at))
      .sort((left, right) => left.receivedAt - right.receivedAt);
    for (const record of removable) {
      records.delete(record.key);
      if (records.size < MAX_RECORDS) return true;
    }
    return false;
  };

  return Object.freeze({
    accept(payload = {}, { serverId: subscriptionServerId = "" } = {}) {
      if (disposed) return false;
      const identity = normalizeIdentity(payload);
      if (!identity || identity.serverId !== normalizeId(subscriptionServerId)) return false;
      if (!Object.prototype.hasOwnProperty.call(payload, "screenShareActive") || typeof payload.screenShareActive !== "boolean") return false;
      const { stateClock, publishedAt } = payload;
      const receivedAt = now();
      if (!Number.isSafeInteger(stateClock) || stateClock <= 0
        || !Number.isSafeInteger(publishedAt) || publishedAt <= 0 || publishedAt > MAX_DATE_MS
        || publishedAt > receivedAt + lease) return false;
      const previous = records.get(identity.key) || null;
      if (previous && (stateClock < previous.stateClock
        || (stateClock === previous.stateClock && (!previous.screenShareActive || payload.screenShareActive)))) return false;
      if (!previous && !makeRoom(receivedAt)) return false;
      // Modest sender clock skew cannot extend the local lease. In particular,
      // neither delayed duplicates nor snapshot retries reset this timestamp.
      const expiresAt = Math.min(publishedAt, receivedAt) + lease;
      const record = {
        ...identity,
        stateClock,
        publishedAt,
        receivedAt,
        expiresAt,
        retainUntil: receivedAt + lease,
        screenShareActive: payload.screenShareActive,
        expiryNotified: expiresAt <= receivedAt,
      };
      records.set(identity.key, record);
      scheduleExpiry();
      notify("state_received", Object.freeze({ ...record }));
      return true;
    },

    isActive({ membershipFresh = false, terminalLeave = false, ...identityInput } = {}) {
      if (disposed || membershipFresh !== true || terminalLeave) return false;
      const identity = normalizeIdentity(identityInput);
      const record = identity ? records.get(identity.key) : null;
      return !!(record?.screenShareActive && record.expiresAt > now());
    },

    clearSession(identityInput = {}) {
      if (disposed) return false;
      const identity = normalizeIdentity(identityInput);
      if (!identity || !records.delete(identity.key)) return false;
      scheduleExpiry();
      notify("session_cleared");
      return true;
    },

    clearServer(serverId = "") {
      if (disposed) return false;
      const sid = normalizeId(serverId);
      let changed = false;
      for (const [key, record] of records) {
        if (record.serverId === sid) {
          records.delete(key);
          changed = true;
        }
      }
      if (changed) {
        scheduleExpiry();
        notify("server_cleared");
      }
      return changed;
    },

    getSnapshot(identityInput = null) {
      if (identityInput) {
        const identity = normalizeIdentity(identityInput);
        const record = identity ? records.get(identity.key) : null;
        return record ? Object.freeze({ ...record }) : null;
      }
      return Object.freeze([...records.values()].map((record) => Object.freeze({ ...record })));
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      cancelExpiry();
      records.clear();
    },
  });
}
