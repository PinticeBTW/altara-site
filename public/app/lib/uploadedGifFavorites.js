import { normalizePrivateUploadReference } from './messageMediaPolicy.js';

// Persist references, never signed delivery URLs. A favorite is not an access grant.
export function normalizeUploadedGifFavorite(value) {
  const vaultUrl = String(value?.url || value?.gif_url || '');
  const vaultParts = /^altara-vault-gif:([0-9a-f-]{36}):([0-9a-f-]{36}):([0-9a-f-]{36})$/i.exec(vaultUrl);
  if (vaultParts && vaultParts.slice(1).every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    const id = `vault:${vaultParts[2]}:${vaultParts[3]}`;
    if ((value.id || value.gif_id) && (value.id || value.gif_id) !== id) return null;
    return { id, provider: 'vault', url: vaultUrl, preview: vaultUrl, title: 'GIF',
      conversationId: vaultParts[1], messageId: vaultParts[2], fileId: vaultParts[3], previewKind: 'static', animatedPreview: '' };
  }
  const url = normalizePrivateUploadReference(value?.url || value?.gif_url || '');
  if (!url) return null;
  const uploadId = url.slice('altara-private-upload:'.length);
  const id = `upload:${uploadId}`;
  if (value.id && value.id !== id) return null;
  return { id, provider: 'upload', url,
    preview: normalizePrivateUploadReference(value.preview || value.preview_url || '') || url,
    title: String(value.title || 'GIF').slice(0, 180),
    width: Math.max(0, Math.min(8192, Number(value.width) || 0)),
    height: Math.max(0, Math.min(8192, Number(value.height) || 0)),
    previewKind: 'static', animatedPreview: '' };
}

export function uploadedGifFavoriteFromAttachment(attachment) {
  const ref = attachment?.referenceUrl || (attachment?.uploadId ? `altara-private-upload:${attachment.uploadId}` : attachment?.url);
  return normalizeUploadedGifFavorite({ url: ref,
    preview: attachment?.previewReferenceUrl || (attachment?.previewUploadId ? `altara-private-upload:${attachment.previewUploadId}` : ''),
    title: attachment?.name, width: attachment?.width, height: attachment?.height });
}

export function uploadedGifFavoriteDescriptor(value) {
  const item = normalizeUploadedGifFavorite(value);
  if (!item || item.provider === 'vault') return null;
  const previewUploadId = item.preview !== item.url ? item.preview.slice('altara-private-upload:'.length) : '';
  return { type: 'attachment', kind: 'image', mime: 'image/gif', name: item.title,
    uploadId: item.id.slice(7), referenceUrl: item.url, url: item.url,
    ...(previewUploadId ? { previewUploadId, previewReferenceUrl: item.preview, previewUrl: item.preview } : {}),
    width: item.width, height: item.height, isAnimated: true };
}
