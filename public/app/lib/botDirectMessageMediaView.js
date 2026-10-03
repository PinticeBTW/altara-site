import { botDirectMessageAttachmentItems } from './botDirectMessageAttachments.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const fileIcon = '<svg class="msg__fileIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>';
const downloadIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 17v4h14v-4"/></svg>';
const deleteIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>';

// Pure presentation shared with admitted human attachments. This helper has no
// URL, upload identity, delivery grant or message authority.
export function nativeAttachmentFileContentHtml({name, meta} = {}) {
  return `${fileIcon}<span class="msg__fileText"><span class="msg__fileName">${escape(name)}</span><span class="msg__fileMeta">${escape(meta)}</span></span>`;
}

export function nativeAttachmentCaptionHtml({meta} = {}) {
  return `<span class="msg__attachmentInfo">${escape(meta)}</span>`;
}

export function createBotDirectMessageMediaView({document: doc = globalThis.document, host,
  resolve, isCurrent, getName = item => item.name, metaLabel = item => item.name,
  sizeLabel = item => `${item.size} B`, onImageOpen, onDownload, onDeleteAttachment, canDelete, onError, bindPlayers,
  maxConcurrent = 2, rootMargin = 240} = {}) {
  if (!doc?.createElement || typeof resolve !== 'function' || typeof isCurrent !== 'function') throw new TypeError('invalid_bot_dm_media_view');
  const win = doc.defaultView, states = new Set(), byHolder = new WeakMap(), pending = new Map(), queue = [];
  const limit = Math.min(4, Math.max(1, Number.isSafeInteger(maxConcurrent) ? maxConcurrent : 2));
  const margin = Math.min(600, Math.max(0, Number.isFinite(rootMargin) ? rootMargin : 240));
  let running = 0, generation = 0, destroyed = false, mutationWatching = false, refreshQueued = false;
  const node = (tag, className, text) => {
    const element = doc.createElement(tag); if (className) element.className = className;
    if (text !== undefined) element.textContent = text; return element;
  };
  const button = (className, label) => {
    const element = node('button', className); element.type = 'button'; element.setAttribute('aria-label', label); element.title = label; return element;
  };
  function valid(state) {
    if (destroyed || state.disposed || !state.holder.isConnected || state.snapshot.enabled !== true || state.row.deleted_at) return false;
    try { return isCurrent(state.snapshot, state.row) === true; } catch (_) { return false; }
  }
  function clearMedia(state) {
    if (!state.media) return;
    if (state.kind !== 'image') state.media.pause();
    state.media.removeAttribute('src'); state.media.removeAttribute('srcset');
    for (const source of state.media.querySelectorAll('source')) source.removeAttribute('src');
    if (state.kind !== 'image') state.media.load();
  }
  function dispose(state) {
    if (state.disposed) return;
    state.disposed = true; intersection?.unobserve(state.holder); clearMedia(state);
    for (const control of state.holder.querySelectorAll('button,input')) control.disabled = true;
    state.frame?.setAttribute('data-media-state', 'pending'); states.delete(state);
  }
  const mutation = win?.MutationObserver ? new win.MutationObserver(() => {
    if (refreshQueued) return; refreshQueued = true;
    queueMicrotask(() => {refreshQueued = false; refresh();});
  }) : null;
  const intersection = win?.IntersectionObserver ? new win.IntersectionObserver(entries => {
    for (const entry of entries) {
      const state = byHolder.get(entry.target);
      if (!state) continue;
      state.near = entry.isIntersecting;
      if (state.near && valid(state)) hydrateState(state);
    }
  }, {rootMargin:`${margin}px`}) : null;
  function nearViewport(state) {
    const rect = state.holder.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom >= -margin && rect.top <= (win?.innerHeight || 0) + margin;
  }
  function watch(state) {
    states.add(state); byHolder.set(state.holder,state); intersection?.observe(state.holder);
    if (!mutationWatching && mutation) {
      mutation.observe(host || doc.body, {childList:true, subtree:true}); mutationWatching = true;
    }
  }
  function refresh() {
    for (const state of [...states]) {
      // A synchronous render precedes insertion. Its single mounting microtask
      // must run before disconnected nodes are disposed.
      if (state.mounting && !state.holder.isConnected) continue;
      if (!valid(state)) {dispose(state); continue;}
      state.mounting = false;
      if (state.deleteControl) {const allowed=canDeleteAttachment(state); state.deleteControl.hidden=!allowed; state.deleteControl.style.display=allowed ? '' : 'none'; state.deleteControl.disabled=!allowed;}
      if (!intersection) {state.near = nearViewport(state); if (state.near) hydrateState(state);}
    }
    if (!states.size && mutationWatching) {mutation?.disconnect(); mutationWatching = false;}
    pump();
  }
  function leaseKey(state, download) {
    return JSON.stringify([generation, state.snapshot.userId, state.snapshot.key, state.row.id, state.row.revision ?? null, state.item.uploadId, download]);
  }
  function requestLease(state, download = false) {
    const key = leaseKey(state, download), existing = pending.get(key);
    if (existing) {existing.consumers.add(state); return existing.promise;}
    let accept, reject;
    const job = {key, consumers:new Set([state]), download,
      promise:new Promise((yes, no) => {accept=yes; reject=no;}), accept:null, reject:null};
    job.accept = accept; job.reject = reject; pending.set(key, job); queue.push(job); pump(); return job.promise;
  }
  function pump() {
    while (!destroyed && running < limit && queue.length) {
      const job = queue.shift(), state = [...job.consumers].find(valid);
      if (!state) {pending.delete(job.key); job.reject(new Error('bot_dm_attachment_context_changed')); continue;}
      running++;
      Promise.resolve().then(() => {
        if (!valid(state)) throw new Error('bot_dm_attachment_context_changed');
        return resolve(state.item, state.row, state.snapshot, {download:job.download});
      }).then(grant => {
        // URL origin and private bucket authority belong to the broker. This
        // final protocol check also keeps a broken adapter from creating script
        // navigation; the grant is never cached beyond the admitted DOM node.
        const url = new URL(grant?.url);
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error('bot_dm_attachment_response_invalid');
        job.accept(grant);
      }, job.reject).catch(job.reject).finally(() => {running--; pending.delete(job.key); pump();});
    }
  }
  function failed(state) {
    if (!valid(state)) return;
    state.loading = false; clearMedia(state);
    state.frame?.setAttribute('data-media-state', 'error'); state.retry.hidden = false;
    if (state.status) state.status.textContent = 'Não foi possível carregar.';
  }
  function hydrateState(state) {
    if (state.kind === 'file' || state.loading || state.loaded || state.failed || !state.near || !valid(state)) return;
    state.loading = true;
    requestLease(state).then(grant => {
      if (!valid(state)) return;
      state.loaded = true; state.loading = false;
      state.frame?.setAttribute('data-media-state', 'preview'); state.media.src = grant.url;
    }).catch(() => {state.failed = true; failed(state);});
  }
  async function action(state, download) {
    if (!valid(state) || state.acting) return;
    state.acting = true;
    try {
      const grant = await requestLease(state, download);
      if (!valid(state)) return;
      if (!download && state.kind === 'image' && onImageOpen) await onImageOpen({host:state.preview,item:state.item,row:state.row,snapshot:state.snapshot,kind:state.kind,grant});
      else if (onDownload) await onDownload(state.item, state.row, state.snapshot, grant);
      else {
        const link = node('a'); link.href = grant.url; link.download = state.item.name; link.rel = 'noopener noreferrer';
        doc.body.append(link); link.click(); link.remove();
      }
    } catch (_) {if (valid(state)) onError?.('Não foi possível abrir o ficheiro. Tenta novamente.', state.snapshot);}
    finally {state.acting = false;}
  }
  function downloadButton(state, className) {
    const control = button(className, 'Download');
    if(state.kind === 'image')control.textContent='Download';else control.innerHTML=downloadIcon;
    control.disabled = !state.snapshot.enabled;
    control.addEventListener('click', event => {event.preventDefault(); event.stopPropagation(); action(state, true);}); return control;
  }
  function canDeleteAttachment(state) {
    if (!onDeleteAttachment || typeof canDelete !== 'function' || !valid(state)) return false;
    try {return canDelete(state.snapshot,state.row) === true;} catch (_) {return false;}
  }
  function deleteButton(state,className) {
    if (!onDeleteAttachment) return null;
    const control=button(className,'Delete attachment');
    if(state.kind === 'image')control.textContent='🗑';else control.innerHTML=deleteIcon;
    state.deleteControl=control; control.hidden=true; control.style.display='none'; control.disabled=true;
    control.addEventListener('click',async event=>{
      event.preventDefault(); event.stopPropagation();
      if (!canDeleteAttachment(state) || state.acting) return;
      state.acting=true;
      try {await onDeleteAttachment(state.item,state.row,state.snapshot);}
      catch (_) {if(valid(state))onError?.('Não foi possível remover este anexo. Tenta novamente.',state.snapshot);}
      finally {state.acting=false;}
    });
    return control;
  }
  function render(row, snapshot) {
    if (destroyed || row?.deleted_at) return null;
    const items = botDirectMessageAttachmentItems(row); if (!items.length) return null;
    const mediaCount = items.filter(item => /^(image|video)\//.test(item.mime)).length;
    const collection = node('div', `msg__attachmentsList${mediaCount === items.length && items.length > 1 ? ' msg__attachmentsList--media' : ''}`);
    collection.dataset.count = String(items.length);
    for (const item of items) {
      const kind = /^(image|video|audio)\//.test(item.mime) ? item.mime.split('/')[0] : 'file';
      const slot = node('div', 'msg__attachmentsItem'), holder = node('div', `msg__attachment msg__attachment--${kind}`);
      const state = {item, row, snapshot, kind, holder, mounting:true, near:false, loading:false, loaded:false, failed:false, acting:false, disposed:false};
      const name = String(getName(item) || item.name), meta = String(metaLabel(item) || '');
      if (kind === 'file') {
        const card = node('div', 'msg__fileRow'), main = button('msg__fileMain', `Abrir ficheiro: ${name}`);
        main.innerHTML = nativeAttachmentFileContentHtml({name,meta}); main.disabled = !snapshot.enabled;
        main.addEventListener('click', event => {event.preventDefault(); event.stopPropagation(); action(state, true);});
        const actions = node('div', 'msg__fileActions'), remove=deleteButton(state,'msg__fileAction msg__fileAction--delete');
        if(remove)actions.append(remove); actions.append(downloadButton(state, 'msg__fileAction'));
        card.append(main, actions); holder.append(card);
      } else if (kind === 'image') {
        state.frame = node('div', 'msg__attachmentMedia dmMediaFrame'); state.frame.dataset.mediaState = 'pending';
        state.preview = button('msg__attachmentPreview', `Abrir imagem: ${name}`); state.preview.disabled = !snapshot.enabled;
        state.media = node('img', `msg__attachmentImage dmProgressiveImage${item.mime === 'image/gif' ? ' msg__gif' : ''}`);
        state.media.alt = name; state.media.loading = 'lazy'; state.media.decoding = 'async'; state.media.referrerPolicy = 'no-referrer';
        state.media.addEventListener('load', () => {
          if (!valid(state)) {clearMedia(state); return;}
          const {naturalWidth:width,naturalHeight:height} = state.media;
          // Tiny or panoramic images still need room for the native download
          // control; contain preserves the original image inside that frame.
          if (width > 0 && height > 0) {state.frame.style.setProperty('--chat-media-ratio', String(Math.min(4,Math.max(.25,width / height)))); state.frame.style.setProperty('--chat-media-width', `${Math.min(640,Math.max(160,width))}px`);}
          state.frame.dataset.mediaState = 'ready';
        });
        state.media.addEventListener('error', () => {state.loaded=false; state.failed=true; failed(state);});
        state.preview.addEventListener('click', event => {event.preventDefault(); event.stopPropagation(); action(state, false);});
        state.preview.append(state.media); state.status = node('span', 'dmMediaStatus', 'A carregar imagem…');
        state.retry = button('dmMediaRetry', 'Tentar novamente'); state.retry.textContent = 'Tentar novamente'; state.retry.hidden = true;
        state.retry.addEventListener('click', () => {if (!valid(state)) return; state.failed=false; state.loaded=false; state.retry.hidden=true; state.frame.dataset.mediaState='pending'; hydrateState(state);});
        state.frame.append(state.preview, state.status, state.retry);
        const remove=deleteButton(state,'msg__attachmentCornerBtn msg__attachmentCornerBtn--danger msg__attachmentCornerBtn--left');
        if(remove)state.frame.append(remove); state.frame.append(downloadButton(state, 'msg__attachmentCornerBtn'));
        const caption = node('div', 'msg__attachmentCaption'); caption.innerHTML = nativeAttachmentCaptionHtml({meta}); holder.append(state.frame, caption);
      } else {
        state.frame = kind === 'video' ? node('div', 'msg__attachmentMedia') : holder;
        const player = node('div', kind === 'video' ? 'msg__videoPlayer' : 'msgAudioCard');
        player.setAttribute(`data-${kind}-player`, '');
        const controlsKind = kind === 'video' ? 'video' : 'audio', prefix = kind === 'video' ? 'msgVideo' : 'msgAudio';
        player.innerHTML = kind === 'video'
          ? '<button type="button" class="msgVideoStart" data-video-start aria-label="Play"></button><video class="msg__attachmentVideo" preload="none" playsinline></video><div class="msg__videoUi" data-video-ui></div>'
          : `<div class="msgAudioHead"><div class="msgAudioFileMeta"><span class="msgAudioFileName" title="${escape(item.name)}">${escape(name)}</span><span class="msgAudioFileSize">${escape(sizeLabel(item))}</span></div></div><div class="msgAudioPlayerRow"><audio class="msg__attachmentAudio" preload="none"></audio></div>`;
        state.media = player.querySelector(kind); state.media.controls = !bindPlayers; state.media.preload = 'none';
        const controls = player.querySelector(kind === 'video' ? '.msg__videoUi' : '.msgAudioPlayerRow');
        const play = button(`${prefix}Btn ${prefix}Btn--play`, 'Play'); play.setAttribute(`data-${controlsKind}-play`, ''); play.textContent = '▶';
        const current = node('span', `${prefix}Time`, '0:00'); current.setAttribute(`data-${controlsKind}-current`, '');
        const seek = node('input', `${prefix}Seek`); seek.type='range'; seek.min='0'; seek.max='1000'; seek.step='1'; seek.value='0'; seek.setAttribute(`data-${controlsKind}-seek`, ''); seek.setAttribute('aria-label', `Posição do ${kind === 'video' ? 'vídeo' : 'áudio'}`);
        const duration = node('span', `${prefix}Time ${prefix}Time--duration`, '0:00'); duration.setAttribute(`data-${controlsKind}-duration`, '');
        const volWrap = node('div', `${prefix}VolWrap`), volPopup = node('div', `${prefix}VolPopup`), volume = node('input', `${prefix}Volume ${prefix}Volume--vertical`);
        volume.type='range'; volume.min='0'; volume.max='100'; volume.step='1'; volume.value='100'; volume.setAttribute(`data-${controlsKind}-volume`, ''); volume.setAttribute('aria-label', `Volume do ${kind === 'video' ? 'vídeo' : 'áudio'}`);
        const mute = button(`${prefix}Btn ${prefix}Btn--mute`, 'Mute'); mute.setAttribute(`data-${controlsKind}-mute`, ''); mute.textContent='🔊'; volPopup.append(volume); volWrap.append(volPopup,mute);
        controls.append(play,current,seek,duration);
        if (kind === 'video') {
          const remain = node('span','msgVideoRemain'); remain.setAttribute('data-video-remain',''); remain.hidden=true; controls.append(remain);
          const fullscreen = button('msgVideoBtn msgVideoBtn--fs','Fullscreen'); fullscreen.setAttribute('data-video-fullscreen',''); controls.append(volWrap,fullscreen);
          state.frame.append(player); const remove=deleteButton(state,'msg__attachmentCornerBtn msg__attachmentCornerBtn--danger msg__attachmentCornerBtn--left');
          if(remove)state.frame.append(remove); state.frame.append(downloadButton(state,'msg__attachmentCornerBtn'));
          const caption = node('div','msg__attachmentCaption'); caption.innerHTML=nativeAttachmentCaptionHtml({meta}); holder.append(state.frame,caption);
        } else {
          controls.append(volWrap); const head=player.querySelector('.msgAudioHead'), remove=deleteButton(state,'msg__attachmentCornerBtn msg__attachmentCornerBtn--inline msg__attachmentCornerBtn--danger');
          if(remove)head.append(remove); head.append(downloadButton(state,'msg__attachmentCornerBtn msg__attachmentCornerBtn--inline msgAudioDownloadBtn')); holder.append(player);
        }
        state.retry = button('dmMediaRetry','Tentar novamente'); state.retry.hidden=true;
        state.retry.addEventListener('click', () => {if (!valid(state)) return; state.failed=false; state.loaded=false; state.retry.hidden=true; hydrateState(state);}); holder.append(state.retry);
        state.media.addEventListener('error', () => {state.loaded=false; state.failed=true; failed(state);});
      }
      slot.append(holder); collection.append(slot); watch(state);
    }
    bindPlayers?.(collection);
    queueMicrotask(() => {for (const state of states) if (collection.contains(state.holder)) state.mounting=false; refresh();});
    return collection;
  }
  function reset() {
    generation++;
    for (const state of [...states]) dispose(state);
    for (const job of queue.splice(0)) {pending.delete(job.key); job.reject(new Error('bot_dm_attachment_context_changed'));}
    mutation?.disconnect(); mutationWatching=false;
  }
  function destroy() {destroyed=true; reset(); intersection?.disconnect();}
  function getItems() {
    const seen = new Set(), items = [];
    for (const state of states) {
      if (!valid(state) || !['image','video'].includes(state.kind)) continue;
      const key = `${state.row.id}:${state.item.uploadId}`; if (seen.has(key)) continue; seen.add(key);
      items.push({key,kind:state.kind,host:state.preview || state.holder,item:state.item,row:state.row,snapshot:state.snapshot,
        title:String(getName(state.item) || state.item.name),meta:String(metaLabel(state.item) || '')});
    }
    return items;
  }
  return {render, hydrate:refresh, refresh, reset, destroy, getItems};
}
