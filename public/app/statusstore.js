// statusStore.js
const KEY = "altara_status_v1";
const ALLOWED = new Set(["online", "idle", "dnd", "invisible", "offline"]);

function normalizeStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  if (ALLOWED.has(s)) return s;
  return "online";
}

export function getMyStatus(){
  return normalizeStatus(localStorage.getItem(KEY) || "online");
}

export function getStoredMyStatus(){
  const raw = localStorage.getItem(KEY);
  if (raw == null) return "";
  return normalizeStatus(raw);
}

export function setMyStatus(status){
  const s = normalizeStatus(status);
  localStorage.setItem(KEY, s);
  return s;
}


