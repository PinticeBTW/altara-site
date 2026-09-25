import { normalizePrivateUploadReference } from './messageMediaPolicy.js';

// Persist references, never signed delivery URLs. A favorite is not an access grant.
export function normalizeUploadedGifFavorite(value) {
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
  if (!item) return null;
  const previewUploadId = item.preview !== item.url ? item.preview.slice('altara-private-upload:'.length) : '';
  return { type: 'attachment', kind: 'image', mime: 'image/gif', name: item.title,
    uploadId: item.id.slice(7), referenceUrl: item.url, url: item.url,
    ...(previewUploadId ? { previewUploadId, previewReferenceUrl: item.preview, previewUrl: item.preview } : {}),
    width: item.width, height: item.height, isAnimated: true };
}
