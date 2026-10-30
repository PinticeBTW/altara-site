const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id=value=>typeof value==='string'&&UUID.test(value)?value.toLowerCase():'';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Deferred release: retain Stage code and metadata without exposing its controls.
export const STAGE_RELEASE_ENABLED=false;
// Threads and channel-mode controls are deferred; keep implementations and data.
export const CHANNEL_THREADS_AND_MODES_ENABLED=false;
// Presentation availability only. Database and voice authority remain unchanged.
export function isServerChannelReleaseVisible(serverId,channelId){
 return STAGE_RELEASE_ENABLED||id(serverId)!=='42e696c5-c152-4854-b331-a259ce503b3f'||id(channelId)!=='2dd245d1-01a4-431c-9ea0-57852ff1d11f';
}
const modes=new Set(['normal','forum','stage']),states=new Set(['active','pending']);
const knownFailure=/42501|denied|invalid_|unknown_|conflict|not_active|not_connected|protected_|quota|rate_limited|stage_enforcement_pending/;
export function channelModeError(error){
 const value=`${error?.code||''} ${error?.message||''}`;
 if(/PGRST202|42883/.test(value))return'Esta função ainda não está disponível neste servidor.';
 if(/pending|55000/.test(value))return'O palco ainda está a ser preparado. Volta a verificar daqui a pouco.';
 if(/42501|denied|not_authenticated|protected_|not_connected/.test(value))return'Já não tens acesso a esta ação ou a pessoa saiu da chamada.';
 if(/invalid_|unknown_|conflict/.test(value))return'Esta ação já não corresponde ao estado do canal. Atualiza para rever.';
 if(/quota|rate_limited/.test(value))return'Atingiste o limite. Tenta novamente mais tarde.';
 return'Não foi possível confirmar a ação. Podes tentar novamente.';
}
export function normalizeChannelMode(data,context){
 if(data?.ok!==true||id(data.server_id)!==id(context.serverId)||id(data.channel_id)!==id(context.channelId)
  ||!modes.has(data.mode)||!states.has(data.state)||(data.revision!==null&&!id(data.revision))
  ||!Array.isArray(data.participants)||data.participants.length>200
  ||(data.mode==='forum'&&context.channelType!=='text')||(data.mode==='stage'&&context.channelType!=='voice'))throw Error('invalid_channel_mode_response');
 const seen=new Set(),participants=data.participants.map(row=>{
  const key=`${row?.subject_kind}:${id(row?.subject_id)}`;
  if(!['user','bot'].includes(row?.subject_kind)||!id(row.subject_id)||!id(row.revision)||!states.has(row.state)
   ||typeof row.speaker!=='boolean'||typeof row.requested!=='boolean'||seen.has(key))throw Error('invalid_channel_mode_response');
  seen.add(key);return{subject_kind:row.subject_kind,subject_id:id(row.subject_id),speaker:row.speaker,requested:row.requested,state:row.state,revision:id(row.revision)};
 });
 return{serverId:id(data.server_id),channelId:id(data.channel_id),mode:data.mode,state:data.state,revision:id(data.revision)||null,participants};
}

