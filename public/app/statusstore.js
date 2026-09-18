// statusStore.js
const KEY = "altara_status_v1";
const ALLOWED = new Set(["online", "idle", "focus", "dnd", "invisible", "offline"]);

function normalizeStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  if (ALLOWED.has(s)) return s;
  return "online";
}

function accountKey(userId) {
  const id = typeof userId === "string" ? userId.trim().toLowerCase() : "";
  return id ? `${KEY}:${id}` : "";
}

export function getMyStatus(userId){
  return normalizeStatus(getStoredMyStatus(userId) || "online");
}

export function getStoredMyStatus(userId){
  const key = accountKey(userId);
  if (!key) return "";
  // The legacy shared key has no owner. Leave it for older clients, but never
  // import it into an authenticated account's preference.
  const raw = localStorage.getItem(key);
  if (raw == null) return "";
  return normalizeStatus(raw);
}

export function setMyStatus(status, userId){
  const s = normalizeStatus(status);
  const key = accountKey(userId);
  if (key) localStorage.setItem(key, s);
  return s;
}


