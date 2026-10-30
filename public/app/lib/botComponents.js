import { botEmbedUrl, renderBotEmbedText, renderBotEmbeds } from "./botEmbeds.js";
const escape = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const text = (v,n) => typeof v === "string" ? [...v].slice(0,n).join("") : "";
const uuid = v => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

const entityUuid = v => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const entityKinds = type => ({5:["user"],6:["role"],7:["user","role"],8:["channel"]}[type] || []);
const object = value => value && typeof value === "object" && !Array.isArray(value);
const componentError = () => { throw Error("invalid_components"); };
const keysOnly = (value,keys) => {if(!object(value) || Object.keys(value).some(key=>!keys.includes(key)))componentError();};
const boundedText = (value,max,{optional=false}={}) => {
 if(optional && value===undefined)return undefined;
 if(typeof value!=="string" || !value.length&&!optional || [...value].length>max || /[\u0000]/.test(value))componentError();
 return value;
};

// Canonical message component grammar. Entity names and media URLs are never
// accepted here: the actor-scoped entity RPC and attachment broker supply them.
export function normalizeBotComponentTree(value) {
 if(!Array.isArray(value) || value.length>5)componentError();
 let size;try{size=new TextEncoder().encode(JSON.stringify(value)).length;}catch{componentError();}
 if(size>32768)componentError();
 let nodes=0;const customIds=new Set();
 const identify=c=>{boundedText(c.custom_id,100);if(/[\u0000-\u001f\u007f]/.test(c.custom_id)||customIds.has(c.custom_id))componentError();customIds.add(c.custom_id);};
 const media=ref=>{keysOnly(ref,["upload_id"]);if(!entityUuid(ref.upload_id))componentError();return {upload_id:ref.upload_id.toLowerCase()};};
 const visit=(c,parent="root")=>{
  if(++nodes>40 || !object(c) || !Number.isInteger(c.type))componentError();
  const allowed=parent==="root"?[1,9,10,12,13,14,17]:parent==="container"?[1,9,10,12,13,14]:parent==="row"?[2,3,5,6,7,8]:parent==="section"?[10]:[2,11];
  if(!allowed.includes(c.type))componentError();
  if(c.type===1){
   keysOnly(c,["type","components"]);if(!Array.isArray(c.components) || !c.components.length || c.components.length>5)componentError();
   if(c.components.some(x=>[3,5,6,7,8].includes(x?.type)) && c.components.length!==1)componentError();
   return {type:1,components:c.components.map(x=>visit(x,"row"))};
  }
  if(c.type===2){
   keysOnly(c,["type","style","label","custom_id","url","disabled"]);boundedText(c.label,80);
   if(![1,2,3,4,5].includes(c.style) || c.disabled!==undefined && typeof c.disabled!=="boolean")componentError();
   if(c.style===5){if(c.custom_id!==undefined || !botEmbedUrl(c.url))componentError();}
   else{if(c.url!==undefined)componentError();identify(c);}
   return structuredClone(c);
  }
  if([3,5,6,7,8].includes(c.type)){
   keysOnly(c,["type","custom_id","placeholder","min_values","max_values","disabled",...(c.type===3?["options"]:["default_values",...(c.type===8?["channel_types"]:[])])]);
   identify(c);boundedText(c.placeholder,100,{optional:true});
   const min=c.min_values??1,max=c.max_values??1;
   if(!Number.isInteger(min)||!Number.isInteger(max)||min<0||max<1||max>25||min>max || c.disabled!==undefined && typeof c.disabled!=="boolean")componentError();
   if(c.type===3){
    if(!Array.isArray(c.options) || !c.options.length || c.options.length>25 || max>c.options.length)componentError();
    const seen=new Set();for(const o of c.options){keysOnly(o,["label","value","description","default"]);boundedText(o.label,100);boundedText(o.value,100);boundedText(o.description,100,{optional:true});if(seen.has(o.value) || o.default!==undefined && typeof o.default!=="boolean")componentError();seen.add(o.value);}
    if(c.options.filter(o=>o.default===true).length>max)componentError();
   }else{
    if(c.default_values!==undefined && (!Array.isArray(c.default_values)||c.default_values.length>max))componentError();
    const seen=new Set();for(const d of c.default_values||[]){keysOnly(d,["id","type"]);if(!entityUuid(d.id)||!entityKinds(c.type).includes(d.type)||seen.has(d.id.toLowerCase()))componentError();seen.add(d.id.toLowerCase());}
    if(c.type===8 && c.channel_types!==undefined && (!Array.isArray(c.channel_types)||!c.channel_types.length||c.channel_types.length>2||new Set(c.channel_types).size!==c.channel_types.length||c.channel_types.some(x=>![0,2].includes(x))))componentError();
   }
   return {...structuredClone(c),min_values:min,max_values:max};
  }
  if(c.type===10){keysOnly(c,["type","content"]);return {type:10,content:boundedText(c.content,2000)};}
  if(c.type===14){keysOnly(c,["type","divider","spacing"]);if(c.divider!==undefined&&typeof c.divider!=="boolean" || c.spacing!==undefined&&![1,2].includes(c.spacing))componentError();return {...c};}
  if(c.type===17){
   keysOnly(c,["type","components","accent_color","spoiler"]);
   if(!Array.isArray(c.components)||!c.components.length||c.components.length>10 || c.accent_color!==undefined&&(!Number.isInteger(c.accent_color)||c.accent_color<0||c.accent_color>0xffffff) || c.spoiler!==undefined&&typeof c.spoiler!=="boolean")componentError();
   return {...c,components:c.components.map(x=>visit(x,"container"))};
  }
  if(c.type===9){
   keysOnly(c,["type","components","accessory"]);if(!Array.isArray(c.components)||!c.components.length||c.components.length>3 || !c.accessory)componentError();
   return {type:9,components:c.components.map(x=>visit(x,"section")),accessory:visit(c.accessory,"accessory")};
  }
  if(c.type===11 || c.type===13){keysOnly(c,["type",c.type===13?"file":"media","description","spoiler"]);boundedText(c.description,256,{optional:true});if(c.spoiler!==undefined&&typeof c.spoiler!=="boolean")componentError();return {...c,[c.type===13?"file":"media"]:media(c[c.type===13?"file":"media"])};}
  if(c.type===12){
   keysOnly(c,["type","items"]);if(!Array.isArray(c.items)||!c.items.length||c.items.length>10)componentError();
   return {type:12,items:c.items.map(item=>{keysOnly(item,["media","description","spoiler"]);boundedText(item.description,256,{optional:true});if(item.spoiler!==undefined&&typeof item.spoiler!=="boolean")componentError();return {...item,media:media(item.media)};})};
  }
  componentError();
 };
 return value.map(c=>visit(c));
}

export function normalizeBotComponentEntities(componentType,response) {
 const kinds=entityKinds(componentType);
 if(!kinds.length || !object(response) || response.component_type!==componentType || !Array.isArray(response.items) || response.items.length>25)throw Error("invalid_component_entities");
 const seen=new Set();return response.items.map(item=>{
  if(!object(item)||!entityUuid(item.id)||!kinds.includes(item.kind)||typeof item.name!=="string"||!item.name.trim()||[...item.name].length>256 || /[\u0000-\u001f]/.test(item.name))throw Error("invalid_component_entities");
  const id=item.id.toLowerCase();if(seen.has(id))throw Error("invalid_component_entities");seen.add(id);
  if(item.kind==="channel"&&![0,2].includes(item.channel_type))throw Error("invalid_component_entities");
  return {id,kind:item.kind,name:item.name,...(item.kind==="channel"?{channel_type:item.channel_type}:{})};
 });
}

