import {
  getPrivateUploadReferenceId,
  normalizePrivateUploadReference,
  normalizeTrustedAttachmentDeliveryUrl,
  normalizeTrustedUploadDeliveryUrl,
} from "./messageMediaPolicy.js";

const TRUSTED_UPLOAD_FUNCTION = "altara-upload-authorize";
const PRIVATE_UPLOAD_REFERENCE_PREFIX = "altara-private-upload:";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRUSTED_ATTACHMENT_DELIVERY_STATE = Symbol("altara.trustedAttachmentDeliveryState");
const TRUSTED_ATTACHMENT_DELIVERY_TOKEN = Object.freeze({ type: "trusted-attachment-delivery" });
// The existing download broker issues 60-second Storage capabilities. A cached
// row can outlive that capability; its trust marker must not extend the URL.
const TRUSTED_ATTACHMENT_DELIVERY_MAX_AGE_MS = 60_000;
const TRUSTED_ATTACHMENT_DELIVERY_REFRESH_MARGIN_MS = 5_000;

function getTrustedAttachmentDeliveryExpiry(url, issuedAt = Date.now()) {
  const fallback = issuedAt + TRUSTED_ATTACHMENT_DELIVERY_MAX_AGE_MS;
  try {
    const token = new URL(url).searchParams.get("token") || "";
    const payload = token.split(".")[1] || "";
    const encoded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")));
    const expiresAt = Number(decoded?.exp) * 1000;
    // This is only a cache deadline, never authentication or a trust grant.
    // The delivery URL has already passed the broker-origin/row checks.
    return Number.isFinite(expiresAt) && expiresAt > 0 ? Math.min(fallback, expiresAt) : fallback;
  } catch (_) {
    return fallback;
  }
}

function isTrustedAttachmentDeliveryEntryFresh(entry, now = Date.now()) {
  return Number(entry?.expiresAt || 0) > now + TRUSTED_ATTACHMENT_DELIVERY_REFRESH_MARGIN_MS;
}

function safeString(value, max = 512) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function trustedUploadError(code = "upload_authority_failed", message = "Upload authorization failed.") {
  const error = new Error(message);
  error.code = safeString(code, 96) || "upload_authority_failed";
  return error;
}

function getSupabaseOrigin(supabase) {
  try {
    return new URL(String(supabase?.supabaseUrl || "").trim()).origin;
  } catch (_) {
    return "";
  }
}

function markTrustedAttachmentDeliveryRow(row, entries = [], supabaseOrigin = "") {
  if (!row || typeof row !== "object") return row;
  const normalizedEntries = (Array.isArray(entries) ? entries : []).filter((entry) => (
    entry
    && UUID_RE.test(String(entry.uploadId || ""))
    && normalizePrivateUploadReference(entry.referenceUrl || "")
    && normalizeTrustedAttachmentDeliveryUrl(entry.url || "", { supabaseOrigin })
  ));
  if (!normalizedEntries.length) return row;
  Object.defineProperty(row, TRUSTED_ATTACHMENT_DELIVERY_STATE, {
    configurable: true,
    enumerable: true,
    writable: false,
    value: Object.freeze({
      token: TRUSTED_ATTACHMENT_DELIVERY_TOKEN,
      supabaseOrigin,
      entries: Object.freeze(normalizedEntries.map((entry) => Object.freeze({
        ...entry,
        expiresAt: getTrustedAttachmentDeliveryExpiry(entry.url),
      }))),
    }),
  });
  return row;
}

