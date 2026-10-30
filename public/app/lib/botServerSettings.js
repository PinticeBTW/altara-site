const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FEATURES=['welcome_messages','dm_commands'];
const SETTINGS=['welcome_enabled','welcome_channel_id','dm_commands_enabled'];
const defaults=()=>({welcome_enabled:false,welcome_channel_id:null,dm_commands_enabled:false});
const identifier=value=>typeof value==='string'&&UUID.test(value)?value.toLowerCase():'';
const sameSettings=(a,b)=>SETTINGS.every(key=>a[key]===b[key]);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeInteger=value=>Number.isSafeInteger(value)&&value>=0;
// This marker describes the stored destination, rather than an app grant. A
// newly selected eligible channel must be able to repair that destination.
const missingGrants=(owner,feature)=>owner.missingPermissions[feature].filter(value=>feature!=='welcome_messages'||value!=='channel:unavailable');
const messages={
 unavailable:['These bot settings are not available yet. Try again later.','Estas definições dos bots ainda não estão disponíveis. Tenta novamente mais tarde.'],
 access:['You no longer have permission to configure this app.','Já não tens permissão para configurar esta app.'],
 session:['Your session ended. Sign in again.','A tua sessão terminou. Volta a iniciar sessão.'],
 conflict:['The settings changed. Review your changes and save again.','As definições mudaram. Revê as tuas alterações e guarda novamente.'],
 permissions:['This feature needs additional permissions. You can still turn it off.','Esta função precisa de permissões adicionais. Podes continuar a desativá-la.'],
 channel:['Choose an available text channel for welcome messages.','Escolhe um canal de texto disponível para as boas-vindas.'],
 unsupported:['This bot no longer supports these settings. Review the available options.','Este bot já não suporta estas definições. Revê as opções disponíveis.'],
 load_failed:['Could not load the settings. Try again.','Não foi possível carregar as definições. Tenta novamente.'],
 save_failed:['Could not confirm the save. Retry the same request.','Não foi possível confirmar se ficou guardado. Tenta novamente.'],
};
const errorCode=(error,fallback)=>{
 const value=`${error?.code||''} ${error?.message||''}`;
 if(/PGRST202|42883|schema cache|function .* does not exist/.test(value))return 'unavailable';
 if(/server_settings_(?:request_)?conflict/.test(value))return 'conflict';
 if(/manage_apps_required|missing_manage_apps|bot_not_installed|access_denied/.test(value))return 'access';
 if(/not_authenticated|JWT|PGRST30[123]/.test(value))return 'session';
 if(/server_settings_permission_required|missing_permission/.test(value))return 'permissions';
 if(/unsupported_server_setting/.test(value))return 'unsupported';
 if(/invalid_server_settings_channel/.test(value))return 'channel';
 return fallback;
};
const issue=(code='')=>code?(messages[code]||messages.load_failed)[1]:'';

function projection(value,owner){
 if(!value||value.ok!==true||identifier(value.server_id)!==owner.serverId||identifier(value.bot_id)!==owner.botId
  ||!identifier(value.install_id)||!safeInteger(value.support_revision)||!safeInteger(value.revision)||typeof value.configured!=='boolean'
  ||!Array.isArray(value.features)||!Array.isArray(value.channels)||!value.missing_permissions
  ||typeof value.settings?.welcome_enabled!=='boolean'||typeof value.settings?.dm_commands_enabled!=='boolean'
  ||value.settings.welcome_channel_id!==null&&!identifier(value.settings.welcome_channel_id))throw new Error('bot_server_settings_response_invalid');
 const channels=[],seen=new Set();
 for(const row of value.channels){
  const id=identifier(row?.id);
  if(!id||typeof row.name!=='string'||row.name.length>200)throw new Error('bot_server_settings_response_invalid');
  if(!seen.has(id)){channels.push({id,name:row.name});seen.add(id);}
 }
 const missingPermissions={};
 for(const feature of FEATURES){
  const list=value.missing_permissions[feature];
  if(!Array.isArray(list)||list.some(item=>typeof item!=='string'||item.length>100))throw new Error('bot_server_settings_response_invalid');
  missingPermissions[feature]=[...new Set(list)];
 }
 return {installId:identifier(value.install_id),supportRevision:value.support_revision,features:FEATURES.filter(feature=>value.features.includes(feature)),
  configured:value.configured,revision:value.revision,settings:{welcome_enabled:value.settings.welcome_enabled,welcome_channel_id:identifier(value.settings.welcome_channel_id)||null,dm_commands_enabled:value.settings.dm_commands_enabled},channels,missingPermissions};
}