export function validateBotEntitySelection(componentType,values,items,{min=1,max=1,channelTypes=[]}={}) {
 if(!entityKinds(componentType).length || !Number.isInteger(min)||!Number.isInteger(max)||min<0||max<1||max>25||min>max||!Array.isArray(channelTypes)||channelTypes.some(x=>![0,2].includes(x)) || !Array.isArray(values)||values.length<min||values.length>max||values.some(x=>!entityUuid(x)))throw Error("invalid_component_values");
 const normalized=values.map(x=>x.toLowerCase());if(new Set(normalized).size!==normalized.length)throw Error("invalid_component_values");
 const authorized=normalizeBotComponentEntities(componentType,{component_type:componentType,items});
 for(const id of normalized){const item=authorized.find(x=>x.id===id);if(!item || componentType===8&&channelTypes.length&&!channelTypes.includes(item.channel_type))throw Error("invalid_component_values");}
 return normalized;
}

export function botMessageComponents(message) {
 if (message?.source !== "bot_channel_messages") return [];
 return Array.isArray(message.metadata?.components) ? message.metadata.components.slice(0,5) : [];
}

export function renderBotComponents(message,options={}) {
 const rows=botMessageComponents(message), meta=message?.metadata || {};
 const id=message?.bot_channel_message_id || message?.message_id || message?.response_message_id || message?.id?.replace(/^bot:/,"");
 if (!rows.length || !uuid(id) || !uuid(meta.components_revision)) return "";
 return renderComponentRows(rows,id,meta,false,options);
}

export function renderBotSurfaceComponents(message,options={}) {
 const kind=message?.source_kind || ({bot_direct_messages_v1:"dm",bot_direct_messages:"dm",bot_thread_messages_v1:"thread",bot_thread_messages:"thread"}[message?.source]);
 if(!["dm","thread"].includes(kind))return "";
 const id=message?.source_message_id || message?.direct_message_id || message?.thread_message_id || message?.message_id || message?.id;
 const meta=message?.metadata?.components?message.metadata:message;
 if(!entityUuid(id)||!entityUuid(meta?.components_revision)||!Array.isArray(meta.components)||!meta.components.length)return "";
 return renderComponentRows(meta.components.slice(0,5),id,meta,false,options).replace('data-bot-message-id=',`data-bot-source-kind="${kind}" data-bot-message-id=`);
}

export function renderBotPrivateComponents(response,options={}) {
 const rows=response?.components;
 if(!Array.isArray(rows) || !rows.length || !uuid(response.response_id) || !uuid(response.components_revision))return "";
 return renderComponentRows(rows.slice(0,5),response.response_id,response,true,options);
}

function renderComponentRows(rows,id,meta,isPrivate,{resolveMedia,resolveMention}={}) {
 const expired=!Number.isFinite(Date.parse(meta.components_expires_at)) || Date.parse(meta.components_expires_at)<=Date.now();
 const mediaHtml=(c,ref,file=false)=>{
  let item;try{item=typeof resolveMedia==="function"?resolveMedia(ref.upload_id):null;}catch{item=null;}
  const url=object(item)&&item.uploadId===ref.upload_id?botEmbedUrl(item.url):"";
  const label=escape(text(c.description,256)||text(item?.name,180)||"Attachment");
  const available=!!url,canImage=available&&["image/png","image/jpeg","image/gif","image/webp"].includes(item.mime);
  const body=file?`<button type="button" class="botComponentFile" data-bot-media-upload="${escape(ref.upload_id)}" ${available?"":"disabled"}>${label}${available?"":" — unavailable"}</button>`:canImage?`<button type="button" class="botComponentMedia" data-bot-media-upload="${escape(ref.upload_id)}"><img src="${escape(url)}" alt="${label}" loading="lazy" referrerpolicy="no-referrer"></button>`:`<span class="botComponentMedia--unavailable">${label} — unavailable</span>`;
  const slot=`<span class="botComponentMediaSlot" data-bot-component-media-upload="${escape(ref.upload_id)}" data-bot-component-media-kind="${file?'file':'image'}">${body}</span>`;
  return c.spoiler?`<details class="botComponentSpoiler"><summary>Spoiler</summary>${slot}</details>`:slot;
 };
 const render=c=>{
  if(!object(c))return "";
  if(c.type>=5){
   try{
    if([5,6,7,8].includes(c.type))c=normalizeBotComponentTree([{type:1,components:[c]}])[0].components[0];
    else if(c.type===11)c=normalizeBotComponentTree([{type:9,components:[{type:10,content:"media"}],accessory:c}])[0].accessory;
    else c=normalizeBotComponentTree([c])[0];
   }catch{return "";}
  }
  if(c.type===1 && Array.isArray(c.components))return `<div class="botComponents__row">${c.components.slice(0,5).map(render).join("")}</div>`;
   const disabled=expired || c.disabled===true;
   if(c.type===2){
    const label=escape(text(c.label,80));
    if(c.style===5){const url=botEmbedUrl(c.url);return url?`<a class="botComponentButton botComponentButton--link" href="${escape(url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${label} ↗</a>`:"";}
    if (![1,2,3,4].includes(c.style) || !text(c.custom_id,100))return "";
    return `<button type="button" class="botComponentButton botComponentButton--${c.style}" data-bot-custom-id="${escape(text(c.custom_id,100))}" ${disabled?'disabled':''}>${label}</button>`;
   }
   if(c.type===3 && Array.isArray(c.options) && text(c.custom_id,100)){
    const multi=Number(c.max_values||1)>1;
    return `<form class="botComponentMenu" data-bot-custom-id="${escape(text(c.custom_id,100))}"><label>${escape(text(c.placeholder,100)||"Choose an option")}<select name="values" ${multi?'multiple':''} ${disabled?'disabled':''} ${Number(c.min_values ?? 1)>0?'required':''}>${!multi?'<option value="">Choose…</option>':''}${c.options.slice(0,25).map(o=>`<option value="${escape(text(o.value,100))}" ${o.default===true?'selected':''}>${escape(text(o.label,100))}</option>`).join("")}</select></label><button type="submit" class="botComponentButton botComponentButton--2" ${disabled?'disabled':''}>Confirm</button></form>`;
   }
   if([5,6,7,8].includes(c.type)){
    let menu;try{menu=normalizeBotComponentTree([{type:1,components:[c]}])[0].components[0];}catch{return "";}
    const label=escape(menu.placeholder||({5:"Choose a member",6:"Choose a role",7:"Choose a member or role",8:"Choose a channel"}[menu.type]));
    return `<form class="botComponentMenu botComponentEntityMenu" data-bot-custom-id="${escape(menu.custom_id)}" data-bot-component-type="${menu.type}" data-bot-min-values="${menu.min_values}" data-bot-max-values="${menu.max_values}" data-bot-default-values="${escape(JSON.stringify(menu.default_values||[]))}" data-bot-channel-types="${escape(JSON.stringify(menu.channel_types||[]))}" ${disabled?'data-bot-expired="true"':''}><label>${label}<input type="search" data-bot-entity-search maxlength="100" autocomplete="off" placeholder="Search…" ${disabled?'disabled':''}></label><label>${label}<select name="values" ${menu.max_values>1?'multiple':''} ${disabled?'disabled':''} ${menu.min_values>0?'required':''}><option value="">Choose…</option></select></label><span class="botComponentMenu__status" role="status" aria-live="polite"></span><button type="submit" class="botComponentButton botComponentButton--2" disabled>Confirm</button></form>`;
   }
   if(c.type===10)return `<div class="botComponentText">${renderBotEmbedText(c.content,{resolveMention})}</div>`;
   if(c.type===14)return `<div class="botComponentSeparator botComponentSeparator--${c.spacing||1}" ${c.divider===false?'aria-hidden="true"':'role="separator"'}>${c.divider===false?'':'<hr>'}</div>`;
   if(c.type===17){const body=c.components.map(render).join(""),accent=c.accent_color!==undefined?` style="--bot-component-accent:#${c.accent_color.toString(16).padStart(6,"0")}"`:"";return c.spoiler?`<details class="botComponentContainer botComponentSpoiler"${accent}><summary>Spoiler</summary>${body}</details>`:`<div class="botComponentContainer"${accent}>${body}</div>`;}
   if(c.type===9)return `<section class="botComponentSection"><div>${c.components.map(render).join("")}</div>${render(c.accessory)}</section>`;
   if(c.type===11)return mediaHtml(c,c.media);
   if(c.type===13)return mediaHtml(c,c.file,true);
   if(c.type===12)return `<div class="botComponentGallery">${c.items.map(item=>mediaHtml(item,item.media)).join("")}</div>`;
   return "";
 };
 const html=rows.map(row=>{if(row?.type===1&&!row.components?.some(c=>c?.type>=5))return render(row);try{return render(normalizeBotComponentTree([row])[0]);}catch{return "";}}).join("");
 return `<div class="botComponents" ${isPrivate?'data-bot-response-id':'data-bot-message-id'}="${escape(id)}" data-bot-revision="${escape(meta.components_revision)}">${html}<div class="botComponents__status" role="status" aria-live="polite">${expired?'These actions have expired.':''}</div></div>`;
}