function collectTrustedAttachmentDeliveryEntries(value, supabaseOrigin, out = []) {
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    value.forEach((entry) => collectTrustedAttachmentDeliveryEntries(entry, supabaseOrigin, out));
    return out;
  }

  const uploadId = safeString(value.uploadId || value.upload_id, 64).toLowerCase()
    || getPrivateUploadReferenceId(value.referenceUrl || value.reference_url || "");
  const referenceUrl = normalizePrivateUploadReference(
    value.referenceUrl || value.reference_url || trustedPrivateUploadReference(uploadId),
  );
  const url = normalizeTrustedAttachmentDeliveryUrl(value.url || value.originalUrl || value.original_url || "", { supabaseOrigin });
  if (UUID_RE.test(uploadId) && referenceUrl === trustedPrivateUploadReference(uploadId) && url) {
    out.push({ uploadId, referenceUrl, url, purpose: "main" });
  }

  const previewUploadId = safeString(value.previewUploadId || value.preview_upload_id, 64).toLowerCase()
    || getPrivateUploadReferenceId(value.previewReferenceUrl || value.preview_reference_url || "");
  const previewReferenceUrl = normalizePrivateUploadReference(
    value.previewReferenceUrl || value.preview_reference_url || trustedPrivateUploadReference(previewUploadId),
  );
  const previewUrl = normalizeTrustedAttachmentDeliveryUrl(value.previewUrl || value.preview_url || "", { supabaseOrigin });
  if (UUID_RE.test(previewUploadId) && previewReferenceUrl === trustedPrivateUploadReference(previewUploadId) && previewUrl) {
    out.push({ uploadId: previewUploadId, referenceUrl: previewReferenceUrl, url: previewUrl, purpose: "preview" });
  }

  Object.values(value).forEach((entry) => {
    if (entry && typeof entry === "object") collectTrustedAttachmentDeliveryEntries(entry, supabaseOrigin, out);
  });
  return out;
}

export function markTrustedAttachmentDeliveryFromDescriptors(row, descriptors = [], {
  supabaseOrigin = "",
} = {}) {
  const entries = collectTrustedAttachmentDeliveryEntries(descriptors, supabaseOrigin, []);
  return markTrustedAttachmentDeliveryRow(row, entries, supabaseOrigin);
}

export function resolveTrustedAttachmentDeliveryUrl(row, attachment = {}, {
  preview = false,
} = {}) {
  const state = row?.[TRUSTED_ATTACHMENT_DELIVERY_STATE];
  if (!state || state.token !== TRUSTED_ATTACHMENT_DELIVERY_TOKEN) return "";
  const purpose = preview ? "preview" : "main";
  const rawUrl = preview
    ? (attachment?.previewUrl || attachment?.preview_url || "")
    : (attachment?.url || attachment?.originalUrl || attachment?.original_url || "");
  const candidate = normalizeTrustedAttachmentDeliveryUrl(rawUrl, { supabaseOrigin: state.supabaseOrigin });
  if (!candidate) return "";

  const explicitId = safeString(
    preview
      ? (attachment?.previewUploadId || attachment?.preview_upload_id || "")
      : (attachment?.uploadId || attachment?.upload_id || ""),
    64,
  ).toLowerCase();
  const explicitReferenceId = getPrivateUploadReferenceId(
    preview
      ? (attachment?.previewReferenceUrl || attachment?.preview_reference_url || "")
      : (attachment?.referenceUrl || attachment?.reference_url || ""),
  );
  if (explicitId && !UUID_RE.test(explicitId)) return "";
  if (explicitId && explicitReferenceId && explicitId !== explicitReferenceId) return "";
  const requiredId = explicitId || explicitReferenceId;

  const match = state.entries.find((entry) => (
    entry.purpose === purpose
    && entry.url === candidate
    && (!requiredId || entry.uploadId === requiredId)
  ));
  // Navigation paints memory rows before fresh history finishes hydrating.
  // Reject an expired capability here so that first paint cannot send a stale
  // Storage GET; normal broker hydration replaces it with a fresh URL.
  return match && isTrustedAttachmentDeliveryEntryFresh(match) ? match.url : "";
}

function unwrapFunctionPayload(data) {
  if (data && typeof data === "object" && !Array.isArray(data)) return data;
  return {};
}