// Settings stay scoped to one installation and one signed-in account. A lost
// write response keeps its exact CAS payload/UUID until confirmed or closed.
export function createBotServerSettingsController({supabase,getCurrentUserId,onChange=()=>{},randomUUID=()=>globalThis.crypto.randomUUID()}={}){
 if(!supabase?.rpc||typeof getCurrentUserId!=='function'||typeof randomUUID!=='function')throw new TypeError('invalid_bot_server_settings_client');
 let active=null,generation=0,disposed=false,authUserId,subscription;
 const user=()=>identifier(getCurrentUserId());
 const current=owner=>!disposed&&active===owner&&owner.userId===user()&&(authUserId===undefined||authUserId===owner.userId);
 const validation=owner=>{
  if(owner.draft.welcome_enabled){
   if(!owner.features.includes('welcome_messages'))return 'unsupported';
   if(missingGrants(owner,'welcome_messages').length)return 'permissions';
   if(!owner.channels.some(channel=>channel.id===owner.draft.welcome_channel_id))return 'channel';
  }
  if(owner.draft.dm_commands_enabled){
   if(!owner.features.includes('dm_commands'))return 'unsupported';
   if(missingGrants(owner,'dm_commands').length)return 'permissions';
  }
  return '';
 };
 function snapshot(){
  if(!active)return null;
  if(!current(active)){close();return null;}
  const owner=active,dirty=!sameSettings(owner.settings,owner.draft),ready=owner.loaded&&!owner.loading&&!owner.unavailable;
  return {key:`bot-settings:${owner.serverId}:${owner.botId}`,userId:owner.userId,serverId:owner.serverId,botId:owner.botId,generation:owner.generation,
   installId:owner.installId,supportRevision:owner.supportRevision,features:[...owner.features],configured:owner.configured,revision:owner.revision,
   settings:{...owner.settings},draft:{...owner.draft},channels:owner.channels.map(row=>({...row})),
   missingPermissions:Object.fromEntries(FEATURES.map(feature=>[feature,[...owner.missingPermissions[feature]]])),
   loading:owner.loading,saving:owner.saving,dirty,ready,unavailable:owner.unavailable,error:issue(owner.errorCode),errorCode:owner.errorCode,
   retryable:!!owner.operation&&!owner.saving,canSave:ready&&!owner.saving&&(!!owner.operation||owner.features.length>0&&(!owner.configured||dirty)&&!validation(owner)),
   pending:owner.operation?{requestId:owner.operation.args.p_request_id}:null};
 }
 const publish=owner=>{if(current(owner))onChange(snapshot());};
 function close(){
  const previous=active;active=null;generation++;
  for(const controller of previous?.controllers||[])controller.abort();
  if(previous)onChange(null);
 }
 async function call(name,args,owner){
  const controller=new AbortController();owner.controllers.add(controller);
  try{
   let request=supabase.rpc(name,args);
   if(typeof request?.abortSignal==='function')request=request.abortSignal(controller.signal);
   const result=await request;if(result?.error)throw result.error;
   if(result?.data?.ok!==true)throw new Error('bot_server_settings_response_invalid');
   return projection(result.data,owner);
  }finally{owner.controllers.delete(controller);}
 }
 function apply(owner,value,{keepDraft=false}={}){
  if(value.installId===owner.installId&&value.revision<owner.revision)throw new Error('bot_server_settings_response_invalid');
  Object.assign(owner,value);if(!keepDraft)owner.draft={...value.settings};owner.loaded=true;owner.unavailable=false;
 }
 function load(owner,{keepDraft=false}={}){
  if(!current(owner)||owner.operation)return Promise.resolve(false);
  if(owner.readFlight)return owner.readFlight;
  owner.loading=true;owner.errorCode='';publish(owner);
  const flight=(async()=>{
   try{
    const value=await call('bots_server_settings_get_v1',{p_server_id:owner.serverId,p_bot_id:owner.botId},owner);
    if(!current(owner))return false;apply(owner,value,{keepDraft});return true;
   }catch(error){
    if(!current(owner))return false;
    owner.errorCode=errorCode(error,'load_failed');owner.unavailable=owner.errorCode==='unavailable';owner.loaded=false;return false;
   }finally{if(current(owner)){owner.loading=false;owner.readFlight=null;publish(owner);}}
  })();owner.readFlight=flight;return flight;
 }
 function open({serverId,botId}={}){
  close();const userId=user(),sid=identifier(serverId),bid=identifier(botId);
  if(disposed||!userId||!sid||!bid||authUserId!==undefined&&authUserId!==userId)return Promise.resolve(false);
  active={userId,serverId:sid,botId:bid,generation,installId:'',supportRevision:0,features:[],configured:false,revision:0,
   settings:defaults(),draft:defaults(),channels:[],missingPermissions:{welcome_messages:[],dm_commands:[]},loaded:false,loading:false,saving:false,
   unavailable:false,errorCode:'',operation:null,readFlight:null,writeFlight:null,controllers:new Set()};
  return load(active);
 }
 const reload=()=>active&&current(active)?load(active,{keepDraft:!sameSettings(active.settings,active.draft)}):Promise.resolve(false);
 function updateDraft(patch){
  const owner=active;
  if(!owner||!current(owner)||!owner.loaded||owner.loading||owner.saving||owner.operation||!patch||typeof patch!=='object'||Array.isArray(patch))return false;
  const next={...owner.draft};
  for(const key of SETTINGS){
   if(!Object.hasOwn(patch,key))continue;
   const value=patch[key];
   if(key==='welcome_channel_id'){
    if(!owner.features.includes('welcome_messages')||value!==null&&value!==''&&!owner.channels.some(channel=>channel.id===identifier(value)))return false;
    next[key]=identifier(value)||null;
   }else{
    const feature=key==='welcome_enabled'?'welcome_messages':'dm_commands';
    if(typeof value!=='boolean'||value&&(!owner.features.includes(feature)||missingGrants(owner,feature).length))return false;
    next[key]=value;
   }
  }
  if(patch.welcome_enabled===false&&!owner.channels.some(channel=>channel.id===next.welcome_channel_id))next.welcome_channel_id=null;
  owner.draft=next;owner.errorCode='';publish(owner);return true;
 }
 function save(){
  const owner=active;
  if(!owner||!current(owner))return Promise.resolve(false);
  if(owner.writeFlight)return owner.writeFlight;
  if(!owner.loaded||owner.loading||owner.unavailable)return Promise.resolve(false);
  if(!owner.operation){
   const code=validation(owner);if(code){owner.errorCode=code;publish(owner);return Promise.resolve(false);}
   if(!owner.features.length||owner.configured&&sameSettings(owner.settings,owner.draft))return Promise.resolve(false);
   owner.operation={args:{p_server_id:owner.serverId,p_bot_id:owner.botId,p_install_id:owner.installId,p_expected_revision:owner.revision,
    p_expected_support_revision:owner.supportRevision,p_settings:{...owner.draft},p_request_id:randomUUID()}};
  }
  const operation=owner.operation;owner.saving=true;owner.errorCode='';publish(owner);
  const flight=(async()=>{
   try{
    const value=await call('bots_server_settings_save_v1',operation.args,owner);
    if(!current(owner)||owner.operation!==operation)return false;
    if(!value.configured||value.installId===operation.args.p_install_id&&(value.revision<=operation.args.p_expected_revision
     ||value.supportRevision<operation.args.p_expected_support_revision))throw new Error('bot_server_settings_response_invalid');
    // An idempotent replay may return a newer administrator's decision. It is
    // authority, but is not confirmation that this request is still in effect.
    const confirmed=value.installId===operation.args.p_install_id&&sameSettings(value.settings,operation.args.p_settings)
     &&!validation({...value,draft:operation.args.p_settings});
    apply(owner,value,{keepDraft:!confirmed});owner.operation=null;
    if(!confirmed)owner.errorCode='conflict';return confirmed;
   }catch(error){
    if(!current(owner)||owner.operation!==operation)return false;
    const code=errorCode(error,'save_failed');owner.errorCode=code;
    if(code!=='save_failed'){
     owner.operation=null;
     if(code==='conflict'||code==='permissions'||code==='unsupported'||code==='channel'){
      await load(owner,{keepDraft:true});if(current(owner))owner.errorCode=code;
     }else{owner.loaded=false;owner.unavailable=code==='unavailable';}
    }
    return false;
   }finally{if(current(owner)){owner.saving=false;owner.writeFlight=null;publish(owner);}}
  })();owner.writeFlight=flight;return flight;
 }
 if(supabase.auth?.onAuthStateChange){
  const result=supabase.auth.onAuthStateChange((event,session)=>{
   authUserId=event==='SIGNED_OUT'?'':identifier(session?.user?.id);
   if(active&&!current(active))close();
  });subscription=result?.data?.subscription;
 }
 const dispose=()=>{if(disposed)return;close();disposed=true;subscription?.unsubscribe?.();};
 return {open,reload,close,snapshot,updateDraft,save,dispose};
}