const errorText = error => /expired|not_available/.test(error?.message||"") ? "This action is no longer available." : /denied|permission/.test(error?.message||"") ? "You cannot use this action in this channel." : /rate_limited/.test(error?.message||"") ? "Please wait before trying again." : "The bot could not complete this action. Try again.";

const contextKey = context => context ? (context.sourceKind || context.source_kind ? [context.sourceKind || context.source_kind,context.botId,context.originServerId || context.origin_server_id,context.threadId || context.thread_id,context.parentChannelId || context.parent_channel_id,context.conversationId,context.navigation ?? ""] : [context.serverId,context.channelId,context.conversationId,context.navigation ?? ""]).map(v=>String(v||"")).join(":") : "";
const privateExpiry = response => Date.parse(response?.action === "modal" ? response.modal_expires_at : response?.expires_at);
export function normalizeBotPrivateResponse(response, now = Date.now(), {rich=false}={}) {
 if (!response || typeof response !== "object" || Array.isArray(response) || !["ephemeral","modal"].includes(response.action)) throw Error("invalid_private_response");
 if ((!rich && ["attachments","allowed_mentions","components"].some(key=>response[key]!==undefined)) || response.allowed_mentions!==undefined) throw Error("invalid_private_response");
 const expires=privateExpiry(response);
 if (!Number.isFinite(expires) || expires>now+15*60*1000+5000) throw Error("invalid_private_response");
 if(response.action==="modal"){
  if(!uuid(response.parent_id) || !response.modal || typeof response.modal!=="object" || !Array.isArray(response.modal.components))throw Error("invalid_private_response");
  return {action:"modal",parent_id:response.parent_id,modal:structuredClone(response.modal),modal_expires_at:response.modal_expires_at};
 }
 if(typeof response.content!=="string" || (response.embeds!==undefined && !Array.isArray(response.embeds)))throw Error("invalid_private_response");
 const result={action:"ephemeral",content:text(response.content,2000),embeds:structuredClone((response.embeds||[]).slice(0,10)),expires_at:response.expires_at};
 if(rich){
  if(!uuid(response.response_id) || response.attachments!==undefined && !Array.isArray(response.attachments)
    || response.mentions!==undefined && (!Array.isArray(response.mentions) || response.mentions.length>100)
    || response.components!==undefined && (!Array.isArray(response.components) || response.components.length>5))throw Error("invalid_private_response");
  result.response_id=response.response_id;
  result.attachments=privateInteractionAttachmentItems(response);
  if(result.attachments.length!==(response.attachments||[]).length)throw Error("invalid_private_response");
  result.mentions=(response.mentions||[]).map(item=>{
   if(!uuid(item?.id) || typeof item.name!=="string" || !item.name.trim() || item.name.length>256)throw Error("invalid_private_response");
   return {id:item.id,name:item.name};
  });
  result.components=structuredClone(response.components||[]);
  if(result.components.length){
   const expiry=Date.parse(response.components_expires_at);
   if(!uuid(response.components_revision) || !Number.isFinite(expiry) || expiry>expires)throw Error("invalid_private_response");
   result.components_revision=response.components_revision;result.components_expires_at=response.components_expires_at;
  }
 }
 return result;
}

// This cache belongs only to the invoking account and navigation epoch. Private
// responses never enter the persisted timeline, unread counts or notification feeds.
export function createBotInteractionResults({rpc,getActor=()=>"",getContext=()=>null,onResult=()=>{},onReset=()=>{},now=Date.now,rich=false}={}){
 let generation=0,owner="",currentKey="",unavailable=false,availabilityActor="";
 const pending=new Map(),completed=new Map();
 const reset=({preserveAvailability=false}={})=>{generation++;owner="";currentKey="";if(!preserveAvailability){unavailable=false;availabilityActor="";}pending.clear();completed.clear();onReset();};
 const syncContext=()=>{
  const actor=String(getActor()||""),key=contextKey(getContext());
  if(owner && (actor!==owner || key!==currentKey))reset({preserveAvailability:actor===owner});
  for(const [id,result] of completed)if(result.response && privateExpiry(result.response)<=now())completed.set(id,{...result,response:null});
 };
 const read=(eventId,context)=>{
  syncContext();const actor=String(getActor()||""),key=contextKey(context);
  if(!actor || !uuid(eventId) || !key || key!==contextKey(getContext()))return Promise.resolve({supported:true,handled:false,status:null});
  owner=actor;currentKey=key;
  if(availabilityActor!==actor){availabilityActor=actor;unavailable=false;}
  if(unavailable)return Promise.resolve({supported:false,handled:false,status:null});
  if(completed.has(eventId))return Promise.resolve(completed.get(eventId));
  if(pending.has(eventId))return pending.get(eventId);
  const run=generation,valid=()=>run===generation && actor===String(getActor()||"") && key===contextKey(getContext());
  const work=(async()=>{
    const value=await rpc("bots_interaction_result_v1",{p_event_id:eventId});
    if(!valid())return {supported:true,handled:false,status:null};
    if(value?.error){
     if(["PGRST202","42883"].includes(value.error.code) && /bots_interaction_result_v1/.test(value.error.message||"")){unavailable=true;return {supported:false,handled:false,status:null};}
     if(/denied|permission|unauth|not_available/.test(value.error.message||"") || value.error.code==="42501")reset();
     throw value.error;
    }
    const data=value?.data;
    if(data?.ok!==true || data.id!==eventId || !["pending","claimed","responded","failed","expired"].includes(data.status))throw Error("invalid_interaction_result");
    const response=data.response ? normalizeBotPrivateResponse(data.response,now(),{rich:rich && !!data.response.response_id}) : null;
    const result={supported:true,status:data.status,responseMessageId:uuid(data.response_message_id)?data.response_message_id:null,handled:!!response,response};
    if(response){
     if(data.status!=="responded")throw Error("invalid_interaction_result");
     completed.set(eventId,result);
     if(privateExpiry(response)>now())onResult(eventId,response,context);
     else completed.set(eventId,{...result,response:null});
    }
    return result;
  })();
  pending.set(eventId,work);const clear=()=>{if(run===generation)pending.delete(eventId);};work.then(clear,clear);return work;
 };
 const dismiss=eventId=>{const result=completed.get(eventId);if(result)completed.set(eventId,{...result,response:null});};
 return {read,reset,syncContext,dismiss,snapshot:()=>{syncContext();return [...completed].filter(([,r])=>r.response).map(([id,r])=>({id,response:structuredClone(r.response)}));}};
}

