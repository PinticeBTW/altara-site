import { normalizeAltaraLocale } from './locale.js';
import { isLocalTranslationSourceLanguage } from './localTranslationLanguages.js';

function sourceLanguage(value = '') {
  if (typeof value !== 'string') return null;
  const code = value.trim().toLowerCase();
  return !code || isLocalTranslationSourceLanguage(code) ? code : null;
}

function readableInput(row, conversationId) {
  if (!row || typeof row.id !== 'string' || !row.id || row.conversation_id !== conversationId
    || typeof row.text !== 'string' || !row.text.trim()) return null;
  return { id: row.id, conversation_id: row.conversation_id, text: row.text,
    ...(typeof row.revision === 'string' || typeof row.revision === 'number' ? { revision: row.revision } : {}) };
}

/** Explicit opt-in for one current conversation. sync() is driven by rendering/visibility events, never polling. */
export function createConversationTranslationController({ getContext, getVisibleMessages, messageController = null,
  getMessageController = () => messageController, confirmEnable = async () => true,
  keepWarm = () => {}, onChange = () => {}, maxTracked = 100 } = {}) {
  if (typeof getContext !== 'function' || typeof getVisibleMessages !== 'function' || typeof getMessageController !== 'function') {
    throw new TypeError('Conversation translation requires context, visible messages and a message controller.');
  }
  const limit = Number.isFinite(maxTracked) ? Math.max(1, Math.min(100, Math.floor(maxTracked))) : 100;
  const records = new Map();
  let enabled = false, enabling = false, scope = null, locale = '', source = '', active = null;
  let generation = 0, queue = [], scheduled = false, pumping = false, waitingForSource = false, errorCode = '', enablePromise = null, lastStatus = '';

  function context() {
    let raw;
    try { raw = getContext(); } catch (_) { return null; }
    if (!raw || typeof raw.userId !== 'string' || !raw.userId || typeof raw.conversationId !== 'string' || !raw.conversationId) return null;
    return { conversationId: raw.conversationId, locale: normalizeAltaraLocale(raw.locale),
      scope: JSON.stringify([raw.userId, raw.sessionId ?? '', raw.conversationId, raw.navigationId ?? '']) };
  }

  function getStatus() {
    return Object.freeze({ enabled, enabling, sourceLanguage: source, pending: !!active, queued: queue.length, waitingForSource,
      ...(errorCode ? { errorCode } : {}) });
  }

  function notify() {
    const status = getStatus(), key = JSON.stringify(status);
    if (key === lastStatus) return;
    lastStatus = key;
    onChange(status);
  }

  const keyOf = input => JSON.stringify([input.conversation_id, input.id]);
  const signatureOf = input => JSON.stringify([input.text, input.revision ?? null, locale, source]);
  const manualSignatureOf = input => JSON.stringify([input.text, input.revision ?? null, locale]);

  function visible(ctx) {
    let rows;
    try { rows = getVisibleMessages(); } catch (_) { return []; }
    if (!Array.isArray(rows)) return [];
    const unique = new Map();
    for (const row of rows) {
      const input = readableInput(row, ctx.conversationId);
      if (input) unique.set(keyOf(input), input);
    }
    // A viewport larger than the cache must not continually evict and retranslate its own rows.
    return [...unique.values()].slice(-limit);
  }

  function remember(input, state) {
    const key = keyOf(input);
    records.delete(key);
    records.set(key, { input, signature: signatureOf(input), sourceLanguage: source, state,
      ...(state === 'manual' ? { manualSignature: manualSignatureOf(input) } : {}) });
    while (records.size > limit) records.delete(records.keys().next().value);
  }

  function cancelActive() {
    const job = active;
    active = null;
    if (job) {
      const controller = getMessageController(), current = controller.get(job.input);
      // A manual correction may already have replaced this automatic request with a different source.
      if (current.status !== 'pending' || (current.sourceLanguage || '') === job.sourceLanguage) controller.cancel?.(job.input);
    }
  }

  function disable({ hideTranslations = false } = {}) {
    const wasWarm = enabled;
    enabled = false; enabling = false; generation++; enablePromise = null;
    queue = []; waitingForSource = false; errorCode = '';
    cancelActive();
    if (hideTranslations) for (const record of records.values()) {
      if (record.state !== 'done') continue;
      const controller = getMessageController(), current = controller?.get(record.input);
      // Completion records can precede a manual replacement that has not yet
      // reached sync(). Only hide the fulfilled source still owned by this mode.
      if (current?.status === 'ready' && current.visible && (current.sourceLanguage || '') === record.sourceLanguage) controller.hide(record.input);
    }
    records.clear(); scope = null; locale = ''; source = '';
    if (wasWarm) keepWarm(false);
    notify();
  }

  function schedule() {
    if (scheduled || pumping || !enabled || active || errorCode || !queue.length) return;
    scheduled = true;
    Promise.resolve().then(() => { scheduled = false; pump(); });
  }

  function sync() {
    const ctx = context();
    if ((enabled || enabling) && (!ctx || ctx.scope !== scope)) { disable(); return; }
    if (!enabled || !ctx) return;
    if (ctx.locale !== locale) {
      locale = ctx.locale; generation++; cancelActive(); records.clear(); waitingForSource = false; errorCode = '';
    }
    const inputs = visible(ctx);
    if (active && !inputs.some(input => keyOf(input) === active.key && signatureOf(input) === active.signature)) cancelActive();
    const controller = getMessageController();
    if (active) {
      const current = controller.get(active.input);
      if (current.status === 'pending' && (current.sourceLanguage || '') !== active.sourceLanguage) cancelActive();
    }
    queue = [];
    let unknownVisible = false;
    for (const input of inputs) {
      const key = keyOf(input), signature = signatureOf(input), record = records.get(key);
      const state = controller.get(input);
      if (record?.signature === signature && record.state === 'failed' && state.errorCode === 'source_language_unknown') unknownVisible = true;
      if (record?.state === 'manual' && record.manualSignature === manualSignatureOf(input)) continue;
      if (state.status === 'ready' && state.visible && record?.state === 'done' && (state.sourceLanguage || '') !== record.sourceLanguage) {
        remember(input, 'manual'); continue;
      }
      if (active?.key === key || (record?.signature === signature && ['done', 'suppressed', 'failed'].includes(record.state))) continue;
      if (state.status === 'pending') continue; // A manual request remains owned by its caller.
      if (state.status === 'ready' && state.visible && !(record?.state === 'done' && record.signature !== signature)) { remember(input, 'manual'); continue; }
      queue.push({ input, key, signature, resetSource: !!record && ['done', 'failed', 'working'].includes(record.state) && record.sourceLanguage !== source });
    }
    // Ambiguity belongs to one attempted row. Keep the source correction hint
    // available without blocking independent rows or newly received messages.
    waitingForSource = unknownVisible;
    notify(); schedule();
  }

  function pump() {
    if (!enabled || active || errorCode) return;
    pumping = true;
    try { sync(); } finally { pumping = false; }
    if (!enabled || active || errorCode || !queue.length) return;
    const next = queue.shift(), job = { ...next, generation, sourceLanguage: source };
    active = job;
    remember(job.input, 'working');
    notify();
    let promise;
    try { promise = getMessageController().translate(job.input, { sourceLanguage: source, resetSource: job.resetSource }); }
    catch (_) { promise = Promise.resolve({ status: 'error', errorCode: 'translation_failed' }); }
    Promise.resolve(promise).then(result => {
      if (active !== job || job.generation !== generation) return;
      const ctx = context();
      if (!ctx || ctx.scope !== scope) { disable(); return; }
      if (ctx.locale !== locale) { active = null; sync(); return; }
      active = null;
      if (result?.status === 'error') {
        remember(job.input, 'failed');
        if (result.errorCode === 'source_language_unknown') {
          waitingForSource = true;
          getMessageController().hide(job.input);
        } else if (result.errorCode !== 'text_too_long') {
          errorCode = ['model_unavailable', 'model_download_failed', 'rate_limited'].includes(result.errorCode) ? result.errorCode : 'translation_failed';
        }
      } else remember(job.input, 'done');
      sync();
    }).catch(() => {
      if (active !== job || job.generation !== generation) return;
      active = null; remember(job.input, 'failed'); errorCode = 'translation_failed'; sync();
    });
  }

  function setSourceLanguage(value = '') {
    const next = sourceLanguage(value);
    if (next === null || !enabled) return false;
    const ctx = context();
    if (!ctx || ctx.scope !== scope) { disable(); return false; }
    source = next; generation++; cancelActive();
    for (const [key, record] of records) if (record.state === 'suppressed' || (['failed', 'working'].includes(record.state) && record.sourceLanguage === source)) records.delete(key);
    waitingForSource = false; errorCode = '';
    sync();
    return true;
  }

  function enable({ sourceLanguage: requestedSource = '' } = {}) {
    const selected = sourceLanguage(requestedSource), ctx = context();
    if (selected === null || !ctx) return Promise.resolve(false);
    if (enabled && ctx.scope === scope) { setSourceLanguage(selected); return Promise.resolve(true); }
    if (enabling && ctx.scope === scope && enablePromise) return enablePromise;
    if (enabled || enabling) disable();
    const ticket = ++generation;
    scope = ctx.scope; locale = ctx.locale; source = selected; enabling = true;
    notify();
    enablePromise = Promise.resolve().then(() => confirmEnable()).then(accepted => {
      const current = context();
      if (ticket !== generation || !enabling) return false;
      if (!accepted || !current || current.scope !== ctx.scope || current.locale !== ctx.locale) { disable(); return false; }
      enabling = false; enabled = true; enablePromise = null; keepWarm(true); sync();
      return true;
    }).catch(() => {
      if (ticket === generation) { disable(); errorCode = 'translation_failed'; notify(); }
      return false;
    });
    return enablePromise;
  }

  function suppress(input) {
    const ctx = context(), safe = ctx && readableInput(input, ctx.conversationId);
    if (!enabled || !safe || ctx.scope !== scope) return;
    remember(safe, 'suppressed');
    if (active?.key === keyOf(safe)) cancelActive();
    sync();
  }

  function claimManual(input) {
    const ctx = context(), safe = ctx && readableInput(input, ctx.conversationId);
    if (!enabled || !safe || ctx.scope !== scope) return false;
    // Claim before cancellation: cancelling may synchronously notify sync(),
    // which must already know that this row belongs to the explicit caller.
    remember(safe, 'manual');
    queue = queue.filter(job => job.key !== keyOf(safe));
    if (active?.key === keyOf(safe)) cancelActive();
    notify();
    return true;
  }

  return Object.freeze({ enable, sync, setSourceLanguage, claimManual, suppress, disable, clear: () => disable(), getStatus });
}