async function invokeTrustedUpload(supabase, body) {
  if (!supabase?.functions?.invoke) {
    throw trustedUploadError("upload_authority_unavailable", "Trusted upload service is unavailable.");
  }
  const { data, error } = await supabase.functions.invoke(TRUSTED_UPLOAD_FUNCTION, { body });
  if (error) {
    throw trustedUploadError(
      safeString(error?.context?.error || error?.code || "upload_authority_request_failed", 96),
      "ALTARA could not authorize this upload. Try again."
    );
  }
  const payload = unwrapFunctionPayload(data);
  if (payload.ok !== true) {
    throw trustedUploadError(
      safeString(payload.error || "upload_authority_denied", 96),
      safeString(payload.user_message || "ALTARA could not authorize this upload. Try again.", 240)
    );
  }
  return payload;
}

export function trustedPrivateUploadReference(uploadId = "") {
  const id = safeString(uploadId, 64).toLowerCase();
  return UUID_RE.test(id) ? `${PRIVATE_UPLOAD_REFERENCE_PREFIX}${id}` : "";
}

export function parseTrustedPrivateUploadReference(value = "") {
  const raw = safeString(value, 128).toLowerCase();
  if (!raw.startsWith(PRIVATE_UPLOAD_REFERENCE_PREFIX)) return "";
  const id = raw.slice(PRIVATE_UPLOAD_REFERENCE_PREFIX.length);
  return UUID_RE.test(id) ? id : "";
}

export async function uploadViaTrustedAuthority({
  supabase,
  file,
  uploadContext,
  conversationId = "",
  serverId = "",
  appId = "",
  targetId = "",
  cacheControl = "60",
} = {}) {
  if (!file || typeof file !== "object") {
    throw trustedUploadError("upload_invalid", "Select a valid file to upload.");
  }
  const declaredSize = Number(file.size || 0);
  if (!Number.isSafeInteger(declaredSize) || declaredSize <= 0) {
    throw trustedUploadError("upload_size_invalid", "Select a non-empty file to upload.");
  }
  const context = safeString(uploadContext, 64).toLowerCase();
  if (!context) throw trustedUploadError("upload_context_invalid", "Upload context is missing.");

  const authorization = await invokeTrustedUpload(supabase, {
    action: "authorize",
    upload_context: context,
    conversation_id: safeString(conversationId, 64) || null,
    server_id: safeString(serverId, 64) || null,
    app_id: safeString(appId, 64) || null,
    target_id: safeString(targetId, 64) || null,
    file_name: safeString(file.name || "file.bin", 180) || "file.bin",
    file_size: declaredSize,
    mime_type: safeString(file.type || "application/octet-stream", 160).toLowerCase() || "application/octet-stream",
  });

  const bucket = safeString(authorization.bucket, 96);
  const path = safeString(authorization.path, 700);
  const token = safeString(authorization.token, 4096);
  const uploadId = safeString(authorization.upload_id, 64).toLowerCase();
  if (!bucket || !path || !token || !UUID_RE.test(uploadId)) {
    throw trustedUploadError("upload_authority_response_invalid", "ALTARA returned an invalid upload authorization.");
  }

  const upload = await supabase.storage.from(bucket).uploadToSignedUrl(path, token, file, {
    contentType: safeString(file.type || authorization.declared_mime || "application/octet-stream", 160),
    cacheControl: safeString(cacheControl, 32) || "60",
  });
  if (upload?.error) {
    throw trustedUploadError("signed_upload_failed", "The file could not be uploaded. Try again.");
  }

  const completed = await invokeTrustedUpload(supabase, {
    action: "complete",
    upload_id: uploadId,
  });
  const referenceUrl = trustedPrivateUploadReference(uploadId);
  const supabaseOrigin = getSupabaseOrigin(supabase);
  const publicUrl = normalizeTrustedUploadDeliveryUrl(completed.public_url, { supabaseOrigin, uploadContext: context });
  const downloadUrl = normalizeTrustedUploadDeliveryUrl(completed.download_url, { supabaseOrigin, uploadContext: context });
  const displayUrl = publicUrl || downloadUrl;
  if (!displayUrl) {
    throw trustedUploadError("upload_delivery_unavailable", "The uploaded file could not be verified for delivery.");
  }

  return {
    uploadId,
    bucket,
    path,
    publicUrl,
    downloadUrl,
    displayUrl,
    referenceUrl,
    visibility: safeString(completed.visibility, 16),
    detectedMime: safeString(completed.detected_mime, 160),
    contentClass: safeString(completed.content_class, 64),
    actualSize: Number(completed.actual_size || declaredSize),
    downloadExpiresIn: Number(completed.download_expires_in || 0),
    upload,
  };
}

