// Canonical package bytes are shared by offline author tools and account delivery.
// This module has no account, network or runtime dependencies.
export function canonicalThemeJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalThemeJson).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalThemeJson(value[key])).join(',') + '}';
}
