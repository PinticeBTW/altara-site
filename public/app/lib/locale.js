export const ALTARA_LOCALE_STORAGE_KEY = "altara_app_language";
export const ALTARA_DEFAULT_LOCALE = "en";
export const ALTARA_SUPPORTED_LOCALES = Object.freeze(["en", "pt-PT", "pt-BR"]);

const SUPPORTED = new Set(ALTARA_SUPPORTED_LOCALES);

function normalizedFallback(value) {
  const raw = String(value || "").trim().replace(/_/g, "-").toLowerCase();
  if (raw === "pt" || raw === "pt-pt") return "pt-PT";
  if (raw === "pt-br") return "pt-BR";
  if (raw === "en" || raw.startsWith("en-")) return "en";
  return ALTARA_DEFAULT_LOCALE;
}

export function normalizeAltaraLocale(value, fallback = ALTARA_DEFAULT_LOCALE) {
  const raw = String(value || "").trim().replace(/_/g, "-").toLowerCase();
  if (raw === "pt" || raw === "pt-pt") return "pt-PT";
  if (raw === "pt-br") return "pt-BR";
  if (raw === "en" || raw.startsWith("en-")) return "en";
  return normalizedFallback(fallback);
}

export function isExplicitAltaraLocale(value) {
  const raw = String(value || "").trim().replace(/_/g, "-").toLowerCase();
  return raw === "pt" || raw === "pt-pt" || raw === "pt-br" || raw === "en" || raw.startsWith("en-");
}

export function detectAltaraLocale({ saved = "", languages = null, fallback = ALTARA_DEFAULT_LOCALE } = {}) {
  if (isExplicitAltaraLocale(saved)) return normalizeAltaraLocale(saved, fallback);
  const candidates = Array.isArray(languages) ? languages : [languages];
  for (const candidate of candidates) {
    if (isExplicitAltaraLocale(candidate)) return normalizeAltaraLocale(candidate, fallback);
  }
  return normalizeAltaraLocale(fallback, ALTARA_DEFAULT_LOCALE);
}

function availableStorage(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage || null; } catch (_) { return null; }
}

function desktopLanguageBridge(storage) {
  if (storage) return null; // Explicit storage adapters retain browser semantics.
  const bridge = globalThis.altaraDesktop;
  return typeof bridge?.getLanguagePreference === "function"
    && typeof bridge?.setLanguagePreference === "function" ? bridge : null;
}

function savedLocale(storage) {
  let stored = "";
  try { stored = availableStorage(storage)?.getItem?.(ALTARA_LOCALE_STORAGE_KEY) || ""; } catch (_) {}
  const desktop = desktopLanguageBridge(storage);
  if (desktop) {
    const durable = desktop.getLanguagePreference();
    if (isExplicitAltaraLocale(durable)) return durable;
    // Migrate the existing device preference, including legacy pt, before any
    // auth/profile hydration or system detection can choose a default.
    if (isExplicitAltaraLocale(stored)) desktop.setLanguagePreference(normalizeAltaraLocale(stored));
  }
  return stored;
}

export function readAltaraLocalePreference({ storage = null, languages = globalThis.navigator?.languages || [globalThis.navigator?.language] } = {}) {
  return detectAltaraLocale({ saved: savedLocale(storage), languages });
}

export function hasAltaraLocalePreference({ storage = null } = {}) {
  return isExplicitAltaraLocale(savedLocale(storage));
}

export function writeAltaraLocalePreference(locale, { storage = null } = {}) {
  const normalized = normalizeAltaraLocale(locale);
  desktopLanguageBridge(storage)?.setLanguagePreference(normalized);
  try { availableStorage(storage)?.setItem?.(ALTARA_LOCALE_STORAGE_KEY, normalized); } catch (_) {}
  return normalized;
}

export function localeDocumentLanguage(locale) {
  return normalizeAltaraLocale(locale);
}

export function localeIntlTag(locale, { english24Hour = true } = {}) {
  const normalized = normalizeAltaraLocale(locale);
  if (normalized === "pt-BR") return "pt-BR";
  if (normalized === "pt-PT") return "pt-PT";
  return english24Hour ? "en-GB" : "en-US";
}

export function localeDisplayNames(locale) {
  const normalized = normalizeAltaraLocale(locale);
  return Object.freeze({
    en: "English",
    "pt-PT": "Português (Portugal)",
    "pt-BR": "Português (Brasil)",
    selected: normalized,
  });
}

// UI locale never selects legal or policy region.
export function localePolicyRegion() {
  return null;
}

export function localeFallbackChain(locale) {
  const normalized = normalizeAltaraLocale(locale);
  return normalized === "en" ? Object.freeze(["en"]) : Object.freeze([normalized, "en"]);
}