function collectTrustedUploadIds(value, ids) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry) => collectTrustedUploadIds(entry, ids));
    return;
  }
  const uploadId = safeString(value.uploadId || value.upload_id, 64).toLowerCase()
    || parseTrustedPrivateUploadReference(value.referenceUrl || value.reference_url || value.url || "");
  const previewUploadId = safeString(value.previewUploadId || value.preview_upload_id, 64).toLowerCase()
    || parseTrustedPrivateUploadReference(value.previewReferenceUrl || value.preview_reference_url || value.previewUrl || value.preview_url || "");
  if (UUID_RE.test(uploadId)) ids.add(uploadId);
  if (UUID_RE.test(previewUploadId)) ids.add(previewUploadId);
  Object.values(value).forEach((entry) => collectTrustedUploadIds(entry, ids));
}

function applyTrustedDownloadUrls(value, byId) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((entry) => applyTrustedDownloadUrls(entry, byId));
  const next = { ...value };
  const uploadId = safeString(next.uploadId || next.upload_id, 64).toLowerCase()
    || parseTrustedPrivateUploadReference(next.referenceUrl || next.reference_url || next.url || "");
  const previewUploadId = safeString(next.previewUploadId || next.preview_upload_id, 64).toLowerCase()
    || parseTrustedPrivateUploadReference(next.previewReferenceUrl || next.preview_reference_url || next.previewUrl || next.preview_url || "");
  const delivery = byId.get(uploadId);
  const previewDelivery = byId.get(previewUploadId);
  if (UUID_RE.test(uploadId)) {
    next.url = delivery?.download_url || trustedPrivateUploadReference(uploadId);
    next.originalUrl = next.url;
    next.referenceUrl = trustedPrivateUploadReference(uploadId);
    next.uploadId = uploadId;
  }
  if (UUID_RE.test(previewUploadId)) {
    next.previewUrl = previewDelivery?.download_url || trustedPrivateUploadReference(previewUploadId);
    next.previewReferenceUrl = trustedPrivateUploadReference(previewUploadId);
    next.previewUploadId = previewUploadId;
  }
  for (const [key, entry] of Object.entries(next)) {
    if (entry && typeof entry === "object") next[key] = applyTrustedDownloadUrls(entry, byId);
  }
  return next;
}

