import { normalizeAltaraLocale } from './locale.js';
import { LOCAL_TRANSLATION_SOURCE_LANGUAGES } from './localTranslationLanguages.js';

const COPY = Object.freeze({
  en: { pending: 'Translating…', loading: 'Preparing translation…', downloading: 'Downloading model…', hide: 'Hide', retry: 'Try again', label: 'translation', english: 'English', portuguese: 'Portuguese', settings: 'Settings', chooseSource: 'Choose language', already: 'Already in {language}.', unchanged: 'Translation is unchanged.', error: 'Could not translate.', unavailable: 'Translation is unavailable on this device.', download: 'Could not download the model.', tooLong: 'Message too long to translate.', rateLimited: 'Please wait before trying again.', sourceUnknown: 'Original language not identified.' },
  'pt-PT': { pending: 'A traduzir…', loading: 'A preparar tradução…', downloading: 'A descarregar modelo…', hide: 'Ocultar', retry: 'Tentar novamente', label: 'tradução', english: 'Inglês', portuguese: 'Português', settings: 'Definições', chooseSource: 'Escolher idioma', already: 'Já está em {language}.', unchanged: 'Sem alterações na tradução.', error: 'Não foi possível traduzir.', unavailable: 'Tradução indisponível neste dispositivo.', download: 'Não foi possível descarregar o modelo.', tooLong: 'Mensagem demasiado longa para traduzir.', rateLimited: 'Aguarda antes de tentar novamente.', sourceUnknown: 'Idioma original não identificado.' },
  'pt-BR': { pending: 'Traduzindo…', loading: 'Preparando tradução…', downloading: 'Baixando modelo…', hide: 'Ocultar', retry: 'Tentar novamente', label: 'tradução', english: 'Inglês', portuguese: 'Português', settings: 'Configurações', chooseSource: 'Escolher idioma', already: 'Já está em {language}.', unchanged: 'Sem alterações na tradução.', error: 'Não foi possível traduzir.', unavailable: 'Tradução indisponível neste dispositivo.', download: 'Não foi possível baixar o modelo.', tooLong: 'Mensagem longa demais para traduzir.', rateLimited: 'Aguarde antes de tentar novamente.', sourceUnknown: 'Idioma original não identificado.' },
});
const IDLE = Object.freeze({ status: 'idle', visible: false });
const ERROR_CODES = new Set(['model_unavailable', 'model_download_failed', 'text_too_long', 'rate_limited', 'source_language_unknown']);
const MAX_TRANSLATION_LENGTH = 32000;
const COMMON_SOURCE_LANGUAGES = Object.freeze([
  ['en', 'English'], ['pt', 'Português'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['it', 'Italiano'],
  ['ru', 'Русский'], ['uk', 'Українська'], ['zh', '中文'], ['ja', '日本語'], ['ko', '한국어'], ['ar', 'العربية'], ['hi', 'हिन्दी'], ['tr', 'Türkçe'],
].map(([code, label]) => Object.freeze({ code, label })));
const SOURCE_LANGUAGE_CODES = new Set(LOCAL_TRANSLATION_SOURCE_LANGUAGES);
const sourceChoicesByLocale = new Map();

export function messageTranslationSourceChoices(locale = 'en') {
  const canonical = normalizeAltaraLocale(locale);
  if (!sourceChoicesByLocale.has(canonical)) {
    const names = new Intl.DisplayNames([canonical], { type: 'language' });
    const commonCodes = new Set(COMMON_SOURCE_LANGUAGES.map(language => language.code));
    const other = [...SOURCE_LANGUAGE_CODES].filter(code => !commonCodes.has(code)).map(code => Object.freeze({ code,
      label: code === 'ns' ? 'Sesotho sa Leboa' : names.of(code) })).sort((a, b) => a.label.localeCompare(b.label, canonical));
    sourceChoicesByLocale.set(canonical, Object.freeze([...COMMON_SOURCE_LANGUAGES.filter(language => SOURCE_LANGUAGE_CODES.has(language.code)), ...other]));
  }
  return sourceChoicesByLocale.get(canonical);
}

export const MESSAGE_TRANSLATION_SOURCE_LANGUAGES = messageTranslationSourceChoices('en');

export function normalizeMessageTranslationSourceLanguage(value = '') {
  if (typeof value !== 'string') return null;
  const code = value.trim().toLowerCase();
  return !code || SOURCE_LANGUAGE_CODES.has(code) ? code : null;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function comparableText(value) { return value.replace(/\r\n?/g, '\n').normalize('NFC').trim(); }

function messageSnapshot(input) {
  if (!input || typeof input.id !== 'string' || !input.id || typeof input.conversation_id !== 'string' || !input.conversation_id
    || typeof input.text !== 'string' || !input.text.trim()) return null;
  const revision = typeof input.revision === 'string' || typeof input.revision === 'number' ? input.revision : null;
  return { id: input.id, conversationId: input.conversation_id, text: input.text, signature: JSON.stringify([input.text, revision]) };
}

function publicState(entry) {
  if (!entry) return IDLE;
  return Object.freeze({ status: entry.status, visible: entry.visible, targetLocale: entry.locale,
    ...(entry.sourceLanguage ? { sourceLanguage: entry.sourceLanguage } : {}),
    ...(entry.status === 'pending' && entry.progress ? { progress: Object.freeze({ ...entry.progress }) } : {}),
    ...(entry.status === 'ready' ? { text: entry.text, detectedSourceLanguage: entry.detectedSourceLanguage } : {}),
    ...(entry.status === 'ready' && entry.unchanged ? { unchanged: true } : {}),
    ...(entry.status === 'error' ? { errorCode: entry.errorCode } : {}) });
}

/** Volatile per-viewer cache. getMessage must resolve the current readable message, including its latest revision. */
export function createMessageTranslationController({ request, getContext, getMessage, onChange = () => {}, maxEntries = 100 } = {}) {
  if (typeof request !== 'function' || typeof getContext !== 'function' || typeof getMessage !== 'function') {
    throw new TypeError('Translation requires request, getContext and getMessage callbacks.');
  }
  const limit = Number.isFinite(maxEntries) ? Math.max(1, Math.min(500, Math.floor(maxEntries))) : 100;
  const entries = new Map();
  let accountKey = null, scopeKey = null, generation = 0;

  function discard(key, entry) {
    entries.delete(key);
    entry.abort.abort();
  }

  function context() {
    let raw;
    try { raw = getContext(); } catch (_) { raw = null; }
    const next = raw && typeof raw.userId === 'string' && raw.userId && typeof raw.conversationId === 'string' && raw.conversationId
      ? { userId: raw.userId, conversationId: raw.conversationId, locale: normalizeAltaraLocale(raw.locale), sessionId: String(raw.sessionId ?? ''), navigationId: String(raw.navigationId ?? '') } : null;
    const account = next ? JSON.stringify([next.userId, next.sessionId]) : null;
    const scope = next ? JSON.stringify([account, next.conversationId, next.locale, next.navigationId]) : null;
    if (account !== accountKey) {
      for (const [key, entry] of entries) discard(key, entry);
      accountKey = account;
    }
    if (scope !== scopeKey) {
      generation++;
      // Leaving a conversation or language invalidates its pending work, even if the viewer returns before it finishes.
      for (const [key, entry] of entries) if (entry.status === 'pending') discard(key, entry);
      scopeKey = scope;
    }
    return next;
  }

  function currentMessage(message) {
    let latest;
    try { latest = messageSnapshot(getMessage(message.id, message.conversationId)); } catch (_) { return false; }
    return !!latest && latest.id === message.id && latest.conversationId === message.conversationId && latest.signature === message.signature;
  }

  function resolve(input) {
    const ctx = context(), message = messageSnapshot(input);
    if (!ctx || !message || message.conversationId !== ctx.conversationId || !currentMessage(message)) return null;
    // Once an edit is observed, no older revision remains reusable in any language.
    for (const [key, entry] of entries) if (entry.message.id === message.id && entry.message.conversationId === message.conversationId && entry.message.signature !== message.signature) discard(key, entry);
    const key = JSON.stringify([accountKey, message.conversationId, ctx.locale, message.id, message.signature]);
    return { ctx, message, key, entry: entries.get(key) };
  }

  function notify(entry) {
    onChange({ messageId: entry.message.id, conversationId: entry.message.conversationId });
  }

  function get(input) { return publicState(resolve(input)?.entry); }

  function translate(input, { sourceLanguage = '', resetSource = false } = {}) {
    sourceLanguage = normalizeMessageTranslationSourceLanguage(sourceLanguage);
    if (sourceLanguage === null) return Promise.resolve(null);
    const resolved = resolve(input);
    if (!resolved) return Promise.resolve(null);
    const { ctx, message, key } = resolved;
    if (resolved.entry?.errorCode === 'source_language_unknown' && !sourceLanguage) {
      const entry = resolved.entry;
      if (!entry.visible) { entry.visible = true; notify(entry); }
      return Promise.resolve(publicState(entry));
    }
    if (!sourceLanguage && !resetSource && resolved.entry?.sourceLanguage) sourceLanguage = resolved.entry.sourceLanguage;
    const matchingSource = sourceLanguage ? resolved.entry?.sourceLanguage === sourceLanguage : !resetSource || !resolved.entry?.sourceLanguage;
    if (resolved.entry && ['pending', 'ready'].includes(resolved.entry.status) && matchingSource) {
      const entry = resolved.entry;
      const wasVisible = entry.visible;
      entry.visible = true;
      entries.delete(key); entries.set(key, entry);
      if (!wasVisible) notify(entry);
      return entry.promise || Promise.resolve(publicState(entry));
    }
    if (resolved.entry) discard(key, resolved.entry);
    const entry = { message, locale: ctx.locale, sourceLanguage, status: 'pending', visible: true, abort: new AbortController(), generation };
    entries.set(key, entry);
    while (entries.size > limit) {
      const [oldKey, oldest] = entries.entries().next().value;
      discard(oldKey, oldest);
    }
    const isCurrent = () => {
      const active = context();
      return !!active && entry.generation === generation && entries.get(key) === entry && currentMessage(message);
    };
    // Start on the next microtask so duplicate clicks always receive the same pending promise.
    entry.promise = Promise.resolve().then(() => {
      if (!isCurrent()) return null;
      return request({ message_id: message.id, conversation_id: message.conversationId, target_locale: ctx.locale, text: message.text,
        ...(sourceLanguage ? { source_language: sourceLanguage } : {}) }, {
        signal: entry.abort.signal,
        onProgress(progress) {
          if (!isCurrent() || !['loading', 'downloading', 'translating'].includes(progress?.phase)) return;
          const next = { phase: progress.phase, ...(typeof progress.percent === 'number' && Number.isFinite(progress.percent) ? { percent: Math.max(0, Math.min(100, Math.floor(progress.percent))) } : {}) };
          if (entry.progress?.phase === next.phase && entry.progress?.percent === next.percent) return;
          entry.progress = next;
          notify(entry);
        },
      });
    }).then(result => {
      if (!isCurrent()) { if (entries.get(key) === entry) discard(key, entry); return null; }
      if (!result || typeof result.text !== 'string' || !result.text.trim() || result.text.length > MAX_TRANSLATION_LENGTH) throw new Error('invalid_translation');
      entry.status = 'ready'; entry.text = result.text;
      entry.detectedSourceLanguage = typeof result.detected_source_language === 'string' && /^[a-z]{2,3}(?:-[A-Za-z]{2,8})?$/.test(result.detected_source_language) ? result.detected_source_language : null;
      entry.unchanged = comparableText(result.text) === comparableText(message.text);
      entry.promise = null;
      notify(entry);
      return publicState(entry);
    }).catch(error => {
      if (!isCurrent()) { if (entries.get(key) === entry) discard(key, entry); return null; }
      entry.status = 'error'; entry.errorCode = ERROR_CODES.has(error?.code) ? error.code : 'translation_failed'; entry.promise = null;
      notify(entry);
      return publicState(entry);
    });
    notify(entry);
    return entry.promise;
  }

  function hide(input) {
    const entry = resolve(input)?.entry;
    if (!entry || !entry.visible) return;
    entry.visible = false;
    notify(entry);
  }

  function cancel(input) {
    const ctx = context(), message = messageSnapshot(input);
    if (!ctx || !message || message.conversationId !== ctx.conversationId) return false;
    const key = JSON.stringify([accountKey, message.conversationId, ctx.locale, message.id, message.signature]);
    const entry = entries.get(key);
    if (entry?.status !== 'pending') return false;
    discard(key, entry);
    notify(entry);
    return true;
  }

  function clear() {
    generation++;
    for (const [key, entry] of entries) discard(key, entry);
    accountKey = null; scopeKey = null;
  }

  function syncContext() { context(); }

  return Object.freeze({ get, translate, hide, cancel, clear, syncContext });
}

export function renderMessageTranslationHtml(controller, input, { locale = 'en', automatic = false } = {}) {
  if (!messageSnapshot(input)) return '';
  const copy = COPY[normalizeAltaraLocale(locale)], state = controller.get(input), id = escapeHtml(input.id);
  const button = (attribute, label, disabled = false) => `<button type="button" class="msg__translationButton" ${attribute}="${id}"${disabled ? ' disabled' : ''}>${escapeHtml(label)}</button>`;
  if (!state.visible) return '';
  const hide = button('data-msg-translation-hide', copy.hide);
  if (state.status === 'pending') {
    const phase = state.progress?.phase, label = phase === 'loading' ? copy.loading : phase === 'downloading' ? copy.downloading : copy.pending;
    const percent = phase === 'downloading' && Number.isFinite(state.progress?.percent) ? ` ${state.progress.percent}%` : '';
    return `<div class="msg__translation" data-msg-translation="${id}" data-translation-status="pending"><span role="status" aria-live="polite" aria-busy="true">${escapeHtml(label + percent)}</span>${hide}</div>`;
  }
  if (state.status === 'error') {
    if (automatic && state.errorCode === 'source_language_unknown') return '';
    const errorCopy = { model_unavailable: copy.unavailable, model_download_failed: copy.download, text_too_long: copy.tooLong, rate_limited: copy.rateLimited, source_language_unknown: copy.sourceUnknown }[state.errorCode] || copy.error;
    const chooseSource = state.errorCode === 'source_language_unknown';
    const settings = button('data-msg-translation-settings', chooseSource ? copy.chooseSource : copy.settings);
    return `<div class="msg__translation msg__translation--notice" data-msg-translation="${id}" data-translation-status="error"><span role="status" aria-live="polite">${escapeHtml(errorCopy)}</span>${chooseSource ? settings : button('data-msg-translate', copy.retry) + settings}${hide}</div>`;
  }
  const target = normalizeAltaraLocale(state.targetLocale), language = target === 'en' ? copy.english : copy.portuguese;
  if (state.unchanged) {
    if (automatic) return '';
    const sameLanguage = (state.detectedSourceLanguage || state.sourceLanguage) === (target === 'en' ? 'en' : 'pt');
    const notice = sameLanguage ? copy.already.replace('{language}', language) : copy.unchanged;
    return `<div class="msg__translation msg__translation--notice" data-msg-translation="${id}" data-translation-status="ready"><span role="status" aria-live="polite">${escapeHtml(notice)}</span>${hide}</div>`;
  }
  return `<div class="msg__translation msg__translation--result" data-msg-translation="${id}" data-translation-status="ready"><div class="msg__translationText" role="status" aria-live="polite" lang="${escapeHtml(target)}" dir="auto">${escapeHtml(state.text)}</div><div class="msg__translationMeta"><span class="msg__translationLabel">${escapeHtml(language + ' · ' + copy.label)}</span>${hide}</div></div>`;
}
