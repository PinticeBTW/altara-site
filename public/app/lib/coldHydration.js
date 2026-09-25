// UI readiness only: never an authorization source, never persisted or sent as analytics.
export function classifyColdPresenceSnapshot(meta = {}) {
  const source = String(meta.source || '');
  if (/error|unstable|mismatch/.test(source) || ['stopped', 'auth-subject-changed', 'transport-unavailable'].includes(source)) return 'error';
  if (meta.relationshipScoped === true) return 'ready'; // A successful existing scoped snapshot RPC.
  // A manual health reconcile can inspect an empty SDK cache before any server snapshot.
  // Its timestamp alone is not proof of an initial full presence result.
  if (['presence-sync', 'raw-presence-state'].includes(source) && Number(meta.authoritativeReconcileAt || 0) > 0) return 'ready';
  return null;
}

export function createColdHydration({ getOwner = () => '', now = () => performance.now() } = {}) {
  let owner = null, epoch = 0, sequence = 0;
  const resources = new Map(), events = [];
  function bind() {
    const next = String(getOwner() || '');
    if (next !== owner) { owner = next; epoch++; resources.clear(); events.length = 0; }
  }
  function mark(stage) {
    bind(); events.push({ stage, at: now() });
    if (events.length > 120) events.shift();
  }
  function read(key) { bind(); return resources.get(key) || { phase: 'unknown', sequence: 0 }; }
  function begin(key) {
    bind(); const ticket = Object.freeze({ key, epoch, sequence: ++sequence });
    resources.set(key, { phase: 'loading', sequence: ticket.sequence }); mark(`${key}:loading`);
    return ticket;
  }
  function current(ticket) {
    bind(); return !!ticket && ticket.epoch === epoch && resources.get(ticket.key)?.sequence === ticket.sequence;
  }
  function finish(ticket, phase = 'ready') {
    if (!current(ticket) || !['ready', 'error'].includes(phase)) return false;
    resources.set(ticket.key, { phase, sequence: ticket.sequence }); mark(`${ticket.key}:${phase}`); return true;
  }
  function phase(keys) {
    const states = keys.map(key => read(key).phase);
    if (states.includes('error')) return 'error';
    return states.every(value => value === 'ready') ? 'ready' : 'loading';
  }
  return { read, begin, current, finish, phase, mark, snapshot: () => { bind(); return events.map(e => ({ ...e })); } };
}
