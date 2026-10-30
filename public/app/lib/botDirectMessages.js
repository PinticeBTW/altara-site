const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMPONENT_PROJECTION = Symbol('botDmComponentProjection');
const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
const keyFor = (serverId, botId) => `bot-dm:${serverId}:${botId}`;
const validKey = key => /^bot-dm:[0-9a-f-]{36}:[0-9a-f-]{36}$/i.test(key || '')
  && key.split(':').slice(1).every(value => UUID.test(value));
const cursorFor = row => ({at:row.created_at, id:row.id});
// PostgreSQL timestamps retain microseconds. Date.parse supplies milliseconds;
// compare the remaining digits only when those are equal, including old 3-digit
// read cursors and timestamps expressed with a UTC offset.
const timestampCompare = (a,b) => Date.parse(a)-Date.parse(b)
  || Number((/\.(\d+)/.exec(a)?.[1] || '').padEnd(6,'0').slice(3,6))
    - Number((/\.(\d+)/.exec(b)?.[1] || '').padEnd(6,'0').slice(3,6));
const after = (row, cursor) => !cursor || row.id !== cursor.id && (timestampCompare(row.created_at,cursor.at) > 0
  || timestampCompare(row.created_at,cursor.at) === 0 && row.id > cursor.id);
const compare = (a, b) => timestampCompare(a.created_at,b.created_at) || a.id.localeCompare(b.id);
const errorText = error => {
  const code = `${error?.code || ''} ${error?.message || ''}`;
  if (/consent_required/.test(code)) return 'Permite as mensagens privadas para falar com este bot.';
  if (/surface_access_denied|permission|bot_not_installed/.test(code)) return 'Já não podes enviar mensagens a este bot.';
  if (/PGRST202|42883|schema cache|does not exist/.test(code)) return 'As mensagens privadas dos bots ainda não estão disponíveis.';
  if (/rate_limited|quota_exceeded/.test(code)) return 'Chegaste ao limite de mensagens. Espera um pouco.';
  if (/not_authenticated|JWT/.test(code)) return 'A tua sessão terminou. Volta a iniciar sessão.';
  return 'Não foi possível confirmar a ação. Tenta novamente.';
};
const definitive = error => /consent_required|surface_access_denied|permission|bot_not_installed|request_conflict|invalid_|message_not_found|not_message_author|PGRST202|42883/.test(`${error?.code || ''} ${error?.message || ''}`);