// UI capability snapshots can hide actions. SQL and the authenticated media
// adapter independently authorize every operation and its final stage revision.
export function createChannelModeController({rpc,callAction,getContext,uuid=()=>crypto.randomUUID(),onChange=()=>{}}){
 let owner=null;
 const current=value=>{const context=getContext();if(!STAGE_RELEASE_ENABLED&&(value?.channelType==='voice'||context?.channelType==='voice')){if(owner)close();return false;}return value===owner&&context?.canView===true&&id(context.actor)===value.actor&&id(context.serverId)===value.serverId&&id(context.channelId)===value.channelId&&context.channelType===value.channelType;};
 function close(){owner=null;onChange(null);}
 function snapshot(){if(!owner)return null;if(!current(owner)){if(owner)close();return null;}return{...structuredClone(owner),operation:owner.operation?{action:owner.operation.action}:null};}
 const publish=value=>{if(current(value))onChange(snapshot());};
 async function refresh(){
  const value=owner;if(!value||!current(value)||value.busy||value.operation)return false;
  value.busy=true;publish(value);
  try{
   // Only the trusted Edge adapter can reconcile pending LiveKit grants.
   const preparing=value.data?.state==='pending'||value.data?.participants.some(row=>row.state==='pending');
   const result=preparing?await callAction({action:'channel_mode_get',server_id:value.serverId,channel_id:value.channelId,payload:{channel_id:value.channelId}}):await rpc('altara_channel_modes_read_v1',{p_server_id:value.serverId,p_channel_id:value.channelId});if(!current(value))return false;if(result?.error)throw result.error;
   value.data=normalizeChannelMode(result?.data??result,value);value.error='';if(value.data.state==='active')value.notBefore=null;return true;
  }catch(error){if(current(value)){value.error=channelModeError(error);value.data=null;}return false;}
  finally{if(current(value)){value.busy=false;publish(value);}}
 }
 async function open(){
  close();const context=getContext();if(context?.canView!==true||!id(context.actor)||!id(context.serverId)||!id(context.channelId)||!['text','voice'].includes(context.channelType)||(!STAGE_RELEASE_ENABLED&&context.channelType==='voice'))return false;
  owner={actor:id(context.actor),serverId:id(context.serverId),channelId:id(context.channelId),channelType:context.channelType,data:null,busy:false,error:'',operation:null,notBefore:null};return refresh();
 }
 function allowed(value,action,payload){
  if(!current(value)||value.busy||!value.data||value.data.state!=='active')return false;
  if(!STAGE_RELEASE_ENABLED&&(action.startsWith('stage_')||(action==='channel_mode_set'&&payload.mode==='stage')))return false;
  const context=getContext();
  if(action==='channel_mode_set')return context.canManageChannels===true&&modes.has(payload.mode)&&!(payload.mode==='forum'&&value.channelType!=='text')&&!(payload.mode==='stage'&&value.channelType!=='voice');
  if(action==='stage_participant_set'){
   const existing=value.data.participants.find(row=>row.subject_kind===payload.subject_kind&&row.subject_id===id(payload.subject_id));
   return value.data.mode==='stage'&&context.canModerateStage===true&&['user','bot'].includes(payload.subject_kind)&&!!id(payload.subject_id)&&typeof payload.speaker==='boolean'&&(!existing||existing.state==='active');
  }
  if(action==='stage_request')return value.data.mode==='stage'&&context.canConnect===true&&context.connected===true&&typeof payload.enabled==='boolean';
  if(action==='forum_post_create')return value.data.mode==='forum'&&context.canCreatePosts===true&&typeof payload.title==='string'&&payload.title.trim().length>0&&payload.title.trim().length<=100&&typeof payload.content==='string'&&payload.content.trim().length>0&&payload.content.trim().length<=2000;
  return false;
 }
 async function mutate(action,payload){
  const value=owner;if(!value||value.operation||!allowed(value,action,payload))return false;
  value.operation={server_id:value.serverId,channel_id:value.channelId,action,payload:{...structuredClone(payload),channel_id:value.channelId},request_id:uuid()};return retry();
 }
 async function retry(){
  const value=owner,operation=value?.operation;if(!operation||!allowed(value,operation.action,operation.payload))return false;
  value.busy=true;value.error='';publish(value);
  try{
   const result=await callAction(structuredClone(operation));if(!current(value))return false;
   const data=result?.data??result;if(result?.error)throw result.error;if(data?.ok!==true)throw Error('invalid_channel_mode_response');
   if(operation.action==='channel_mode_set'||operation.action==='stage_participant_set'){
    if(!states.has(data.state)||(data.server_id!==undefined&&id(data.server_id)!==value.serverId)||(data.channel_id!==undefined&&id(data.channel_id)!==value.channelId))throw Error('invalid_channel_mode_response');
    if(data.state==='pending')value.notBefore=typeof data.not_before==='string'&&Number.isFinite(Date.parse(data.not_before))?data.not_before:null;
   }
   if(operation.action==='forum_post_create'&&!id(data.thread?.id))throw Error('invalid_channel_mode_response');
   value.operation=null;value.busy=false;await refresh();return data;
  }catch(error){if(current(value)){value.error=channelModeError(error);if(knownFailure.test(`${error?.code||''} ${error?.message||''}`))value.operation=null;}return false;}
  finally{if(current(value)){value.busy=false;publish(value);}}
 }
 return{open,close,snapshot,refresh,retry,setMode:mode=>mutate('channel_mode_set',{mode}),setSpeaker:(subject_kind,subject_id,speaker)=>mutate('stage_participant_set',{subject_kind,subject_id,speaker}),requestSpeak:enabled=>mutate('stage_request',{enabled}),createForumPost:(title,content)=>typeof title==='string'&&typeof content==='string'?mutate('forum_post_create',{title:title.trim(),content:content.trim()}):Promise.resolve(false)};
}

