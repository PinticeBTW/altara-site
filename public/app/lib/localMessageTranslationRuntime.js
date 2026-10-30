import { localTranslationError, validateLocalTranslationInput, validateLocalTranslationSourceContext } from './localMessageTranslator.js';
import { isLocalTranslationSourceLanguage } from './localTranslationLanguages.js';
export { LOCAL_TRANSLATION_SOURCE_LANGUAGES } from './localTranslationLanguages.js';

export const LOCAL_TRANSLATION_MODELS = Object.freeze({
  romanceToEnglish: Object.freeze({ id: 'Xenova/opus-mt-ROMANCE-en', revision: 'f60feaabe8bb435a5871e7702b25f53a01e770f8' }),
  englishToPortuguese: Object.freeze({ id: 'Douglasrambo/opus-mt-tc-big-en-pt-onnx', revision: '738ee4cce801ce7c519954e4b78d02d5057b6740' }),
  multilingual: Object.freeze({ id: 'Xenova/m2m100_418M', revision: '9c374f0b7aca709787cea97b047bfbbd1559d177' }),
});
export const LOCAL_TRANSLATION_ASSET_FILES = Object.freeze([
  'config.json', 'generation_config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json',
  'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx',
]);
// Restrict specialist routing to the intersection of the published model
// languages and the app's validated detector/source-language vocabulary.
const romanceSources = new Set(['pt', 'es', 'fr', 'it', 'ro', 'ca', 'gl', 'oc']);
export function selectLocalTranslationModel(sourceLanguage, targetLocale) {
  const kind = targetLocale === 'en' && romanceSources.has(sourceLanguage) ? 'romanceToEnglish'
    : sourceLanguage === 'en' && ['pt-PT', 'pt-BR'].includes(targetLocale) ? 'englishToPortuguese' : 'multilingual';
  return { kind, model: LOCAL_TRANSLATION_MODELS[kind],
    prefix: kind === 'englishToPortuguese' ? (targetLocale === 'pt-BR' ? '>>pob<< ' : '>>por<< ') : '' };
}
export function isLocalTranslationModelUrl(value) {
  let url; try { url = new URL(value); } catch (_) { return false; }
  return url.origin === 'https://huggingface.co' && !url.username && !url.password && !url.search && !url.hash
    && Object.values(LOCAL_TRANSLATION_MODELS).some(model => LOCAL_TRANSLATION_ASSET_FILES.some(file => url.pathname === `/${model.id}/resolve/${model.revision}/${file}`));
}