export async function hydrateTrustedAttachmentRows({ supabase, rows } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const parsedRows = list.map((row) => {
    if (!row || typeof row !== "object" || typeof row.content !== "string") return { row, parsed: null };
    try {
      const parsed = JSON.parse(row.content);
      return { row, parsed: parsed && typeof parsed === "object" ? parsed : null };
    } catch (_) {
      return { row, parsed: null };
    }
  });
  const ids = new Set();
  parsedRows.forEach(({ parsed }) => {
    collectTrustedUploadIds(parsed, ids);
  });
  if (!ids.size) return list;

  const payload = { items: [] };
  try {
    const uploadIds = Array.from(ids);
    for (let offset = 0; offset < uploadIds.length; offset += 48) {
      const batch = await invokeTrustedUpload(supabase, {
        action: "download",
        upload_ids: uploadIds.slice(offset, offset + 48),
      });
      payload.items.push(...(Array.isArray(batch.items) ? batch.items : []));
    }
  } catch (_) {
    return list;
  }
  const supabaseOrigin = getSupabaseOrigin(supabase);
  const byId = new Map();
  (Array.isArray(payload.items) ? payload.items : []).forEach((entry) => {
    const id = safeString(entry?.upload_id, 64).toLowerCase();
    const url = normalizeTrustedAttachmentDeliveryUrl(entry?.download_url, { supabaseOrigin });
    if (UUID_RE.test(id) && url) byId.set(id, { ...entry, download_url: url });
  });

  return parsedRows.map(({ row, parsed }) => {
    if (!parsed || !row || typeof row !== "object") return row;
    const hydrated = applyTrustedDownloadUrls(parsed, byId);
    const nextRow = { ...row, content: JSON.stringify(hydrated) };
    // A new response grants only the returned capabilities; omitted/revoked
    // admissions must not inherit the previous cache row's delivery marker.
    delete nextRow[TRUSTED_ATTACHMENT_DELIVERY_STATE];
    return markTrustedAttachmentDeliveryFromDescriptors(nextRow, hydrated, { supabaseOrigin });
  });
}

export function persistedTrustedAttachment(raw = {}) {
  if (!raw || typeof raw !== "object") return raw;
  const next = { ...raw };
  const resolveCanonicalId = (idKeys, referenceKeys) => {
    const candidates = [];
    for (const key of idKeys) {
      const value = safeString(next[key], 64).toLowerCase();
      if (!value) continue;
      if (!UUID_RE.test(value)) return "";
      candidates.push(value);
    }
    for (const key of referenceKeys) {
      const value = safeString(next[key], 160);
      if (!value) continue;
      const id = parseTrustedPrivateUploadReference(value);
      if (!id) return "";
      candidates.push(id);
    }
    const unique = [...new Set(candidates)];
    return unique.length === 1 ? unique[0] : "";
  };
  const uploadId = resolveCanonicalId(
    ["uploadId", "upload_id"],
    ["referenceUrl", "reference_url"],
  );
  const previewUploadId = resolveCanonicalId(
    ["previewUploadId", "preview_upload_id"],
    ["previewReferenceUrl", "preview_reference_url"],
  );
  if (UUID_RE.test(uploadId)) {
    const reference = trustedPrivateUploadReference(uploadId);
    for (const key of ["url", "public_url", "originalUrl", "original_url", "referenceUrl", "reference_url", "upload_id"]) {
      delete next[key];
    }
    next.url = reference;
    next.originalUrl = reference;
    next.referenceUrl = reference;
    next.uploadId = uploadId;
  }
  if (UUID_RE.test(previewUploadId)) {
    const reference = trustedPrivateUploadReference(previewUploadId);
    for (const key of [
      "previewUrl", "preview_url", "thumbnailUrl", "thumbnail_url",
      "previewReferenceUrl", "preview_reference_url", "preview_upload_id",
    ]) {
      delete next[key];
    }
    next.previewUrl = reference;
    next.previewReferenceUrl = reference;
    next.previewUploadId = previewUploadId;
  }
  return next;
}

