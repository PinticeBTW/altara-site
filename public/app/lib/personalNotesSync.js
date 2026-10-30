import { personalNotesCloudBase, validPersonalNotesCloudText } from './personalNotesCloud.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const own = (value, key) => Object.getOwnPropertyDescriptor(value, key)?.value;
const same = (left, right) => !!left && !!right && left.revision === right.revision && left.text === right.text;
function recovery(value, ownerId) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Reflect.ownKeys(value).length !== 4
      || !['version', 'ownerId', 'base', 'text'].every(key => Object.hasOwn(value, key))
      || own(value, 'version') !== 1 || own(value, 'ownerId') !== ownerId) return null;
    const base = personalNotesCloudBase(own(value, 'base'), ownerId), text = own(value, 'text');
    if (!base || typeof text !== 'string' || text.length > 4000) return null;
    return Object.freeze({ version: 1, ownerId, base, text });
  } catch { return null; }
}

/** Text edits are durable local intents before they become conditional cloud
 * writes. Conflicting or uncertain writes are never replayed without a choice. */
export function createPersonalNotesSync({ ownerId: input, remote, local, legacy, delay = 350 }) {
  if (typeof input !== 'string' || input.length !== 36 || !uuid.test(input)) throw new Error('personal_notes_invalid_owner');
  const ownerId = input.toLowerCase(), listeners = new Set(), localWrites = new Set();
  let active = null, off = null, timer = null, reading = null, latestRead = null, writing = null, readAgain = false;
  let draft = null, base = null, latestRemote = null, sequence = 0, localJob = null, blocked = null;
  let replacing = false, held = 0, editorEpoch = 0;
  let value = Object.freeze({ ownerId, status: 'inactive', text: null, savedText: null, remoteText: null, error: null, editorEpoch });
  const current = scope => !!scope && active === scope && !scope.signal.aborted;
  const dirty = () => !!base && draft !== base.text;
  function publish(status, error = null) {
    value = Object.freeze({ ownerId, status, text: status === 'inactive' ? null : draft,
      savedText: status === 'inactive' ? null : base?.text ?? null,
      remoteText: status === 'inactive' ? null : latestRemote?.text ?? null, error, editorEpoch });
    for (const listener of [...listeners]) { if (listeners.has(listener)) { try { void Promise.resolve(listener(value)).catch(() => {}); } catch {} } }
  }
  function stopTimer() { if (timer !== null) clearTimeout(timer); timer = null; }
  function persist(scope) {
    if (!base || typeof draft !== 'string') return null;
    const document = Object.freeze({ version: 1, ownerId, base, text: draft }), intent = sequence;
    let acknowledge;
    const job = { scope, intent, document, ok: false, promise: new Promise(resolve => { acknowledge = resolve; }) };
    localJob = job; localWrites.add(job);
    let result;
    // Invoke now, not after an await: adapters reserve their shared account
    // queue immediately, including edits followed by navigation or background.
    try { result = local.write(document); } catch { result = Promise.reject(new Error('personal_notes_local')); }
    void Promise.resolve(result).then(() => { job.ok = true; acknowledge(true); }, () => {
      if (current(scope) && localJob === job && sequence === intent) { blocked = 'local'; publish('error', 'local'); }
      acknowledge(false);
    }).finally(() => localWrites.delete(job));
    return job;
  }
  async function flushLocal() {
    const scope = active;
    if (!current(scope) || typeof draft !== 'string' || !base) return false;
    for (;;) {
      const job = localJob, intent = sequence;
      await Promise.all([...localWrites].map(item => item.promise));
      if (!current(scope)) return false;
      if (job !== localJob || intent !== sequence) continue;
      return !!job?.ok && job.intent === sequence && job.document.text === draft && same(job.document.base, base);
    }
  }
  async function adopt(scope, fresh) {
    if (!current(scope)) return;
    if (draft !== fresh.text) editorEpoch++;
    base = latestRemote = fresh; draft = fresh.text; sequence++; blocked = null;
    const intent = sequence;
    // Retire the old editor snapshot before awaiting the new recovery receipt.
    // A keystroke from the old visible text must not use an unseen newer base.
    let job;
    replacing = true;
    try { job = persist(scope); } finally { replacing = false; }
    if (!current(scope) || intent !== sequence || localJob !== job) return;
    publish('saving');
    if (job && await job.promise && current(scope) && intent === sequence && localJob === job) publish('ready');
  }
  async function accept(scope, fresh, mode) {
    if (!current(scope)) return;
    if (held) { readAgain = true; return; }
    latestRemote = fresh;
    if (!base || draft === null || draft === fresh.text || !dirty()) { await adopt(scope, fresh); return; }
    if (!same(base, fresh)) { stopTimer(); blocked = 'conflict'; publish('conflict', 'conflict'); return; }
    if (!validPersonalNotesCloudText(draft)) { blocked = 'invalid'; publish('error', 'write'); return; }
    if (mode === 'retry') { blocked = null; publish('saving'); return; }
    if (blocked) publish('error', blocked === 'local' ? 'local' : 'write');
  }
  async function readLatest(scope, mode = 'hint') {
    if (!current(scope)) return;
    if (reading?.scope === scope) { readAgain = true; return reading.promise; }
    const job = { scope, promise: null }; reading = latestRead = job;
    job.promise = (async () => {
      try {
        const result = await remote.read(scope.signal);
        if (!current(scope) || reading !== job) return;
        const fresh = personalNotesCloudBase(result, ownerId);
        if (!fresh) throw new Error('personal_notes_invalid_remote');
        await accept(scope, fresh, mode);
      } catch { if (current(scope) && reading === job) { stopTimer(); blocked = 'read'; publish('error', 'read'); } }
      finally {
        if (reading === job) reading = null;
        if (current(scope) && !held && readAgain) { readAgain = false; void Promise.resolve().then(() => refresh(scope)); }
      }
    })();
    return job.promise;
  }
  function refresh(scope, waitForWrite = false) {
    // Only hydrate may establish the first baseline: it must reconcile the
    // recovery journal and legacy pad before any cloud value can replace them.
    // A queued subscription hint cannot bypass a failed initial hydration.
    if (!current(scope) || !base) return Promise.resolve();
    if (held) { readAgain = true; return Promise.resolve(); }
    if (writing?.scope === scope) {
      readAgain = true;
      if (!waitForWrite) return Promise.resolve();
      const previousRead = latestRead;
      return writing.promise.then(() => {
        if (!current(scope) || held) return;
        // The write's finally dispatches the queued hint reconciliation. Await
        // that exact read, including if it already finished, rather than read
        // ahead of an older ACK or schedule a new mutation against stale state.
        if (latestRead !== previousRead && latestRead?.scope === scope) return latestRead.promise;
        return readLatest(scope);
      });
    }
    return readLatest(scope);
  }
  function schedule(scope) {
    stopTimer();
    if (!current(scope) || held || blocked || !dirty() || !validPersonalNotesCloudText(draft)) return;
    timer = setTimeout(() => { timer = null; if (current(scope)) void flush(); }, Math.max(0, Math.min(60000, Number(delay) || 0)));
    timer?.unref?.();
  }
  async function hydrate(scope) {
    if (!current(scope)) return;
    try {
      const raw = await local.read();
      if (!current(scope)) return;
      const restored = raw === null ? null : recovery(raw, ownerId);
      if (raw !== null && !restored) { blocked = 'local'; publish('error', 'local'); return; }
      let old = null;
      if (!restored) {
        old = await legacy.read();
        if (!current(scope)) return;
        if (old !== null && (typeof old !== 'string' || old.length > 4000)) { blocked = 'local'; publish('error', 'local'); return; }
      }
      let result;
      try { result = await remote.read(scope.signal); }
      catch { if (current(scope)) { blocked = 'read'; publish('error', 'read'); } return; }
      if (!current(scope)) return;
      const fresh = personalNotesCloudBase(result, ownerId);
      if (!fresh) { blocked = 'read'; publish('error', 'read'); return; }
      if (restored) {
        base = restored.base; draft = restored.text; latestRemote = fresh; sequence++;
        localJob = { scope, intent: sequence, document: restored, ok: true, promise: Promise.resolve(true) };
        blocked = dirty() ? 'recovered' : null;
        if (dirty() && same(base, fresh)) {
          blocked = validPersonalNotesCloudText(draft) ? 'recovered' : 'invalid'; publish('error', 'write');
        } else await accept(scope, fresh, 'initial');
        return;
      }
      if (!old || old === fresh.text) { await adopt(scope, fresh); return; }
      // This owned read establishes the new baseline. Retire only the error
      // inherited from the earlier hydration; failures during this reservation
      // still block its continuation through the guards below.
      base = latestRemote = fresh; draft = old; sequence++; blocked = null;
      const intent = sequence, original = base, job = persist(scope);
      if (!job || !await job.promise || !current(scope) || sequence !== intent || base !== original || localJob !== job || !same(latestRemote, fresh) || blocked) return;
      if (fresh.revision !== 0) { blocked = 'conflict'; publish('conflict', 'conflict'); }
      else if (!validPersonalNotesCloudText(draft)) { blocked = 'invalid'; publish('error', 'write'); }
      else { blocked = null; publish('saving'); schedule(scope); }
    } catch { if (current(scope)) { blocked = 'local'; publish('error', 'local'); } }
  }
  function activate() {
    if (active) return active.initial;
    const scope = new AbortController(); active = scope; draft = base = latestRemote = null; localJob = null; blocked = null; sequence++; readAgain = false; held = 0;
    publish('loading');
    if (!current(scope)) return Promise.resolve();
    try { off = remote.subscribe(() => { if (current(scope)) { if (!base) readAgain = true; else void refresh(scope); } }, scope.signal); }
    catch { off = null; }
    scope.initial = hydrate(scope).finally(() => { if (current(scope) && !held && readAgain) { readAgain = false; void refresh(scope); } });
    return scope.initial;
  }
  function deactivate() {
    stopTimer(); const previous = active; active = null; previous?.abort();
    try { off?.(); } catch {} off = null; reading = latestRead = writing = null; readAgain = false; held = 0;
    publish('inactive');
  }
  function edit(original, inputText) {
    const scope = active;
    if (!current(scope) || replacing || original !== value || !base || typeof draft !== 'string' || typeof inputText !== 'string') return;
    const next = inputText.slice(0, 4000);
    if (next === draft) return;
    draft = next; sequence++;
    if (blocked === 'invalid' && validPersonalNotesCloudText(next)) blocked = null;
    const intent = sequence, job = persist(scope);
    if (sequence !== intent || localJob !== job) return;
    if (blocked === 'conflict') publish('conflict', 'conflict');
    else if (!validPersonalNotesCloudText(next)) { blocked = 'invalid'; publish('error', 'write'); }
    else if (blocked) publish('error', blocked === 'local' ? 'local' : blocked === 'read' ? 'read' : 'write');
    else {
      // Returning to the cloud text still needs its new journal receipt: an
      // earlier draft may already be durable on this device.
      publish('saving'); schedule(scope);
      void job.promise.then(ok => {
        if (ok && current(scope) && intent === sequence && localJob === job && !blocked && !dirty()) publish('ready');
      });
    }
  }
  function flush() {
    const scope = active;
    if (!current(scope) || held) return Promise.resolve(false);
    stopTimer();
    if (writing?.scope === scope) return writing.promise;
    const job = { scope, promise: null }; writing = job;
    job.promise = (async () => {
      if (scope.initial) await scope.initial;
      if (reading?.scope === scope) await reading.promise;
      while (current(scope) && !blocked && dirty()) {
        // A completed ACK may leave a newer local intent, while a composition
        // release or Realtime hint requires a fresh baseline before that intent
        // is dispatched. Reconcile between writes, not only after the whole pump.
        if (readAgain && !held) {
          readAgain = false; await readLatest(scope, 'hint');
          if (!current(scope) || blocked || held) return false;
          continue;
        }
        const intent = sequence, original = base, text = draft;
        if (!validPersonalNotesCloudText(text)) { blocked = 'invalid'; publish('error', 'write'); return false; }
        if (!await flushLocal()) return false;
        if (!current(scope)) return false;
        if (blocked || held) return false;
        if (intent !== sequence || original !== base || reading?.scope === scope || readAgain) { if (reading?.scope === scope) await reading.promise; continue; }
        try {
          const result = await remote.write(original, text, scope.signal);
          if (!current(scope)) return false;
          const confirmed = personalNotesCloudBase(result, ownerId);
          if (!confirmed || confirmed.text !== text || confirmed.revision !== original.revision + 1) throw new Error('personal_notes_invalid_ack');
          base = latestRemote = confirmed;
          const saved = persist(scope);
          if (!saved || !await flushLocal() || !current(scope)) return false;
          if (blocked) return false;
          publish(dirty() ? 'saving' : 'ready');
        } catch (cause) {
          if (!current(scope)) return false;
          stopTimer(); blocked = 'write'; publish('error', 'write');
          let conflict = false; try { conflict = own(cause, 'code') === 'conflict'; } catch {}
          if (conflict) await readLatest(scope, 'hint');
          return false;
        }
      }
      if (!current(scope) || held || blocked || dirty() || typeof draft !== 'string' || !await flushLocal()) return false;
      if (!current(scope) || held || blocked || dirty()) return false;
      publish('ready');
      // Subscribers may synchronously author another edit or retire the page.
      // That new intent has its own journal receipt and cannot inherit this one.
      return current(scope) && !held && !blocked && !dirty() && localJob?.ok === true;
    })().finally(() => {
      if (writing === job) writing = null;
      if (current(scope) && !held && readAgain) { readAgain = false; void refresh(scope); }
    });
    return job.promise;
  }
  async function retry(original) {
    const scope = active;
    if (!current(scope) || original !== value || value.status !== 'error' || writing?.scope === scope) return;
    stopTimer();
    if (!base) {
      // Retire the error receipt before any awaited read: two taps must not
      // start competing hydrations that can publish different baselines.
      publish('loading'); if (current(scope)) await hydrate(scope); return;
    }
    await readLatest(scope, 'retry');
    if (current(scope) && !blocked && dirty()) { persist(scope); await flush(); }
  }
  async function useRemote(original) {
    const scope = active;
    if (!current(scope) || original !== value || value.status !== 'conflict' || !latestRemote || writing?.scope === scope) return;
    stopTimer(); await adopt(scope, latestRemote);
  }
  async function keepLocal(original) {
    const scope = active;
    if (!current(scope) || original !== value || value.status !== 'conflict' || !latestRemote || writing?.scope === scope) return;
    base = latestRemote; sequence++; blocked = null; persist(scope); publish('saving'); await flush();
  }
  function holdRemote() {
    const scope = active;
    if (!current(scope) || !base || typeof draft !== 'string') return () => {};
    held++; stopTimer();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (!current(scope)) return;
      held--;
      if (held) return;
      readAgain = false;
      // The editor captures its final composition against the old visible base
      // before releasing. Re-read once before permitting its conditional save.
      void refresh(scope, true).then(() => { if (current(scope) && !held && !blocked) schedule(scope); });
    };
  }
  return { activate, deactivate, snapshot: () => value,
    subscribe(listener) { const subscription = next => listener(next); listeners.add(subscription); return () => listeners.delete(subscription); },
    edit, clear: original => edit(original, ''), flush, flushLocal, retry, useRemote, keepLocal, holdRemote };
}
