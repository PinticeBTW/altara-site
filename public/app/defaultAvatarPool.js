const DEFAULT_AVATAR_FOLDER = "./assets/default-avatars";
const DEFAULT_AVATAR_MANIFEST = `${DEFAULT_AVATAR_FOLDER}/manifest.json`;
const DEFAULT_AVATAR_MAX_SEQUENTIAL = 80;
const AVATAR_PROBE_TIMEOUT_MS = 1800;

let cachedDefaultAvatarPoolPromise = null;

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
