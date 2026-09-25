const DEFAULT_AVATAR_FOLDER = "./assets/default-avatars";
const DEFAULT_AVATAR_MANIFEST = `${DEFAULT_AVATAR_FOLDER}/manifest.json`;
const DEFAULT_AVATAR_MAX_SEQUENTIAL = 80;
const AVATAR_PROBE_TIMEOUT_MS = 1800;

let cachedDefaultAvatarPoolPromise = null;

// This module is beside index.html in both packaged and web builds. Pin built-in
// assets to that app base, not a navigated route or a popup's about:blank URL.
// Callers/tests may provide an explicit app document/base URL.
export function resolveAvatarPresentationUrl(value, appBaseUrl = import.meta.url) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || /[\\\u0000-\u0020\u007f]/.test(raw)) return "";
  const builtIn = raw.match(/^(?:\.\/|\/)?assets\/default-avatars\/([a-z0-9_-]+\.(?:png|webp|jpe?g|gif))$/i);
  try {
    if (builtIn) {
      const base = new URL(appBaseUrl);
      if (!["file:", "http:", "https:"].includes(base.protocol)) return "";
      return new URL(`./assets/default-avatars/${builtIn[1]}`, base).href;
    }
    const url = new URL(raw);
    if (url.username || url.password) return "";
    if (["http:", "https:"].includes(url.protocol)) return raw;
    if (/^data:image\//i.test(raw) || url.protocol === "blob:") return raw;
    // Only already-resolved files from this app's packaged avatar pool.
    if (url.protocol === "file:") {
      const asset = url.pathname.match(/\/assets\/default-avatars\/([a-z0-9_-]+\.(?:png|webp|jpe?g|gif))$/i);
      if (asset && url.href === new URL(`./assets/default-avatars/${asset[1]}`, appBaseUrl).href) return url.href;
    }
  } catch (_) { /* Malformed/custom relative paths are not avatar sources. */ }
  return "";
}

// Rendering fallback only: never writes or replaces the account's assigned URL.
// These four PNGs are shipped in every desktop/web build. Identity keeps the
// choice stable across views, reloads and devices without a network lookup.
export function getDefaultAvatarPresentationUrl(userId = "", appBaseUrl = import.meta.url, failedUrl = "") {
  let hash = 2166136261;
  for (const char of String(userId || "").trim().toLowerCase()) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  const index = hash % 4;
  const candidate = resolveAvatarPresentationUrl(`${DEFAULT_AVATAR_FOLDER}/${index + 1}.png`, appBaseUrl);
  return candidate === failedUrl
    ? resolveAvatarPresentationUrl(`${DEFAULT_AVATAR_FOLDER}/${(index + 1) % 4 + 1}.png`, appBaseUrl)
    : candidate;
}

export function resolveAvatarImageSource(value, userId = "", appBaseUrl = import.meta.url) {
  return resolveAvatarPresentationUrl(value, appBaseUrl) || getDefaultAvatarPresentationUrl(userId, appBaseUrl);
}

// A fresh static node prevents GIF hover/lazy listeners and pending work from
// restoring a failed URL. One fallback attempt; an unavailable pool stays on
// the existing initials instead of entering an error/request loop.
export function replaceAvatarWithDefault(image) {
  if (!image?.isConnected || image.dataset.avatarFallbackApplied === "1") return false;
  const clip = image.closest(".profileAvatarMediaClip");
  if (!clip) return false;
  const fallbackUrl = resolveAvatarPresentationUrl(image.dataset.avatarFallbackSrc)
    || getDefaultAvatarPresentationUrl(image.dataset.avatarUserId, import.meta.url, image.getAttribute("src"));
  if (!fallbackUrl) return false;
  const replacement = image.ownerDocument.createElement("span");
  replacement.className = "profileAvatarMediaClip is-error";
  replacement.setAttribute("data-avatar-fallback", clip.getAttribute("data-avatar-fallback") || "?");
  const fallback = image.ownerDocument.createElement("img");
  fallback.className = "profileAvatarMedia";
  fallback.alt = image.alt;
  fallback.loading = "eager";
  fallback.style.display = "none";
  fallback.dataset.avatarSrc = image.dataset.avatarSrc || image.getAttribute("src") || "";
  fallback.dataset.avatarUserId = image.dataset.avatarUserId || "";
  fallback.dataset.avatarFallbackApplied = "1";
  for (const event of ["onload", "onerror"]) {
    const handler = image.getAttribute(event);
    if (handler) fallback.setAttribute(event, handler);
  }
  replacement.appendChild(fallback);
  clip.replaceWith(replacement);
  fallback.src = fallbackUrl;
  return true;
}

