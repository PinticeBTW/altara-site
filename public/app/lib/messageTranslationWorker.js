import { createLocalTranslationRuntime, isLocalTranslationModelUrl } from './localMessageTranslationRuntime.js';
import { createLocalTranslationProgressReporter, localTranslationError } from './localMessageTranslator.js';

const originalFetch = globalThis.fetch.bind(globalThis);
const localAssets = new Set(['ort-wasm-simd-threaded.jsep.wasm', 'fasttext/core/fasttext.wasm', 'fasttext/model/lid.176.ftz']
  .map(file => new URL(`./vendor/message-translation/${file}`, import.meta.url).href));
const modelDownloads = new Set();
// A dedicated inference worker has no reason to publish diagnostics containing
// generated output. Typed, content-free errors are sent to the renderer instead.
for (const method of ['log', 'debug', 'info', 'warn', 'error']) console[method] = () => {};

function readLocalWasm(url) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest(); request.open('GET', url); request.responseType = 'arraybuffer';
    request.onload = () => request.response && (request.status === 0 || request.status === 200)
      ? resolve(new Response(request.response, { status: 200, headers: { 'Content-Type': 'application/wasm' } }))
      : reject(localTranslationError('model_unavailable'));
    request.onerror = () => reject(localTranslationError('model_unavailable')); request.send();
  });
}

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
  const method = String(init.method || input?.method || 'GET').toUpperCase();
  if (method !== 'GET' || init.body || input?.body || (!isLocalTranslationModelUrl(url) && !localAssets.has(url))) {
    throw localTranslationError('model_download_failed');
  }
  // Chromium's file:// renderer does not implement fetch(file://), while a
  // same-file XHR works without Node integration or sandbox exceptions.
  if (localAssets.has(url) && new URL(url).protocol === 'file:') return readLocalWasm(url);
  if (isLocalTranslationModelUrl(url)) modelDownloads.add(activeId);
  try { return await originalFetch(url, { method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', signal: init.signal }); }
  catch (_) { throw localTranslationError('model_download_failed'); }
};

let libraryPromise, detectorPromise, runtime;
async function detectLanguage(text) {
  if (!detectorPromise) detectorPromise = import('./vendor/message-translation/fasttext/index.mjs').then(async ({ FastText }) => {
    const detector = await FastText.create({
      corePath: new URL('./vendor/message-translation/fasttext/core/fasttext.mjs', import.meta.url).href,
      wasmPath: new URL('./vendor/message-translation/fasttext/core/fasttext.wasm', import.meta.url).href,
    });
    await detector.loadModel(new URL('./vendor/message-translation/fasttext/model/lid.176.ftz', import.meta.url).href);
    return detector;
  }).catch(() => { detectorPromise = null; throw localTranslationError('model_unavailable'); });
  const detector = await detectorPromise;
  const candidates = [...detector.predict(text, 2, 0)].sort((a, b) => b[1] - a[1]);
  return { language: String(candidates[0]?.[0] || '').replace(/^__label__/, ''), confidence: candidates[0]?.[1] || 0,
    margin: (candidates[0]?.[1] || 0) - (candidates[1]?.[1] || 0) };
}
async function library() {
  if (!libraryPromise) libraryPromise = import('./vendor/message-translation/transformers.min.js').then(async module => {
    const env = module.env;
    env.allowLocalModels = false; env.allowRemoteModels = true; env.useFS = false; env.useFSCache = false;
    env.remoteHost = 'https://huggingface.co/'; env.remotePathTemplate = '{model}/resolve/{revision}/';
    env.backends.onnx.wasm.numThreads = 1; env.backends.onnx.wasm.proxy = false;
    env.backends.onnx.wasm.wasmPaths = new URL('./vendor/message-translation/', import.meta.url).href;
    env.backends.onnx.logLevel = 'fatal';
    try {
      const cache = await caches.open('altara-local-message-models-v1');
      env.useBrowserCache = false; env.useCustomCache = true;
      env.customCache = {
        match: value => isLocalTranslationModelUrl(value) ? cache.match(value) : Promise.resolve(undefined),
        put: (value, response) => {
          if (!isLocalTranslationModelUrl(value)) throw localTranslationError('model_download_failed');
          return cache.put(value, response);
        },
      };
    } catch (_) { throw localTranslationError('model_unavailable'); }
    return module;
  }).catch(() => { libraryPromise = null; throw localTranslationError('model_unavailable'); });
  return libraryPromise;
}

const queue = [], cancelled = new Set(); let running = false, activeId = 0, loadedModelId = '', retiring = false;
const progressReporter = createLocalTranslationProgressReporter(value => self.postMessage(value));
const progress = (id, value) => {
  if (cancelled.has(id)) return;
  const result = { type: 'progress', id, status: value.status === 'translating' ? 'translating'
    : modelDownloads.has(id) && ['progress', 'download', 'initiate'].includes(value.status) ? 'downloading' : 'loading' };
  for (const key of ['progress', 'loaded', 'total']) if (Number.isFinite(value[key])) result[key] = value[key];
  progressReporter.report(result);
};
async function runQueue() {
  if (running || retiring) return; running = true;
  try {
    while (queue.length && !retiring) {
      const request = queue.shift(); activeId = request.id;
      if (cancelled.has(request.id)) { cancelled.delete(request.id); continue; }
      self.postMessage({ type: 'active', id: request.id });
      try {
        const module = await library();
        if (!runtime) runtime = createLocalTranslationRuntime({
          detectLanguage,
          onModelRequired: (choice, sourceLanguage) => {
            if (!loadedModelId || loadedModelId === choice.model.id) return;
            retiring = true;
            self.postMessage({ type: 'restart', id: activeId, sourceLanguage });
            throw localTranslationError('worker_restart');
          },
          loadPipeline: async (model, onProgress) => {
            try {
              const pipe = await module.pipeline('translation', model.id, { revision: model.revision, device: 'wasm', dtype: 'q8', progress_callback: onProgress });
              loadedModelId = model.id; return pipe;
            }
            catch (error) { if (error?.code) throw error; throw localTranslationError('model_download_failed'); }
          },
          createStoppingCriteria: () => {
            const criterion = new module.InterruptableStoppingCriteria(), list = new module.StoppingCriteriaList();
            list.push(criterion); return { list, interrupt: () => criterion.interrupt() };
          },
        });
        const result = await runtime.translate(request, { isCancelled: () => cancelled.has(request.id), onProgress: value => progress(request.id, value) });
        if (!cancelled.has(request.id)) self.postMessage({ type: 'result', id: request.id, ...result });
      } catch (error) {
        if (error?.code !== 'worker_restart' && !cancelled.has(request.id)) self.postMessage({ type: 'error', id: request.id, code: error?.code || 'translation_failed' });
      } finally { cancelled.delete(request.id); modelDownloads.delete(request.id); progressReporter.forget(request.id); activeId = 0; }
    }
  } finally { running = false; }
}
self.addEventListener('message', ({ data }) => {
  if (retiring || !data || !Number.isSafeInteger(data.id) || data.id <= 0) return;
  if (data.type === 'cancel') {
    if (activeId === data.id || queue.some(request => request.id === data.id)) { cancelled.add(data.id); runtime?.cancel(data.id); }
    return;
  }
  if (data.type !== 'translate') return;
  if (queue.length >= 8) { self.postMessage({ type: 'error', id: data.id, code: 'rate_limited' }); return; }
  queue.push({ id: data.id, text: data.text, targetLocale: data.targetLocale, sourceLanguage: data.sourceLanguage, sourceContext: data.sourceContext }); void runQueue();
});