export function renderBotPrivateResponse(response,{language="en",botName="Bot",botId="",botAvatarUrl="",renderAvatar=()=>"",resolveMedia}={}){
 if(response?.action!=="ephemeral")return "";
 const pt=String(language).toLowerCase().startsWith("pt");
 const name=text(botName,80)||"Bot",avatar=renderAvatar({name,botId:String(botId||""),avatarUrl:String(botAvatarUrl||"")});
 const mentions=new Map((response.mentions||[]).map(item=>[item.id,item.name]));
 return `<div class="botPrivateResponse__body"><div class="botPrivateResponse__author">${avatar?`<span class="botPrivateResponse__avatar">${avatar}</span>`:""}<strong>${escape(name)} <span class="botTag">BOT</span></strong></div><div class="botPrivateResponse__text">${renderBotEmbedText(text(response.content,2000),{resolveMention:id=>mentions.get(id)})}</div>${renderBotEmbeds({source:"bot_channel_messages",metadata:{embeds:response.embeds}})}${renderBotPrivateComponents(response,{resolveMedia,resolveMention:id=>mentions.get(id)})}<div data-bot-private-files></div></div><footer><span>${pt?'Só tu podes ver esta mensagem':'Only you can see this message'}</span><button type="button" data-bot-private-dismiss>${pt?'Dispensar':'Dismiss'}</button></footer>`;
}