// Signup assigns a pool URL once, in avatar_url (also in Auth metadata).
// Rendering must retain that assignment, never randomly pick another avatar.
export function resolveAssignedDefaultAvatarUrl(...sources) {
  for (const source of sources) {
    const values = typeof source === "string" ? [source] : source && typeof source === "object"
      ? [source.avatar_url, source.avatarUrl, source.avatar, source.assignedDefaultAvatarUrl,
        source.user_metadata?.avatar_url, source.raw_user_meta_data?.avatar_url] : [];
    for (const value of values) {
      const raw = typeof value === "string" ? value.trim() : "";
      // Only the existing packaged pool is a recognized account default.
      // A removed custom URL must not be revived from a stale member snapshot.
      let asset = raw;
      if (/^(?:https?:|file:)\/\//i.test(raw)) {
        try { asset = new URL(raw).pathname.match(/\/assets\/default-avatars\/[^/]+$/i)?.[0] || ""; }
        catch (_) { asset = ""; }
      }
      const match = asset.match(/^(?:\.\/|\/)?assets\/default-avatars\/([a-z0-9_-]+\.(?:png|webp|jpe?g|gif))$/i);
      if (match) return `${DEFAULT_AVATAR_FOLDER}/${match[1]}`;
    }
  }
  return "";
}

function sleep(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function normalizeManifestEntry(entry) {
  const raw = String(entry || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^data:/i.test(raw)) return raw;
  if (raw.startsWith("./") || raw.startsWith("../") || raw.startsWith("/")) return raw;
  return `${DEFAULT_AVATAR_FOLDER}/${raw.replace(/^\/+/, "")}`;
}

function probeImageUrl(url) {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      img.onload = null;
      img.onerror = null;
      resolve(!!ok);
    };
    const timeoutId = setTimeout(() => finish(false), AVATAR_PROBE_TIMEOUT_MS);
    img.onload = () => {
      clearTimeout(timeoutId);
      finish(true);
    };
    img.onerror = () => {
      clearTimeout(timeoutId);
      finish(false);
    };
    img.src = `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
  });
}

async function loadPoolFromManifest() {
  try {
    const res = await fetch(DEFAULT_AVATAR_MANIFEST, { cache: "no-store" });
    if (!res?.ok) return [];
    const json = await res.json();
    const list = Array.isArray(json) ? json : Array.isArray(json?.avatars) ? json.avatars : [];
    if (!Array.isArray(list) || !list.length) return [];
    const cleaned = list
      .map(normalizeManifestEntry)
      .filter(Boolean);
    return Array.from(new Set(cleaned));
  } catch (_) {
    return [];
  }
}

async function loadSequentialPngPool() {
  const out = [];
  for (let i = 1; i <= DEFAULT_AVATAR_MAX_SEQUENTIAL; i += 1) {
    const candidate = `${DEFAULT_AVATAR_FOLDER}/${i}.png`;
    // Keep this sequential so users can just drop 1.png, 2.png, 3.png... in a folder.
    const ok = await probeImageUrl(candidate);
    if (ok) {
      out.push(candidate);
      continue;
    }
    if (out.length > 0) break;
    await sleep(4);
  }
  return out;
}

async function resolveDefaultAvatarPool() {
  const fromManifest = await loadPoolFromManifest();
  if (fromManifest.length) return fromManifest;
  return loadSequentialPngPool();
}

export async function getDefaultAvatarPool() {
  if (!cachedDefaultAvatarPoolPromise) {
    cachedDefaultAvatarPoolPromise = resolveDefaultAvatarPool()
      .then((list) => (Array.isArray(list) ? list.filter(Boolean) : []))
      .catch(() => []);
  }
  return cachedDefaultAvatarPoolPromise;
}

export async function pickRandomDefaultAvatarUrl() {
  const pool = await getDefaultAvatarPool();
  if (!pool.length) return "";
  const index = Math.floor(Math.random() * pool.length);
  return String(pool[index] || "").trim();
}
