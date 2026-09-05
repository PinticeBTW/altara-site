const PRIVATE_UPLOAD_REFERENCE_PREFIX = "altara-private-upload:";
const PRIVATE_UPLOAD_REFERENCE_RE = /^altara-private-upload:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRUSTED_ATTACHMENT_BUCKET = "altara-message-attachments-v1";
const TRUSTED_PUBLIC_UPLOAD_BUCKET = "avatars";
const MAX_MESSAGE_MEDIA_URL_LENGTH = 4096;
const PRIVATE_MESSAGE_UPLOAD_CONTEXTS = new Set(["dm_attachment", "dm_attachment_preview"]);
const PUBLIC_IMAGE_UPLOAD_CONTEXTS = new Set([
  "profile_avatar",
  "profile_banner",
  "server_icon",
  "server_banner",
  "group_avatar",
  "developer_app_icon",
  "developer_app_banner",
  "bot_avatar",
  "bot_banner",
]);

export const TRUSTED_MESSAGE_GIF_HOSTS = Object.freeze([
  "media.tenor.com",
  "c.tenor.com",
  "media.giphy.com",
]);

const trustedGifHosts = new Set(TRUSTED_MESSAGE_GIF_HOSTS);

function hasUnsafeUrlCharacters(value = "") {
  return /[\u0000-\u001f\u007f]/.test(String(value || ""));
}

function parseBoundedUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw || raw.length > MAX_MESSAGE_MEDIA_URL_LENGTH || hasUnsafeUrlCharacters(raw)) return null;
  try {
    return new URL(raw);
  } catch (_) {
    return null;
  }
}

function isSafeHttpsUrl(parsed) {
  return !!parsed
    && parsed.protocol === "https:"
    && !parsed.username
    && !parsed.password
    && (!parsed.port || parsed.port === "443");
}

export function normalizePrivateUploadReference(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  return PRIVATE_UPLOAD_REFERENCE_RE.test(raw) ? raw : "";
}

export function getPrivateUploadReferenceId(value = "") {
  const reference = normalizePrivateUploadReference(value);
  return reference ? reference.slice(PRIVATE_UPLOAD_REFERENCE_PREFIX.length) : "";
}

// Descriptor parsing is deliberately broader than rendering. It accepts the
// three transports that can legitimately exist while a message is being
// prepared, but it does not grant any of them permission to reach Chromium.
export function normalizeMessageAttachmentDescriptorUrl(value = "") {
  const reference = normalizePrivateUploadReference(value);
  if (reference) return reference;

  const parsed = parseBoundedUrl(value);
  if (!parsed) return "";
  if (isSafeHttpsUrl(parsed)) {
    parsed.hash = "";
    return parsed.toString();
  }
  if (parsed.protocol === "blob:" && !parsed.username && !parsed.password) {
    return parsed.toString();
  }
  return "";
}

export function normalizeTrustedMessageGifUrl(value = "") {
  const parsed = parseBoundedUrl(value);
  if (!isSafeHttpsUrl(parsed)) return "";
  const host = String(parsed.hostname || "").toLowerCase();
  if (!trustedGifHosts.has(host)) return "";
  parsed.hash = "";
  return parsed.toString();
}

export function normalizeTrustedAttachmentDeliveryUrl(value = "", {
  supabaseOrigin = "",
} = {}) {
  const parsed = parseBoundedUrl(value);
  const authority = parseBoundedUrl(supabaseOrigin);
  if (!isSafeHttpsUrl(parsed) || !isSafeHttpsUrl(authority)) return "";
  if (parsed.origin !== authority.origin) return "";

  const pathPrefix = `/storage/v1/object/`;
  if (!parsed.pathname.startsWith(pathPrefix)) return "";
  const parts = parsed.pathname.slice(pathPrefix.length).split("/").filter(Boolean);
  if (parts.length < 3) return "";
  if (parts[0] !== "sign") return "";
  try {
    if (decodeURIComponent(parts[1]) !== TRUSTED_ATTACHMENT_BUCKET) return "";
  } catch (_) {
    return "";
  }

  parsed.hash = "";
  return parsed.toString();
}

export function normalizeTrustedUploadDeliveryUrl(value = "", {
  supabaseOrigin = "",
  uploadContext = "",
} = {}) {
  const context = String(uploadContext || "").trim().toLowerCase();
  if (PRIVATE_MESSAGE_UPLOAD_CONTEXTS.has(context)) {
    return normalizeTrustedAttachmentDeliveryUrl(value, { supabaseOrigin });
  }
  if (!PUBLIC_IMAGE_UPLOAD_CONTEXTS.has(context)) return "";

  const parsed = parseBoundedUrl(value);
  const authority = parseBoundedUrl(supabaseOrigin);
  if (!isSafeHttpsUrl(parsed) || !isSafeHttpsUrl(authority)) return "";
  if (parsed.origin !== authority.origin) return "";

  const pathPrefix = "/storage/v1/object/";
  if (!parsed.pathname.startsWith(pathPrefix)) return "";
  const parts = parsed.pathname.slice(pathPrefix.length).split("/").filter(Boolean);
  if (parts.length < 3 || parts[0] !== "public") return "";
  try {
    if (decodeURIComponent(parts[1]) !== TRUSTED_PUBLIC_UPLOAD_BUCKET) return "";
  } catch (_) {
    return "";
  }

  parsed.hash = "";
  return parsed.toString();
}
