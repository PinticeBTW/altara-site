const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
const keyFor = (serverId, botId) => `bot-dm:${serverId}:${botId}`;
const validKey = key => /^bot-dm:[0-9a-f-]{36}:[0-9a-f-]{36}$/i.test(key || '')
  && key.split(':').slice(1).every(value => UUID.test(value));
const cursorFor = row => ({at:row.created_at, id:row.id});
const after = (row, cursor) => !cursor || Date.parse(row.created_at) > Date.parse(cursor.at)
  || Date.parse(row.created_at) === Date.parse(cursor.at) && row.id > cursor.id;
const compare = (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id);
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
  let userId = '', generation = 0, openGeneration = 0, activeKey = '', channel = null;
  let inboxFlight = null, inboxQueued = false, hydrated = false, eventVersion = 0;
  let inboxSignature = '[]';
  let authUserId, authSubscription, lifecycleBound = false;
  const entries = new Map(), rows = new Map(), cursors = new Map(), pending = new Map(), consentStates = new Map();
  const exactUnread = new Map();
  const seenIncoming = new Set(), controllers = new Set(), eventRows = new Map(), profiles = new Map(), capabilityFlights = new Map();
  const user = () => text(getContext()?.userId, 36).toLowerCase();
  const current = owner => owner === generation && UUID.test(userId) && user() === userId && (authUserId === undefined || authUserId === userId);
  const storageKey = () => `altara.botDmRead.v1:${userId}`;
  const visible = key => getActiveKey() === key && (!globalThis.document || globalThis.document.visibilityState !== 'hidden' && globalThis.document.hasFocus?.() !== false);
  const notifyInbox = () => {
    if (!current(generation)) return;
    const snapshot = getRows(), signature = JSON.stringify(snapshot);
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
  }
  function normalizeRow(row) {
    if (!row || row.user_id !== userId || !UUID.test(row.id || '') || !UUID.test(row.bot_id || '') || !UUID.test(row.server_id || '')
      || !['user','bot'].includes(row.sender) || typeof row.content !== 'string' || row.content.length > 2000 || !Number.isFinite(Date.parse(row.created_at))) return null;
    let embeds = [];
    try { if (Array.isArray(row.embeds) && row.embeds.length <= 10) { const json = JSON.stringify(row.embeds); if (json.length <= 100000) embeds = JSON.parse(json); } } catch (_) {}
    const timestamp = value => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
    const reactions = Array.isArray(row.reactions) ? row.reactions.slice(0, 30).filter(item => typeof item?.emoji === 'string' && item.emoji.length <= 32 && Number.isInteger(item.count) && item.count > 0).map(item => ({emoji:item.emoji,count:item.count,me:item.user === true || item.mine === true || item.me === true})) : [];
    return {id:row.id.toLowerCase(),bot_id:row.bot_id.toLowerCase(),server_id:row.server_id.toLowerCase(),user_id:userId,sender:row.sender,content:row.content,embeds,request_id:UUID.test(row.request_id || '') ? row.request_id.toLowerCase() : '',created_at:new Date(row.created_at).toISOString(),
      revision:Number.isSafeInteger(row.revision) && row.revision >= 0 ? row.revision : 0,
      reply_to_id:UUID.test(row.reply_to_id || '') ? row.reply_to_id.toLowerCase() : null,
      reply_preview:row.reply_preview && row.reply_preview.id === row.reply_to_id && ['user','bot'].includes(row.reply_preview.sender) && typeof row.reply_preview.content === 'string'
        ? {id:row.reply_preview.id,sender:row.reply_preview.sender,content:text(row.reply_preview.content,2000),deleted:row.reply_preview.deleted === true} : null,
      edited_at:timestamp(row.edited_at),deleted_at:timestamp(row.deleted_at),is_pinned:row.is_pinned === true,pinned_at:timestamp(row.pinned_at),reactions,
      attachments:Array.isArray(row.attachments) ? row.attachments.slice(0,10) : []};
  }
  function rowsFor(key) { return [...rows.values()].filter(row => keyFor(row.server_id,row.bot_id) === key).sort(compare).slice(-50); }
  function refreshCounts() {
    for (const entry of entries.values()) {
      const messages = [...rows.values()].filter(row => keyFor(row.server_id,row.bot_id) === entry.key);
      entry.lastMessageAt = Math.max(entry.lastMessageAt || 0, ...messages.map(row => Date.parse(row.created_at)), 0);
      const unread = messages.filter(row => row.sender === 'bot' && after(row, cursors.get(entry.key)));
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
    const messages=rowsFor(activeKey),pinnedIds=new Set([...(entry.pinnedIds || []),...messages.filter(row=>row.is_pinned).map(row=>row.id)]);
    return {...entry,userId,messages,pinnedMessages:[...pinnedIds].map(id => rows.get(id)).filter(row => row?.is_pinned && !row.deleted_at),pending:operation ? {action:operation.action,requestId:operation.extra.p_request_id || null} : null,loading:entry.loading === true,busy:entry.busy === true,error:entry.error || entry.actionError || '',retryable:!!operation && !entry.busy && (!operation.messageApi && operation.action !== 'send' || entry.enabled)};
  }
  function publishActive() { if (activeKey && current(generation)) onActiveChange(activeSnapshot()); }
  function getRows() { return current(generation) ? [...entries.values()].map(({key,botId,serverId,name,avatarUrl,serverName,enabled,lastMessageAt,unreadCount}) => ({key,botId,serverId,name,avatarUrl,serverName,enabled,lastMessageAt,unreadCount})).sort((a,b) => b.lastMessageAt-a.lastMessageAt || a.name.localeCompare(b.name)) : []; }
  function markRead() {
    ensureAccount();
    if (!activeKey || !visible(activeKey)) return false;
    const messages = rowsFor(activeKey), last = messages.at(-1);
    if (!last || !after(last,cursors.get(activeKey))) return false;
    cursors.set(activeKey,cursorFor(last));exactUnread.delete(activeKey);persistCursors();refreshCounts();notifyInbox();return true;
  }
  function recordRow(row,{incoming=false}={}) {
    const normalized = normalizeRow(row);if(!normalized)return null;
    const entry = entryFor({botId:normalized.bot_id,serverId:normalized.server_id});
    // Realtime may beat an older HTTP history/inbox read. Legacy projections
    // have revision zero and must never overwrite an edited or deleted row.
    const previous = rows.get(normalized.id);
    if (previous && previous.revision > normalized.revision) return previous;
    if (previous?.revision === normalized.revision && previous.reply_to_id === normalized.reply_to_id && !normalized.deleted_at && !normalized.reply_preview) normalized.reply_preview=previous.reply_preview;
    rows.set(normalized.id,normalized);
    const fresh = !seenIncoming.has(normalized.id);seenIncoming.add(normalized.id);
    if (seenIncoming.size > 4000) seenIncoming.delete(seenIncoming.values().next().value);
    refreshCounts();
    if (activeKey === entry.key && visible(entry.key)) markRead();
    if (incoming && fresh && entry.enabled && normalized.sender === 'bot' && after(normalized,cursors.get(entry.key)) && !visible(entry.key)) {
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
      entry.capabilities = Object.fromEntries(['send','reply','edit','delete','reaction','pin','attachments'].map(name => [name,data.capabilities[name] === true || name === 'reaction' && data.capabilities.reactions === true || name === 'pin' && data.capabilities.pins === true]));
      const history = await messageActor(entry,'history',{},owner);
      if (!history || !current(owner) || activeKey !== entry.key || opening !== openGeneration) return;
      if (!Array.isArray(history.messages) || history.messages.length > 50) throw new Error('bot_dm_response_invalid');
      for (const row of history.messages) {
        const normalized = normalizeRow(row);
        if (!normalized || keyFor(normalized.server_id,normalized.bot_id) !== entry.key) throw new Error('bot_dm_response_invalid');
        recordRow(normalized);
      }
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
  function stopRealtime() { if(channel){const previous=channel;channel=null;void Promise.resolve(supabase.removeChannel?.(previous)).catch(()=>{});} }
  function reset() {
    const hadActive = !!activeKey, hadInbox = inboxSignature !== '[]';
    generation++;openGeneration++;activeKey='';userId='';inboxFlight=null;inboxQueued=false;hydrated=false;eventVersion=0;
    stopRealtime();for(const controller of controllers)controller.abort();controllers.clear();
    entries.clear();rows.clear();cursors.clear();pending.clear();consentStates.clear();exactUnread.clear();seenIncoming.clear();eventRows.clear();profiles.clear();capabilityFlights.clear();
    inboxSignature='[]';if(hadActive)onActiveChange(null);if(hadInbox)onInboxChange([]);
  }
  function ensureAccount() {
    const next=user();
    if(!UUID.test(next)||authUserId!==undefined && next!==authUserId){if(userId)reset();return '';}
    if(userId!==next){reset();userId=next;loadCursors();bindLifecycle();}
    return userId;
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
        query(supabase.from('bot_direct_messages_v1').select('id,bot_id,server_id,user_id,sender,content,embeds,request_id,created_at').eq('user_id',userId).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(501),owner)
      ]);
      if(!current(owner)||!consentResult||!messageResult)return [];
      if(!Array.isArray(consentResult.data)||!Array.isArray(messageResult.data))throw new Error('bot_dm_response_invalid');
      // Resolve consent before incoming rows can notify. Local withdrawal also
      // wins over reads started while its database request is still pending.
      const acceptedConsents=new Set();
      for(const entry of entries.values())if(canApplyConsentRead(entry)){entry.enabled=false;acceptedConsents.add(entry);}
      for(const consent of consentResult.data){if(consent.user_id!==userId||!UUID.test(consent.bot_id||'')||!UUID.test(consent.server_id||''))continue;const entry=entryFor({botId:consent.bot_id,serverId:consent.server_id});if(canApplyConsentRead(entry)){entry.enabled=consent.enabled===true;acceptedConsents.add(entry);}}
      for(const entry of acceptedConsents)consentState(entry).readRevision++;
      for(const row of messageResult.data)recordRow(row,{incoming:wasHydrated});
      // Events observed after the HTTP read began win over its older snapshot.
      for(const item of eventRows.values()) if(item.version>version&&item.row)recordRow(item.row);
      const known=[...entries.values()];
      if(messageResult.data.length===501) {
        // Exact counts are needed only when the bounded aggregate read truncates.
        let index=0;await Promise.all(Array.from({length:Math.min(4,known.length)},async()=>{while(index<known.length){
          const entry=known[index++],cursor=cursors.get(entry.key),cursorKey=JSON.stringify(cursor||null),countVersion=eventVersion,through=rowsFor(entry.key).at(-1);
          let countQuery=supabase.from('bot_direct_messages_v1').select('id',{head:true,count:'exact'}).eq('user_id',userId).eq('bot_id',entry.botId).eq('server_id',entry.serverId).eq('sender','bot');
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
      if(!Array.isArray(data.messages)||data.messages.length>50)throw new Error('bot_dm_response_invalid');
      for(const row of data.messages){const normalized=normalizeRow(row);if(!normalized||keyFor(normalized.server_id,normalized.bot_id)!==entry.key)throw new Error('bot_dm_response_invalid');recordRow(normalized);}
      if(state.version===version&&state.readRevision===readRevision&&!state.revocationPending){entry.enabled=data.enabled===true;state.readRevision++;}
      await profile(entry,owner);if(!current(owner)||activeKey!==entry.key||opening!==openGeneration)return null;
      entry.loading=false;markRead();notifyInbox();publishActive();void loadCapabilities(entry,owner,opening);return activeSnapshot();
    }catch(error){if(current(owner)&&activeKey===entry.key&&opening===openGeneration){entry.loading=false;if(state.version===version&&state.readRevision===readRevision&&state.latestExecution===execution)entry.error=errorText(error);publishActive();}return null;}
  }
  async function open(seed) {
    if(!ensureAccount())throw new Error('not_authenticated');
    close();const entry=entryFor(seed);activeKey=entry.key;const owner=generation,opening=openGeneration;
    publishActive();notifyInbox();startRealtime();return loadActive(entry,owner,opening);
  }
  function close() {openGeneration++;activeKey='';onActiveChange(null);}
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
        recordRow(normalized);pinnedIds.push(normalized.id);
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
    if(!ensureAccount()||!supabase.channel||channel)return;
    const owner=generation,ownUser=userId;
    const next=supabase.channel(`bot-dm-inbox:${ownUser}`);
    const receive=(payload,table)=>{
      if(channel!==next||!current(owner))return;
      const value=payload?.new;if(!value||value.user_id!==ownUser)return;
      eventVersion++;
      if(table==='messages'){const row=normalizeRow(value);if(!row)return;eventRows.set(row.id,{version:eventVersion,row});recordRow(row,{incoming:payload.eventType !== 'UPDATE'});}
      else {if(!UUID.test(value.bot_id||'')||!UUID.test(value.server_id||''))return;const entry=entryFor({botId:value.bot_id,serverId:value.server_id}),state=consentState(entry);recordConsent(entry,state.revocationPending?false:value.enabled===true,{revocationPending:state.revocationPending&&value.enabled!==false});if(value.enabled===false)state.revocationOperation=null;}
      if(eventRows.size>2000)eventRows.delete(eventRows.keys().next().value);
      notifyInbox();publishActive();
    };
    next.on('postgres_changes',{event:'INSERT',schema:'public',table:'bot_direct_messages_v1',filter:`user_id=eq.${ownUser}`},payload=>receive(payload,'messages'))
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'bot_direct_messages_v1',filter:`user_id=eq.${ownUser}`},payload=>receive(payload,'messages'))
      .on('postgres_changes',{event:'*',schema:'public',table:'bot_dm_consents_v1',filter:`user_id=eq.${ownUser}`},payload=>receive(payload,'consent'));
    channel=next;next.subscribe(status=>{if(channel!==next||!current(owner))return;if(status==='SUBSCRIBED')refresh();});
  }
  const onFocus=()=>{if(ensureAccount()){markRead();refresh();}};
  const onVisibility=()=>{if(globalThis.document?.visibilityState!=='hidden')onFocus();};
  const onStorage=event=>{if(current(generation)&&event?.key===storageKey()){loadCursors();refreshCounts();notifyInbox();}};
  function bindLifecycle() {
    if(!lifecycleBound){globalThis.addEventListener?.('focus',onFocus);globalThis.addEventListener?.('storage',onStorage);globalThis.document?.addEventListener?.('visibilitychange',onVisibility);lifecycleBound=true;}
    if(!authSubscription&&supabase.auth?.onAuthStateChange)authSubscription=supabase.auth.onAuthStateChange((_event,session)=>{authUserId=session?.user?.id?.toLowerCase()||'';if(authUserId!==userId)reset();})?.data?.subscription;
  }
  function dispose() {reset();authSubscription?.unsubscribe?.();authSubscription=null;if(lifecycleBound){globalThis.removeEventListener?.('focus',onFocus);globalThis.removeEventListener?.('storage',onStorage);globalThis.document?.removeEventListener?.('visibilitychange',onVisibility);lifecycleBound=false;}}
  return {ensureAccount,loadInbox,open,close,send,messageAction,loadPins,saveConsent,retry,markRead,getRows,reset,startRealtime,dispose};
}