export function persistedTrustedMessageContent(rawContent = "") {
  const content = String(rawContent ?? "");
  let payload;
  try {
    payload = JSON.parse(content);
  } catch (_) {
    return content;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return content;

  const type = safeString(payload.type, 32).toLowerCase();
  if (type === "attachment") {
    return JSON.stringify(persistedTrustedAttachment(payload));
  }
  if (type === "attachments") {
    if (!Array.isArray(payload.items)) return content;
    return JSON.stringify({
      ...payload,
      items: payload.items.map((entry) => persistedTrustedAttachment(entry)),
    });
  }
  if (type === "gif") {
    if (!payload.attachment || typeof payload.attachment !== "object" || Array.isArray(payload.attachment)) {
      return content;
    }
    const attachment = persistedTrustedAttachment(payload.attachment);
    const next = persistedTrustedAttachment({ ...payload, attachment });
    const attachmentId = parseTrustedPrivateUploadReference(attachment?.referenceUrl || "");
    const rootId = parseTrustedPrivateUploadReference(next.referenceUrl || next.url || "");
    if (attachmentId && rootId === attachmentId) {
      next.url = trustedPrivateUploadReference(attachmentId);
      next.originalUrl = next.url;
      next.referenceUrl = next.url;
      next.uploadId = attachmentId;
    }
    return JSON.stringify(next);
  }
  return content;
}

export function hasExpiredTrustedAttachmentDelivery(row) {
  const state = row?.[TRUSTED_ATTACHMENT_DELIVERY_STATE];
  return !!(state?.token === TRUSTED_ATTACHMENT_DELIVERY_TOKEN
    && state.entries.some((entry) => !isTrustedAttachmentDeliveryEntryFresh(entry)));
}

export function mergeTrustedAttachmentDeliveryRows(currentRows, originalRows, hydratedRows) {
  const originalById = new Map(originalRows.map((row) => [String(row?.id || ""), row]));
  const hydratedById = new Map(hydratedRows.map((row) => [String(row?.id || ""), row]));
  return currentRows.map((row) => {
    const id = String(row?.id || "");
    const original = originalById.get(id);
    const hydrated = hydratedById.get(id);
    const delivery = hydrated?.[TRUSTED_ATTACHMENT_DELIVERY_STATE];
    if (!original || row.content !== original.content || hydrated === original
      || hasExpiredTrustedAttachmentDelivery(hydrated)) return row;
    // Only replace delivery content/provenance; concurrent reactions, profiles,
    // edits and other message fields retain their current owner.
    const next = { ...row, content: hydrated.content };
    delete next[TRUSTED_ATTACHMENT_DELIVERY_STATE];
    if (delivery?.token === TRUSTED_ATTACHMENT_DELIVERY_TOKEN) Object.defineProperty(next, TRUSTED_ATTACHMENT_DELIVERY_STATE, {
      configurable: true, enumerable: true, writable: false, value: delivery,
    });
    return next;
  });
}

export function createTrustedAttachmentDeliveryRefreshQueue({
  supabase, getContext, onRefreshed, schedule = setTimeout, now = Date.now,
} = {}) {
  const pending = new Map();
  const inFlight = new Set();
  const retryAfter = new Map();
  let scheduled = false;
  const keyFor = (context, row) => `${context}\u0000${String(row?.id || "")}`;
  const flush = async () => {
    scheduled = false;
    const context = String(getContext?.() || "");
    const batch = Array.from(pending.values()).filter((entry) => entry.context === context);
    pending.clear();
    if (!context || !batch.length) return;
    const originals = batch.map((entry) => entry.row);
    batch.forEach((entry) => inFlight.add(keyFor(context, entry.row)));
    try {
      const hydrated = await hydrateTrustedAttachmentRows({ supabase, rows: originals });
      if (String(getContext?.() || "") === context) onRefreshed?.(originals, hydrated);
      hydrated.forEach((row, index) => {
        if (hasExpiredTrustedAttachmentDelivery(row)) retryAfter.set(keyFor(context, originals[index]), now() + 15_000);
      });
    } finally {
      batch.forEach((entry) => inFlight.delete(keyFor(context, entry.row)));
      // Failed attempts can retry on a later render, or immediately in a new
      // navigation generation; no timer loop or retained signed URLs in logs.
      if (retryAfter.size > 250) retryAfter.clear();
    }
  };
  return {
    queue(row) {
      const context = String(getContext?.() || "");
      if (!context || !row?.id || !hasExpiredTrustedAttachmentDelivery(row)) return false;
      const key = keyFor(context, row);
      if (inFlight.has(key) || Number(retryAfter.get(key) || 0) > now()) return false;
      pending.set(key, { row, context });
      if (!scheduled) {
        scheduled = true;
        schedule(() => { void flush().catch(() => {}); }, 0);
      }
      return true;
    },
    flush,
  };
}
