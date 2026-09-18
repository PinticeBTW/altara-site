const KEY = 'altara.foundingCreator.v1';
const TTL = 7 * 24 * 60 * 60 * 1000;
export const normalizeCreatorCode = value => /^[A-Z0-9_-]{6,48}$/.test(String(value || '').trim().toUpperCase())
  ? String(value).trim().toUpperCase() : '';

export function createFoundingCreatorReferral({ storage, now = Date.now } = {}) {
  try { storage ||= globalThis.localStorage; } catch (_) { /* Storage can be disabled. */ }
  let memory = null;
  const clear = () => { memory = null; try { storage?.removeItem(KEY); } catch (_) {} };
  const read = () => {
    let row = memory;
    try { row ||= JSON.parse(storage?.getItem(KEY) || 'null'); } catch (_) {}
    if (!row || !normalizeCreatorCode(row.code) || !Number.isFinite(row.at) || row.at > now() || now() - row.at >= TTL) {
      clear(); return null;
    }
    return row;
  };
  const capture = (url = globalThis.location?.href) => {
    // First link wins during this signup journey; persisted independently of analytics consent.
    const existing = read();
    if (existing) return existing;
    let code;
    try { code = normalizeCreatorCode(new URL(url).searchParams.get('creator_ref')); } catch (_) { return null; }
    if (!code) return null;
    memory = { code, at: now() };
    try { storage?.setItem(KEY, JSON.stringify(memory)); } catch (_) {}
    return memory;
  };
  return { read, capture, clear, metadata: () => {
    const row = read(); return row ? { founding_creator_code: row.code } : {};
  } };
}

export const foundingCreatorReferral = createFoundingCreatorReferral();
