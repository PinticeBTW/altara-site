import { encryptVaultFile, decryptVaultFile, encryptedVaultSize } from './vaultMediaCrypto.js';
import { uploadSignedFile } from './signedUploadTransport.js';
import { normalizeTrustedAttachmentDeliveryUrl } from './messageMediaPolicy.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function invokeVaultMedia(supabase, body, { signal, assertCurrent = () => {} } = {}) {
  assertCurrent(); if (signal?.aborted) throw new Error('Vault transfer cancelled.');
  const { data, error } = await supabase.functions.invoke('altara-vault-media', { body, signal });
  assertCurrent(); if (signal?.aborted) throw new Error('Vault transfer cancelled.');
  if (error || data?.ok !== true) throw new Error('Os anexos encriptados Vault ainda não estão disponíveis neste servidor ou nesta conversa.');
  return data;
}
export async function uploadVaultAttachment({ supabase, file, context, signal, assertCurrent = () => {}, onProgress, onPhase, transfer = {}, upload = uploadSignedFile }) {
  const startedAt = performance.now();
  const fingerprint = JSON.stringify([context.conversationId, context.messageId, context.fileId, context.epoch]);
  if (transfer.fingerprint && (transfer.fingerprint !== fingerprint || transfer.file !== file)) throw new Error('Vault transfer context changed.');
  transfer.fingerprint = fingerprint; transfer.file = file;
  const encryptedSize = encryptedVaultSize(file.size);
  const preferInline = file.type === 'image/gif' && encryptedSize <= 4 * 1048576;
  await Promise.all([
    transfer.encrypted || encryptVaultFile(file, context, { signal, assertCurrent, onProgress }).then(value => (transfer.encrypted = value)),
    transfer.claim || invokeVaultMedia(supabase, { action: 'authorize', conversation_id: context.conversationId, message_id: context.messageId, file_id: context.fileId, epoch: context.epoch, size: encryptedSize,
      ...(preferInline ? { prefer_inline: true } : {}) }, { signal, assertCurrent }).then(value => (transfer.claim = value)),
  ]);
  assertCurrent();
  const encrypted = transfer.encrypted;
  let xhr;
  const abort = () => xhr?.abort();
  try {
    const claim = transfer.claim;
    const inline = preferInline && claim.inline_upload_max_bytes === 4 * 1048576;
    if (claim.bucket !== 'altara-message-attachments-v1' || !uuid.test(claim.upload_id) || (!inline && (typeof claim.token !== 'string' || !claim.token))
      || typeof claim.path !== 'string' || claim.path.length > 700 || claim.path.includes('\\') || claim.path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid encrypted upload grant.');
    const cipherFile = new File([encrypted.blob], 'vault.bin', { type: 'application/octet-stream' });
    signal?.addEventListener('abort', abort, { once: true });
    assertCurrent(); if (signal?.aborted) throw new Error('Vault transfer cancelled.');
    if (inline && !transfer.completed) {
      // One authenticated ciphertext transfer also verifies and completes storage.
      // Retries retain the same upload ID and encrypted bytes.
      onProgress?.({ phase: 'uploading', loaded: 0, total: encryptedSize });
      const { data, error } = await supabase.functions.invoke('altara-vault-media?action=upload_complete', {
        body: encrypted.blob, signal, headers: { 'Content-Type': 'application/octet-stream', 'x-vault-upload-id': claim.upload_id },
      });
      assertCurrent(); if (signal?.aborted) throw new Error('Vault transfer cancelled.');
      if (error || data?.ok !== true || data.upload_id !== claim.upload_id) throw new Error('Não foi possível enviar o GIF. Tenta novamente.');
      transfer.uploaded = true; transfer.completed = true;
      onProgress?.({ phase: 'uploading', loaded: encryptedSize, total: encryptedSize });
    }
    if (!transfer.uploaded) {
      try {
        await upload({ origin: new URL(supabase.supabaseUrl).origin, bucket: claim.bucket, path: claim.path, token: claim.token, file: cipherFile, cacheControl: '0', onProgress,
          createRequest: () => { xhr = new XMLHttpRequest(); return xhr; } });
      } catch (error) {
        // A signed PUT can succeed while its response is lost. Only the broker's
        // exact stored-size/header check may confirm that uncertain upload.
        await invokeVaultMedia(supabase, { action: 'complete', upload_id: claim.upload_id }, { signal, assertCurrent }).catch(() => { throw error; });
        transfer.completed = true;
      }
      transfer.uploaded = true;
    }
    if (!transfer.completed) await invokeVaultMedia(supabase, { action: 'complete', upload_id: claim.upload_id }, { signal, assertCurrent });
    transfer.completed = true;
    const descriptor = { fileId: context.fileId, uploadId: claim.upload_id, key: encrypted.key, size: file.size,
      encryptedSize: encryptedVaultSize(file.size), name: (file.name || 'ficheiro').replace(/[\\/\u0000-\u001f\u007f]/g, '_').slice(0, 180),
      mime: /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(file.type) ? file.type : 'application/octet-stream', spoiler: context.spoiler === true };
    encrypted.key = ''; delete transfer.encrypted; delete transfer.file;
    return descriptor;
  } finally {
    signal?.removeEventListener('abort', abort);
    onPhase?.('vault_upload_total', { durationMs: performance.now() - startedAt, rowCount: 1, ok: transfer.completed === true });
  }
}
export async function downloadVaultAttachment({ supabase, descriptor, context, signal, assertCurrent = () => {}, fetchImpl = fetch, onPhase }) {
  const grantStarted = performance.now();
  const grant = await invokeVaultMedia(supabase, { action: 'download', upload_id: descriptor.uploadId, message_id: context.messageId }, { signal, assertCurrent });
  onPhase?.('vault_download_grant', { durationMs: performance.now() - grantStarted, rowCount: 1 });
  const url = normalizeTrustedAttachmentDeliveryUrl(grant.url, { supabaseOrigin: new URL(supabase.supabaseUrl).origin });
  if (!url || grant.size !== descriptor.encryptedSize) throw new Error('Invalid encrypted download grant.');
  const downloadStarted = performance.now();
  const response = await fetchImpl(url, { signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error' });
  if (!response.ok || !response.body || Number(response.headers.get('content-length') || 0) > descriptor.encryptedSize) throw new Error('Vault download failed.');
  const reader = response.body.getReader(); const parts = []; let size = 0;
  try {
    while (true) {
      assertCurrent(); if (signal?.aborted) throw new Error('Vault transfer cancelled.');
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > descriptor.encryptedSize) throw new Error('Oversized encrypted file.');
      parts.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  if (size !== descriptor.encryptedSize) throw new Error('Incomplete encrypted file.');
  onPhase?.('vault_download_bytes', { durationMs: performance.now() - downloadStarted, rowCount: 1 });
  const decryptStarted = performance.now();
  const blob = await decryptVaultFile(new Blob(parts), descriptor, context, { signal, assertCurrent });
  onPhase?.('vault_download_decrypt', { durationMs: performance.now() - decryptStarted, rowCount: 1 });
  return blob;
}