export function buildBotServerSettingsHtml(snapshot,{botName='Bot',serverName='',language=globalThis.document?.documentElement?.lang||'pt-PT'}={}){
 if(!snapshot)return '';
 const text=(en,pt)=>String(language).toLowerCase().startsWith('pt')?pt:en;
 const s=snapshot,locked=s.loading||s.saving||!!s.pending||!s.ready;
 const supported=feature=>s.features.includes(feature);
 const disabled=feature=>locked||!s.draft[feature==='welcome_messages'?'welcome_enabled':'dm_commands_enabled']&&missingGrants(s,feature).length>0;
 const channelMissing=s.draft.welcome_channel_id&&!s.channels.some(channel=>channel.id===s.draft.welcome_channel_id);
 const warning=feature=>missingGrants(s,feature).length?`<p class="hint">${esc(text('Additional permissions are needed to enable this feature. Review the app permissions.','São necessárias permissões adicionais para ativar esta função. Revê as permissões da app.'))}</p>`:feature==='welcome_messages'&&channelMissing?`<p class="hint">${esc(text('The previous channel is unavailable. Choose another channel or turn welcome messages off.','O canal anterior está indisponível. Escolhe outro canal ou desativa as boas-vindas.'))}</p>`:'';
 const error=s.errorCode?(messages[s.errorCode]||messages.load_failed)[String(language).toLowerCase().startsWith('pt')?1:0]:'';
 const fields=supported('welcome_messages')?`<div><label class="label botServerSettingsToggle"><input type="checkbox" name="welcome_enabled" data-bot-server-settings-field ${s.draft.welcome_enabled?'checked':''} ${disabled('welcome_messages')?'disabled':''}> ${esc(text('Welcome new members','Dar as boas-vindas a novos membros'))}</label><p class="hint">${esc(text('The bot sends a welcome message when someone joins this server.','O bot envia uma mensagem de boas-vindas quando alguém entra neste servidor.'))}</p>${warning('welcome_messages')}<label class="label" for="botServerSettingsWelcomeChannel">${esc(text('Welcome channel','Canal de boas-vindas'))}</label><select class="input" id="botServerSettingsWelcomeChannel" name="welcome_channel_id" data-bot-server-settings-field ${locked||!s.draft.welcome_enabled?'disabled':''}><option value="">${esc(text('Choose a text channel…','Escolher canal de texto…'))}</option>${channelMissing?`<option value="${esc(s.draft.welcome_channel_id)}" selected disabled>${esc(text('Channel unavailable — choose another','Canal indisponível — escolhe outro'))}</option>`:''}${s.channels.map(channel=>`<option value="${esc(channel.id)}" ${channel.id===s.draft.welcome_channel_id?'selected':''}># ${esc(channel.name)}</option>`).join('')}</select></div>`:'';
 const dm=supported('dm_commands')?`<div><label class="label botServerSettingsToggle"><input type="checkbox" name="dm_commands_enabled" data-bot-server-settings-field ${s.draft.dm_commands_enabled?'checked':''} ${disabled('dm_commands')?'disabled':''}> ${esc(text('Commands in direct messages','Comandos nas mensagens privadas'))}</label><p class="hint">${esc(text('Allow help, ping and roll commands in private conversations with this bot.','Permite os comandos de ajuda, ping e roll nas conversas privadas com este bot.'))}</p>${warning('dm_commands')}</div>`:'';
 const empty=s.ready&&!s.features.length?`<p class="hint">${esc(text('This bot does not provide settings for this server.','Este bot não disponibiliza definições para este servidor.'))}</p>`:'';
 return `<div class="modalCard serverSettingsCard" role="dialog" aria-modal="true" aria-labelledby="botServerSettingsTitle">
  <div class="modalTop"><div><div id="botServerSettingsTitle" class="modalTitle">${esc(text('Configure app','Configurar app'))}</div><div class="hint">${esc(botName)}${serverName?` · ${esc(serverName)}`:''}</div></div>
   <button class="btn ghost" type="button" data-bot-server-settings-close aria-label="${esc(text('Close','Fechar'))}" ${s.saving?'disabled':''}>&times;</button></div>
  <form class="botServerSettingsForm" data-bot-server-settings-form><div class="serverCreateBody">
   ${s.loading?`<p class="hint" role="status">${esc(text('Loading settings…','A carregar definições…'))}</p>`:''}${fields}${dm}${empty}
   ${s.ready&&s.features.length&&!s.configured?`<p class="hint">${esc(text('Save to apply these settings to this server.','Guarda para aplicar estas definições neste servidor.'))}</p>`:''}
   ${error?`<p class="hint error" role="alert">${esc(error)}</p>`:''}</div>
   <div class="serverCreateFooter">${!s.ready&&!s.loading?`<button class="btn ghost" type="button" data-bot-server-settings-reload>${esc(text('Try again','Tentar novamente'))}</button>`:''}
    <button class="btn ghost" type="button" data-bot-server-settings-close ${s.saving?'disabled':''}>${esc(text('Cancel','Cancelar'))}</button>
    ${s.features.length||s.pending?`<button class="btn primary" type="submit" data-bot-server-settings-save ${s.canSave?'':'disabled'}>${esc(s.saving?text('Saving…','A guardar…'):s.retryable?text('Retry save','Tentar guardar novamente'):text('Save','Guardar'))}</button>`:''}
   </div></form></div>`;
}