// Preserve links, mention identifiers and literal code; only prose enters a model.
export function localTranslationSegments(text) {
  const protectedParts = /(```[\s\S]*?(?:```|$)|`[^`\n]*`|\[code\][\s\S]*?(?:\[\/code\]|$)|(?:https?:\/\/|altara:\/\/)[^\s<>]+|<@!?[a-f0-9-]+>|<a?:[^:>]+:[^>]+>|\[\[[^\]]+\]\])/gi;
  const result = []; let offset = 0, match;
  while ((match = protectedParts.exec(text))) {
    if (match.index > offset) result.push({ text: text.slice(offset, match.index), protected: false });
    result.push({ text: match[0], protected: true }); offset = match.index + match[0].length;
  }
  if (offset < text.length) result.push({ text: text.slice(offset), protected: false });
  return result;
}

export function splitLocalTranslationText(text, tokenizer, prefix = '', tokenLimit = 128) {
  const fits = value => tokenizer.encode(prefix + value).length <= tokenLimit;
  // Translate independent sentences separately and retain their original
  // separators. This also prevents a model from joining "password.The".
  const boundaries = /[.!?。！？](?:\s+|$)|\n+/gu;
  const sentences = []; let offset = 0, boundary;
  while ((boundary = boundaries.exec(text))) {
    const end = boundary.index + boundary[0].length;
    if (end > offset) sentences.push(text.slice(offset, end)); offset = end;
  }
  if (offset < text.length) sentences.push(text.slice(offset));
  if (sentences.length > 1) {
    const chunks = sentences.flatMap(sentence => splitLocalTranslationText(sentence, tokenizer, prefix, tokenLimit));
    if (chunks.length > 32) throw localTranslationError('text_too_long');
    return chunks;
  }
  if (fits(text)) return [text];
  const units = text.match(/\S+\s*|\s+/gu) || [], chunks = [];
  let current = '';
  for (const unit of units) {
    if (fits(current + unit)) { current += unit; continue; }
    if (current) { chunks.push(current); current = ''; }
    if (fits(unit)) { current = unit; continue; }
    // A long uninterrupted word/URL cannot be truncated to the model limit.
    for (const character of unit) {
      if (!fits(current + character)) { if (!current) throw localTranslationError('text_too_long'); chunks.push(current); current = ''; }
      current += character;
    }
  }
  if (current) chunks.push(current);
  if (chunks.length > 32) throw localTranslationError('text_too_long');
  return chunks;
}

export function createLocalTranslationRuntime({ loadPipeline, detectLanguage, createStoppingCriteria = null, onModelRequired = null } = {}) {
  const activeCriteria = new Map();
  let resident = null, busy = false;
  async function getPipeline(kind, onProgress) {
    if (resident?.kind === kind) return resident.pipe;
    // The worker runs one job at a time. Release the previous ONNX sessions
    // before allocating another family; cached public weights remain on disk.
    const previous = resident; resident = null;
    if (previous) {
      try { await previous.pipe.dispose?.(); }
      catch (_) { throw localTranslationError('model_unavailable'); }
    }
    const pipe = await loadPipeline(LOCAL_TRANSLATION_MODELS[kind], onProgress);
    resident = { kind, pipe }; return pipe;
  }
  async function translateChunks(text, pipe, choice, sourceLanguage, targetLanguage, job) {
    const chunks = splitLocalTranslationText(text, pipe.tokenizer, choice.prefix);
    const outputs = [];
    for (const chunk of chunks) {
      if (job.isCancelled()) throw localTranslationError('cancelled');
      if (!chunk.trim()) { outputs.push(chunk); continue; }
      const leading = chunk.match(/^\s*/u)[0], trailing = chunk.match(/\s*$/u)[0];
      const criteria = createStoppingCriteria?.();
      if (criteria) activeCriteria.set(job.id, criteria);
      job.onProgress({ status: 'translating' });
      let output;
      try {
        // Marian uses a target prefix; only M2M100 accepts src_lang/tgt_lang.
        // Count that prefix before generation to prevent silent truncation.
        let lastToken = null;
        const streamer = { put: value => { lastToken = value?.[0]?.at(-1) ?? lastToken; }, end() {} };
        const generated = await pipe(choice.prefix + chunk.trim(), {
          ...(choice.kind === 'multilingual' ? { src_lang: sourceLanguage, tgt_lang: targetLanguage } : {}),
          max_new_tokens: 256, num_beams: 1, do_sample: false, streamer,
          ...(criteria ? { stopping_criteria: criteria.list } : {}) });
        if (job.isCancelled()) throw localTranslationError('cancelled');
        const eos = pipe.tokenizer.eos_token_id;
        if (lastToken === null || (Array.isArray(eos) ? !eos.some(value => BigInt(value) === BigInt(lastToken)) : BigInt(eos) !== BigInt(lastToken))) {
          throw localTranslationError('text_too_long');
        }
        output = generated?.[0]?.translation_text;
        if (typeof output !== 'string' || !output.trim()) throw localTranslationError('translation_failed');
      } finally { activeCriteria.delete(job.id); }
      outputs.push(leading + output.trim() + trailing);
    }
    return outputs.join('');
  }
  return {
    cancel(id) { activeCriteria.get(id)?.interrupt(); },
    async translate({ text, targetLocale, id, sourceLanguage: sourceOverride = '', sourceContext = '' }, { isCancelled = () => false, onProgress = () => {} } = {}) {
      // Enforce the sequential worker contract even when called directly.
      if (busy) throw localTranslationError('rate_limited');
      busy = true;
      try {
        validateLocalTranslationInput(text, targetLocale);
        validateLocalTranslationSourceContext(sourceContext);
        if (isCancelled()) throw localTranslationError('cancelled');
        const job = { id, isCancelled, onProgress };
        onProgress({ status: 'loading' });
        const segments = localTranslationSegments(text), prose = segments.filter(segment => !segment.protected).map(segment => segment.text).join(' ');
        if (!/\p{L}/u.test(prose)) return { text, targetLocale, engine: 'local-identity' };
        if (sourceOverride && !isLocalTranslationSourceLanguage(sourceOverride)) throw localTranslationError('source_language_unknown');
        // Short phrases can have strong detector scores; length is not confidence.
        let detected = sourceOverride ? { language: sourceOverride, confidence: 1 } : await detectLanguage(prose.replace(/\s+/gu, ' ').trim());
        // A fragment such as Portuguese "nem sabes" can confidently resemble
        // another Latin-script language. Nearby readable messages from the same
        // author supply a bounded detection hint; only this message is translated.
        const letters = prose.replace(/[^\p{L}]/gu, '');
        // Preserve independently accepted English/Romance detection so a
        // genuine language switch is not mistaken for the author's usual one.
        const acceptedCommon = (detected?.language === 'en' || romanceSources.has(detected?.language))
          && Number.isFinite(detected?.confidence) && detected.confidence >= 0.5
          && (!Number.isFinite(detected?.margin) || detected.margin >= 0.15);
        if (!sourceOverride && !acceptedCommon && sourceContext && prose.trim().split(/\s+/u).length <= 4 && /^\p{Script=Latin}+$/u.test(letters)) {
          const contextProse = localTranslationSegments(sourceContext).filter(segment => !segment.protected).map(segment => segment.text).join(' ');
          if (contextProse.replace(/[^\p{L}]/gu, '').length >= 40) {
            const contextual = await detectLanguage(contextProse.replace(/\s+/gu, ' ').trim());
            if (isLocalTranslationSourceLanguage(contextual?.language) && Number.isFinite(contextual?.confidence) && contextual.confidence >= 0.8
              && Number.isFinite(contextual?.margin) && contextual.margin >= 0.4) detected = contextual;
          }
        }
        if (isCancelled()) throw localTranslationError('cancelled');
        const sourceLanguage = detected?.language;
        if (!isLocalTranslationSourceLanguage(sourceLanguage) || !Number.isFinite(detected?.confidence) || detected.confidence < 0.5
          || (Number.isFinite(detected?.margin) && detected.margin < 0.15)) {
          throw localTranslationError('source_language_unknown');
        }
        const targetLanguage = targetLocale === 'en' ? 'en' : 'pt';
        if (sourceLanguage === targetLanguage) return { text, targetLocale, detectedSourceLanguage: sourceLanguage, engine: 'local-identity' };
        const choice = selectLocalTranslationModel(sourceLanguage, targetLocale);
        await onModelRequired?.(choice, sourceLanguage);
        if (isCancelled()) throw localTranslationError('cancelled');
        const pipe = await getPipeline(choice.kind, onProgress);
        if (isCancelled()) throw localTranslationError('cancelled');
        const result = [];
        for (const segment of segments) {
          if (segment.protected || !segment.text.trim() || !/\p{L}/u.test(segment.text)) { result.push(segment.text); continue; }
          result.push(await translateChunks(segment.text, pipe, choice, sourceLanguage, targetLanguage, job));
        }
        const translated = result.join('');
        if (!translated.trim() || translated.length > 12_000) throw localTranslationError('translation_failed');
        const engine = choice.kind === 'romanceToEnglish' ? 'opus-romance-local'
          : choice.kind === 'englishToPortuguese' ? 'opus-en-pt-local' : 'm2m100-local';
        return { text: translated, targetLocale, detectedSourceLanguage: sourceLanguage, engine };
      } finally { busy = false; }
    },
  };
}