export function bindBotComponents(root, {rpc, invoke:invokeHttp,getActor = ()=>"",getContext=()=>null,getResponseAnchor=()=>null,getLanguage=()=>"en",renderAvatar=()=>"",onPrivateResult=()=>{},onPrivateReset=()=>{},resultsVersion=1,subscribeResults,renderPrivateFiles=()=>null,clearPrivateFiles=()=>{},refreshPrivateFiles=()=>{},resolveMedia,openMedia,resolveEntities,renderScopedMedia,acceptSource=(kind)=>kind==="guild"} = {}) {
 const pending=new Map(),terminalResultErrors=new WeakSet();let generation=0;
 const entityMenus=new Map();
 const dialogs=new Set();
 const privateCards=new Map(),privateContexts=new Map(),timers=new Map();let privateHost=null;
 const doc=root.ownerDocument || root;
 const removePrivate=id=>{privateCards.get(id)?.remove();privateCards.delete(id);privateContexts.delete(id);if(timers.has(id))clearTimeout(timers.get(id));timers.delete(id);privateResults.dismiss(id);refreshPrivateFiles();if(!privateCards.size){privateHost?.remove();privateHost=null;}};
 const clearUi=()=>{generation++;pending.clear();for(const item of entityMenus.values())clearTimeout(item.timer);entityMenus.clear();for(const dialog of dialogs)dialog.close();for(const id of [...privateCards.keys()])removePrivate(id);clearPrivateFiles();onPrivateReset();};
 const validScope=(actor,run,key)=>getActor()===actor && run===generation && (!key || key===contextKey(getContext()));
 const status=(box,value)=>{const node=box.querySelector('[role="status"]');if(node)node.textContent=value;};
 const call=async(name,args)=>{const response=await rpc(name,args);if(response.error)throw response.error;return response.data;};
 const acceptedSource=box=>!!box && acceptSource(box.dataset.botSourceKind || "guild",box)===true;
 const captureScope=control=>{
  const box=control.closest('[data-bot-message-id]')||control.closest('[data-bot-response-id]');if(!box)return null;
  if(!acceptedSource(box))return null;
  const responseId=box.dataset.botResponseId||"",messageId=responseId?"":box.dataset.botMessageId,revision=box.dataset.botRevision;
  const actor=getActor(),run=generation,contextValue=responseId?privateContexts.get(responseId):getContext(messageId),context=contextValue?{...contextValue}:null,key=contextKey(context);
  if(!entityUuid(actor)||!entityUuid(responseId||messageId)||!entityUuid(revision)||!key || responseId&&(!context||context.userId!==actor||!privateCards.get(responseId)?.isConnected))return null;
  const valid=()=>validScope(actor,run,key)&&root.isConnected!==false&&box.isConnected!==false&&root.contains(control)&&box.dataset.botRevision===revision&&(box.dataset.botResponseId||"")===responseId&&(responseId||box.dataset.botMessageId)===(responseId||messageId);
  return {box,actor,context,revision,messageId,responseId,valid};
 };
 const entityFeedback=(form,message)=>{const node=form.querySelector('.botComponentMenu__status');if(node)node.textContent=message;};
 const loadEntities=(form,{fresh=false}={})=>{
  const scope=captureScope(form),type=Number(form.dataset.botComponentType),select=form.querySelector('select'),button=form.querySelector('button[type="submit"]'),input=form.querySelector('[data-bot-entity-search]'),query=String(input?.value||"");
  if(!scope?.valid()||!entityKinds(type).length||query.length>100||form.dataset.botExpired==="true"||!select||!button)return Promise.resolve(null);
  const customId=form.dataset.botCustomId,stamp=JSON.stringify([scope.actor,contextKey(scope.context),scope.messageId,scope.responseId,scope.revision,customId,type]),previous=entityMenus.get(form);
  if(previous?.stamp===stamp&&previous.query===query&&previous.promise)return previous.promise;
  if(!fresh&&previous?.stamp===stamp&&previous.query===query&&previous.items)return Promise.resolve(previous);
  if(entityMenus.size>=256&&!previous)return Promise.resolve(null);
  clearTimeout(previous?.timer);
  const token={},record={stamp,query,token,items:null,promise:null,timer:null};entityMenus.set(form,record);
  const valid=()=>entityMenus.get(form)===record&&record.token===token&&scope.valid()&&form.dataset.botCustomId===customId&&Number(form.dataset.botComponentType)===type&&String(input?.value||"")===query;
  const selected=Array.from(select.selectedOptions||[]).map(x=>x.value).filter(Boolean),initial=!previous?.items;
  select.disabled=true;button.disabled=true;entityFeedback(form,"Loading choices…");
  const work=(async()=>{
   try{
    const args={p_message_id:scope.messageId||null,p_response_id:scope.responseId||null,p_revision:scope.revision,p_custom_id:customId,p_query:query,p_limit:25};
    const data=typeof resolveEntities==="function"?await resolveEntities(args):await call("bots_component_entities_v1",args);
    if(!valid())return null;
    const items=normalizeBotComponentEntities(type,data),channelTypes=JSON.parse(form.dataset.botChannelTypes||"[]");
    if(type===8&&items.some(item=>channelTypes.length&&!channelTypes.includes(item.channel_type)))throw Error("invalid_component_entities");
    const defaults=initial?JSON.parse(form.dataset.botDefaultValues||"[]").map(x=>x.id.toLowerCase()):[];
    const wanted=new Set(selected.length?selected:defaults),multi=Number(form.dataset.botMaxValues)>1;
    select.innerHTML=(!multi?'<option value="">Choose…</option>':"")+items.map(item=>`<option value="${escape(item.id)}" ${wanted.has(item.id)?"selected":""}>${escape(item.kind==="role"?"@"+item.name:item.kind==="channel"?"#"+item.name:item.name)}</option>`).join("");
    record.items=items;select.disabled=false;button.disabled=false;entityFeedback(form,items.length?"":"No available choices.");return record;
   }catch(error){if(valid()){record.items=null;select.innerHTML='<option value="">Choose…</option>';select.disabled=true;button.disabled=true;entityFeedback(form,errorText(error));}return null;}
   finally{if(entityMenus.get(form)===record)record.promise=null;}
  })();record.promise=work;return work;
 };
 const deliver=async(eventId,delivery,visible)=>{
  // Older bindings remain SDK-only. Updated bindings use the event's stored
  // transport; a form inherits its parent rather than the current app mode.
  if(typeof invokeHttp!=="function" || delivery.accepted)return;
  if(!delivery.mode){
   let route;
   try{route=await call("bots_get_component_delivery_route_v1",{p_event_id:eventId});}
   catch(error){
    if(!visible())throw Error("component_cancelled");
    // A legacy backend already queued this exact event for its SDK. Only the
    // missing named RPC may retain that wait; never create a replacement event.
    if(["PGRST202","42883"].includes(error?.code) && /\bbots_get_component_delivery_route_v1\b/.test(error?.message||"")){delivery.accepted=true;return;}
    throw error;
   }
   if(!visible())throw Error("component_cancelled");
   if(!route || !["bot_token","https"].includes(route.mode))throw Error("invalid_component_delivery_route");
   delivery.mode=route.mode;
  }
  if(delivery.mode==="bot_token"){delivery.accepted=true;return;}
  let result;
  try{result=await invokeHttp("altara-bot-interaction-dispatch",{action:"dispatch_component",event_id:eventId});}
  catch(error){if(!visible())throw Error("component_cancelled");throw error;}
  if(!visible())throw Error("component_cancelled");
  if(result?.ok!==true || result.event_id!==eventId)throw Error("invalid_component_delivery_response");
  // Ignore all HTTP content, including private payloads. The existing own-
  // author getter remains the only source of component/modal results.
  delivery.accepted=true;
 };
 const wait=async(eventId,actor,visible)=>{
  for(let n=0;n<25;n++){
   if(getActor()!==actor || !visible())throw Error("component_cancelled");
   const result=await call("bots_component_result_v1",{p_event_id:eventId});
   if(getActor()!==actor || !visible())throw Error("component_cancelled");
   if(result?.status==="responded")return result.response;
   if(result?.status==="failed" || result?.status==="expired"){
    const error=Error("component_"+result.status);terminalResultErrors.add(error);throw error;
   }
   if(!["pending","claimed"].includes(result?.status))throw Error("invalid_component_result");
   await new Promise(resolve=>setTimeout(resolve,n<5?750:1250));
  }
  throw Error("component_timeout");
 };
 const showModal=(parentId,modal,actor,{expiresAt="",context=null,botName="Bot",onClose=()=>{}}={})=>{
  if (!modal || !Array.isArray(modal.components) || getActor()!==actor)return;
  const run=generation,key=contextKey(context || getContext()),expiry=expiresAt?Date.parse(expiresAt):Date.now()+15*60*1000;
  if(!Number.isFinite(expiry) || expiry<=Date.now())return;
  const dialog=doc.createElement("dialog"),pt=String(getLanguage()).startsWith("pt"),beforeFocus=doc.activeElement;
  let closedByExpiry=false;
  const valid=()=>validScope(actor,run,key) && Date.now()<expiry && dialog.isConnected;
  // Once SQL accepts the child, the modal deadline only ends new input. Its
  // own callback/result lifetime remains valid in the same account/navigation.
  // A manual close still stops an HTTP dispatch that has not started.
  const acceptedScope=()=>validScope(actor,run,key) && (dialog.isConnected || closedByExpiry);
  dialog.className="botComponentModal";
  const titleId="bot-modal-"+crypto.randomUUID();
  dialog.setAttribute("aria-labelledby",titleId);
  dialog.innerHTML=`<form><header><h2 id="${titleId}">${escape(text(modal.title,45))}</h2><button type="button" data-close aria-label="${pt?'Fechar formulário':'Close form'}">×</button></header><div class="botComponentModal__fields">${modal.components.slice(0,5).map(r=>r.components?.[0]).filter(c=>c?.type===4).map((c,i)=>{
   const id=titleId+"-"+i, attrs=`id="${id}" name="${escape(text(c.custom_id,100))}" minlength="${Math.max(0,Number(c.min_length)||0)}" maxlength="${Math.min(2000,Math.max(1,Number(c.max_length)||2000))}" placeholder="${escape(text(c.placeholder,100))}" ${c.required!==false?'required':''}`;
   return `<label for="${id}">${escape(text(c.label,45))}${c.style===2?`<textarea ${attrs}>${escape(text(c.value,2000))}</textarea>`:`<input type="text" ${attrs} value="${escape(text(c.value,2000))}">`}</label>`;
  }).join("")}</div><p role="status" aria-live="polite"></p><footer><button type="button" data-close>${pt?'Cancelar':'Cancel'}</button><button type="submit" class="botComponentButton botComponentButton--1">${pt?'Enviar':'Submit'}</button></footer></form>`;
  doc.body.append(dialog);dialogs.add(dialog);
  const requestId=crypto.randomUUID(),delivery={mode:"",accepted:false};let busy=false,submittedFields=null,queuedId="";
  const expiryTimer=setTimeout(()=>{closedByExpiry=(resultsVersion===2 || resultsVersion==="surface") && !!context;dialog.close();},Math.max(0,expiry-Date.now()));
  dialog.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>dialog.close()));
  dialog.addEventListener('close',()=>{clearTimeout(expiryTimer);dialogs.delete(dialog);dialog.remove();onClose();if(validScope(actor,run,key) && beforeFocus?.isConnected)beforeFocus.focus?.();},{once:true});
  dialog.querySelector('form').addEventListener('submit',async event=>{
   event.preventDefault();if(busy || !valid()){if(!valid())dialog.close();return;}
   busy=true;const button=dialog.querySelector('[type="submit"]');button.disabled=true;
   if(!submittedFields)submittedFields=Object.fromEntries(new FormData(event.target));
   dialog.querySelectorAll('input,textarea').forEach(input=>input.readOnly=true);
   const message=dialog.querySelector('[role="status"]');message.textContent=pt?"À espera do bot…":"Waiting for the bot…";
   const current=()=>(resultsVersion===2 || resultsVersion==="surface") && context && queuedId?acceptedScope():valid();
   try{
    if(!queuedId){
     const queued=await call("bots_submit_modal_v1",{p_parent_id:parentId,p_fields:submittedFields,p_request_id:requestId});
     if(!((resultsVersion===2 || resultsVersion==="surface") && context?acceptedScope():valid()))return;
     if(!uuid(queued?.id))throw Error("invalid_component_result");queuedId=queued.id;
     // Register synchronously before awaiting route/HTTP, so an accepted
     // private child can recover through Broadcast/focus after the form closes.
     if((resultsVersion===2 || resultsVersion==="surface") && context)void privateResults.read(queuedId,context).catch(()=>null);
    }
    await deliver(queuedId,delivery,current);
    if(!current())return;
    const response=await wait(queuedId,actor,current);
    if(!current())return;
    if(context && response?.action==="ephemeral"){
     displayPrivate(queuedId,normalizeBotPrivateResponse(response,Date.now(),{rich:(resultsVersion===2 || resultsVersion==="surface") && !!response.response_id}),{...context,botName:context.botName || botName});
     if((resultsVersion===2 || resultsVersion==="surface") && response.response_id)await privateResults.read(queuedId,context).catch(()=>null);
     if(!current())return;
    }
    dialog.close();
   }catch(error){if(valid() && error?.message!=="component_cancelled")message.textContent=errorText(error);}
   finally{busy=false;button.disabled=false;}
  });
  dialog.showModal();
  dialog.querySelector('input,textarea')?.focus();
 };
 const displayPrivate=(eventId,response,context)=>{
  if(response.action==="modal"){showModal(response.parent_id,response.modal,getActor(),{expiresAt:response.modal_expires_at,context,botName:context?.botName,onClose:()=>privateResults.dismiss(eventId)});return;}
  const anchor=getResponseAnchor();if(!anchor?.parentNode)return;
  const cardId=response.response_id || eventId;
  if(privateCards.has(cardId))return;
  if(!privateHost?.isConnected){privateHost=doc.createElement('div');privateHost.className='botPrivateResponses';privateHost.setAttribute('aria-live','polite');anchor.parentNode.insertBefore(privateHost,anchor.nextSibling);}
  const card=doc.createElement('article');card.className='botPrivateResponse';card.innerHTML=renderBotPrivateResponse(response,{language:getLanguage(),botName:context?.botName,botId:context?.botId,botAvatarUrl:context?.botAvatarUrl,renderAvatar,resolveMedia:uploadId=>resolveMedia?.(uploadId,{responseId:response.response_id,context,userId:getActor()})});
  const sourceKind=context?.sourceKind || context?.source_kind;
  if(["dm","thread"].includes(sourceKind))for(const box of card.querySelectorAll?.('[data-bot-response-id]')||[])box.dataset.botSourceKind=sourceKind;
  card.querySelector('[data-bot-private-dismiss]')?.addEventListener('click',()=>removePrivate(cardId));
  privateHost.append(card);privateCards.set(cardId,card);privateContexts.set(cardId,{...context,userId:getActor()});
  if(typeof renderScopedMedia==="function"){
   const userId=getActor(),key=contextKey(context),run=generation;
   for(const slot of card.querySelectorAll?.('[data-bot-component-media-upload]')||[]){
    const uploadId=slot.dataset.botComponentMediaUpload,kind=slot.dataset.botComponentMediaKind;
    if(!entityUuid(uploadId)||!["file","image"].includes(kind))continue;
    let media;try{media=renderScopedMedia(uploadId,{response,context:{...context},userId,kind});}catch{continue;}
    if([1,11].includes(media?.nodeType)&&validScope(userId,run,key)&&privateCards.get(cardId)===card&&card.isConnected)slot.replaceChildren(media);
   }
  }
  const files=renderPrivateFiles(response,{...context,userId:getActor(),enabled:true});
  if(files)card.querySelector('[data-bot-private-files]')?.append(files);
  timers.set(cardId,setTimeout(()=>removePrivate(cardId),Math.max(0,privateExpiry(response)-Date.now())));
 };
 const receivePrivate=(eventId,response,context)=>{onPrivateResult(eventId,response,context);displayPrivate(eventId,response,context);};
 const legacyResults=createBotInteractionResults({rpc,getActor,getContext,onResult:receivePrivate,onReset:clearUi,rich:resultsVersion==="surface"});
 const richResults=resultsVersion===2 || resultsVersion==="surface";
 const privateResults=richResults?createBotInteractionResultsV2({rpc,getActor,getContext,normalize:normalizeBotPrivateResponse,onResult:receivePrivate,legacy:legacyResults,subscribe:subscribeResults,surface:resultsVersion==="surface"}):legacyResults;
 const terminalError=error=>/^(component_expired|component_not_available|component_failed|request_conflict|invalid_component_values|not_authenticated|component_access_denied|component_rate_limited)$/.test(error?.message||"") || error?.code==="42501";
 const invoke=async(control,values)=>{
  const box=control.closest('[data-bot-message-id]') || control.closest('[data-bot-response-id]');if(!box)return;
  if(!acceptedSource(box))return;
  const privateId=box.dataset.botResponseId || "",sourceId=privateId || box.dataset.botMessageId;
  const key=(privateId?"private:":"public:")+sourceId+":"+control.dataset.botCustomId;
  const actor=getActor(),run=generation,contextValue=privateId?privateContexts.get(privateId):getContext(sourceId),context=contextValue?{...contextValue}:null,scope=contextKey(context);
  if(privateId && (!context || context.userId!==actor || scope!==contextKey(getContext()) || !privateCards.get(privateId)?.isConnected))return;
  if(!actor)return;
  const signature=JSON.stringify([actor,scope,privateId,sourceId,box.dataset.botRevision,control.dataset.botCustomId]),selection=JSON.stringify(values);
  let operation=pending.get(key);
  if(operation && (operation.signature!==signature || operation.run!==run)){pending.delete(key);operation=null;}
  if(operation?.inFlight)return;
  if(operation && operation.selection!==selection){status(box,"Repeat the original selection to retry the unconfirmed action.");return;}
  if(!operation){
   // Never evict an uncertain write to admit another one: a later click could
   // otherwise create a second event for the same logical action.
   if(pending.size>=128){status(box,"Finish or retry an earlier action before starting another.");return;}
   const payload=Object.freeze({[privateId?'p_response_id':'p_message_id']:sourceId,p_revision:box.dataset.botRevision,p_custom_id:control.dataset.botCustomId,p_values:Object.freeze([...values]),p_request_id:crypto.randomUUID()});
   operation={actor,run,scope,signature,selection,payload,queuedId:"",delivery:{mode:"",accepted:false},uncertainWrite:false,retryUntil:Date.now()+5*60*1000,inFlight:false,finished:false};
   pending.set(key,operation);
  }
  const token={};operation.token=token;operation.inFlight=true;
  const owns=()=>pending.get(key)===operation && operation.token===token && validScope(actor,run,scope);
  const visible=()=>owns() && root.isConnected!==false && box.isConnected!==false && root.contains(control);
  const disabled=Array.from(box.querySelectorAll('button,select,input[data-bot-entity-search]')).map(node=>[node,node.disabled]);
  disabled.forEach(([node])=>node.disabled=true);status(box,"Waiting for the bot…");
  let invoking=false;
  try{
   if(!operation.queuedId){
    // The backend ledger is finite. Do not replay an unconfirmed write after
    // the conservative five-minute window, or silently replace its request ID.
    if(Date.now()>operation.retryUntil)throw Error("component_recovery_expired");
    invoking=true;
    const queued=await call(privateId?"bots_invoke_private_component_v1":"bots_invoke_component_v1",operation.payload);
    if(!owns())return;
    if(!uuid(queued?.id))throw Error("invalid_component_result");
    operation.queuedId=queued.id;invoking=false;
    if(richResults && context)void privateResults.read(queued.id,context).catch(()=>null);
   }
   await deliver(operation.queuedId,operation.delivery,visible);
   if(!visible())return;
   const response=await wait(operation.queuedId,actor,visible);
   if(!visible())return;
   if(response?.action==="modal"){
    const expiry=response.modal_expires_at?Date.parse(response.modal_expires_at):null;
    if(expiry!==null && (!Number.isFinite(expiry) || expiry<=Date.now())){status(box,errorText(Error("component_expired")));operation.finished=true;return;}
    showModal(operation.queuedId,response.modal,actor,{context,expiresAt:response.modal_expires_at});
   }else if(response?.action==="ephemeral"){
    if(!context)throw Error("private_response_not_available");
    const privateResponse=normalizeBotPrivateResponse(response,Date.now(),{rich:(resultsVersion===2 || resultsVersion==="surface") && !!response.response_id});
    if(privateExpiry(privateResponse)>Date.now())displayPrivate(operation.queuedId,privateResponse,context);
    if(richResults && response.response_id)await privateResults.read(operation.queuedId,context).catch(()=>null);
    if(!visible())return;
   }
   status(box,"Done.");operation.finished=true;
  }catch(error){
   if(owns()){
    // A denied read/replay does not prove a previously accepted/uncertain write
    // was unexecuted. Only its returned event state or a first-write rejection
    // finishes it; preserve the queued ID/UUID through authority recovery.
    operation.finished=terminalResultErrors.has(error) || (invoking && !operation.uncertainWrite && terminalError(error));
    if(invoking && !terminalError(error))operation.uncertainWrite=true;
    if(visible() && error?.message!=="component_cancelled")status(box,error?.message==="component_recovery_expired"?"This action could not be confirmed and cannot be resumed.":errorText(error));
   }
  }finally{
   // A retired flight cannot release the replacement operation or its controls.
   if(owns()){
    operation.inFlight=false;
    disabled.forEach(([node,was])=>node.disabled=was);
    if(operation.finished)pending.delete(key);
   }
  }
 };
 const click=event=>{
  const media=event.target?.closest?.('button[data-bot-media-upload]');
  if(media?.dataset?.botMediaUpload){
   if(media.disabled||!root.contains(media)||!entityUuid(media.dataset.botMediaUpload))return;
   const scope=captureScope(media),uploadId=media.dataset.botMediaUpload;if(!scope?.valid()||typeof openMedia!=="function")return;
   void Promise.resolve().then(()=>{if(scope.valid())return openMedia(uploadId,{messageId:scope.messageId,responseId:scope.responseId,revision:scope.revision,context:scope.context,userId:scope.actor,isCurrent:scope.valid});}).catch(()=>{if(scope.valid())status(scope.box,"Attachment unavailable.");});return;
  }
  const button=event.target?.closest?.('button[data-bot-custom-id]');if(button && root.contains(button) && !button.disabled)void invoke(button,[]);
 };
 const submit=event=>{
  const form=event.target?.closest?.('form.botComponentMenu');if(!form||!root.contains(form))return;
  event.preventDefault();const select=form.querySelector('select');if(!select||select.disabled)return;
  const values=Array.from(select.selectedOptions).map(o=>o.value).filter(Boolean),type=Number(form.dataset.botComponentType);
  if(!entityKinds(type).length){void invoke(form,values);return;}
  const scope=captureScope(form);if(!scope?.valid())return;
  const key=(scope.responseId?"private:":"public:")+(scope.responseId||scope.messageId)+":"+form.dataset.botCustomId,operation=pending.get(key);
  if(operation?.run===generation && operation.signature===JSON.stringify([scope.actor,contextKey(scope.context),scope.responseId,scope.responseId||scope.messageId,scope.revision,form.dataset.botCustomId])){
   // An accepted or uncertain action already owns immutable values and a UUID.
   // Current entity availability must not turn recovery into another action.
   void invoke(form,values);return;
  }
  // Re-resolve immediately before invocation. Cached options only describe the
  // UI; the backend validates the same IDs again before issuing an event.
  void loadEntities(form,{fresh:true}).then(record=>{
   if(!record||!scope.valid())return;
   try{const selected=validateBotEntitySelection(type,values,record.items,{min:Number(form.dataset.botMinValues),max:Number(form.dataset.botMaxValues),channelTypes:JSON.parse(form.dataset.botChannelTypes||"[]")});void invoke(form,selected);}
   catch(error){entityFeedback(form,errorText(error));}
  });
 };
 const focusEntity=event=>{const form=event.target?.closest?.('form.botComponentEntityMenu');if(form&&root.contains(form)&&!event.target.disabled)void loadEntities(form);};
 const searchEntity=event=>{
  if(!event.target?.matches?.('[data-bot-entity-search]')||event.target.disabled)return;
  const form=event.target.closest('form.botComponentEntityMenu');if(!form||!root.contains(form))return;
  const old=entityMenus.get(form);if(old){clearTimeout(old.timer);old.token={};old.items=null;old.promise=null;}
  const record=old||{timer:null};entityMenus.set(form,record);
  const select=form.querySelector('select'),button=form.querySelector('button[type="submit"]');if(select)select.disabled=true;if(button)button.disabled=true;
  record.timer=setTimeout(()=>{if(root.contains(form))void loadEntities(form,{fresh:true});},250);
 };
 root.addEventListener('click',click);root.addEventListener('submit',submit);root.addEventListener('focusin',focusEntity);root.addEventListener('input',searchEntity);
 const reset=options=>privateResults.reset(options);
 const focus=()=>{privateResults.syncContext();privateResults.refresh?.();refreshPrivateFiles();for(const [key,operation] of pending)if(!validScope(operation.actor,operation.run,operation.scope))pending.delete(key);for(const [form,record] of entityMenus)if(!captureScope(form)?.valid()){clearTimeout(record.timer);entityMenus.delete(form);}};
 const dispose=()=>{reset();root.removeEventListener('click',click);root.removeEventListener('submit',submit);root.removeEventListener('focusin',focusEntity);root.removeEventListener('input',searchEntity);};
 dispose.reset=reset;
 dispose.syncContext=focus;
 dispose.checkSlashResponse=(eventId,context)=>privateResults.read(eventId,context);
 dispose.isPrivateResponseCurrent=id=>privateCards.get(id)?.isConnected===true;
 return dispose;
}

