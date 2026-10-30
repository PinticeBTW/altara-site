import { isLocalTranslationSourceLanguage } from './localTranslationLanguages.js';

export const LOCAL_MESSAGE_TRANSLATION_MAX_LENGTH = 2000;
// Largest individual model download; specialists use smaller pinned assets.
export const LOCAL_MESSAGE_TRANSLATION_DOWNLOAD_BYTES = 700_000_000;
const localEngines = new Set(['opus-romance-local', 'opus-en-pt-local', 'm2m100-local', 'local-identity']);

export function localTranslationError(code = 'translation_failed') {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function validateLocalTranslationInput(text, targetLocale) {
  if (typeof text !== 'string' || !text.trim()) throw localTranslationError('translation_failed');
  if (text.length > LOCAL_MESSAGE_TRANSLATION_MAX_LENGTH) throw localTranslationError('text_too_long');
  if (!['en', 'pt-PT', 'pt-BR'].includes(targetLocale)) throw localTranslationError('model_unavailable');
  // A separate plain-text translation must never reveal concealed content.
  if (/\|\||\[spoiler\]/i.test(text)) throw localTranslationError('unsafe_format');
  return { text, targetLocale };
}

export function validateLocalTranslationSourceContext(value) {
  if (typeof value !== 'string') throw localTranslationError('translation_failed');
  if (value.length > LOCAL_MESSAGE_TRANSLATION_MAX_LENGTH) throw localTranslationError('text_too_long');
  if (/\|\||\[spoiler\]|```/i.test(value)) throw localTranslationError('unsafe_format');
  return value;
}

export function createLocalTranslationProgressReporter(send, { now = () => performance.now(), intervalMs = 100 } = {}) {
  const previous = new Map();
  return {
    report(value) {
      const time = now(), before = previous.get(value.id);
      const completes = Number.isFinite(value.progress) && value.progress >= 100 && before?.progress !== value.progress;
      if (before && before.status === value.status && !completes && time - before.time < intervalMs) return;
      previous.set(value.id, { time, status: value.status, progress: value.progress }); send(value);
    },
    forget: id => previous.delete(id),
  };
}

// The renderer never imports the inference library or sends text over a network.
// Terminating this worker on account changes also retires in-progress inference.
export function createLocalMessageTranslator({ workerFactory = () => new Worker(
  new URL('./messageTranslationWorker.js', import.meta.url), { type: 'module', name: 'altara-local-message-translation' }
), maxPending = 8, timeoutMs = 600_000, idleMs = 60_000 } = {}) {
  let worker = null, serial = 0, disposed = false, idleTimer = null, activeRequestId = 0, keepWarm = false;
  const requests = new Map();
  const scheduleIdleRetirement = () => {
    clearTimeout(idleTimer); idleTimer = null;
    if (keepWarm || requests.size || !worker) return;
    const idleWorker = worker;
    idleTimer = setTimeout(() => {
      if (worker !== idleWorker || keepWarm || requests.size) return;
      idleWorker.terminate(); worker = null; idleTimer = null;
    }, idleMs);
  };
  const finish = (id, error, result) => {
    const request = requests.get(id);
    if (!request) return;
    requests.delete(id);
    if (activeRequestId === id) activeRequestId = 0;
    clearTimeout(request.timer);
    request.signal?.removeEventListener('abort', request.abort);
    if (error) request.reject(error); else request.resolve(result);
    if (!requests.size) scheduleIdleRetirement();
  };
  const reset = (code = 'cancelled') => {
    keepWarm = false;
    clearTimeout(idleTimer); idleTimer = null; worker?.terminate(); worker = null; activeRequestId = 0;
    for (const id of [...requests.keys()]) finish(id, localTranslationError(code));
  };
  const retireAndReplay = () => {
    // ONNX session disposal does not shrink WASM memory. A new realm releases
    // the old allocator while preserving the requests' timers and promises.
    clearTimeout(idleTimer); idleTimer = null;
    const retired = worker; worker = null; activeRequestId = 0; retired?.terminate();
    if (!requests.size) return;
    try {
      const replacement = getWorker();
      for (const pending of requests.values()) replacement.postMessage(pending.message);
    } catch (_) { reset('model_unavailable'); }
  };
  const getWorker = () => {
    clearTimeout(idleTimer); idleTimer = null;
    if (worker) return worker;
    try { worker = workerFactory(); } catch (_) { throw localTranslationError('model_unavailable'); }
    const createdWorker = worker;
    createdWorker.addEventListener('message', ({ data }) => {
      if (worker !== createdWorker || !data || !requests.has(data.id)) return;
      if (data.type === 'active') { activeRequestId = data.id; return; }
      if (data.type === 'restart') {
        if (activeRequestId !== data.id) return;
        const request = requests.get(data.id), source = data.sourceLanguage;
        if (!isLocalTranslationSourceLanguage(source) || request.restarts
          || (request.message.sourceLanguage && request.message.sourceLanguage !== source)) {
          finish(data.id, localTranslationError('translation_failed')); retireAndReplay(); return;
        }
        request.restarts++;
        // Keep the detected choice for this exact request so replay does not
        // redetect a different family. Explicit source choices cannot change.
        request.message = { ...request.message, sourceLanguage: source };
        retireAndReplay(); return;
      }
      if (data.type === 'progress') {
        const progress = { phase: ['loading', 'downloading', 'translating'].includes(data.status) ? data.status : 'loading' };
        if (Number.isFinite(data.progress)) progress.percent = Math.max(0, Math.min(100, data.progress));
        try { requests.get(data.id)?.onProgress?.(progress); } catch (_) {}
      } else if (data.type === 'result') {
        const request = requests.get(data.id);
        if (typeof data.text !== 'string' || !data.text.trim() || data.text.length > 12_000 || data.targetLocale !== request.targetLocale
          || (data.engine !== undefined && !localEngines.has(data.engine))) {
          finish(data.id, localTranslationError());
        } else finish(data.id, null, { text: data.text, targetLocale: data.targetLocale, engine: data.engine || 'm2m100-local', detected_source_language: data.detectedSourceLanguage || null });
      } else if (data.type === 'error') {
        const codes = new Set(['model_unavailable', 'model_download_failed', 'text_too_long', 'rate_limited', 'cancelled', 'translation_failed', 'unsafe_format', 'source_language_unknown']);
        finish(data.id, localTranslationError(codes.has(data.code) ? data.code : 'translation_failed'));
      }
    });
    createdWorker.addEventListener('error', event => { if (worker !== createdWorker) return; event.preventDefault?.(); reset('model_unavailable'); });
    createdWorker.addEventListener('messageerror', () => { if (worker === createdWorker) reset('translation_failed'); });
    return worker;
  };
  return {
    translate(text, targetLocale, { signal, onProgress, sourceLanguage = '', sourceContext = '' } = {}) {
      try {
        validateLocalTranslationInput(text, targetLocale);
        validateLocalTranslationSourceContext(sourceContext);
        if (disposed) throw localTranslationError('model_unavailable');
        if (signal?.aborted) throw localTranslationError('cancelled');
        if (requests.size >= maxPending) throw localTranslationError('rate_limited');
        const currentWorker = getWorker(), id = ++serial;
        return new Promise((resolve, reject) => {
          const request = { resolve, reject, signal, onProgress, targetLocale, restarts: 0 };
          request.message = { type: 'translate', id, text, targetLocale, sourceLanguage };
          if (sourceContext) request.message.sourceContext = sourceContext;
          request.abort = () => {
            const terminateActive = activeRequestId === id || !activeRequestId;
            if (!terminateActive) worker?.postMessage({ type: 'cancel', id });
            finish(id, localTranslationError('cancelled'));
            if (!terminateActive) return;
            // WASM generation can monopolize the worker's microtask queue, so a
            // cancel message cannot reliably interrupt it. Retire that realm
            // immediately, then preserve other queued requests in a fresh one.
            retireAndReplay();
          };
          request.timer = setTimeout(() => reset('model_unavailable'), timeoutMs);
          requests.set(id, request);
          signal?.addEventListener('abort', request.abort, { once: true });
          try { currentWorker.postMessage(request.message); }
          catch (_) { finish(id, localTranslationError('model_unavailable')); }
        });
      } catch (error) { return Promise.reject(error); }
    },
    // This lease never starts inference or downloads. The conversation's opt-in
    // automatic mode owns it and releases it on navigation, stopping or logout.
    setKeepWarm(enabled) {
      if (disposed) return false;
      const next = enabled === true;
      if (keepWarm === next) return next;
      keepWarm = next; scheduleIdleRetirement(); return keepWarm;
    },
    reset: () => reset(),
    dispose: () => { disposed = true; reset(); },
  };
}
