const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUCKET='altara-bot-dm-attachments-v1',MAX_BYTES=8*1024*1024;
const types=new Set(['image/png','image/jpeg','image/gif','image/webp','application/pdf','application/zip','video/mp4','video/webm','audio/ogg','audio/mpeg','audio/wav','text/plain','text/csv','application/json']);
const id=value=>typeof value==='string'&&UUID.test(value)?value.toLowerCase():'';
const failure=code=>Object.assign(new Error(code),{code});
function descriptor(value){
 const uploadId=id(value?.uploadId||value?.upload_id),reference=`altara-private-upload:${uploadId}`;
 if(!uploadId||value?.type!=='attachment'||value.url!==reference||value.referenceUrl!==reference||typeof value.name!=='string'||!value.name||value.name.length>180||/[\x00-\x1f\\/]/.test(value.name)
  ||!Number.isSafeInteger(value.size)||value.size<1||value.size>MAX_BYTES||!types.has(value.mime)&&!(value.mime==='application/octet-stream'&&/\.(txt|csv|json|log)$/i.test(value.name)))return null;
 return {type:'attachment',uploadId,referenceUrl:reference,url:reference,name:value.name,size:value.size,mime:value.mime};
}
export function botDirectMessageAttachmentItems(message){
 if(!Array.isArray(message?.attachments)||message.attachments.length>10)return [];
 const items=message.attachments.map(descriptor),ids=new Set();let bytes=0;
 for(const item of items){if(!item||ids.has(item.uploadId))return [];ids.add(item.uploadId);bytes+=item.size;}
 return bytes<=16*1024*1024?items:[];
}
function signedUrl(value,origin,{userId,botId,uploadId}){
 try{const url=new URL(value),base=new URL(origin);
  if(url.protocol!=='https:'||url.origin!==base.origin||url.username||url.password||url.hash||!url.searchParams.get('token'))return '';
  const expected=`/storage/v1/object/sign/${BUCKET}/${userId}/${botId}/${uploadId}/file`;
  if(url.pathname!==expected||[...url.searchParams.keys()].some(key=>!['token','download'].includes(key)))return '';
  return url.href;
 }catch{return '';}
}
// The renderer keeps durable UUID references, never persisted signed grants.
// Every action asks the broker again and re-checks account/navigation afterwards.
export function createBotDirectMessageAttachments({supabase,getContext,supabaseOrigin=supabase?.supabaseUrl}={}){
 if(!supabase?.functions?.invoke||typeof getContext!=='function')throw new TypeError('invalid_bot_dm_attachment_client');
 function context(snapshot){
  const current=getContext(),userId=id(snapshot?.userId),botId=id(snapshot?.botId),serverId=id(snapshot?.serverId),key=`bot-dm:${serverId}:${botId}`;
  if(!userId||!botId||!serverId||snapshot?.key!==key||snapshot.enabled!==true||current?.userId!==userId||current?.key!==key||current?.enabled!==true)throw failure('bot_dm_attachment_context_changed');
  return {userId,botId,serverId,key};
 }
 function same(snapshot,previous){const next=context(snapshot);if(next.userId!==previous.userId||next.key!==previous.key)throw failure('bot_dm_attachment_context_changed');return next;}
 function currentMessage(owner,messageId,uploadId){
  const current=getContext(),rows=[...(Array.isArray(current?.messages)?current.messages:[]),...(Array.isArray(current?.pinnedMessages)?current.pinnedMessages:[])];
  const message=rows.find(row=>row?.id===messageId);
  if(!message||message.deleted_at||message.user_id!==owner.userId||message.bot_id!==owner.botId||message.server_id!==owner.serverId
   ||!botDirectMessageAttachmentItems(message).some(item=>item.uploadId===uploadId))throw failure('bot_dm_attachment_context_changed');
  return message;
 }
 async function invoke(body){
  const {data,error}=await supabase.functions.invoke('altara-bot-dm-attachments',{body});
  if(error||data?.ok!==true)throw failure(['consent_required','attachment_access_denied','invalid_attachment','attachment_rate_limited','attachment_quota_limited'].includes(data?.error)?data.error:'bot_dm_attachment_unavailable');
  return data;
 }
 async function upload({snapshot,file}={}){
  const owner=context(snapshot);if(!file||typeof file.arrayBuffer!=='function'||!Number.isSafeInteger(file.size)||file.size<1||file.size>MAX_BYTES)throw failure('invalid_attachment');
  const form=new FormData();form.append('bot_id',owner.botId);form.append('server_id',owner.serverId);form.append('file',file,file.name||'file.bin');
  const data=await invoke(form);same(snapshot,owner);
  const item=descriptor(data.attachment);
  if(!item||item.size!==file.size||data.user_id!==owner.userId||data.bot_id!==owner.botId||data.server_id!==owner.serverId)throw failure('bot_dm_attachment_response_invalid');
  return item;
 }
 async function resolve({snapshot,message,attachment,download=false}={}){
  const owner=context(snapshot),messageId=id(message?.id),uploadId=id(attachment?.uploadId||attachment?.upload_id);
  if(!messageId||message?.user_id!==owner.userId||message?.bot_id!==owner.botId||message?.server_id!==owner.serverId||message?.deleted_at
   ||!botDirectMessageAttachmentItems(message).some(item=>item.uploadId===uploadId))throw failure('invalid_attachment');
  currentMessage(owner,messageId,uploadId);
  const data=await invoke({action:'read',message_id:messageId,upload_id:uploadId,download:download===true});same(snapshot,owner);
  currentMessage(owner,messageId,uploadId);
  const url=signedUrl(data.download_url,supabaseOrigin,{...owner,uploadId});
  if(!url||data.upload_id!==uploadId||data.message_id!==messageId||data.user_id!==owner.userId||data.bot_id!==owner.botId||data.server_id!==owner.serverId||data.visibility!=='private'||data.download_expires_in!==60)throw failure('bot_dm_attachment_response_invalid');
  return {url,expiresIn:60,uploadId,messageId};
 }
 return {upload,resolve,items:botDirectMessageAttachmentItems};
}