// These are separate bot conversations. No human conversation IDs, encryption
// state, profiles, friends, call permissions or message mutations are reused.
export function createBotDirectMessages({supabase, getContext, getActiveKey = () => '', onActiveChange = () => {}, onInboxChange = () => {}, onIncoming = () => {}, getProfile = async () => ({}), getReadCursorStorage = () => globalThis.localStorage} = {}) {
  if (!supabase?.rpc || !supabase?.from || typeof getContext !== 'function') throw new TypeError('invalid_bot_dm_client');
  let userId = '', generation = 0, openGeneration = 0, activeKey = '', channel = null, retentionChannel = null;
  let inboxFlight = null, inboxQueued = false, hydrated = false, eventVersion = 0;
  let inboxRichColumns;
  let inboxSignature = '[]';
  let authUserId, authSubscription, lifecycleBound = false;
  const emptyRetention=()=>({supported:false,loaded:false,loading:false,pending:false,error:'',days:0,revision:0,updatedAt:null,readFlight:null,writeFlight:null,operation:null,version:0});
  let retention=emptyRetention();
  const entries = new Map(), rows = new Map(), cursors = new Map(), pending = new Map(), consentStates = new Map();
  const timelines = new Map(), histories = new Map(), historicalOnly = new Set();
  const exactUnread = new Map(), hiddenInbox = new Map();
  const seenIncoming = new Set(), controllers = new Set(), eventRows = new Map(), profiles = new Map(), capabilityFlights = new Map();
  const user = () => text(getContext()?.userId, 36).toLowerCase();
  const current = owner => owner === generation && UUID.test(userId) && user() === userId && (authUserId === undefined || authUserId === userId);
  const storageKey = () => `altara.botDmRead.v1:${userId}`;
  const hiddenStorageKey = () => `altara.botDmHidden.v1:${userId}`;
  const visible = key => getActiveKey() === key && (!globalThis.document || globalThis.document.visibilityState !== 'hidden' && globalThis.document.hasFocus?.() !== false);
  const notifyInbox = () => {
    if (!current(generation)) return;
    const snapshot = getVisibleRows(), signature = JSON.stringify(snapshot);
    if (signature === inboxSignature) return;
    inboxSignature = signature;onInboxChange(snapshot);
  };

  function loadCursors() {
    try {
      const saved = JSON.parse(getReadCursorStorage()?.getItem(storageKey()) || '{}');
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return;
      for (const [key, cursor] of Object.entries(saved).slice(0, 500)) {
        if (!validKey(key) || !UUID.test(cursor?.id) || !Number.isFinite(Date.parse(cursor?.at)) || Date.parse(cursor.at) > Date.now() + 300000) continue;
        const previous = cursors.get(key);
        if (!previous || after({created_at:cursor.at,id:cursor.id}, previous)) cursors.set(key, {at:cursor.at,id:cursor.id});
      }
    } catch (_) {}
  }
  function persistCursors() {
    try { getReadCursorStorage()?.setItem(storageKey(), JSON.stringify(Object.fromEntries(cursors))); } catch (_) {}
  }
  function loadHiddenInbox() {
    hiddenInbox.clear();
    try {
      const raw = getReadCursorStorage()?.getItem(hiddenStorageKey()) || '{}';
      if (typeof raw !== 'string' || raw.length > 256000) return;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return;
      for (const [key, cursor] of Object.entries(saved).slice(-500)) {
        if (!validKey(key) || typeof cursor?.at !== 'string' || cursor.at.length > 64 || !UUID.test(cursor?.id || '')
          || !Number.isFinite(Date.parse(cursor.at)) || Date.parse(cursor.at) > Date.now() + 300000) continue;
        hiddenInbox.set(key.toLowerCase(), {at:cursor.at,id:cursor.id.toLowerCase()});
      }
    } catch (_) {}
  }
  function persistHiddenInbox() {
    try { getReadCursorStorage()?.setItem(hiddenStorageKey(), JSON.stringify(Object.fromEntries(hiddenInbox))); } catch (_) {}
  }
  function restoreHiddenInbox(key) {
    if (!hiddenInbox.delete(key)) return false;
    persistHiddenInbox();return true;
  }
  function hideFromInbox(key) {
    if (typeof key !== 'string' || !validKey(key) || !ensureAccount()) return false;
    const ownKey = key.toLowerCase();
    if (!entries.has(ownKey)) return false;
    const latest = cachedRowsFor(ownKey).at(-1);
    // An unopened consent can have no cached history. Keep earlier hydration
    // hidden; only a message created after closing can restore that row.
    const cursor = latest ? cursorFor(latest) : {at:new Date().toISOString(),id:'ffffffff-ffff-ffff-ffff-ffffffffffff'};
    hiddenInbox.delete(ownKey);hiddenInbox.set(ownKey,cursor);
    while (hiddenInbox.size > 500) hiddenInbox.delete(hiddenInbox.keys().next().value);
    persistHiddenInbox();notifyInbox();return true;
  }
  function entryFor(seed) {
    if (!UUID.test(seed?.botId || '') || !UUID.test(seed?.serverId || '')) throw new Error('invalid_bot_dm_context');
    const key = keyFor(seed.serverId.toLowerCase(), seed.botId.toLowerCase());
    let entry = entries.get(key);
    if (!entry) { entry = {key,botId:seed.botId.toLowerCase(),serverId:seed.serverId.toLowerCase(),name:'Bot',avatarUrl:'',serverName:'',enabled:false,lastMessageAt:0,unreadCount:0}; entries.set(key,entry); }
    for (const [field,limit] of [['name',100],['avatarUrl',2048],['serverName',100],['bannerUrl',2048],['description',2000],['publicId',100],['appId',100],['presenceStatus',16]]) {
      if (typeof seed[field] === 'string') entry[field] = text(seed[field],limit);
    }
    if(typeof seed.isPublic === 'boolean')entry.isPublic=seed.isPublic;
    return entry;
  }
  function consentState(entry) {
    let state = consentStates.get(entry.key);
    if (!state) { state = {version:0,readRevision:0,revocationPending:false,revocationOperation:null,executions:new Set(),latestExecution:null}; consentStates.set(entry.key,state); }
    return state;
  }
  function recordConsent(entry, enabled, {revocationPending=false} = {}) {
    const state = consentState(entry);
    state.version++;state.revocationPending=revocationPending;entry.enabled=enabled===true;
    eventVersion++;
    eventRows.set(entry.key,{version:eventVersion,consent:{bot_id:entry.botId,server_id:entry.serverId,enabled:entry.enabled}});
    invalidateOlder(entry.key);
  }
  function normalizeRow(row) {
    if (!row || row.user_id !== userId || !UUID.test(row.id || '') || !UUID.test(row.bot_id || '') || !UUID.test(row.server_id || '')
      || !['user','bot'].includes(row.sender) || typeof row.content !== 'string' || row.content.length > 2000
      || typeof row.created_at !== 'string' || row.created_at.length > 64 || !Number.isFinite(Date.parse(row.created_at))) return null;
    let embeds = [];
    try { if (Array.isArray(row.embeds) && row.embeds.length <= 10) { const json = JSON.stringify(row.embeds); if (json.length <= 100000) embeds = JSON.parse(json); } } catch (_) {}
    let components=[];
    const componentSource=Array.isArray(row.metadata?.components)?row.metadata:row;
    try { if (row.sender==='bot'&&Array.isArray(componentSource.components)&&componentSource.components.length<=5&&JSON.stringify(componentSource.components).length<=32768) components=structuredClone(componentSource.components); } catch (_) {}
    const timestamp = value => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
    const reactions = Array.isArray(row.reactions) ? row.reactions.slice(0, 30).filter(item => typeof item?.emoji === 'string' && item.emoji.length <= 32 && Number.isInteger(item.count) && item.count > 0).map(item => ({emoji:item.emoji,count:item.count,me:item.user === true || item.mine === true || item.me === true})) : [];
    return {[COMPONENT_PROJECTION]:row[COMPONENT_PROJECTION] ?? (Object.hasOwn(row,'components') || Object.hasOwn(row.metadata || {},'components')),
      id:row.id.toLowerCase(),bot_id:row.bot_id.toLowerCase(),server_id:row.server_id.toLowerCase(),user_id:userId,sender:row.sender,content:row.content,embeds,request_id:UUID.test(row.request_id || '') ? row.request_id.toLowerCase() : '',created_at:row.created_at,
      revision:Number.isSafeInteger(row.revision) && row.revision >= 0 ? row.revision : 0,
      reply_to_id:UUID.test(row.reply_to_id || '') ? row.reply_to_id.toLowerCase() : null,
      reply_preview:row.reply_preview && row.reply_preview.id === row.reply_to_id && ['user','bot'].includes(row.reply_preview.sender) && typeof row.reply_preview.content === 'string'
        ? {id:row.reply_preview.id,sender:row.reply_preview.sender,content:text(row.reply_preview.content,2000),deleted:row.reply_preview.deleted === true} : null,
      edited_at:timestamp(row.edited_at),deleted_at:timestamp(row.deleted_at),is_pinned:row.is_pinned === true,pinned_at:timestamp(row.pinned_at),reactions,
      attachments:Array.isArray(row.attachments) ? row.attachments.slice(0,10) : [],components,
      components_revision:UUID.test(componentSource.components_revision||'')?componentSource.components_revision.toLowerCase():null,
      components_expires_at:timestamp(componentSource.components_expires_at)};
  }
  function cachedRowsFor(key) { return [...rows.values()].filter(row=>keyFor(row.server_id,row.bot_id)===key).sort(compare); }
  function rowsFor(key) { const ids=timelines.get(key);return cachedRowsFor(key).filter(row=>ids?.has(row.id)); }
  function historyFor(key) {
    let history=histories.get(key);
    if(!history){history={ready:false,hasMore:false,cursor:null,loading:false,error:'',version:0,flight:null};histories.set(key,history);}
    return history;
  }
  function invalidateOlder(key) {
    const history=histories.get(key);if(!history)return;
    history.version++;history.loading=false;history.flight=null;history.error='';
  }
  function seedTimeline(entry) {
    if(!timelines.has(entry.key))timelines.set(entry.key,new Set(cachedRowsFor(entry.key).slice(-50).map(row=>row.id)));
  }
  function normalizeHistoryPage(entry,data,paginated=false) {
    if(!Array.isArray(data.messages)||data.messages.length>50)throw new Error('bot_dm_response_invalid');
    const messages=data.messages.map(normalizeRow);
    if(messages.some(row=>!row||keyFor(row.server_id,row.bot_id)!==entry.key))throw new Error('bot_dm_response_invalid');
    let cursor=null;
    if(paginated){
      if(typeof data.has_more!=='boolean')throw new Error('bot_dm_response_invalid');
      if(data.has_more){
        const value=data.next_cursor,oldest=messages.slice().sort(compare)[0];
        if(!oldest||!UUID.test(value?.id||'')||typeof value.created_at!=='string'||value.created_at.length>64
          ||!Number.isFinite(Date.parse(value.created_at))||value.id!==oldest.id||timestampCompare(value.created_at,oldest.created_at)!==0)throw new Error('bot_dm_response_invalid');
        cursor={created_at:value.created_at,id:value.id};
      }
    }
    return {messages,cursor,hasMore:paginated&&data.has_more===true};
  }
  function refreshCounts() {
    for (const entry of entries.values()) {
      const messages = [...rows.values()].filter(row => keyFor(row.server_id,row.bot_id) === entry.key);
      entry.lastMessageAt = Math.max(entry.lastMessageAt || 0, ...messages.map(row => Date.parse(row.created_at)), 0);
      const unread = messages.filter(row => row.sender === 'bot' && !row.deleted_at && !historicalOnly.has(row.id) && after(row, cursors.get(entry.key)));
      const exact = exactUnread.get(entry.key);
      entry.unreadCount = exact && exact.cursor === JSON.stringify(cursors.get(entry.key) || null)
        ? exact.count + unread.filter(row => after(row, exact.through)).length
        : unread.length;
    }
  }
  function activeSnapshot() {
    const entry = entries.get(activeKey);
    if (!entry || !current(generation)) return null;
    const operation = consentState(entry).revocationOperation || pending.get(activeKey);
    const quoteSafe=row=>{
      const parent=rows.get(row.reply_to_id);
      return parent?.deleted_at && keyFor(parent.server_id,parent.bot_id)===activeKey
        ? {...row,reply_preview:{id:parent.id,sender:parent.sender,content:'',deleted:true}} : row;
    },messages=rowsFor(activeKey).map(quoteSafe),pinnedIds=new Set([...(entry.pinnedIds || []),...messages.filter(row=>row.is_pinned).map(row=>row.id)]);
    const history=historyFor(activeKey),historyPagination=entry.capabilities?.history_pagination===true&&history.ready;
    return {...entry,userId,messages,pinnedMessages:[...pinnedIds].map(id => rows.get(id)).filter(row => row?.is_pinned && !row.deleted_at).map(quoteSafe),retention:retentionSnapshot(),historyPagination,hasMoreBefore:historyPagination&&history.hasMore,loadingOlder:history.loading,olderError:history.error,pending:operation ? {action:operation.action,requestId:operation.extra.p_request_id || null} : null,loading:entry.loading === true,busy:entry.busy === true,error:entry.error || entry.actionError || '',retryable:!!operation && !entry.busy && (!operation.messageApi && operation.action !== 'send' || entry.enabled)};
  }
  function publishActive() { if (activeKey && current(generation)) onActiveChange(activeSnapshot()); }
  function getRows() { return current(generation) ? [...entries.values()].map(({key,botId,serverId,name,avatarUrl,serverName,enabled,lastMessageAt,unreadCount}) => ({key,botId,serverId,name,avatarUrl,serverName,enabled,lastMessageAt,unreadCount})).sort((a,b) => b.lastMessageAt-a.lastMessageAt || a.name.localeCompare(b.name)) : []; }
  function getVisibleRows() { return getRows().filter(row => !hiddenInbox.has(row.key)); }
  function markRead() {
    ensureAccount();
    if (!activeKey || !visible(activeKey)) return false;
    const messages = rowsFor(activeKey), last = messages.at(-1);
    if (!last || !after(last,cursors.get(activeKey))) return false;
    cursors.set(activeKey,cursorFor(last));exactUnread.delete(activeKey);persistCursors();refreshCounts();notifyInbox();return true;
  }
  function recordRow(row,{incoming=false,timeline=false,cacheOnly=false,hydrateOnly=false,historical=false,realtime=false}={}) {
    let normalized = normalizeRow(row);if(!normalized)return null;
    const entry = entryFor({botId:normalized.bot_id,serverId:normalized.server_id});
    // Realtime may beat an older HTTP history/inbox read. Legacy projections
    // have revision zero and must never overwrite an edited or deleted row.
    const previous = rows.get(normalized.id);
    if (previous && (previous.revision > normalized.revision || previous.deleted_at && previous.revision===normalized.revision)) normalized=previous;
    // The inbox intentionally reads a small projection. Only a full component
    // projection at this exact message revision can clear cached controls.
    if(previous?.revision===normalized.revision && !normalized.deleted_at && normalized[COMPONENT_PROJECTION]===false){
      normalized.components=previous.components;
      normalized.components_revision=previous.components_revision;
      normalized.components_expires_at=previous.components_expires_at;
      normalized[COMPONENT_PROJECTION]=previous[COMPONENT_PROJECTION];
    }
    if (previous?.revision === normalized.revision && previous.reply_to_id === normalized.reply_to_id && !normalized.deleted_at && !normalized.reply_preview) normalized.reply_preview=previous.reply_preview;
    if(previous?.reply_to_id===normalized.reply_to_id && previous.reply_preview?.deleted)normalized.reply_preview=previous.reply_preview;
    const replyParent=rows.get(normalized.reply_to_id);
    if(replyParent?.deleted_at && keyFor(replyParent.server_id,replyParent.bot_id)===entry.key)
      normalized.reply_preview={id:replyParent.id,sender:replyParent.sender,content:'',deleted:true};
    const hiddenCursor = hiddenInbox.get(entry.key);
    if (hiddenCursor && !historical && !hydrateOnly && !normalized.deleted_at && after(normalized,hiddenCursor)) restoreHiddenInbox(entry.key);
    rows.set(normalized.id,normalized);
    if(normalized.deleted_at){
      // Keep the deletion proof on cached replies as well as their parent: a
      // close/reopen may evict an old parent before a fresh history arrives.
      for(const candidate of rows.values())if(candidate.reply_to_id===normalized.id && keyFor(candidate.server_id,candidate.bot_id)===entry.key)
        candidate.reply_preview={id:normalized.id,sender:normalized.sender,content:'',deleted:true};
    }
    const cursor=cursors.get(entry.key);
    // Older clients stored only milliseconds. Rehydrate the immutable timestamp
    // of that same read message before comparing other rows in its millisecond.
    if(cursor?.id===normalized.id && Date.parse(cursor.at)===Date.parse(normalized.created_at) && timestampCompare(normalized.created_at,cursor.at)>0){
      cursors.set(entry.key,cursorFor(normalized));exactUnread.delete(entry.key);persistCursors();
    }
    const exact=exactUnread.get(entry.key);
    if(normalized.sender==='bot' && normalized.deleted_at && !previous?.deleted_at && exact && exact.cursor===JSON.stringify(cursors.get(entry.key)||null)
      && after(normalized,cursors.get(entry.key)) && !after(normalized,exact.through)){
      // The exact count and row projection are separate database snapshots;
      // even a cached live row may already be excluded from that count.
      // Refresh authority instead of subtracting twice after an expiry.
      if(realtime)refresh();
    }
    if(historical&&!previous)historicalOnly.add(normalized.id);else if(!historical&&!hydrateOnly)historicalOnly.delete(normalized.id);
    const ids=timelines.get(entry.key),displayed=ids&&rowsFor(entry.key),boundary=cacheOnly?displayed?.at(-1):displayed?.[0];
    if(ids&&!hydrateOnly&&(timeline||ids.has(normalized.id)||!boundary||compare(normalized,boundary)>(cacheOnly?0:-1)))ids.add(normalized.id);
    const fresh = !seenIncoming.has(normalized.id);seenIncoming.add(normalized.id);
    if (seenIncoming.size > 4000) seenIncoming.delete(seenIncoming.values().next().value);
    refreshCounts();
    if (!historical && activeKey === entry.key && visible(entry.key)) markRead();
    if (incoming && fresh && entry.enabled && normalized.sender === 'bot' && !normalized.deleted_at && after(normalized,cursors.get(entry.key)) && !visible(entry.key)) {
      onIncoming({entry:{...entry},row:{...normalized},userId,unreadCount:entry.unreadCount});
    }
    return normalized;
  }
  async function profile(entry, owner) {
    let flight=profiles.get(entry.botId);
    if(!flight){flight=Promise.resolve().then(()=>getProfile({botId:entry.botId,serverId:entry.serverId})).catch(()=>({}));profiles.set(entry.botId,flight);}
    const data=await flight;
    if(!current(owner)||entries.get(entry.key)!==entry)return;
    for(const [field,limit] of [['name',100],['avatarUrl',2048],['serverName',100],['bannerUrl',2048],['description',2000],['publicId',100],['appId',100],['presenceStatus',16]]) {
      if(typeof data?.[field]==='string')entry[field]=text(data[field],limit);
    }
    if(typeof data?.isPublic === 'boolean')entry.isPublic=data.isPublic;
  }
  async function query(builder, owner) {
    const controller = new AbortController();controllers.add(controller);
    try {
      const {data,error,count}=await (builder.abortSignal ? builder.abortSignal(controller.signal) : builder);
      if(!current(owner)||controller.signal.aborted)return null;
      if(error)throw error;
      return {data,count};
    } finally {controllers.delete(controller);}
  }
  const actorArgs = (entry, action, extra={}) => ({p_action:action,p_bot_id:entry.botId,p_server_id:entry.serverId,...extra});
  async function actor(entry,action,extra,owner) {
    const result=await query(supabase.rpc('bots_dm_actor_v1',actorArgs(entry,action,extra)),owner);
    if(!result)return null;
    if(result.data?.ok!==true)throw new Error('bot_dm_request_failed');
    return result.data;
  }
  async function messageActor(entry, action, extra, owner) {
    const result = await query(supabase.rpc('bots_dm_message_actor_v1', actorArgs(entry,action,extra)),owner);
    if (!result) return null;
    if (result.data?.ok !== true) throw new Error('bot_dm_request_failed');
    return result.data;
  }
  function retentionSnapshot(){
    return {supported:retention.supported,loading:retention.loading,pending:retention.pending,error:retention.error,
      days:retention.days,revision:retention.revision,updatedAt:retention.updatedAt};
  }
  function normalizeRetention(value){
    if(![0,30].includes(value?.days) || !Number.isSafeInteger(value?.revision) || value.revision<0
      || !(value.updated_at===null && value.days===0 && value.revision===0
        || typeof value.updated_at==='string' && value.updated_at.length<=64 && Number.isFinite(Date.parse(value.updated_at))))throw new Error('bot_dm_response_invalid');
    return {days:value.days,revision:value.revision,updatedAt:value.updated_at};
  }
  function applyRetention(value){
    const next=normalizeRetention(value);
    if(retention.loaded && next.revision<retention.revision)return false;
    if(retention.loaded && next.revision===retention.revision && next.days!==retention.days)throw new Error('bot_dm_response_invalid');
    Object.assign(retention,next,{supported:true,loaded:true});
    // A newer committed revision makes an older uncertain CAS unable to apply.
    if(!retention.writeFlight && retention.operation && next.revision>retention.operation.expectedRevision)retention.operation=null;
    return true;
  }
  async function retentionActor(action,extra,owner){
    const result=await query(supabase.rpc('bots_dm_retention_actor_v1',{p_action:action,p_days:null,p_expected_revision:null,p_request_id:null,...extra}),owner);
    if(!result)return null;
    if(result.data?.ok!==true)throw new Error('bot_dm_response_invalid');
    normalizeRetention(result.data.retention);return result.data.retention;
  }
  async function loadRetention(){
    if(!ensureAccount() || !retention.supported)return false;
    const state=retention,owner=generation,version=state.version;
    if(state.readFlight)return state.readFlight;
    state.loading=true;publishActive();
    const flight=(async()=>{
      try{const value=await retentionActor('get',{},owner);if(!value || !current(owner) || retention!==state)return false;
        applyRetention(value);startRetentionRealtime();if(state.version===version)state.error='';publishActive();return true;
      }catch(error){if(current(owner)&&retention===state&&state.version===version){
        if(/PGRST202|42883|schema cache|does not exist/.test(`${error?.code||''} ${error?.message||''}`)){state.supported=false;state.error='';stopRetentionRealtime();}
        else state.error='Não foi possível carregar a definição. Tenta novamente.';
        publishActive();}return false;
      }finally{if(current(owner)&&retention===state&&state.readFlight===flight){state.loading=false;state.readFlight=null;publishActive();}}
    })();state.readFlight=flight;return flight;
  }
  async function setRetention(days){
    if(![0,30].includes(days))throw new Error('invalid_retention');
    if(!ensureAccount() || !retention.supported)return false;
    const state=retention,owner=generation;
    if(state.writeFlight)return state.operation?.days===days?state.writeFlight:false;
    if(!state.loaded && !await loadRetention() || !current(owner) || retention!==state)return false;
    if(state.operation && state.operation.days!==days){state.error='Confirma primeiro a alteração anterior. Tenta novamente.';publishActive();return false;}
    const operation=state.operation || {days,expectedRevision:state.revision,requestId:globalThis.crypto.randomUUID()};
    state.operation=operation;state.pending=true;state.error='';state.version++;publishActive();
    const flight=(async()=>{
      try{const value=await retentionActor('set',{p_days:operation.days,p_expected_revision:operation.expectedRevision,p_request_id:operation.requestId},owner);
        if(!value || !current(owner)||retention!==state)return false;
        applyRetention(value);state.operation=null;
        const confirmed=state.days===operation.days;
        state.error=confirmed?'':'A definição mudou noutro dispositivo. Revê-a e tenta novamente.';
        publishActive();return confirmed;
      }catch(error){if(current(owner)&&retention===state){
        const code=`${error?.code||''} ${error?.message||''}`;
        if(/retention_conflict/.test(code)){state.operation=null;await loadRetention();if(current(owner)&&retention===state)state.error='A definição mudou noutro dispositivo. Revê-a e tenta novamente.';}
        else{if(/invalid_|not_authenticated|account_access_denied|PGRST202|42883/.test(code))state.operation=null;
          state.error='Não foi possível confirmar a alteração. Tenta novamente.';}
        publishActive();}return false;
      }finally{if(current(owner)&&retention===state&&state.writeFlight===flight){state.pending=false;state.writeFlight=null;
        if(state.operation && state.revision>state.operation.expectedRevision)state.operation=null;publishActive();}}
    })();state.writeFlight=flight;return flight;
  }
  async function loadCapabilities(entry, owner, opening) {
    const existing=capabilityFlights.get(entry.key);
    if(existing?.owner===owner && existing.opening===opening)return existing.promise;
    const flight={owner,opening};
    flight.promise=readCapabilities(entry,owner,opening).finally(()=>{if(capabilityFlights.get(entry.key)===flight)capabilityFlights.delete(entry.key);});
    capabilityFlights.set(entry.key,flight);return flight.promise;
  }
  async function readCapabilities(entry, owner, opening) {
    const state=consentState(entry),version=state.version,readRevision=state.readRevision;
    try {
      const data = await messageActor(entry,'capabilities',{},owner);
      if (!data || !current(owner) || activeKey !== entry.key || opening !== openGeneration) return;
      if (!data.capabilities || typeof data.capabilities !== 'object') return;
      entry.capabilities = Object.fromEntries(['send','reply','edit','delete','reaction','pin','attachments','history_pagination','retention_settings'].map(name => [name,data.capabilities[name] === true || name === 'reaction' && data.capabilities.reactions === true || name === 'pin' && data.capabilities.pins === true]));
      if(inboxRichColumns===false && Object.values(entry.capabilities).some(Boolean))inboxRichColumns=undefined;
      if(entry.capabilities.retention_settings){retention.supported=true;if(!retention.loaded&&!retention.loading)void loadRetention();}
      const history = await messageActor(entry,'history',{},owner);
      if (!history || !current(owner) || activeKey !== entry.key || opening !== openGeneration) return;
      const page=normalizeHistoryPage(entry,history,entry.capabilities.history_pagination);
      for (const row of page.messages) recordRow(row,{timeline:true});
      const pagination=historyFor(entry.key);
      if(entry.capabilities.history_pagination && !pagination.ready){pagination.ready=true;pagination.hasMore=page.hasMore;pagination.cursor=page.cursor;}
      if(!entry.capabilities.history_pagination){invalidateOlder(entry.key);pagination.ready=false;pagination.hasMore=false;pagination.cursor=null;}
      if(history.enabled===false && state.version===version && state.readRevision===readRevision && !state.revocationPending)recordConsent(entry,false);
      entry.actionError='';
      publishActive();
    } catch (error) {
      // The enhanced API is optional during a staged rollout. Missing support
      // keeps the established text/consent path available without a banner.
      if (current(owner) && activeKey === entry.key && opening === openGeneration && !/PGRST202|42883|schema cache|does not exist/.test(`${error?.code || ''} ${error?.message || ''}`)) {
        entry.actionError = errorText(error); publishActive();
      }
    }
  }
  function stopInboxRealtime() { if(channel){const previous=channel;channel=null;void Promise.resolve(supabase.removeChannel?.(previous)).catch(()=>{});} }
  function stopRealtime() {stopInboxRealtime();stopRetentionRealtime();}
  function stopRetentionRealtime(){if(retentionChannel){const previous=retentionChannel;retentionChannel=null;void Promise.resolve(supabase.removeChannel?.(previous)).catch(()=>{});}}
  function reset() {
    const hadActive = !!activeKey, hadInbox = inboxSignature !== '[]';
    generation++;openGeneration++;activeKey='';userId='';inboxFlight=null;inboxQueued=false;hydrated=false;eventVersion=0;inboxRichColumns=undefined;retention=emptyRetention();
    stopRealtime();for(const controller of controllers)controller.abort();controllers.clear();
    entries.clear();rows.clear();cursors.clear();hiddenInbox.clear();pending.clear();consentStates.clear();exactUnread.clear();seenIncoming.clear();eventRows.clear();profiles.clear();capabilityFlights.clear();timelines.clear();histories.clear();historicalOnly.clear();
    inboxSignature='[]';if(hadActive)onActiveChange(null);if(hadInbox)onInboxChange([]);
  }
  function ensureAccount() {
    const next=user();
    if(!UUID.test(next)||authUserId!==undefined && next!==authUserId){if(userId)reset();return '';}
    if(userId!==next){reset();userId=next;loadCursors();loadHiddenInbox();bindLifecycle();}
    return userId;
  }
  async function readInboxMessages(owner){
    const base='id,bot_id,server_id,user_id,sender,content,embeds,request_id,created_at';
    const read=rich=>query(supabase.from('bot_direct_messages_v1').select(base+(rich?',revision,deleted_at':''))
      .eq('user_id',userId).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(501),owner);
    const rich=inboxRichColumns!==false;
    try{const result=await read(rich);if(result){inboxRichColumns=rich;result.richColumns=rich;}return result;}
    catch(error){
      // Only a missing optional column permits the legacy projection. Auth,
      // RLS, connectivity and other query failures must remain visible.
      if(!rich || !['42703','PGRST204'].includes(error?.code) || !/\b(?:revision|deleted_at)\b/i.test(error?.message||''))throw error;
      if(!current(owner))return null;inboxRichColumns=false;
      const result=await read(false);if(result)result.richColumns=false;return result;
    }
  }
  async function loadInbox() {
    if(!ensureAccount())return [];
    if(inboxFlight)return inboxFlight;
    const owner=generation,version=eventVersion,wasHydrated=hydrated;
    const consentVersions=new Map([...entries.values()].map(entry=>{const state=consentState(entry);return [entry.key,{version:state.version,readRevision:state.readRevision}];}));
    const canApplyConsentRead=entry=>{const state=consentState(entry),snapshot=consentVersions.get(entry.key);return !state.revocationPending&&state.version===(snapshot?.version||0)&&state.readRevision===(snapshot?.readRevision||0);};
    const flight=(async()=>{
      const [consentResult,messageResult]=await Promise.all([
        query(supabase.from('bot_dm_consents_v1').select('bot_id,server_id,user_id,enabled,updated_at').eq('user_id',userId).order('updated_at',{ascending:false}).limit(200),owner),
        readInboxMessages(owner)
      ]);
      if(!current(owner)||!consentResult||!messageResult)return [];
      if(!Array.isArray(consentResult.data)||!Array.isArray(messageResult.data))throw new Error('bot_dm_response_invalid');
      // Resolve consent before incoming rows can notify. Local withdrawal also
      // wins over reads started while its database request is still pending.
      const acceptedConsents=new Set();
      for(const entry of entries.values())if(canApplyConsentRead(entry)){entry.enabled=false;acceptedConsents.add(entry);}
      for(const consent of consentResult.data){if(consent.user_id!==userId||!UUID.test(consent.bot_id||'')||!UUID.test(consent.server_id||''))continue;const entry=entryFor({botId:consent.bot_id,serverId:consent.server_id});if(canApplyConsentRead(entry)){entry.enabled=consent.enabled===true;acceptedConsents.add(entry);}}
      for(const entry of acceptedConsents)consentState(entry).readRevision++;
      for(const row of messageResult.data)recordRow(row,{incoming:wasHydrated,cacheOnly:true});
      // Events observed after the HTTP read began win over its older snapshot.
      for(const item of eventRows.values()) if(item.version>version&&item.row)recordRow(item.row);
      const known=[...entries.values()];
      if(messageResult.data.length===501) {
        // Exact counts are needed only when the bounded aggregate read truncates.
        let index=0;await Promise.all(Array.from({length:Math.min(4,known.length)},async()=>{while(index<known.length){
          const entry=known[index++],cursor=cursors.get(entry.key),cursorKey=JSON.stringify(cursor||null),countVersion=eventVersion,through=cachedRowsFor(entry.key).at(-1);
          let countQuery=supabase.from('bot_direct_messages_v1').select('id',{head:true,count:'exact'}).eq('user_id',userId).eq('bot_id',entry.botId).eq('server_id',entry.serverId).eq('sender','bot');
          if(messageResult.richColumns)countQuery=countQuery.is('deleted_at',null);
          if(cursor)countQuery=countQuery.or(`created_at.gt.${cursor.at},and(created_at.eq.${cursor.at},id.gt.${cursor.id})`);
          const countResult=await query(countQuery,owner);
          if(countResult&&Number.isInteger(countResult.count)&&through&&countVersion===eventVersion&&cursorKey===JSON.stringify(cursors.get(entry.key)||null)){
            exactUnread.set(entry.key,{cursor:cursorKey,through:cursorFor(through),count:Math.max(0,countResult.count)});entry.unreadCount=Math.max(0,countResult.count);
          }else if(current(owner)&&countVersion!==eventVersion)inboxQueued=true;
        }}));
      }
      await Promise.all(known.map(entry=>profile(entry,owner)));
      if(!current(owner))return [];
      hydrated=true;notifyInbox();publishActive();return getRows();
    })();
    inboxFlight=flight;
    try{return await flight;}finally{if(inboxFlight===flight){inboxFlight=null;if(inboxQueued){inboxQueued=false;void loadInbox().catch(()=>{});}}}
  }
  function refresh() {
    if(inboxFlight){inboxQueued=true;return;}
    const owner=generation,key=activeKey,entry=entries.get(key),opening=openGeneration,state=entry&&consentState(entry),version=state?.version,readRevision=state?.readRevision,execution=state?.latestExecution;
    void loadInbox().then(()=>{
      if(entry&&current(owner)&&activeKey===key&&opening===openGeneration&&!entry.loading)void loadCapabilities(entry,owner,opening);
    }).catch(()=>{if(entry&&current(owner)&&activeKey===key&&state.version===version&&state.readRevision===readRevision&&state.latestExecution===execution){entry.error='Não foi possível atualizar as mensagens.';publishActive();}});
  }
  async function loadActive(entry,owner,opening) {
    entry.loading=true;entry.error='';publishActive();
    const state=consentState(entry),version=state.version,readRevision=state.readRevision,execution=state.latestExecution;
    try {
      const data=await actor(entry,'history',{},owner);
      if(!data||!current(owner)||activeKey!==entry.key||opening!==openGeneration)return null;
      const page=normalizeHistoryPage(entry,data);
      for(const row of page.messages)recordRow(row,{timeline:true});
      if(state.version===version&&state.readRevision===readRevision&&!state.revocationPending){entry.enabled=data.enabled===true;state.readRevision++;}
      await profile(entry,owner);if(!current(owner)||activeKey!==entry.key||opening!==openGeneration)return null;
      entry.loading=false;markRead();notifyInbox();publishActive();void loadCapabilities(entry,owner,opening);return activeSnapshot();
    }catch(error){if(current(owner)&&activeKey===entry.key&&opening===openGeneration){entry.loading=false;if(state.version===version&&state.readRevision===readRevision&&state.latestExecution===execution)entry.error=errorText(error);publishActive();}return null;}
  }
  async function open(seed) {
    if(!ensureAccount())throw new Error('not_authenticated');
    close();const entry=entryFor(seed);restoreHiddenInbox(entry.key);seedTimeline(entry);activeKey=entry.key;const owner=generation,opening=openGeneration;
    publishActive();notifyInbox();startRealtime();return loadActive(entry,owner,opening);
  }
  function close() {
    const previous=activeKey;invalidateOlder(previous);openGeneration++;activeKey='';
    if(previous){
      // Keep a bounded inactive cache, including its pins. Any evicted history
      // stays available through the authoritative cursor API when reopened.
      const cached=[...rows.values()].filter(row=>keyFor(row.server_id,row.bot_id)===previous).sort(compare);
      const keep=new Set([...cached.slice(-50).map(row=>row.id),...(entries.get(previous)?.pinnedIds||[])]);
      for(const row of cached)if(!keep.has(row.id)){rows.delete(row.id);historicalOnly.delete(row.id);}
      timelines.delete(previous);histories.delete(previous);
    }
    onActiveChange(null);
  }
  async function loadOlder() {
    const entry=activeEntry(),history=historyFor(entry.key);
    if(history.flight)return history.flight.promise;
    if(entry.loading || entry.capabilities?.history_pagination!==true || !history.ready || !history.hasMore || !history.cursor)return false;
    const owner=generation,opening=openGeneration,version=history.version,consentVersion=consentState(entry).version;
    const before={...history.cursor},flight={promise:null};history.flight=flight;history.loading=true;history.error='';publishActive();
    const valid=()=>current(owner)&&activeKey===entry.key&&opening===openGeneration&&histories.get(entry.key)===history&&history.version===version&&consentState(entry).version===consentVersion;
    flight.promise=(async()=>{
      try{
        const data=await messageActor(entry,'history',{p_payload:{before}},owner);
        if(!data||!valid())return false;
        const page=normalizeHistoryPage(entry,data,true);
        if(page.messages.some(row=>compare(row,{created_at:before.created_at,id:before.id})>=0)
          || page.cursor && compare(page.cursor,before)>=0)throw new Error('bot_dm_response_invalid');
        for(const row of page.messages)recordRow(row,{timeline:true,historical:true});
        history.hasMore=page.hasMore;history.cursor=page.cursor;history.error='';publishActive();return true;
      }catch(_){if(valid()){history.error='Não foi possível carregar as mensagens anteriores. Tenta novamente.';publishActive();}return false;}
      finally{if(valid()&&history.flight===flight){history.loading=false;history.flight=null;publishActive();}}
    })();
    return flight.promise;
  }
  async function execute(entry,operation) {
    const owner=generation,state=consentState(entry),version=state.version,readRevision=state.readRevision,execution={};
    state.executions.add(execution);state.latestExecution=execution;entry.busy=true;entry.error='';publishActive();
    try{
      const data=await (operation.messageApi ? messageActor(entry,operation.action,operation.extra,owner) : actor(entry,operation.action,operation.extra,owner));
      if(!data||!current(owner))return false;
      if(operation.messageApi || operation.action==='send'){
        const row=normalizeRow(data.message);
        if(!row||row.bot_id!==entry.botId||row.server_id!==entry.serverId)throw new Error('bot_dm_response_invalid');
        if(operation.action==='send' && (row.sender!=='user'||row.request_id!==operation.extra.p_request_id||row.content!==(operation.messageApi ? operation.extra.p_payload.content : operation.extra.p_content)))throw new Error('bot_dm_response_invalid');
        if(operation.action!=='send' && row.id!==operation.extra.p_message_id)throw new Error('bot_dm_response_invalid');
        recordRow(row);
      }else {
        if(typeof data.enabled!=='boolean'||data.enabled!==operation.extra.p_enabled)throw new Error('bot_dm_response_invalid');
        // A newer decision/event wins even when an older RPC committed first
        // and its HTTP response arrives after a confirmed withdrawal.
        if(state.version===version&&state.readRevision===readRevision&&state.latestExecution===execution)recordConsent(entry,data.enabled);
      }
      if(pending.get(entry.key)===operation)pending.delete(entry.key);
      if(state.revocationOperation===operation)state.revocationOperation=null;
      notifyInbox();return true;
    }catch(error){if(current(owner)&&state.latestExecution===execution&&state.version===version&&state.readRevision===readRevision){entry.error=errorText(error);if(definitive(error)){if(pending.get(entry.key)===operation)pending.delete(entry.key);if(state.revocationOperation===operation)state.revocationOperation=null;if(/consent_required|surface_access_denied|permission|bot_not_installed/.test(error?.message||''))recordConsent(entry,false);}}return false;
    }finally{if(current(owner)){state.executions.delete(execution);entry.busy=state.executions.size>0;if(activeKey===entry.key)publishActive();}}
  }
  function activeEntry() {ensureAccount();const entry=entries.get(activeKey);if(!entry||!current(generation))throw new Error('invalid_bot_dm_context');return entry;}
  async function send(content, {replyToId=null,attachments=[]} = {}) {
    const entry=activeEntry();if(!entry.enabled)throw new Error('consent_required');
    if(entry.busy||pending.has(entry.key))throw new Error('bot_dm_pending');
    if(typeof content!=='string'||(!content.trim() && !attachments.length)||content.length>2000)throw new Error('invalid_content');
    if (replyToId && (!UUID.test(replyToId) || !entry.capabilities?.reply)) throw new Error('invalid_reply');
    if (attachments.length && (!entry.capabilities?.attachments || attachments.length > 10 || !attachments.every(value => UUID.test(value?.upload_id || '')))) throw new Error('invalid_attachments');
    const operation=entry.capabilities?.send
      ? {action:'send',messageApi:true,extra:{p_payload:{content,reply_to_id:replyToId,attachments},p_request_id:globalThis.crypto.randomUUID()}}
      : {action:'send',extra:{p_content:content,p_request_id:globalThis.crypto.randomUUID()}};
    pending.set(entry.key,operation);return execute(entry,operation);
  }
  async function messageAction(action, messageId, payload={}) {
    const entry = activeEntry();
    if (!entry.enabled) throw new Error('consent_required');
    if (!['edit','delete','reaction','pin'].includes(action) || entry.capabilities?.[action] !== true || !UUID.test(messageId)) throw new Error('invalid_message_action');
    const row = rows.get(messageId);
    if (!row || keyFor(row.server_id,row.bot_id) !== entry.key || row.deleted_at || (['edit','delete'].includes(action) && row.sender !== 'user')) throw new Error('invalid_message_action');
    if (entry.busy || pending.has(entry.key)) throw new Error('bot_dm_pending');
    const operation = {action,messageApi:true,extra:{p_message_id:messageId,p_payload:payload,p_request_id:globalThis.crypto.randomUUID()}};
    pending.set(entry.key,operation);return execute(entry,operation);
  }
  async function loadPins() {
    const entry = activeEntry(),owner=generation,opening=openGeneration;
    if (!entry.capabilities?.pin) return false;
    try {
      const data = await messageActor(entry,'pins',{},owner);
      if (!data || !current(owner) || activeKey !== entry.key || opening !== openGeneration) return false;
      if (!Array.isArray(data.messages) || data.messages.length > 100) throw new Error('bot_dm_response_invalid');
      const pinnedIds=[];
      for (const row of data.messages) {
        const normalized = normalizeRow(row);
        if (!normalized || keyFor(normalized.server_id,normalized.bot_id) !== entry.key) throw new Error('bot_dm_response_invalid');
        recordRow(normalized,{hydrateOnly:true,historical:true});pinnedIds.push(normalized.id);
      }
      entry.pinnedIds=pinnedIds;publishActive();return true;
    } catch (error) {
      if (current(owner) && activeKey === entry.key && opening === openGeneration) {entry.error=errorText(error);publishActive();}
      return false;
    }
  }
  async function saveConsent(enabled) {
    if(typeof enabled!=='boolean')throw new Error('invalid_consent');const entry=activeEntry();
    if(enabled&&entry.busy)throw new Error('bot_dm_pending');
    const operation={action:'consent',extra:{p_enabled:enabled}};
    // A lost withdrawal is retried separately; it must not replace the UUID
    // of an earlier send whose server result remains uncertain.
    consentState(entry).revocationOperation=enabled?null:operation;
    // Granting is never optimistic. Withdrawal takes effect locally at once,
    // including if its response is lost, until a new explicit grant succeeds.
    recordConsent(entry,enabled?entry.enabled:false,{revocationPending:!enabled});
    notifyInbox();publishActive();
    // Revocation remains possible even if a message response is uncertain.
    return execute(entry,operation);
  }
  async function retry() {
    const entry=activeEntry(),operation=consentState(entry).revocationOperation||pending.get(entry.key);if(!operation||entry.busy)return false;
    if((operation.messageApi||operation.action==='send')&&!entry.enabled)throw new Error('consent_required');return execute(entry,operation);
  }
  function startRealtime() {
    if(!ensureAccount()||!supabase.channel)return;
    if(channel){startRetentionRealtime();return;}
    const owner=generation,ownUser=userId;
    const next=supabase.channel(`bot-dm-inbox:${ownUser}`,{config:{private:true}});
    const receive=(payload,table)=>{
      if(channel!==next||!current(owner))return;
      const value=payload?.new;if(!value||value.user_id!==ownUser)return;
      eventVersion++;
      if(table==='messages'){const row=normalizeRow(value);if(!row)return;eventRows.set(row.id,{version:eventVersion,row});recordRow(row,{incoming:payload.eventType !== 'UPDATE',realtime:true});}
      else {if(!UUID.test(value.bot_id||'')||!UUID.test(value.server_id||''))return;const entry=entryFor({botId:value.bot_id,serverId:value.server_id}),state=consentState(entry);recordConsent(entry,state.revocationPending?false:value.enabled===true,{revocationPending:state.revocationPending&&value.enabled!==false});if(value.enabled===false)state.revocationOperation=null;}
      if(eventRows.size>2000)eventRows.delete(eventRows.keys().next().value);
      notifyInbox();publishActive();
    };
    next.on('postgres_changes',{event:'INSERT',schema:'public',table:'bot_direct_messages_v1',filter:`user_id=eq.${ownUser}`},payload=>receive(payload,'messages'))
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'bot_direct_messages_v1',filter:`user_id=eq.${ownUser}`},payload=>receive(payload,'messages'))
      .on('postgres_changes',{event:'*',schema:'public',table:'bot_dm_consents_v1',filter:`user_id=eq.${ownUser}`},payload=>receive(payload,'consent'));
    channel=next;next.subscribe(status=>{
      if(channel!==next||!current(owner))return;
      if(status==='SUBSCRIBED')refresh();
      // A failed/removed channel cannot rejoin itself after the app's transport
      // recovery. Retire only this owner so the next resume can recreate it.
      else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status))stopInboxRealtime();
    });
    startRetentionRealtime();
  }
  function startRetentionRealtime(){
    // The optional table must not affect message/consent subscriptions while
    // an older backend is still serving the established DM interface.
    if(!current(generation)||!retention.supported||!retention.loaded||!supabase.channel||retentionChannel)return;
    const owner=generation,ownUser=userId,state=retention,next=supabase.channel(`bot-dm-retention:${ownUser}`,{config:{private:true}});
    next.on('postgres_changes',{event:'*',schema:'public',table:'bot_dm_retention_preferences_v1',filter:`user_id=eq.${ownUser}`},payload=>{
      if(retentionChannel!==next||!current(owner)||retention!==state||payload?.new?.user_id!==ownUser)return;
      try{applyRetention(payload.new);publishActive();}catch(_){}
    });
    retentionChannel=next;next.subscribe(status=>{
      if(retentionChannel!==next||!current(owner)||retention!==state)return;
      if(status==='SUBSCRIBED')void loadRetention();
      else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status))stopRetentionRealtime();
    });
  }
  const onFocus=()=>{if(ensureAccount()){startRealtime();markRead();refresh();}};
  const onVisibility=()=>{if(globalThis.document?.visibilityState!=='hidden')onFocus();};
  const onStorage=event=>{
    if (!current(generation)) return;
    if (event?.key===storageKey()) {loadCursors();refreshCounts();notifyInbox();}
    else if (event?.key===hiddenStorageKey()) {loadHiddenInbox();notifyInbox();}
  };
  function bindLifecycle() {
    if(!lifecycleBound){globalThis.addEventListener?.('focus',onFocus);globalThis.addEventListener?.('storage',onStorage);globalThis.document?.addEventListener?.('visibilitychange',onVisibility);lifecycleBound=true;}
    if(!authSubscription&&supabase.auth?.onAuthStateChange)authSubscription=supabase.auth.onAuthStateChange((_event,session)=>{authUserId=session?.user?.id?.toLowerCase()||'';if(authUserId!==userId)reset();})?.data?.subscription;
  }
  function dispose() {reset();authSubscription?.unsubscribe?.();authSubscription=null;if(lifecycleBound){globalThis.removeEventListener?.('focus',onFocus);globalThis.removeEventListener?.('storage',onStorage);globalThis.document?.removeEventListener?.('visibilitychange',onVisibility);lifecycleBound=false;}}
  return {ensureAccount,loadInbox,open,close,loadOlder,loadRetention,setRetention,snapshot:activeSnapshot,send,messageAction,loadPins,saveConsent,retry,markRead,getRows,getVisibleRows,hideFromInbox,reset,startRealtime,stopRealtime,dispose};
}