export function createChannelModeDialog({document,rpc,callAction,getContext,onOpenThreads,resolveParticipant=()=>null,onChange=()=>{}}){
 let dialog=null,returnFocus=null,controller;
 function render(snapshot){
  if(!snapshot){dialog?.close();dialog?.remove();dialog=null;if(returnFocus?.isConnected)returnFocus.focus();onChange(null);return;}
  if(!dialog){returnFocus=document.activeElement;dialog=document.createElement('dialog');dialog.className='serverResourceDialog channelModesDialog';dialog.setAttribute('aria-label','Modo do canal');document.body.append(dialog);dialog.addEventListener('cancel',event=>{event.preventDefault();controller.close();});dialog.addEventListener('click',handleClick);dialog.showModal();}
  const context=getContext(),data=snapshot.data,locked=snapshot.busy||!!snapshot.operation,pending=data?.state==='pending';
  const modeLabels=snapshot.channelType==='text'?{normal:'Chat',forum:'Fórum'}:{normal:'Conversa de voz',...(STAGE_RELEASE_ENABLED?{stage:'Palco'}:{})};
  const pick=context.canManageChannels===true?`<div role="group" aria-label="Modo do canal">${Object.entries(modeLabels).map(([mode,label])=>`<button type="button" data-mode="${mode}" aria-pressed="${data?.mode===mode}" ${locked||pending||!data?'disabled':''}>${label}</button>`).join('')}</div>`:'';
  const stageRows=[...(data?.participants||[])];
  for(const subject of (Array.isArray(context.connectedSubjects)?context.connectedSubjects:[]).slice(0,200))if(['user','bot'].includes(subject?.kind)&&id(subject.id)&&!stageRows.some(row=>row.subject_kind===subject.kind&&row.subject_id===id(subject.id)))stageRows.push({subject_kind:subject.kind,subject_id:id(subject.id),speaker:false,requested:false,state:'active'});
  const own=data?.participants.find(row=>row.subject_kind==='user'&&row.subject_id===snapshot.actor);
  const stage=STAGE_RELEASE_ENABLED&&data?.mode==='stage'?`<section aria-label="Palco"><h3>Palco</h3><p>${pending?'O palco está a ser preparado. As permissões da chamada ainda não estão confirmadas.':'Só os oradores confirmados podem falar.'}</p>${!pending&&context.connected===true&&context.canConnect===true?`<button type="button" data-request="${!own?.requested}" ${locked?'disabled':''}>${own?.requested?'Retirar pedido':'Pedir para falar'}</button>`:''}<ul>${stageRows.map(row=>{
   const profile=resolveParticipant(row.subject_kind,row.subject_id),name=profile?.name|| (row.subject_kind==='bot'?'Bot':'Membro');
   const state=row.state==='pending'?'A preparar':row.speaker?'Orador':row.requested?'Pediu para falar':'Público';
   return`<li><span>${esc(name)}${row.subject_kind==='bot'?' · BOT':''} · ${state}</span>${!pending&&context.canModerateStage===true?`<button type="button" data-speaker-kind="${row.subject_kind}" data-speaker-id="${row.subject_id}" data-speaker="${!row.speaker}" ${locked||row.state!=='active'?'disabled':''}>${row.speaker?'Mover para o público':'Dar a palavra'}</button>`:''}</li>`;
  }).join('')}</ul></section>`:'';
  dialog.innerHTML=`<header><h2>Modo do canal</h2><button type="button" data-close aria-label="Fechar">×</button></header>${pick}${data?.mode==='forum'?`<p>As publicações usam as conversas e respostas deste canal.</p><button type="button" data-threads ${locked||pending?'disabled':''}>Abrir publicações</button>`:''}${stage}<p role="status">${esc(snapshot.error||(snapshot.busy?'A carregar…':pending?'A preparar o canal. Volta a verificar daqui a pouco.':''))}</p><footer><button type="button" data-refresh ${locked?'disabled':''}>Verificar estado</button><button type="button" data-retry ${!snapshot.operation||snapshot.busy?'hidden':''}>Tentar novamente</button></footer>`;
  onChange(snapshot);
 }
 async function handleClick(event){
  const button=event.target.closest('button');if(!button||button.disabled)return;
  if(button.hasAttribute('data-close'))return controller.close();
  if(button.hasAttribute('data-refresh'))return controller.refresh();
  if(button.hasAttribute('data-retry'))return controller.retry();
  if(button.hasAttribute('data-mode'))return controller.setMode(button.dataset.mode);
  if(button.hasAttribute('data-request'))return controller.requestSpeak(button.dataset.request==='true');
  if(button.hasAttribute('data-speaker'))return controller.setSpeaker(button.dataset.speakerKind,button.dataset.speakerId,button.dataset.speaker==='true');
  if(button.hasAttribute('data-threads')){const snapshot=controller.snapshot();if(!snapshot||snapshot.busy||snapshot.operation||snapshot.data?.mode!=='forum'||snapshot.data.state!=='active')return;const seed={serverId:snapshot.serverId,channelId:snapshot.channelId,forum:true};controller.close();await onOpenThreads?.(seed);}
 }
 controller=createChannelModeController({rpc,callAction,getContext,onChange:render});
 return{open:controller.open,close:controller.close,sync:controller.snapshot,refresh:controller.refresh,createForumPost:controller.createForumPost,setSpeaker:controller.setSpeaker,requestSpeak:controller.requestSpeak};
}

