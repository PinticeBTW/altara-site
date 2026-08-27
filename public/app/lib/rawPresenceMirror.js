function cloneMeta(meta = {}) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  return { ...meta };
}

function unwrapProtocolPayload(payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  const nested = payload.payload;
  if (
    nested
    && typeof nested === "object"
    && !Array.isArray(nested)
    && (
      Object.prototype.hasOwnProperty.call(nested, "joins")
      || Object.prototype.hasOwnProperty.call(nested, "leaves")
    )
  ) return nested;
  return payload;
}

function readMetas(value) {
  if (Array.isArray(value)) return value.filter((meta) => meta && typeof meta === "object").map(cloneMeta);
  if (!value || typeof value !== "object") return [];
  const inherited = { ...value };
  delete inherited.metas;
  delete inherited.presences;
  if (Array.isArray(value.metas)) {
    return value.metas
      .filter((meta) => meta && typeof meta === "object")
      .map((meta) => ({ ...inherited, ...cloneMeta(meta) }));
  }
  if (Array.isArray(value.presences)) {
    return value.presences
      .filter((meta) => meta && typeof meta === "object")
      .map((meta) => ({ ...inherited, ...cloneMeta(meta) }));
  }
  return [];
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function metaIdentity(meta = {}) {
  const nested = meta?.payload && typeof meta.payload === "object" ? meta.payload : {};
  const ref = String(meta?.phx_ref || meta?.presence_ref || nested?.phx_ref || nested?.presence_ref || "").trim();
  if (ref) return `ref:${ref}`;
  const sessionId = String(meta?.session_id || meta?.sessionId || nested?.session_id || nested?.sessionId || "").trim();
  if (sessionId) return `session:${sessionId}`;
  return `meta:${JSON.stringify(stableValue(meta))}`;
}

function metaUserId(meta = {}) {
  const nested = meta?.payload && typeof meta.payload === "object" ? meta.payload : {};
  return String(
    meta?.user_id
    || meta?.userId
    || meta?.id
    || nested?.user_id
    || nested?.userId
    || nested?.id
    || "",
  ).trim();
}

function normalizeStateInput(state = {}) {
  const source = state && typeof state === "object" && !Array.isArray(state) ? state : {};
  const normalized = new Map();
  for (const [presenceKeyInput, value] of Object.entries(source)) {
    const presenceKey = String(presenceKeyInput || "").trim();
    if (!presenceKey) continue;
    const metas = readMetas(value);
    if (!metas.length) continue;
    const byIdentity = new Map();
    for (const meta of metas) byIdentity.set(metaIdentity(meta), meta);
    if (byIdentity.size) normalized.set(presenceKey, byIdentity);
  }
  return normalized;
}

function mapSignature(mirror = new Map()) {
  return Array.from(mirror.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([presenceKey, metas]) => [
      presenceKey,
      Array.from(metas.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([identity, meta]) => [identity, stableValue(meta)]),
    ])
    .map((entry) => JSON.stringify(entry))
    .join("|");
}

function sectionEntries(section = {}) {
  if (!section || typeof section !== "object" || Array.isArray(section)) return [];
  return Object.entries(section);
}

export function createRawPresenceMirror() {
  let mirror = new Map();

  function clear() {
    const changed = mirror.size > 0;
    mirror = new Map();
    return changed;
  }

  function replace(state = {}) {
    const before = mapSignature(mirror);
    mirror = normalizeStateInput(unwrapProtocolPayload(state));
    return {
      changed: before !== mapSignature(mirror),
      ...getSummary(),
    };
  }

  function applyDiff(payload = {}) {
    const before = mapSignature(mirror);
    const diff = unwrapProtocolPayload(payload);
    const joinedUserIds = new Set();
    const leftUserIds = new Set();
    const joinedPresenceKeys = [];
    const leftPresenceKeys = [];
    let joinedMetaCount = 0;
    let leftMetaCount = 0;

    for (const [presenceKeyInput, value] of sectionEntries(diff?.joins)) {
      const presenceKey = String(presenceKeyInput || "").trim();
      if (!presenceKey) continue;
      const metas = readMetas(value);
      if (!metas.length) continue;
      joinedPresenceKeys.push(presenceKey);
      const current = mirror.get(presenceKey) || new Map();
      for (const meta of metas) {
        const previousRef = String(meta?.phx_ref_prev || meta?.presence_ref_prev || "").trim();
        if (previousRef) current.delete(`ref:${previousRef}`);
        current.set(metaIdentity(meta), meta);
        const userId = metaUserId(meta);
        if (userId) joinedUserIds.add(userId);
        joinedMetaCount += 1;
      }
      if (current.size) mirror.set(presenceKey, current);
    }

    for (const [presenceKeyInput, value] of sectionEntries(diff?.leaves)) {
      const presenceKey = String(presenceKeyInput || "").trim();
      if (!presenceKey) continue;
      const metas = readMetas(value);
      if (!metas.length) continue;
      leftPresenceKeys.push(presenceKey);
      const current = mirror.get(presenceKey);
      for (const meta of metas) {
        current?.delete(metaIdentity(meta));
        const userId = metaUserId(meta);
        if (userId) leftUserIds.add(userId);
        leftMetaCount += 1;
      }
      if (current && current.size === 0) mirror.delete(presenceKey);
    }

    return {
      changed: before !== mapSignature(mirror),
      joinedMetaCount,
      leftMetaCount,
      joinedPresenceKeys: Array.from(new Set(joinedPresenceKeys)).sort(),
      leftPresenceKeys: Array.from(new Set(leftPresenceKeys)).sort(),
      joinedUserIds: Array.from(joinedUserIds).sort(),
      leftUserIds: Array.from(leftUserIds).sort(),
      ...getSummary(),
    };
  }

  function toState() {
    return Object.fromEntries(Array.from(mirror.entries()).map(([presenceKey, metas]) => [
      presenceKey,
      { metas: Array.from(metas.values()).map(cloneMeta) },
    ]));
  }

  function getSummary() {
    const userIds = new Set();
    let sessionCount = 0;
    for (const metas of mirror.values()) {
      sessionCount += metas.size;
      for (const meta of metas.values()) {
        const userId = metaUserId(meta);
        if (userId) userIds.add(userId);
      }
    }
    return {
      presenceKeys: Array.from(mirror.keys()).sort(),
      sessionCount,
      userIds: Array.from(userIds).sort(),
      signature: mapSignature(mirror),
    };
  }

  return { applyDiff, clear, getSummary, replace, toState };
}