const privateAttachmentUuid=value=>typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const mimeTypes=new Set(['image/png','image/jpeg','image/gif','image/webp','application/pdf','application/zip','video/mp4','video/webm','audio/ogg','audio/mpeg','audio/wav','text/plain','text/csv','application/json']);

export function privateInteractionAttachmentItems(response) {
  if(!privateAttachmentUuid(response?.response_id) || !Array.isArray(response.attachments) || response.attachments.length>10)return [];
  let bytes=0;const seen=new Set(),items=[];
  for(const item of response.attachments) {
    const uploadId=item?.uploadId,reference=`altara-private-interaction-upload:${uploadId}`;
    if(!privateAttachmentUuid(uploadId) || item.responseId!==response.response_id || item.referenceUrl!==reference || seen.has(uploadId)
      || !Number.isSafeInteger(item.size) || item.size<1 || item.size>8*1024*1024
      || typeof item.name!=='string' || !item.name || item.name.length>180 || /[\x00-\x1f\\/]/.test(item.name)
      || !mimeTypes.has(item.mime) && !(item.mime==='application/octet-stream' && /\.(txt|csv|json|log)$/i.test(item.name)))return [];
    bytes+=item.size;if(bytes>16*1024*1024)return [];
    seen.add(uploadId);items.push({uploadId,responseId:item.responseId,referenceUrl:reference,name:item.name,size:item.size,mime:item.mime});
  }
  return items;
}


const ledgerUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const ledgerContextKey = value => value ? [value.serverId,value.channelId,value.conversationId,value.navigation ?? ''].join(':') : '';
const ledgerMissing = (error,name) => ['PGRST202','42883'].includes(error?.code) && String(error?.message || '').includes(name);
const emptyLedger = () => ({supported:true,handled:false,status:null});

// Notifications carry only invalidation metadata. The own-author RPC is always
// the source of content, and this cache never leaves the current navigation.
export function createBotInteractionResultsV2({rpc,getActor,getContext,normalize,onResult,onReset,legacy,subscribe,now=Date.now,surface=false,surfacePollMs=2500}={}) {
  let generation=0,owner='',scope='',legacyOnly=false,unsubscribe=null,subscriptionOwner='',surfaceTimer=null;
  const registrations=new Map(),pending=new Map(),seen=new Map(),dirty=new Set();
  const keyOf=surface?contextKey:ledgerContextKey;
  const valid=(actor,key,run)=>run===generation && actor===String(getActor() || '') && key===keyOf(getContext());
  function scheduleSurface(){
    if(!surface||surfaceTimer!==null||!registrations.size)return;
    surfaceTimer=setTimeout(()=>{surfaceTimer=null;refresh();scheduleSurface();},Math.max(250,Number(surfacePollMs)||2500));
  }
  function reset(options={}) {
    generation++;clearTimeout(surfaceTimer);surfaceTimer=null;registrations.clear();pending.clear();seen.clear();dirty.clear();owner='';scope='';
    if(!options.preserveAvailability){legacyOnly=false;unsubscribe?.();unsubscribe=null;subscriptionOwner='';}
    legacy.reset(options);onReset?.();
  }
  function syncContext() {
    const actor=String(getActor() || ''),key=keyOf(getContext());
    if(owner && (owner!==actor || scope!==key))reset({preserveAvailability:owner===actor});
    legacy.syncContext();
    for(const [id,entry] of registrations)if(entry.deadline && entry.deadline<=now())registrations.delete(id);
    if(!registrations.size){clearTimeout(surfaceTimer);surfaceTimer=null;}
    for(const [id,entry] of seen)if(entry.expires<=now())seen.delete(id);
  }
  function refresh() {
    syncContext();
    for(const [id,entry] of registrations) {
      if(pending.has(id)){dirty.add(id);continue;}
      void read(id,entry.context).catch(()=>{});
    }
  }
  function ensureSubscription(actor) {
    if(typeof subscribe!=='function' || subscriptionOwner===actor)return;
    unsubscribe?.();subscriptionOwner=actor;
    const captured=actor;
    const cleanup=subscribe({actor,onReady:()=>{if(subscriptionOwner===captured && getActor()===captured)queueMicrotask(refresh);},onChange:payload=>{
      if(subscriptionOwner!==captured || getActor()!==captured || !payload || !ledgerUuid(payload.event_id) || !Number.isSafeInteger(payload.sequence) || payload.sequence<1)return;
      syncContext();const entry=registrations.get(payload.event_id);
      if(!entry || payload.sequence<=entry.cursor)return;
      if(pending.has(payload.event_id)){dirty.add(payload.event_id);return;}
      void read(payload.event_id,entry.context).catch(()=>{});
    }});
    unsubscribe=typeof cleanup==='function'?cleanup:null;
  }
  function read(eventId,context) {
    syncContext();const actor=String(getActor() || ''),key=keyOf(context);
    if(!ledgerUuid(actor) || !ledgerUuid(eventId) || !key || key!==keyOf(getContext()))return Promise.resolve(emptyLedger());
    if(owner && owner!==actor)reset();owner=actor;scope=key;
    ensureSubscription(actor);
    if(legacyOnly)return legacy.read(eventId,context);
    if(pending.has(eventId))return pending.get(eventId);
    let entry=registrations.get(eventId);
    if(!entry) {
      if(registrations.size>=64)return Promise.resolve(emptyLedger());
      const registeredAt=now();
      entry={context:structuredClone(context),cursor:0,deadline:registeredAt+5*60*1000,legacyReadDeadline:registeredAt+20*60*1000,result:emptyLedger()};registrations.set(eventId,entry);
    }
    const run=generation,current=()=>valid(actor,key,run) && registrations.get(eventId)===entry;
    const work=(async()=>{
      // Each page is bounded by SQL. Catch-up is finite even if a broken server
      // repeatedly reports has_more or returns a non-advancing cursor.
      for(let page=0;page<8;page++) {
        const value=await rpc(surface?'bots_surface_component_result_v1':'bots_interaction_results_v2',{p_event_id:eventId,p_after_sequence:entry.cursor});
        if(!current())return emptyLedger();
        if(value?.error) {
          if(!surface && ledgerMissing(value.error,'bots_interaction_results_v2')){legacyOnly=true;registrations.clear();return legacy.read(eventId,context);}
          if(value.error.code==='42501' || /denied|permission|unauth|not_available/.test(value.error.message || ''))reset();
          throw value.error;
        }
        let data=value?.data;
        if(surface){
          const kind=context.sourceKind || context.source_kind,origin=context.originServerId || context.origin_server_id,parent=context.parentChannelId || context.parent_channel_id,thread=context.threadId || context.thread_id;
          if(data?.ok!==true||data.id!==eventId||data.actor_id!==actor||data.source_kind!==kind||!['dm','thread'].includes(kind)||!ledgerUuid(data.source_message_id)||data.origin_server_id!==origin||data.bot_id!==context.botId
            ||(kind==='dm'?(data.server_id!==null||data.channel_id!==null||data.user_id!==actor||data.direct_message_id!==data.source_message_id):(data.server_id!==origin||data.channel_id!==null||data.thread_id!==thread||data.parent_channel_id!==parent))||typeof data.followups_open!=='boolean'||!Array.isArray(data.responses)||data.responses.length>11||data.responses.some(item=>typeof item?.ephemeral!=='boolean'))throw Error('invalid_interaction_result');
          data={...data,invoking_user_id:actor,server_id:context.serverId,channel_id:context.channelId,conversation_id:context.conversationId,
            items:data.responses.map(item=>({response_id:item.id,sequence:item.sequence,visibility:item.ephemeral?'private':'public',response_message_id:item.message_id,response:item.response})),next_cursor:data.cursor,has_more:false};
        }
        const deadline=Date.parse(data?.capability_deadline);
        if(data?.ok!==true || data.id!==eventId || !['pending','claimed','responded','failed','expired'].includes(data.status)
          || data.invoking_user_id!==actor || data.server_id!==context.serverId || data.channel_id!==context.channelId || data.conversation_id!==context.conversationId
          || !ledgerUuid(data.bot_id) || (context.botId && data.bot_id!==context.botId) || !Array.isArray(data.items) || data.items.length>100
          || !Number.isSafeInteger(data.next_cursor) || data.next_cursor<entry.cursor || typeof data.has_more!=='boolean' || (!Number.isFinite(deadline) && data.legacy!==true))throw Error('invalid_interaction_result');
        if(data.legacy===true){
          if(data.capability_deadline!==null || data.items.length || data.has_more || data.next_cursor!==entry.cursor)throw Error('invalid_interaction_result');
          const initial=await legacy.read(eventId,context);
          if(!current())return emptyLedger();
          // A legacy SDK reply can arrive near its five-minute write deadline
          // and remain readable for 15 more minutes. Keep only this original,
          // finite read window through focus recovery; reads never renew it.
          entry.deadline=['pending','claimed'].includes(initial.status)?entry.legacyReadDeadline:now();
          entry.result=initial;return initial;
        }
        const admitted=[];let sequence=entry.cursor;
        for(const item of data.items) {
          if(!ledgerUuid(item?.response_id) || !Number.isSafeInteger(item.sequence) || item.sequence<=sequence || item.sequence>data.next_cursor || !['public','private'].includes(item.visibility))throw Error('invalid_interaction_result');
          sequence=item.sequence;
          if(item.visibility==='public') {
            if(!ledgerUuid(item.response_message_id) || item.response!==null && item.response!==undefined)throw Error('invalid_interaction_result');
            continue;
          }
          if(item.response_message_id!==null && item.response_message_id!==undefined)throw Error('invalid_interaction_result');
          if(item.response===null)continue;
          const response=normalize(item.response,now(),{rich:true});
          if(response.action!=='ephemeral' || response.response_id!==item.response_id)throw Error('invalid_interaction_result');
          admitted.push({id:item.response_id,response:{...response,response_id:item.response_id,sequence:item.sequence},expires:Date.parse(response.expires_at)});
        }
        if(data.has_more && data.next_cursor<=entry.cursor)throw Error('invalid_interaction_result');
        // A reply accepted just before the write deadline may remain readable
        // for another 15 minutes. Keep recovery subscribed for that window;
        // each result/control still enforces its own original expiry.
        entry.cursor=data.next_cursor;entry.deadline=Math.max(deadline+15*60*1000,...admitted.map(item=>item.expires));
        if(surface && ['failed','expired'].includes(data.status))registrations.delete(eventId);
        entry.result={supported:true,status:data.status,responseMessageId:ledgerUuid(data.response_message_id)?data.response_message_id:null,handled:entry.result.handled || admitted.length>0,response:null};
        for(const item of admitted) {
          if(seen.has(item.id))continue;
          seen.set(item.id,{eventId,expires:item.expires,response:item.response});
          if(item.expires>now())onResult(eventId,item.response,{...context,botId:data.bot_id});
        }
        if(!data.has_more){
          // Modal/older initial replies are deliberately retained by the v1
          // projection; an empty new ledger must not hide those responses.
          if(!entry.cursor && data.status==='responded' && !data.response_message_id && (!surface||data.response?.action==='modal')){
            const initial=await legacy.read(eventId,context);
            if(!current())return emptyLedger();
            entry.result={...entry.result,handled:initial.handled,response:initial.response};
          }
          if(surface && data.status==='responded' && !data.followups_open)registrations.delete(eventId);
          return entry.result;
        }
      }
      throw Error('interaction_result_page_limit');
    })();
    pending.set(eventId,work);
    const clear=()=>{
      if(run!==generation)return;
      pending.delete(eventId);
      if(dirty.delete(eventId) && current())queueMicrotask(()=>{if(current())void read(eventId,entry.context).catch(()=>{});});
      scheduleSurface();
    };
    work.then(clear,clear);return work;
  }
  function dismiss(id) {
    const item=seen.get(id);if(item)seen.set(id,{...item,response:null});else legacy.dismiss(id);
  }
  return {read,reset,syncContext,refresh,dismiss,snapshot:()=>{syncContext();return [...seen].filter(([,entry])=>entry.response).map(([id,entry])=>({id,response:structuredClone(entry.response)}));},dispose:()=>reset()};
}
