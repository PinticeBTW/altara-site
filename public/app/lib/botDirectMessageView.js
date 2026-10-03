import {renderDirectMessageFrame} from './directMessagePresentation.js';

// Bot conversations share the main chat layout, while keeping their actor API
// and composer separate from encrypted human DMs and human message actions.
export function createBotDirectMessageView({host, template, onSend, onConsent, onRetry, onRefresh, onProfile, onOptions,
  getProfile, onFullProfile, onProfileRender, onPrivacy, getPrivacyState, onEmoji, onGif, onAttach, onFiles, onEdit, onPins, onMore, onFormat, onMessageAction, onSenderProfile, getCapabilities, getMessageActions, getQuickReactions, getReactions, getPinnedMessages, getMessagePreview, canStack,
  renderAvatar, renderProfileBanner, renderText, renderMessageBody, renderEmbeds, renderAttachments, renderNameAttrs, renderComposerPreview,
  formatTimestamp, getDayKey, renderDayDivider, getOwnProfile} = {}) {
  const doc = host?.ownerDocument;
  if (!doc || typeof onSend !== 'function') throw new TypeError('invalid_bot_dm_view');
  const node = (tag, className, text) => {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const esc=value=>String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const isDeleted=row=>row?.deleted === true || !!row?.deleted_at || !!row?.deletedAt;
  const button = (text, action, className = 'btn ghost') => {
    const el = node('button', className, text); el.type = 'button';
    el.addEventListener('click', () => invokeAction(action,snapshot || {})); return el;
  };
  // Reuse the native shell's classes and static button artwork, never its IDs,
  // mutable data attributes or handlers bound to a human conversation.
  const native = template || doc.getElementById('dmMain');
  const skeleton = (selector, tag, className, deep = false) => {
    const source = native?.querySelector?.(selector);
    const el = source?.tagName?.toLowerCase() === tag ? source.cloneNode(deep) : node(tag, className);
    for (const current of [el, ...el.querySelectorAll('*')]) {
      const nativeRole=current.getAttribute('id');
      const artwork = current.namespaceURI === 'http://www.w3.org/2000/svg';
      for (const attr of [...current.attributes]) {
        if (attr.name !== 'class' && !(artwork && ['viewBox','d','cx','cy','r','x','y','x1','x2','y1','y2','rx','ry','width','height','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin'].includes(attr.name))) current.removeAttribute(attr.name);
      }
      if (nativeRole) current.dataset.nativeDmRole=nativeRole;
    }
    el.className = className;
    return el;
  };
  const tool = (selector, text, action, className = 'btn ghost') => {
    const el = skeleton(selector, 'button', className, true);
    if (!el.childNodes.length) el.textContent = text;
    el.type = 'button'; el.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      if (!el.disabled && !el.hidden && snapshot) invokeAction(() => action(snapshot, el), snapshot);
    });
    return el;
  };
  const root = node('section', 'dmMain botDmMain'); root.id = 'botDmMain'; root.hidden = true;
  root.setAttribute('aria-label', 'Conversa privada com bot');
  const header = skeleton('.dmHeader', 'div', 'dmHeader');
  const avatar = skeleton('.dmHeaderAvatar', 'div', 'dmHeaderAvatar');
  avatar.setAttribute('role', 'img');
  const identity = skeleton('.dmHeaderText', 'div', 'dmHeaderText');
  const titleRow = node('div', 'dmTitleRow');
  const title = node('div', 'dmTitle');title.dataset.nativeDmRole='dmTitle';
  const badge = node('span', 'msg__botBadge', 'BOT');
  titleRow.append(title, badge);
  const privacyBadge=skeleton('#dmPrivacyBadge','span','dmPrivacyBadge');privacyBadge.hidden=true;
  const privacy=tool('#btnDmPrivacy','', (current,anchor)=>onPrivacy?.(current,anchor),'dmPrivacyOptInBtn');privacy.hidden=!onPrivacy;
  privacy.setAttribute('aria-label','Informações da conversa');privacy.setAttribute('aria-haspopup','dialog');
  if(getPrivacyState)titleRow.append(privacyBadge);if(onPrivacy)titleRow.append(privacy);
  identity.append(titleRow);
  const actions = skeleton('.dmHeaderActions', 'div', 'dmHeaderActions');
  const profile = tool('#btnDmProfilePanel','',()=>toggleProfile(),'btn ghost dmHeaderIconBtn');
  profile.setAttribute('aria-label','Profile');profile.title='Profile (Alt+S)';
  if (!profile.childNodes.length || !profile.querySelector('svg')) profile.innerHTML='<span class="dmHeaderIcon dmHeaderIcon--profile" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="3.2"/><path d="M5 20a7 7 0 0 1 14 0"/></svg></span>';
  const pins = tool('#btnDmPins', '📌', (current, anchor) => onPins ? onPins(current, anchor) : togglePins(), 'btn ghost dmHeaderIconBtn');
  pins.title = 'Pinned Messages'; pins.setAttribute('aria-label', 'Mensagens afixadas');
  actions.append(pins,profile);header.append(avatar,identity,actions);
  header.addEventListener('contextmenu',event=>{
    if (!snapshot || !onOptions) return;
    event.preventDefault();event.stopPropagation();invokeAction(()=>onOptions(snapshot,header,{clientX:event.clientX,clientY:event.clientY}),snapshot);
  });
  const consentBar = node('div', 'botDmConsentBar');
  const consentText = node('span', '', 'Permite as mensagens deste bot para conversar.');
  const consent = button('Permitir mensagens', () => onConsent?.(!snapshot?.enabled));
  consentBar.append(consentText, consent);
  const status = node('div', 'botDmStatus'); status.setAttribute('role', 'status');
  const statusText = node('span');
  const retry = button('Tentar novamente', () => retryPending()); retry.hidden = true;
  status.append(statusText, retry);
  const mainBody = skeleton('.dmMainBody', 'div', 'dmMainBody');
  const thread = skeleton('.dmThread', 'div', 'dmThread');
  const timeline = skeleton('.dmMessages', 'div', 'dmMessages botDmMessages');
  timeline.setAttribute('role', 'log'); timeline.setAttribute('aria-label', 'Mensagens com o bot');
  const jump = tool('#btnDmJumpLatest', '↓ Jump to latest', () => {
    timeline.scrollTop = timeline.scrollHeight; syncJump();
  }, 'dmJumpLatest');
  jump.setAttribute('aria-label', 'Ir para as mensagens mais recentes'); jump.hidden = true;
  const pinsPanel = skeleton('.dmPinsPanel', 'aside', 'dmPinsPanel botDmPinsPanel hidden'); pinsPanel.hidden = true;
  const pinsTop = node('div', 'dmPinsPanel__top');
  const pinsClose = button('×', () => togglePins(false)); pinsClose.setAttribute('aria-label', 'Fechar mensagens afixadas');
  pinsTop.append(node('div', 'dmPinsPanel__title', '📌 Pinned Messages'), pinsClose);
  const pinsList = node('div', 'dmPinsList'); pinsPanel.append(pinsTop, pinsList);
  const profilePanel=skeleton('.dmProfilePanel','aside','dmProfilePanel hidden',true);profilePanel.hidden=true;
  const profileRole=(role,tag,className,parent=profilePanel)=>{
    let el=profilePanel.querySelector(`[data-native-dm-role="${role}"]`);
    if(!el){el=node(tag,className);el.dataset.nativeDmRole=role;parent.append(el);}return el;
  };
  let profileTop=profilePanel.querySelector('.dmProfilePanel__top');
  if(!profileTop){profileTop=node('div','dmProfilePanel__top');profileTop.append(node('div','dmProfilePanel__title','Profile Preview'));profilePanel.prepend(profileTop);}
  const profileClose=profileRole('btnDmProfileClose','button','btn ghost',profileTop);profileClose.type='button';profileClose.textContent='×';profileClose.setAttribute('aria-label','Close profile');profileClose.addEventListener('click',()=>toggleProfile(false));
  const profileBanner=profileRole('dmProfileBanner','div','dmProfilePanel__banner');profileBanner.replaceChildren();
  const profileAvatar=profileRole('dmProfileAvatar','button','dmProfileAvatar');profileAvatar.type='button';profileAvatar.replaceChildren();profileAvatar.setAttribute('aria-label','Open full profile');
  let profileBody=profilePanel.querySelector('.dmProfilePanel__body');if(!profileBody){profileBody=node('div','dmProfilePanel__body');profilePanel.append(profileBody);}
  const profileName=profileRole('dmProfileName','div','dmProfileName',profileBody),profileHandle=profileRole('dmProfileHandle','div','dmProfileHandle',profileBody);
  const profileStatus=profileRole('dmProfileStatusText','span','dmProfileStatusText',profileBody),profileStatusDot=profileRole('dmProfileStatusDot','span','dmProfileStatusDot',profileBody);
  const profileBio=profileRole('dmProfileBio','div','dmProfileBio',profileBody),profileContext=node('div','dmProfileContextSection');profileBody.append(profileContext);
  for (const el of [profileName,profileHandle,profileStatus,profileBio]) el.textContent='';
  for (const role of ['dmProfileAltaraPlusBadge','dmProfileActivityPreview','dmProfileConnectionsPreview','dmProfileWidgetsPreview','dmProfileMutualSection']) {
    const el=profilePanel.querySelector(`[data-native-dm-role="${role}"]`);if(el){el.replaceChildren();el.hidden=true;}
  }
  let profileFooter=profilePanel.querySelector('.dmProfilePanel__footer');if(!profileFooter){profileFooter=node('div','dmProfilePanel__footer');profilePanel.append(profileFooter);}
  const fullProfile=profileRole('btnDmProfileOpenCard','button','btn ghost w100',profileFooter);fullProfile.type='button';fullProfile.textContent='View Full Profile';
  const openFullProfile=anchor=>{if(snapshot)return onFullProfile ? onFullProfile(getProfile?.(snapshot) || snapshot,snapshot,anchor) : onProfile?.(snapshot,anchor);};
  for(const control of [profileAvatar,fullProfile])control.addEventListener('click',()=>invokeAction(()=>openFullProfile(control),snapshot));
  thread.append(timeline,jump);mainBody.append(thread,pinsPanel,profilePanel);
  const replyBar = skeleton('#dmReplyBar', 'div', 'dmReplyBar botDmReplyBar'); replyBar.hidden = true;
  const replyText = node('div', 'dmReplyBar__text'), replyTitle = node('span', 'dmReplyBar__title'), replyPreview = node('span', 'dmReplyBar__body');
  replyText.append(replyTitle, replyPreview);
  const replyCancel = button('×', () => cancelComposeMode(), 'dmReplyBar__close'); replyCancel.setAttribute('aria-label', 'Cancelar resposta ou edição');
  replyBar.append(replyText, replyCancel);
  const pendingAttachments = skeleton('#dmPendingAttachments', 'div', 'dmPendingAttachments botDmPendingAttachments'); pendingAttachments.hidden = true;
  const composer = node('form', 'dmComposer');
  const attach = tool('#btnAttach', '+', (current, anchor) => onAttach?.(current, anchor), 'btn ghost dmAttachBtn');
  attach.title = 'Attach file'; attach.setAttribute('aria-label', 'Anexar ficheiro');
  const inputWrap = skeleton('.dmInputWrap', 'div', 'dmInputWrap');
  const mirror = skeleton('.dmInputRichMirror', 'div', 'dmInputRichMirror'); mirror.setAttribute('aria-hidden','true');
  const input = skeleton('textarea', 'textarea', 'input'); input.rows = 1; input.maxLength = 2000;
  input.placeholder = 'Message...'; input.setAttribute('aria-label', 'Mensagem para o bot');
  input.spellcheck = false; input.setAttribute('autocorrect', 'off'); input.setAttribute('autocapitalize', 'off');
  input.setAttribute('data-gramm', 'false');
  const composerTools = skeleton('.dmComposerTools', 'div', 'dmComposerTools');
  composerTools.setAttribute('aria-label', 'Message actions');
  const gif = tool('#btnGif', 'GIF', (current, anchor) => onGif?.(current, anchor));
  gif.title = 'GIF'; gif.setAttribute('aria-label', 'GIF');
  const emoji = tool('#btnEmoji', '🙂', (current, anchor) => onEmoji?.(current, anchor));
  emoji.title = 'Emoji'; emoji.setAttribute('aria-label', 'Emoji');
  composerTools.append(gif, emoji);
  const send = node('button', 'btn primary', 'Send');send.type='submit';send.dataset.nativeDmRole='dmSend';
  inputWrap.append(mirror, input); composer.append(attach, inputWrap, composerTools, send);
  const formatToolbar = skeleton('#dmFormatToolbar','div','dmFormatToolbar'); formatToolbar.hidden = true;
  formatToolbar.setAttribute('aria-label','Formatação da mensagem');
  for (const [mode,label,artwork] of [['bold','Bold','<b>B</b>'],['italic','Italic','<i>I</i>'],['strike','Strikethrough','<s>S</s>'],['code','Code','&lt;/&gt;'],['spoiler','Spoiler','◌']]) {
    const control = button('',()=>{
      const context=getComposerContext(); if (context && onFormat) return onFormat(mode,context);
    },'dmFormatToolbar__btn');
    control.innerHTML=artwork; control.title=label; control.setAttribute('aria-label',label); control.dataset.botDmFormat=mode;
    control.addEventListener('mousedown',event=>event.preventDefault()); formatToolbar.append(control);
  }
  root.append(header, consentBar, status, mainBody, replyBar, pendingAttachments, composer, formatToolbar); host.append(root);
  let snapshot = null, sending = null, ownerUserId = '', notice = null, attachmentUploadBusy = false;
  const drafts = new Map(), composeModes = new Map(), attachmentDrafts = new Map(), retryDrafts = new Map();
  const rowNodes = new Map(), dividerNodes = new Map(), pinnedNodes = new Map();
  const avatarSignatures = new WeakMap();
  const emptyTimeline = node('div', 'hint botDmEmpty', 'Começa a conversa com este bot.');
  const emptyPins = node('div', 'hint', 'No pinned messages.');
  const avatarInto = (target, profile) => {
    const html = renderAvatar?.(profile) || '';
    const fallback=String(profile?.name || '?').slice(0,1);
    const signature=html || fallback;
    if (avatarSignatures.get(target) === signature) return;
    target.innerHTML=html; if (!target.childNodes.length) target.textContent=fallback;
    avatarSignatures.set(target,signature);
  };
  const capabilities = current => getCapabilities?.(current) || {
    emoji: !!onEmoji, gif: !!onGif, attach: !!onAttach, messageActions: !!onMessageAction || !!onMore, pins: !!onPins || !!getPinnedMessages,
  };
  function syncJump() {
    const visible = timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight > 80;
    jump.hidden = !visible;
    jump.classList.toggle('is-visible', visible);
    jump.setAttribute('aria-hidden', String(!visible));
  }
  function syncTools() {
    const caps = snapshot ? capabilities(snapshot) : {};
    for (const [el, capability, callback] of [[attach,'attach',onAttach],[gif,'gif',onGif],[emoji,'emoji',onEmoji]]) {
      el.hidden = !callback || caps[capability] !== true;
      el.disabled = input.disabled || !!sending || (capability === 'attach' && attachmentUploadBusy);
    }
    composerTools.hidden = gif.hidden && emoji.hidden;
    pins.hidden = (!onPins && !getPinnedMessages) || caps.pins !== true;
    pins.disabled = !!snapshot?.loading;
    if (pins.hidden) togglePins(false);
    privacy.hidden=!onPrivacy;
  }
  function syncSidePanels() {
    root.classList.toggle('sidepanel-open',!pinsPanel.hidden || !profilePanel.hidden);
    pins.classList.toggle('is-on',!pinsPanel.hidden);pins.setAttribute('aria-pressed',String(!pinsPanel.hidden));
    profile.classList.toggle('is-on',!profilePanel.hidden);profile.setAttribute('aria-pressed',String(!profilePanel.hidden));
  }
  function renderProfile() {
    if(!snapshot || profilePanel.hidden)return;
    const data=getProfile?.(snapshot) || snapshot;
    profileName.textContent=data.name || snapshot.name || 'Bot';
    const profileBadge=node('span','msg__botBadge','BOT');profileName.append(' ',profileBadge);
    profileHandle.textContent=String(data.handle || data.publicId || data.botPublicId || '');
    profileBio.textContent=String(data.bio || data.description || 'No bio yet.');
    profileContext.textContent=String(data.serverName || data.serverLabel || '') + (data.isPublic === true ? ' · Public bot' : '');
    const status=String(data.status || (data.online === true ? 'online' : data.online === false ? 'offline' : '')).toLowerCase();
    profileStatus.textContent=status;profileStatusDot.dataset.status=['online','idle','dnd','offline'].includes(status) ? status : 'offline';
    avatarInto(profileAvatar,data);
    const bannerHtml=renderProfileBanner?.(data,snapshot) || '';
    if(profileBanner._botBannerHtml !== bannerHtml){releaseMedia(profileBanner);profileBanner.innerHTML=bannerHtml;profileBanner._botBannerHtml=bannerHtml;}
    profileBanner.classList.toggle('has-banner-media',!!bannerHtml);profileBanner.classList.toggle('has-image',!!bannerHtml);
    if(/^#[0-9a-f]{6}$/i.test(data.bannerColor || ''))profileBanner.style.backgroundColor=data.bannerColor;else profileBanner.style.removeProperty('background-color');
    fullProfile.hidden=!onFullProfile && !onProfile;profileAvatar.disabled=fullProfile.hidden;
    if(onProfileRender)invokeAction(()=>onProfileRender(profilePanel,snapshot),snapshot);
  }
  function toggleProfile(open=profilePanel.hidden) {
    profilePanel.hidden=!snapshot || !open;profilePanel.classList.toggle('hidden',profilePanel.hidden);profilePanel.setAttribute('aria-hidden',String(profilePanel.hidden));
    if(!profilePanel.hidden){togglePins(false);renderProfile();}else {releaseMedia(profilePanel);avatarSignatures.delete(profileAvatar);profileBanner._botBannerHtml=null;}
    syncSidePanels();return !profilePanel.hidden;
  }
  function syncPrivacy() {
    if(!getPrivacyState && !onPrivacy)return;
    const data=getPrivacyState?.(snapshot) || {};
    // Artwork is supplied by the same trusted internal formatter as the native
    // header; labels and account-derived descriptions always remain text nodes.
    privacyBadge.hidden=!data.badgeText && !data.badgeHtml;privacyBadge.className='dmPrivacyBadge is-standard';
    privacyBadge.innerHTML=data.badgeHtml || '';if(!data.badgeHtml)privacyBadge.textContent=data.badgeText || '';
    const badgeTooltip=node('span','dmHeaderStatusTooltip',data.tooltip || data.title || data.label || 'Informações da conversa');
    badgeTooltip.setAttribute('role','tooltip');privacyBadge.append(badgeTooltip);privacyBadge.tabIndex=0;privacyBadge.setAttribute('role','img');
    privacyBadge.dataset.statusLabel=data.badgeText || data.label || '';privacyBadge.setAttribute('aria-label',badgeTooltip.textContent);privacyBadge.title=badgeTooltip.textContent;
    privacy.title=data.title || data.label || 'Informações da conversa';privacy.setAttribute('aria-label',data.label || privacy.title);
    privacy.classList.add('is-standard');
    const icon=privacy.querySelector('[data-native-dm-role="btnDmPrivacyIcon"]');if(icon){icon.innerHTML=data.iconHtml || '';if(!data.iconHtml)icon.textContent='↻';}
    const tooltip=privacy.querySelector('[data-native-dm-role="btnDmPrivacyTooltip"]');if(tooltip)tooltip.textContent=data.tooltip || privacy.title;
    for(const label of privacy.querySelectorAll('.sr-only'))label.textContent=data.label || privacy.title;
  }
  function getComposerContext() {
    if (!snapshot || root.hidden || input.disabled) return null;
    const mode = composeModes.get(snapshot.key);
    return {key:snapshot.key, userId:snapshot.userId, input, snapshot,
      replyToId: mode?.kind === 'reply' ? mode.row.id : null,
      editMessageId: mode?.kind === 'edit' ? mode.row.id : null,
      attachments: attachmentDrafts.get(snapshot.key) || [], attachmentUploadBusy};
  }
  function validOwner(owner = {}) {
    return snapshot && !root.hidden && (!owner.key || snapshot.key === owner.key) && (!owner.userId || snapshot.userId === owner.userId);
  }
  function showNotice(message, owner = {}) {
    if (!validOwner(owner)) return false;
    notice = {key:snapshot.key,userId:snapshot.userId,text:String(message || '').slice(0,500)};
    statusText.textContent = notice.text; status.hidden = !notice.text && retry.hidden; return true;
  }
  function invokeAction(callback, owner) {
    try {
      Promise.resolve(callback()).catch(() => showNotice('Não foi possível concluir a ação. Tenta novamente.',owner));
    } catch (_) { showNotice('Não foi possível concluir a ação. Tenta novamente.',owner); }
  }
  function syncInputSize() {
    mirror.innerHTML = snapshot && renderComposerPreview ? renderComposerPreview(input.value,snapshot) || '' : '';
    input.style.height = 'auto';
    const height = Math.min(184,Math.max(46,input.scrollHeight || 46));
    inputWrap.style.setProperty('--dmComposerInputHeight',`${height}px`); input.style.height = `${height}px`;
  }
  function setAttachmentUploadBusy(busy,owner = {}) {
    if (!validOwner(owner) || (busy && (input.disabled || capabilities(snapshot).attach !== true))) return false;
    attachmentUploadBusy=busy === true; send.disabled=input.disabled || !!sending || attachmentUploadBusy; syncTools(); return true;
  }
  function releaseMedia(container) {
    const media=[...(container?.matches?.('audio,video,img') ? [container] : []),...container?.querySelectorAll?.('audio,video,img') || []];
    for (const item of media) {
      if (item.matches('audio,video')) item.pause();
      item.removeAttribute('src'); item.removeAttribute('srcset');
      for (const source of item.querySelectorAll('source')) source.removeAttribute('src');
      if (item.matches('audio,video')) item.load();
    }
  }
  function clearTimeline() {
    releaseMedia(timeline); rowNodes.clear(); dividerNodes.clear(); timeline.replaceChildren();
  }
  function clearPins() {
    releaseMedia(pinsList); pinnedNodes.clear(); pinsList.replaceChildren();
  }
  function syncFormatToolbar() {
    const visible = !!(onFormat && snapshot && !root.hidden && !input.disabled && input.selectionEnd > input.selectionStart);
    formatToolbar.hidden = !visible; formatToolbar.setAttribute('aria-hidden',String(!visible));
    if (!visible) return;
    const rect=input.getBoundingClientRect();
    formatToolbar.style.left=`${Math.max(8,rect.left)}px`;
    formatToolbar.style.top=`${Math.max(8,rect.top-48)}px`;
  }
  function syncComposeMode() {
    const mode = snapshot && composeModes.get(snapshot.key);
    replyBar.hidden = !mode;
    if (mode) {
      const author = mode.row.sender === 'user' ? getOwnProfile?.()?.name || 'Tu' : snapshot.name || 'Bot';
      replyTitle.textContent = `${mode.kind === 'edit' ? 'A editar mensagem de' : 'A responder a'} ${author}`;
      replyPreview.textContent = messagePreview(mode.row,snapshot,180);
    }
    send.textContent = mode?.kind === 'edit' ? 'Save' : 'Send';
  }
  function messagePreview(row,current,limit,collapse = true) {
    const content=String(row?.content || '');
    const preview=String(getMessagePreview?.(content,row,current) ?? content);
    return (collapse ? preview.replace(/\s+/g,' ') : preview).slice(0,limit);
  }
  function cancelComposeMode({restore = true} = {}) {
    if (!snapshot) return false;
    const mode = composeModes.get(snapshot.key);
    if (restore && mode?.kind === 'edit') { input.value = mode.draftBefore; drafts.set(snapshot.key, input.value); }
    composeModes.delete(snapshot.key); syncComposeMode(); syncInputSize(); return true;
  }
  function beginReply(row, owner = {}) {
    if (!validOwner(owner) || input.disabled) return false;
    const current=snapshot.messages?.find(item => item.id === row?.id); if (!current || isDeleted(current)) return false;
    cancelComposeMode(); composeModes.set(snapshot.key, {kind:'reply',row:{...current}}); syncComposeMode(); input.focus(); return true;
  }
  function beginEdit(row, owner = {}) {
    if (!onEdit || !validOwner(owner) || input.disabled) return false;
    const current=snapshot.messages?.find(item => item.id === row?.id); if (current?.sender !== 'user' || isDeleted(current)) return false;
    cancelComposeMode(); composeModes.set(snapshot.key, {kind:'edit',row:{...current},draftBefore:input.value});
    input.value = String(current.content || ''); drafts.set(snapshot.key, input.value); syncComposeMode(); syncInputSize(); input.focus(); input.setSelectionRange(input.value.length,input.value.length); return true;
  }
  function syncAttachments() {
    const items = snapshot && attachmentDrafts.get(snapshot.key) || [];
    pendingAttachments.replaceChildren(); pendingAttachments.hidden = !items.length;
    const grid=node('div','dmPendingGrid');
    for (const [index,item] of items.entries()) {
      const chip = node('article', 'dmPendingCard dmPendingAttachment');
      const preview=node('div','dmPendingCard__preview'),icon=node('div','dmPendingCard__fileIcon');
      icon.setAttribute('aria-hidden','true');
      icon.innerHTML='<svg class="altaraIcon dmPendingSvgIcon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"></path><path d="M14 2v5h5"></path><path d="M9 13h6"></path><path d="M9 17h4"></path></svg>';
      preview.append(icon);
      const meta=node('div','dmPendingCard__meta'),name=node('div','dmPendingCard__name dmPendingAttachment__name',item.name || item.filename || `Ficheiro ${index + 1}`);
      name.title=name.textContent;meta.append(name);
      const size=Number(item.size ?? item.bytes);
      if (Number.isFinite(size) && size>0) meta.append(node('div','dmPendingCard__info',size<1024 ? `${Math.round(size)} B` : size<1048576 ? `${(size/1024).toFixed(1)} KB` : `${(size/1048576).toFixed(1)} MB`));
      chip.append(preview,meta);
      const remove = button('×', () => {
        if (!validOwner(owner) || sending) return;
        const current = attachmentDrafts.get(owner.key) || [];
        attachmentDrafts.set(owner.key,current.filter(candidate=>candidate !== item));syncAttachments();
      }, 'dmPendingCard__remove dmPendingAttachment__remove');
      const owner = {key:snapshot.key,userId:snapshot.userId};
      remove.setAttribute('aria-label', 'Remover ficheiro'); remove.disabled = !!sending;
      chip.append(remove);grid.append(chip);
    }
    if (items.length) pendingAttachments.append(grid);
  }
  function setAttachments(items, owner = {}) {
    if (!validOwner(owner) || input.disabled || capabilities(snapshot).attach !== true || !Array.isArray(items)) return false;
    attachmentDrafts.set(snapshot.key, items.map(item => ({...item}))); syncAttachments(); return true;
  }
  function renderPins() {
    if (!snapshot || pinsPanel.hidden) return;
    const rows = getPinnedMessages?.(snapshot) || [];
    const ownProfile=getOwnProfile?.() || {name:'Tu'},desiredNodes=[],liveRows=new Set();
    for (const row of rows) {
      if (!row?.id || isDeleted(row) || liveRows.has(row.id)) continue;
      liveRows.add(row.id);
      const inHistory=snapshot.messages?.some(item=>item.id === row.id);
      const rendered=!inHistory && renderMessageBody?.(row,snapshot);
      const textHtml=!inHistory && (renderMessageBody ? typeof rendered === 'object' && rendered ? rendered.html || '' : rendered || '' : renderText?.(row.content || ''));
      const textClass=rendered && typeof rendered === 'object' && rendered.className || 'msg__text msg__text--plain';
      const embeds=!inHistory && renderEmbeds?.(row),author=row.sender === 'user' ? ownProfile.name || 'Tu' : snapshot.name || 'Bot';
      const time=!inHistory && formatTimestamp?.(row.created_at) || '';
      const quickPreview=inHistory ? messagePreview(row,snapshot,240,false) : '';
      const signature=JSON.stringify([inHistory,row.sender,row.content,row.embeds,row.attachments,row.deleted_at,author,time,textHtml,textClass,embeds,quickPreview]);
      let cached=pinnedNodes.get(row.id);
      if (!cached || cached.signature !== signature) {
        const owner={key:snapshot.key,userId:snapshot.userId};
        const entry=inHistory ? button(quickPreview,()=>withCurrentRow(row,owner.key,owner.userId,()=>{
          const target=[...timeline.querySelectorAll('[data-bot-dm-message-id]')].find(el=>el.dataset.botDmMessageId === row.id);
          target?.scrollIntoView({block:'center'});
        }),'dmPinRow') : node('div','dmPinRow');
        let attachmentNodes=[];
        if (!inHistory) {
          const meta=node('div','msg__meta');meta.append(node('span','msg__name',author));
          if (row.sender !== 'user') meta.append(node('span','msg__botBadge','BOT'));
          if (time) meta.append(node('time','msg__time',time));
          const text=node('div',textClass);
          if (textHtml !== undefined) text.innerHTML=textHtml;else text.textContent=row.content || '';
          entry.append(meta,text);
          if (embeds) {const cards=node('div','botDmCards');cards.innerHTML=embeds;entry.append(cards);}
          const attachments=renderAttachments?.(row,snapshot);
          attachmentNodes=(Array.isArray(attachments) ? attachments : [attachments]).filter(content=>content?.nodeType);
          entry.append(...attachmentNodes);
        }
        cached={node:entry,signature,attachmentNodes,attachmentsEnabled:snapshot.enabled};pinnedNodes.set(row.id,cached);
      } else if (!inHistory && cached.attachmentsEnabled !== snapshot.enabled) {
        for (const content of cached.attachmentNodes) {releaseMedia(content);content.remove();}
        const attachments=renderAttachments?.(row,snapshot);
        cached.attachmentNodes=(Array.isArray(attachments) ? attachments : [attachments]).filter(content=>content?.nodeType);
        cached.node.append(...cached.attachmentNodes);cached.attachmentsEnabled=snapshot.enabled;
      }
      desiredNodes.push(cached.node);
    }
    if (!desiredNodes.length) desiredNodes.push(emptyPins);
    const desiredSet=new Set(desiredNodes);
    for (const child of [...pinsList.childNodes]) if (!desiredSet.has(child)) {releaseMedia(child);child.remove();}
    let cursor=pinsList.firstChild;
    for (const child of desiredNodes) {if(child === cursor)cursor=cursor.nextSibling;else pinsList.insertBefore(child,cursor);}
    for (const key of pinnedNodes.keys()) if (!liveRows.has(key)) pinnedNodes.delete(key);
  }
  function togglePins(open = pinsPanel.hidden) {
    const available = snapshot && capabilities(snapshot).pins === true && !!getPinnedMessages;
    pinsPanel.hidden = !available || !open; pinsPanel.classList.toggle('hidden',pinsPanel.hidden);
    pinsPanel.setAttribute('aria-hidden',String(pinsPanel.hidden));
    if (pinsPanel.hidden) clearPins(); else {toggleProfile(false);renderPins();}syncSidePanels();return !pinsPanel.hidden;
  }
  function insertText(value, owner = {}) {
    const current = getComposerContext();
    if (!current || (owner.key && current.key !== owner.key) || (owner.userId && current.userId !== owner.userId)) return false;
    const text = String(value ?? '');
    const start = Number.isFinite(input.selectionStart) ? input.selectionStart : input.value.length;
    const end = Number.isFinite(input.selectionEnd) ? input.selectionEnd : start;
    if (input.value.length - (end - start) + text.length > input.maxLength) return false;
    input.setRangeText(text, start, end, 'end');
    input.dispatchEvent(new doc.defaultView.Event('input', {bubbles:true})); input.focus();
    return true;
  }
  function withCurrentRow(row, key, userId, action) {
    if (!snapshot || root.hidden || snapshot.key !== key || snapshot.userId !== userId) return;
    const current = snapshot.messages?.find(item => item.id === row.id);
    if (current && !isDeleted(current)) invokeAction(() => action(current, snapshot),{key,userId});
  }
  const attachmentIdentity=items=>JSON.stringify(items.map(item=>item.uploadId || item.upload_id || item.id || item));
  function retainRetryDraft(operation) {
    if (sending === operation && operation.isSend && validOwner(operation) && operation.requestId &&
      snapshot.pending?.action === 'send' && snapshot.pending.requestId === operation.requestId) retryDrafts.set(operation.key,operation);
  }
  async function retryPending() {
    if (!snapshot?.retryable) return onRefresh?.();
    const owner={key:snapshot.key,userId:snapshot.userId},pending=snapshot.pending,submitted=retryDrafts.get(owner.key);
    const known=submitted?.userId === owner.userId && pending?.action === 'send' && pending.requestId === submitted.requestId;
    const accepted=await onRetry?.();
    if (accepted !== true || !known || !validOwner(owner) || retryDrafts.get(owner.key) !== submitted ||
      snapshot.pending && (snapshot.pending.action !== 'send' || snapshot.pending.requestId !== pending.requestId)) return accepted;
    retryDrafts.delete(owner.key);
    // A confirmed retry only consumes the exact original intent; a newer text,
    // file selection or reply mode remains the user's current draft.
    if (input.value === submitted.text && composeModes.get(owner.key) === submitted.mode &&
      attachmentIdentity(attachmentDrafts.get(owner.key) || []) === submitted.fileIds) {
      input.value='';drafts.delete(owner.key);composeModes.delete(owner.key);attachmentDrafts.delete(owner.key);
      syncComposeMode();syncAttachments();syncInputSize();
    }
    return accepted;
  }
  async function submit() {
    if (!snapshot || input.disabled || sending || attachmentUploadBusy) return;
    const mode = composeModes.get(snapshot.key), attachments = attachmentDrafts.get(snapshot.key) || [];
    if (!input.value.trim() && (!attachments.length || mode?.kind === 'edit')) return;
    if (attachments.length && capabilities(snapshot).attach !== true) return;
    const key = snapshot.key, userId = snapshot.userId, text = input.value;
    const operation = {key,userId,text,mode,fileIds:attachmentIdentity(attachments),isSend:mode?.kind !== 'edit'};
    sending = operation;send.disabled = true;syncTools();syncAttachments();
    try {
      const result = mode?.kind === 'edit'
        ? await onEdit(mode.row,text,snapshot)
        : await onSend(text,{replyToId:mode?.kind === 'reply' ? mode.row.id : null,attachments:attachments.map(item=>({...item}))},snapshot);
      if (result !== false && result != null && sending === operation && snapshot?.key === key && snapshot?.userId === userId) {
        retryDrafts.delete(key);
        if (input.value === text && composeModes.get(key) === mode) {input.value='';drafts.delete(key);syncInputSize();}
        if (composeModes.get(key) === mode) { composeModes.delete(key); syncComposeMode(); }
        if (attachmentDrafts.get(key) === attachments) { attachmentDrafts.delete(key); syncAttachments(); }
      } else retainRetryDraft(operation);
    } catch (_) {
      retainRetryDraft(operation);
      if (sending === operation && snapshot?.key === key && snapshot?.userId === userId) {
        statusText.textContent = 'Não foi possível enviar a mensagem. Tenta novamente.';
        status.hidden = false;
      }
    } finally {
      if (sending === operation) {
        sending = null;
        send.disabled = input.disabled || attachmentUploadBusy;
        syncTools(); syncAttachments();
      }
    }
  }
  composer.addEventListener('submit', event => { event.preventDefault(); void submit(); });
  input.addEventListener('keydown', event => {
    if(event.key === 'ArrowUp' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.isComposing && !input.value && !composeModes.get(snapshot?.key)) {
      const row=snapshot?.messages?.findLast(item=>item.sender === 'user' && !isDeleted(item) && (getMessageActions?.(item,snapshot) || []).some(action=>action.action === 'edit' && !action.disabled));
      if(row && beginEdit(row,snapshot)){event.preventDefault();return;}
    }
    const shortcut=(event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && ({b:'bold',i:'italic'})[event.key.toLowerCase()];
    if (shortcut && onFormat && !event.isComposing) {
      const current=getComposerContext();
      if (current) { event.preventDefault(); invokeAction(()=>onFormat(shortcut,current),current); }
      return;
    }
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault(); void submit();
  });
  input.addEventListener('input', () => { if (snapshot) drafts.set(snapshot.key, input.value); syncInputSize(); syncFormatToolbar(); });
  for (const event of ['select','keyup','pointerup']) input.addEventListener(event,syncFormatToolbar);
  const sendFiles=(files,source,event)=>{
    if(!files.length || !onFiles || !snapshot || input.disabled || attachmentUploadBusy || sending || capabilities(snapshot).attach !== true)return false;
    event.preventDefault();event.stopPropagation();invokeAction(()=>onFiles(files,snapshot,{source}),snapshot);return true;
  };
  input.addEventListener('paste',event=>sendFiles([...event.clipboardData?.files || []],'paste',event));
  root.addEventListener('dragover',event=>{if(onFiles && snapshot && !input.disabled && capabilities(snapshot).attach === true && [...event.dataTransfer?.types || []].includes('Files'))event.preventDefault();});
  root.addEventListener('drop',event=>{const files=[...event.dataTransfer?.files || []];if(files.length)event.preventDefault();sendFiles(files,'drop',event);});
  root.addEventListener('keydown',event=>{
    if(event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 's'){event.preventDefault();toggleProfile();}
    else if(event.key === 'Escape'){
      if(!profilePanel.hidden){event.preventDefault();toggleProfile(false);}
      else if(!pinsPanel.hidden){event.preventDefault();togglePins(false);}
      else if(composeModes.get(snapshot?.key)){event.preventDefault();cancelComposeMode();}
    }
  });
  root.addEventListener('pointerdown',event=>{if(event.target !== input && !formatToolbar.contains(event.target))formatToolbar.hidden=true;});
  timeline.addEventListener('scroll', syncJump, {passive:true});
  function createActionStrip(row, owner, availableActions, moreAvailable) {
    const strip=node('div','msg__actions'),base=node('div','msg__actionsRow msg__actionsRow--base'),shift=node('div','msg__actionsRow msg__actionsRow--shift');
    for(const emoji of owner.quickReactions || []) {
      if(typeof emoji !== 'string' || !emoji || emoji.length>32)continue;
      const control=button(emoji,()=>withCurrentRow(row,owner.key,owner.userId,(current,active)=>{
        if(active.enabled && !active.busy && !active.pending && capabilities(active).messageActions === true) return onMessageAction?.('reaction',current,active,control,{emoji,enabled:!(getReactions?.(current,active) || []).some(item=>item.emoji === emoji && item.enabled)});
      }),'msgActionBtn');control.title='Reagir';control.setAttribute('aria-label',`Reagir com ${emoji}`);control.dataset.botDmQuickReaction=emoji;base.append(control);
    }
    for (const [index,item] of availableActions.entries()) {
      if (!item?.action || !item.label) continue;
      const control=button(item.icon || item.label,()=>withCurrentRow(row,owner.key,owner.userId,(current,active)=>{
        if (!active.busy && !active.pending && capabilities(active).messageActions === true) return onMessageAction?.(item.action,current,active,control);
      }),`msgActionBtn${item.danger ? ' msgActionBtn--danger' : ''}`);
      // The picker opens during this click; do not let the same event dismiss
      // it through the document's outside-click handler.
      if (item.action === 'react') control.addEventListener('click',event=>event.stopPropagation());
      control.title=item.label;control.setAttribute('aria-label',item.label);control.dataset.botDmActionIndex=index;
      if(item.action === 'pin' && row.is_pinned)control.classList.add('is-on');
      (['edit','pin','delete'].includes(item.action) ? shift : base).append(control);
    }
    if (moreAvailable) {
      for(const actionRow of [base,shift]) {
        const control=button('…',()=>withCurrentRow(row,owner.key,owner.userId,(current,active)=>{
          if (!active.busy && !active.pending && capabilities(active).messageActions === true) return onMore(current,active,control,null);
        }),'msgActionBtn');
        control.title='More Actions';control.setAttribute('aria-label','Mais ações da mensagem');control.dataset.botDmMore='1';actionRow.append(control);
      }
    }
    if(!base.children.length && !shift.children.length)return null;
    strip.append(base,shift);return strip;
  }
  function createReactions(row, owner, items) {
    const reactions=node('div','msg__reactions');
    for (const reaction of items) {
      const count=Number(reaction.count);
      if (!reaction.emoji || !Number.isFinite(count) || count<1) continue;
      const chip=button('',()=>withCurrentRow(row,owner.key,owner.userId,(current,active)=>{
        if (active.enabled && capabilities(active).messageActions === true) return onMessageAction?.('reaction',current,active,chip,{emoji:reaction.emoji,enabled:!reaction.enabled});
      }),`msg__reaction${reaction.enabled ? ' is-on' : ''}`);
      chip.append(node('span','',reaction.emoji),node('span','',String(count)));
      chip.setAttribute('aria-label',`${reaction.emoji}, ${count}`); chip.setAttribute('aria-pressed',String(!!reaction.enabled)); reactions.append(chip);
    }
    return reactions;
  }
  function syncRowState(cached,row,next,availableActions,reactionItems) {
    const enabled=capabilities(next).messageActions === true;
    const moreAvailable=!!onMore && enabled;
    const quickReactions=enabled && next.enabled && availableActions.some(item=>item.action === 'react') ? getQuickReactions?.(next) || [] : [];
    const actionSignature=JSON.stringify([moreAvailable,quickReactions,availableActions.map(item=>[item.action,item.label,item.icon,item.danger])]);
    const body=cached.node.querySelector('.msg__body');
    if (cached.attachmentsEnabled !== next.enabled) {
      for (const content of cached.attachmentNodes || []) {releaseMedia(content);content.remove();}
      const rendered=renderAttachments?.(row,next);
      cached.attachmentNodes=(Array.isArray(rendered) ? rendered : [rendered]).filter(content=>content?.nodeType);
      for(const content of cached.attachmentNodes)cached.contentNode.append(content);
      cached.attachmentsEnabled=next.enabled;
    }
    if (cached.actionSignature !== actionSignature) {
      const strip=createActionStrip(row,{...next,quickReactions},availableActions,moreAvailable);
      cached.strip?.remove(); cached.strip=strip; cached.actionSignature=actionSignature;
      if (strip) body.prepend(strip);
    }
    for (const control of cached.strip?.querySelectorAll('button') || []) {
      const item=availableActions[Number(control.dataset.botDmActionIndex)];
      control.disabled=!enabled || !!next.busy || !!next.pending || item?.disabled === true;
    }
    const reactionSignature=JSON.stringify(reactionItems);
    if (cached.reactionSignature !== reactionSignature) {
      const reactions=createReactions(row,next,reactionItems);
      if (cached.reactions) cached.reactions.replaceWith(reactions); else body.append(reactions);
      cached.reactions=reactions; cached.reactionSignature=reactionSignature;
    }
    for (const chip of cached.reactions?.children || []) chip.disabled=!next.enabled || !onMessageAction || !enabled || !!next.busy || !!next.pending;
    const meta=body.querySelector('.msg__meta');
    if (meta) for (const [selector,visible,label,title] of [['msg__edited',!!row.edited_at,'(editado)',''],['msg__pin',!!row.is_pinned,'📌','Mensagem afixada']]) {
      let mark=meta.querySelector(`.${selector}`);
      if (!visible) mark?.remove();
      else if (!mark) {mark=node('span',selector,label);if(title)mark.title=title;meta.append(mark);}
    }
  }
  function update(next) {
    if (!next) { close(); return; }
    if (ownerUserId !== next.userId) { close(); drafts.clear(); composeModes.clear(); attachmentDrafts.clear(); retryDrafts.clear(); ownerUserId = next.userId; }
    if (snapshot?.key !== next.key) {
      if (snapshot) drafts.set(snapshot.key, input.value);
      input.value = drafts.get(next.key) || ''; sending = null; notice = null; attachmentUploadBusy=false; togglePins(false);toggleProfile(false);
      clearTimeline();
    }
    snapshot = next;
    const mode=composeModes.get(next.key);
    if(mode && next.messages?.some(row=>row.id === mode.row.id && isDeleted(row))) {
      // A deleted target ends reply/edit mode, while text being composed remains
      // the user's draft. Canonical revision ordering stays in the controller.
      drafts.set(next.key,input.value);cancelComposeMode({restore:false});
    }
    if (sending?.isSend && sending.key === next.key && sending.userId === next.userId && !sending.requestId && next.pending?.action === 'send') sending.requestId=next.pending.requestId;
    root.hidden = false;
    title.textContent = next.name || 'Bot';
    avatar.setAttribute('aria-label', next.name || 'Bot');
    avatarInto(avatar, next);
    consentBar.hidden = next.enabled;
    consent.disabled = !!next.busy || !!next.loading;
    const locked = !next.enabled || !!next.pending || !!next.loading || (!!next.error && !next.retryable);
    input.disabled = locked; send.disabled = locked || sending || attachmentUploadBusy;
    syncTools();syncPrivacy();syncComposeMode();syncAttachments();renderPins();renderProfile();syncInputSize();syncFormatToolbar();
    statusText.textContent = next.error || notice?.text || (next.loading && !next.messages?.length ? 'A carregar mensagens…' : '');
    retry.hidden = !next.retryable && !(next.error && !next.pending && onRefresh); retry.disabled = !!next.loading;
    status.hidden = !statusText.textContent && retry.hidden;
    const originalRows=Array.isArray(next.messages) ? next.messages : [];
    const originals = new Map(originalRows.map(row=>[row.id,row]));
    const messages = originalRows.filter(row=>!isDeleted(row));
    const ownProfile = getOwnProfile?.() || {name:'Tu'};
    const dates = messages.map(row => {
      const date = new Date(row.created_at);
      return Number.isFinite(date.valueOf()) ? {
        date, label:formatTimestamp?.(row.created_at) || date.toLocaleString('pt-PT', {dateStyle:'short',timeStyle:'short'}),
        day:getDayKey?.(row.created_at) || date.toDateString(), divider:renderDayDivider?.(row.created_at) || '',
      } : {label:'',divider:''};
    });
    // Profile hydration and display preferences may change without a new message.
    const activeCapabilities = capabilities(next);
    const messageActions = messages.map(row => activeCapabilities.messageActions === true && onMessageAction ? getMessageActions?.(row,next) || [] : []);
    const messageReactions = messages.map(row => getReactions?.(row,next) || []);
    const stickToBottom = timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight < 80 || !timeline.children.length;
    const desiredNodes=[], liveRows=new Set(), liveDividers=new Set(), dayOccurrences=new Map();
    let previousDay;
    for (const [index,row] of messages.entries()) {
      const date = dates[index];
      if (date.divider && date.day !== previousDay) {
        const occurrence=dayOccurrences.get(date.day) || 0; dayOccurrences.set(date.day,occurrence+1);
        const dividerKey=`${date.day}:${occurrence}`; liveDividers.add(dividerKey);
        let cached=dividerNodes.get(dividerKey);
        if (!cached || cached.html !== date.divider) {
          const divider=doc.createElement('template'); divider.innerHTML=date.divider;
          cached={html:date.divider,nodes:[...divider.content.childNodes]}; dividerNodes.set(dividerKey,cached);
        }
        desiredNodes.push(...cached.nodes); previousDay=date.day;
      }
      const own = row.sender === 'user';
      const profile = own ? ownProfile : next;
      const compact = !!(index && !row.reply_to_id && canStack?.(messages[index - 1], row));
      const nameAttrs=renderNameAttrs?.(profile,row);
      const preview=row.reply_preview;
      const original=row.reply_to_id ? originals.get(row.reply_to_id)
        || (preview?.id === row.reply_to_id && ['user','bot'].includes(preview.sender) && typeof preview.content === 'string' ? preview : null) : null;
      const originalPreview=original ? messagePreview(original,next,160) : '';
      const rendered=renderMessageBody?.(row,next);
      const textHtml=renderMessageBody ? typeof rendered === 'object' && rendered ? rendered.html || '' : rendered || '' : renderText?.(row.content || '');
      const textClass=rendered && typeof rendered === 'object' && rendered.className || 'msg__text msg__text--plain';
      const embeds=renderEmbeds?.(row);
      const rowSignature=JSON.stringify([row.sender,row.created_at,row.content,row.embeds,row.attachments,row.deleted_at,row.reply_to_id,
        original ? [original.id,original.sender,original.content,isDeleted(original),original.sender === 'user' ? ownProfile.name : next.name,originalPreview] : null,compact,
        profile.name,profile.avatarUrl,nameAttrs,date.label,textHtml,textClass,embeds]);
      liveRows.add(row.id);
      let cached=rowNodes.get(row.id);
      if (cached?.signature === rowSignature) {
        syncRowState(cached,row,next,messageActions[index],messageReactions[index]); desiredNodes.push(cached.node); continue;
      }
      const messageClasses=`msg${own ? ' msg--me' : ' msg--bot'}${compact ? ' msg--compact' : ''}`;
      const avatarColumn = node('div', `msg__avatarCol${compact ? ' msg__avatarCol--compact' : ''}`);
      if (compact) avatarColumn.setAttribute('aria-hidden', 'true');
      else {
        const picture = node(onSenderProfile ? 'button' : 'div', `msg__avatar${onSenderProfile ? ' msg__avatarBtn' : ''}${own ? '' : ' msg__avatar--bot'}`);
        avatarInto(picture, profile);
        if (onSenderProfile) {
          picture.type = 'button'; picture.setAttribute('aria-label', `Ver perfil de ${profile.name || 'Bot'}`);
          picture.addEventListener('click', () => withCurrentRow(row, next.key, next.userId, (current, active) => onSenderProfile(current.sender === 'user' ? getOwnProfile?.() || {name:'Tu'} : active, current, active, picture)));
        }
        avatarColumn.append(picture);
      }
      const meta = node('div', 'msg__meta');
      const name = node(onSenderProfile ? 'button' : 'span', `msg__name${onSenderProfile ? ' msg__nameBtn' : ''}${own ? '' : ' msg__name--bot'}`, profile.name || (own ? 'Tu' : 'Bot'));
      if (nameAttrs?.className) name.className += ` ${nameAttrs.className}`;
      if (nameAttrs?.style) name.setAttribute('style', nameAttrs.style);
      if (onSenderProfile) {
        name.type = 'button';
        name.addEventListener('click', () => withCurrentRow(row, next.key, next.userId, (current, active) => onSenderProfile(current.sender === 'user' ? getOwnProfile?.() || {name:'Tu'} : active, current, active, name)));
      }
      meta.append(name);
      if (!own) meta.append(node('span', 'msg__botBadge', 'BOT'));
      const time = node('time', 'msg__time', date.label);
      if (date.date) time.dateTime = date.date.toISOString();
      meta.append(time);
      const text = node('div',textClass);
      if (textHtml !== undefined) text.innerHTML=textHtml; else text.textContent=row.content || '';
      let reference=null;
      if (row.reply_to_id) {
        const available=original && !isDeleted(original);
        const inHistory=available && messages.some(item=>item.id === original.id);
        reference = inHistory
          ? button('',()=>withCurrentRow(original,next.key,next.userId,()=>{
            const target=[...timeline.querySelectorAll('[data-bot-dm-message-id]')].find(el=>el.dataset.botDmMessageId === original.id);
            target?.scrollIntoView({block:'center'});
          }),'msg__replyRef')
          : node('div',`msg__replyRef${available ? '' : ' msg__replyRef--unavailable'}`);
        if (!inHistory) reference.setAttribute('role','note');
        reference.append(node('span','msg__replyName',available ? original.sender === 'user' ? ownProfile.name || 'Tu' : next.name || 'Bot' : 'Message'),
          node('span','msg__replyText',available ? originalPreview : 'Message unavailable.'));
      }
      if(embeds){const cards=node('div','botDmCards');cards.innerHTML=embeds;text.append(cards);}
      const template=doc.createElement('template');
      template.innerHTML=renderDirectMessageFrame({classes:esc(messageClasses),attributes:`data-bot-dm-message-id="${esc(row.id)}"`,
        avatarColumnHtml:avatarColumn.outerHTML,metaHtml:compact ? '' : meta.outerHTML,replyHtml:reference?.outerHTML || '',bodyClass:esc(textClass),bodyHtml:text.innerHTML});
      const message=template.content.firstElementChild,body=message.querySelector('.msg__body');
      message.querySelector('.msg__avatarCol').replaceWith(avatarColumn);
      if(!compact)body.querySelector('.msg__meta').replaceWith(meta);
      if(reference)body.querySelector('.msg__replyRef').replaceWith(reference);
      body.querySelector(`.${textClass.split(/\s+/)[0]}`).replaceWith(text);
      if (onMore) message.addEventListener('contextmenu',event=>{
        event.preventDefault(); event.stopPropagation();
        withCurrentRow(row,next.key,next.userId,(current,active)=>{
          if (!active.busy && !active.pending && capabilities(active).messageActions === true) return onMore(current,active,message,{clientX:event.clientX,clientY:event.clientY});
        });
      });
      const attachmentsBody = renderAttachments?.(row, next);
      const attachmentNodes=(Array.isArray(attachmentsBody) ? attachmentsBody : [attachmentsBody]).filter(content=>content?.nodeType);
      for(const content of attachmentNodes)text.append(content);
      cached={node:message,signature:rowSignature,contentNode:text,attachmentNodes,attachmentsEnabled:next.enabled,reactions:body.querySelector('.msg__reactions')};rowNodes.set(row.id,cached);
      syncRowState(cached,row,next,messageActions[index],messageReactions[index]); desiredNodes.push(message);
    }
    if (!messages.length) desiredNodes.push(emptyTimeline);
    const desiredSet=new Set(desiredNodes);
    // Remove only obsolete nodes before insertion so unchanged media never has
    // to be detached merely because a preceding row changed or was removed.
    for (const child of [...timeline.childNodes]) if (!desiredSet.has(child)) {releaseMedia(child);child.remove();}
    let cursor=timeline.firstChild;
    for (const child of desiredNodes) {
      if (child === cursor) cursor=cursor.nextSibling;
      else timeline.insertBefore(child,cursor);
    }
    for (const key of rowNodes.keys()) if (!liveRows.has(key)) rowNodes.delete(key);
    for (const key of dividerNodes.keys()) if (!liveDividers.has(key)) dividerNodes.delete(key);
    if (stickToBottom) timeline.scrollTop = timeline.scrollHeight;
    syncJump();
  }
  function close() {
    if (snapshot) drafts.set(snapshot.key, input.value);
    snapshot = null; sending = null; notice = null; attachmentUploadBusy=false; root.hidden = true; input.value = '';
    clearTimeline();syncTools();syncJump();syncComposeMode();syncAttachments();togglePins(false);toggleProfile(false);syncFormatToolbar();
  }
  return {root, update, close, getComposerContext, insertText, beginReply, setReply:beginReply, beginEdit, cancelComposeMode, setAttachments, setAttachmentUploadBusy, togglePins, toggleProfile, showNotice,
    focus:() => input.focus(), reset:() => { close(); drafts.clear(); composeModes.clear(); attachmentDrafts.clear(); retryDrafts.clear(); ownerUserId = ''; }};
}