export const eventStatusTransitions=Object.freeze({scheduled:Object.freeze(['active','canceled']),active:Object.freeze(['completed']),completed:Object.freeze([]),canceled:Object.freeze([])});
export function renderEventLifecycleControls(event,{canManage=false,busy=false}={}){
 const status=event?.lifecycle_status??'scheduled',labels={scheduled:'Agendado',active:'A decorrer',completed:'Terminado',canceled:'Cancelado'},actions={active:'Iniciar',completed:'Terminar',canceled:'Cancelar'};
 if(!id(event?.id)||!Object.hasOwn(labels,status))return'';
 return`<div class="eventLifecycle" role="group" aria-label="Estado do evento"><span>${labels[status]}</span>${canManage?eventStatusTransitions[status].map(next=>`<button type="button" class="eventEdit" data-event-lifecycle-id="${id(event.id)}" data-event-lifecycle-status="${next}" ${busy?'disabled':''}>${actions[next]}</button>`).join(''):''}</div>`;
}

export function createEventLifecycleController({rpc,getContext,uuid=()=>crypto.randomUUID(),onChange=()=>{}}){
 let owner=null;
 const current=value=>{const context=getContext(value.eventId);return value===owner&&context?.canReadEvents===true&&id(context.actor)===value.actor&&id(context.serverId)===value.serverId;};
 function close(){owner=null;onChange(null);}
 function snapshot(){if(!owner)return null;if(!current(owner)){close();return null;}return{actor:owner.actor,serverId:owner.serverId,eventId:owner.eventId,data:structuredClone(owner.data),busy:owner.busy,error:owner.error,retryable:!!owner.operation};}
 const publish=value=>{if(current(value))onChange(snapshot());};
 function normalize(data,value){
  if(data?.ok!==true||id(data.event_id)!==value.eventId||id(data.server_id)!==value.serverId||!Object.hasOwn(eventStatusTransitions,data.status)||(data.revision!==null&&!id(data.revision)))throw Error('invalid_event_lifecycle_response');
  return{eventId:value.eventId,status:data.status,revision:id(data.revision)||null};
 }
 async function refresh(){
  const value=owner;if(!value||!current(value)||value.busy||value.operation)return false;
  value.busy=true;publish(value);
  try{const result=await rpc('altara_event_lifecycle_read_v1',{p_event_id:value.eventId});if(!current(value))return false;if(result?.error)throw result.error;value.data=normalize(result?.data,value);value.error='';return true;}
  catch(error){if(current(value)){value.data=null;value.error=channelModeError(error);}return false;}
  finally{if(current(value)){value.busy=false;publish(value);}}
 }
 async function open(eventId){
  close();const context=getContext(eventId);if(!id(eventId)||context?.canReadEvents!==true||!id(context.actor)||!id(context.serverId))return false;
  owner={actor:id(context.actor),serverId:id(context.serverId),eventId:id(eventId),data:null,busy:false,error:'',operation:null};return refresh();
 }
 async function setStatus(status){
  const value=owner;if(!value||!current(value)||value.busy||value.operation||getContext(value.eventId).canManageEvents!==true||!value.data||!eventStatusTransitions[value.data.status].includes(status))return false;
  value.operation={p_event_id:value.eventId,p_status:status,p_request_id:uuid()};return retry();
 }
 async function retry(){
  const value=owner;if(!value?.operation||!current(value)||value.busy||getContext(value.eventId).canManageEvents!==true)return false;
  value.busy=true;value.error='';publish(value);
  try{const result=await rpc('altara_event_lifecycle_actor_v1',structuredClone(value.operation));if(!current(value))return false;if(result?.error)throw result.error;
   const data=normalize(result?.data,value);if(data.status!==value.operation.p_status)throw Error('invalid_event_lifecycle_response');value.data=data;value.operation=null;return true;
  }catch(error){if(current(value)){value.error=channelModeError(error);if(knownFailure.test(`${error?.code||''} ${error?.message||''}`))value.operation=null;}return false;}
  finally{if(current(value)){value.busy=false;publish(value);}}
 }
 return{open,close,snapshot,refresh,setStatus,retry};
}
