import { downloadVaultAttachment } from './vaultMediaClient.js';
import { safeVaultMime } from './vaultMediaCrypto.js';

// Only authenticated blobs enter the normal media presentation. No persistent cache.
export function createVaultMediaViewer({ supabase, getRow, getManifest, captureOwner, canView,
  onImageOpen, onInvalidate, onReady, onPhase, favoriteButton, labels = {}, document: doc = document, urlApi = URL, download = downloadVaultAttachment }) {
  const text = { loading: 'A carregar…', retry: 'Não foi possível carregar. Tentar novamente', save: 'Guardar ficheiro', open: 'Abrir imagem', ...labels };
  const resources = new Map(), queue = new Set(), transfers = new Map();
  const blobs = new Map(); let blobBytes = 0;
  // Kept only in memory. Bind reuse to the authenticated envelope and descriptor,
  // not to a DOM node or the identity of a freshly decrypted manifest object.
  const blobKey = (row, file) => JSON.stringify([row.id, row.conversation_id, row.ciphertext, row.cipher_iv,
    row.user_id, row.sender_key_id, row.recipient_key_id, row.dm_privacy_epoch, file]);
  function authorized(messageId, fileId, key) {
    const row = getRow(messageId), file = getManifest(row)?.files.find(file => file.fileId === fileId);
    return !!file && canView(row) && blobKey(row, file) === key;
  }
  function load(row, descriptor) {
    const key = blobKey(row, descriptor), cached = blobs.get(key);
    if (cached?.expires > Date.now()) { onPhase?.('vault_cache_hit', { rowCount: 1 }); return Promise.resolve(cached.blob); }
    if (transfers.has(key)) { onPhase?.('vault_download_reused', { rowCount: 1 }); return transfers.get(key).promise; }
    const owner = captureOwner(), controller = new AbortController();
    const transfer = { owner, controller, messageId: row.id, fileId: descriptor.fileId, key };
    const assertCurrent = () => {
      if (!owner.isCurrent() || controller.signal.aborted || !authorized(row.id, descriptor.fileId, key)) throw new Error('Media access changed.');
    };
    transfer.abort = () => controller.abort(); owner.signal.addEventListener('abort', transfer.abort, { once: true });
    transfers.set(key, transfer);
    transfer.promise = (async () => {
      try {
        assertCurrent();
        const blob = await download({ supabase, descriptor, context: { conversationId: row.conversation_id, messageId: row.id, fileId: descriptor.fileId },
          signal: controller.signal, assertCurrent, onPhase });
        assertCurrent(); remember(getRow(row.id), descriptor, blob); return blob;
      } finally {
        owner.signal.removeEventListener('abort', transfer.abort);
        if (transfers.get(key) === transfer) transfers.delete(key);
      }
    })();
    return transfer.promise;
  }
  function remember(row, file, blob) {
    if (!getManifest(row) || !canView(row) || blob.size > 32 * 1048576) return;
    const key = blobKey(row, file), old = blobs.get(key);
    if (old) blobBytes -= old.blob.size;
    blobs.delete(key); blobs.set(key, { blob, expires: Date.now() + 120000 }); blobBytes += blob.size;
    while (blobBytes > 32 * 1048576 || blobs.size > 32) { const [id, value] = blobs.entries().next().value; blobBytes -= value.blob.size; blobs.delete(id); }
  }
  function seed(row, files) {
    const manifest = getManifest(row);
    manifest?.files.forEach((descriptor, i) => {
      if (files[i]?.size === descriptor.size) remember(row, descriptor, files[i].slice(0, files[i].size, safeVaultMime(descriptor.mime)));
    });
  }
  let root = null, seen = new WeakSet(), active = 0;
  const Observer = doc.defaultView?.MutationObserver;
  const Intersection = doc.defaultView?.IntersectionObserver;
  const observer = Observer ? new Observer(() => { prune(); scan(); }) : null;
  const visible = Intersection ? new Intersection(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      visible.unobserve(entry.target); queue.add(entry.target);
    }
    drain();
  }, { rootMargin: '150px' }) : null;
  function dispose(button, item) {
    item.controller.abort(); item.owner.signal.removeEventListener('abort', item.abort);
    item.preview?.querySelectorAll('video,audio').forEach(media => { media.pause(); media.removeAttribute('src'); media.load(); });
    item.preview?.remove();
    if (item.url) urlApi.revokeObjectURL(item.url);
    if (button.isConnected) { button.hidden = false; button.disabled = false; button.textContent = item.label; }
    resources.delete(button);
  }
  function clear() {
    root = null; observer?.disconnect(); visible?.disconnect(); queue.clear(); seen = new WeakSet();
    blobs.clear(); blobBytes = 0;
    for (const transfer of transfers.values()) transfer.controller.abort();
    transfers.clear();
    onInvalidate?.();
    for (const [button, item] of resources) dispose(button, item);
  }
  function current(button, item) {
    return item.owner.isCurrent() && !item.controller.signal.aborted && button.isConnected
      && authorized(button.dataset.vaultMessage, button.dataset.vaultFile, item.key);
  }
  async function open(button) {
    if (resources.has(button)) return;
    const messageId = button.dataset.vaultMessage, fileId = button.dataset.vaultFile;
    const row = getRow(messageId), manifest = getManifest(row);
    const descriptor = manifest?.files.find(file => file.fileId === fileId);
    if (!descriptor || !canView(row)) return;
    if (doc.body) observer?.observe(doc.body, { childList: true, subtree: true });
    const owner = captureOwner(), controller = new AbortController();
    const item = { controller, owner, label: button.textContent, url: '', preview: null, key: blobKey(row, descriptor), descriptor };
    item.abort = () => clear();
    resources.set(button, item);
    owner.signal.addEventListener('abort', item.abort, { once: true });
    const assertCurrent = () => { if (!current(button, item)) throw new Error('Media view changed.'); };
    button.disabled = true; button.textContent = text.loading;
    try {
      assertCurrent();
      const blob = await load(row, descriptor);
      assertCurrent();
      remember(row, descriptor, blob);
      item.url = urlApi.createObjectURL(blob);
      const preview = doc.createElement('div'); preview.className = 'vaultMediaPreview'; item.preview = preview;
      const isImage = blob.type.startsWith('image/'), isVideo = blob.type.startsWith('video/');
      if (blob.type === 'image/gif') {
        preview.classList.add('vaultMediaPreview--gif');
        button.closest('.vaultMediaFile')?.classList.add('vaultMediaFile--gif');
      }
      if (/^(image|video|audio)\//.test(blob.type)) {
        const media = doc.createElement(isImage ? 'img' : isVideo ? 'video' : 'audio');
        media.src = item.url;
        media.className = isImage ? 'msg__attachmentImage' : isVideo ? 'msg__attachmentVideo' : 'msg__attachmentAudio';
        if (isImage) {
          media.alt = descriptor.name; media.decoding = 'async';
          const opener = doc.createElement('button'); opener.type = 'button'; opener.className = 'msg__attachmentPreview'; opener.setAttribute('aria-label', text.open);
          opener.addEventListener('click', () => { if (current(button, item)) onImageOpen?.(messageId + ':' + fileId); });
          opener.append(media); preview.append(opener);
        } else { media.controls = true; media.preload = 'metadata'; media.setAttribute('playsinline', ''); preview.append(media); }
        media.addEventListener(isImage ? 'load' : 'loadedmetadata', () => { if (current(button, item)) onReady?.(media); }, { once: true });
      }
      if (blob.type === 'image/gif') {
        const favorite = favoriteButton?.(row, descriptor);
        if (favorite) preview.append(favorite);
      } else {
      const save = doc.createElement('a'); save.href = item.url; save.download = descriptor.name;
      save.textContent = text.save; save.className = 'vaultMediaSave'; save.setAttribute('aria-label', text.save + ': ' + descriptor.name);
      save.addEventListener('click', event => { if (!current(button, item)) event.preventDefault(); });
      preview.append(save);
      }
      button.after(preview); button.hidden = true;
    } catch {
      // A replaced DOM node must not receive the result of an old request.
      if (resources.get(button) === item) {
        const cancelled = controller.signal.aborted;
        dispose(button, item);
        if (button.isConnected && !cancelled) button.textContent = text.retry;
      }
    }
  }
  function prune() {
    for (const [button, item] of resources) if (!current(button, item)) { onInvalidate?.(); dispose(button, item); seen.delete(button); }
    for (const [key, transfer] of transfers) {
      if (!transfer.owner.isCurrent() || !authorized(transfer.messageId, transfer.fileId, key)) {
        transfer.controller.abort(); transfers.delete(key);
      }
    }
    for (const button of queue) if (!button.isConnected) queue.delete(button);
  }
  function drain() {
    // Four visible small media requests can progress together instead of making
    // the newest GIF wait through serial pairs of download authorizations.
    while (active < 4 && queue.size) {
      const button = queue.values().next().value; queue.delete(button);
      if (!root?.contains(button) || !button.isConnected) continue;
      active++;
      void open(button).finally(() => { active--; drain(); });
    }
  }
  function scan() {
    if (!root?.isConnected) return;
    for (const button of root.querySelectorAll('button[data-vault-auto="1"]')) {
      if (seen.has(button)) continue;
      seen.add(button);
      if (visible) visible.observe(button); else queue.add(button);
    }
    drain();
  }
  function watch(container) {
    root = container;
    if (doc.body) observer?.observe(doc.body, { childList: true, subtree: true });
    prune(); scan();
  }
  function getItems() {
    return [...resources].filter(([button, item]) => item.url && current(button, item) && item.descriptor.mime?.startsWith('image/'))
      .map(([button, item]) => ({ key: button.dataset.vaultMessage + ':' + button.dataset.vaultFile, host: button.parentElement,
        url: item.url, preview: item.url, kind: 'image', title: item.descriptor.name, download: { url: item.url, name: item.descriptor.name }, zoomable: item.descriptor.mime !== 'image/gif',
        width: item.preview?.querySelector('img')?.naturalWidth || 1, height: item.preview?.querySelector('img')?.naturalHeight || 1 }));
  }
  return { open, clear, prune, watch, getItems, seed };
}
