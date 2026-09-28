// Vault media v1: independent random file keys; authenticated 1 MiB chunks.
// Keys and filenames belong only inside the encrypted message manifest.
export const VAULT_MEDIA_VERSION = 2;
export const VAULT_MEDIA_CHUNK = 1024 * 1024;
export const VAULT_MEDIA_MAX_BYTES = 512 * 1024 * 1024;
const MAGIC = new TextEncoder().encode('ALTVM001');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();
export function encodeVaultBytes(bytes) {
  let s = ''; for (const byte of bytes) s += String.fromCharCode(byte);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeVaultBytes(value, length) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length !== Math.ceil(length * 4 / 3)) throw new Error('Invalid Vault key material.');
  const bytes = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0));
  if (bytes.length !== length) throw new Error('Invalid Vault key length.');
  return bytes;
}
function current(signal, assertCurrent) { if (signal?.aborted) throw new Error('Vault transfer cancelled.'); assertCurrent?.(); }
function context(value) {
  if (!id.test(value?.conversationId) || !uuid.test(value?.messageId) || !uuid.test(value?.fileId)) throw new Error('Invalid Vault attachment context.');
}
function aad(ctx, index, count, size) { return encoder.encode(JSON.stringify(['ALTARA-VAULT-MEDIA', 1, ctx.conversationId, ctx.messageId, ctx.fileId, index, count, size])); }
function iv(prefix, index) { const result = new Uint8Array(12); result.set(prefix); new DataView(result.buffer).setUint32(8, index); return result; }
export function encryptedVaultSize(size) {
  if (!Number.isSafeInteger(size) || size < 1 || size > VAULT_MEDIA_MAX_BYTES) throw new Error('O anexo Vault deve ter entre 1 byte e 512 MB.');
  return 32 + size + 16 * Math.ceil(size / VAULT_MEDIA_CHUNK);
}
export function inspectVaultHeader(bytes, storedSize) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 32 || MAGIC.some((b, i) => bytes[i] !== b)) throw new Error('Invalid Vault media header.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = Number(view.getBigUint64(12));
  const count = Math.ceil(size / VAULT_MEDIA_CHUNK);
  if (view.getUint32(8) !== VAULT_MEDIA_CHUNK || view.getUint32(20) !== count || encryptedVaultSize(size) !== storedSize) throw new Error('Truncated or oversized Vault media.');
  return { size, count, prefix: bytes.slice(24, 32) };
}
export async function encryptVaultFile(file, ctx, { signal, assertCurrent, onProgress } = {}) {
  context(ctx); const total = encryptedVaultSize(file.size); current(signal, assertCurrent);
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const prefix = crypto.getRandomValues(new Uint8Array(8));
  const count = Math.ceil(file.size / VAULT_MEDIA_CHUNK);
  const header = new Uint8Array(32); header.set(MAGIC); header.set(prefix, 24);
  const view = new DataView(header.buffer); view.setUint32(8, VAULT_MEDIA_CHUNK); view.setBigUint64(12, BigInt(file.size)); view.setUint32(20, count);
  const parts = [header];
  try {
    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
    for (let index = 0; index < count; index++) {
      current(signal, assertCurrent);
      const plain = new Uint8Array(await file.slice(index * VAULT_MEDIA_CHUNK, (index + 1) * VAULT_MEDIA_CHUNK).arrayBuffer());
      try { parts.push(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv(prefix, index), additionalData: aad(ctx, index, count, file.size), tagLength: 128 }, key, plain)); }
      finally { plain.fill(0); }
      current(signal, assertCurrent); onProgress?.({ phase: 'preparing', loaded: Math.min(file.size, (index + 1) * VAULT_MEDIA_CHUNK), total: file.size });
    }
    return { blob: new Blob(parts, { type: 'application/octet-stream' }), key: encodeVaultBytes(keyBytes), encryptedSize: total };
  } finally { keyBytes.fill(0); }
}
export async function decryptVaultFile(blob, descriptor, ctx, { signal, assertCurrent } = {}) {
  context(ctx); current(signal, assertCurrent);
  const header = inspectVaultHeader(new Uint8Array(await blob.slice(0, 32).arrayBuffer()), blob.size);
  if (descriptor.size !== header.size || descriptor.encryptedSize !== blob.size || descriptor.fileId !== ctx.fileId) throw new Error('Vault attachment metadata mismatch.');
  const bytes = decodeVaultBytes(descriptor.key, 32);
  const parts = [];
  try {
    const key = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['decrypt']); bytes.fill(0);
    for (let index = 0; index < header.count; index++) {
      current(signal, assertCurrent);
      const offset = 32 + index * (VAULT_MEDIA_CHUNK + 16);
      const length = Math.min(VAULT_MEDIA_CHUNK, header.size - index * VAULT_MEDIA_CHUNK) + 16;
      const cipher = await blob.slice(offset, offset + length).arrayBuffer();
      parts.push(new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv(header.prefix, index), additionalData: aad(ctx, index, header.count, header.size), tagLength: 128 }, key, cipher)));
    }
    current(signal, assertCurrent);
    // Only inert media types render inline; arbitrary files are downloads.
    return new Blob(parts, { type: safeVaultMime(descriptor.mime) });
  } finally { bytes.fill(0); parts.forEach(part => part.fill(0)); }
}
export function safeVaultMime(value) {
  return ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/ogg', 'audio/wav'].includes(value) ? value : 'application/octet-stream';
}
export function validateVaultManifest(value, { conversationId, messageId } = {}) {
  if (!value || value.type !== 'vault_media' || value.version !== 1 || value.conversationId !== conversationId || value.messageId !== messageId
    || !Array.isArray(value.files) || !value.files.length || value.files.length > 10) throw new Error('Invalid Vault media manifest.');
  const ids = new Set();
  const fileIds = new Set();
  const files = value.files.map(file => {
    if (!file || !uuid.test(file.fileId) || !uuid.test(file.uploadId) || ids.has(file.uploadId) || fileIds.has(file.fileId)
      || typeof file.name !== 'string' || !file.name || file.name.length > 180 || /[\\/\u0000-\u001f\u007f]/.test(file.name)
      || typeof file.mime !== 'string' || file.mime.length > 160 || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(file.mime)
      || file.encryptedSize !== encryptedVaultSize(file.size)) throw new Error('Invalid Vault media descriptor.');
    decodeVaultBytes(file.key, 32).fill(0); ids.add(file.uploadId); fileIds.add(file.fileId);
    return Object.freeze({ fileId: file.fileId, uploadId: file.uploadId, key: file.key, size: file.size, encryptedSize: file.encryptedSize, name: file.name, mime: file.mime, spoiler: file.spoiler === true });
  });
  return Object.freeze({ type: 'vault_media', version: 1, conversationId, messageId, files: Object.freeze(files) });
}
