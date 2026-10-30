import {privateInteractionAttachmentItems} from "./botComponents.js";
const contextKey=value=>value?[value.userId,value.sourceKind||'guild',value.originServerId||value.serverId,value.botId,value.threadId,value.parentChannelId||value.channelId,value.conversationId,value.navigation ?? ''].join(':'):'';


// Signed grants are temporary DOM capabilities. Both ends recheck the exact
// actor/result/current channel; raw URLs from callback content are never used.
export function createPrivateInteractionAttachments({invoke,getActor,getContext,isCurrent,supabaseOrigin,readerFunction='altara-bot-interaction-attachments',now=Date.now}={}) {
  if(!['altara-bot-interaction-attachments','altara-bot-surface-attachments'].includes(readerFunction))throw TypeError('invalid_private_attachment_reader');
  return async function resolve(item,response,snapshot,{download=false}={}) {
    const actor=String(getActor() || ''),key=contextKey(getContext());
    const current=()=>actor===String(getActor() || '') && actor===snapshot.userId && key===contextKey(getContext()) && key===contextKey(snapshot) && isCurrent(snapshot,response)===true;
    if(!current() || !privateInteractionAttachmentItems(response).some(value=>value.uploadId===item.uploadId))throw Error('private_attachment_context_changed');
    const native=readerFunction==='altara-bot-surface-attachments';
    if(native&&!['dm','thread'].includes(snapshot.sourceKind))throw Error('private_attachment_context_changed');
    const remaining=Date.parse(response.expires_at);
    if(!Number.isFinite(remaining)||remaining<=now())throw Error('private_attachment_response_invalid');
    const value=await invoke(readerFunction,{action:'read',response_id:response.response_id,upload_id:item.uploadId,download:download===true});
    if(!current())throw Error('private_attachment_context_changed');
    const expires=Date.parse(value?.expires_at);
    let url,origin;try{url=new URL(value?.url);origin=new URL(supabaseOrigin);}catch{throw Error('private_attachment_response_invalid');}
    const path=native&&snapshot.sourceKind==='dm'?`altara-bot-dm-attachments-v1/${snapshot.userId}/${snapshot.botId}/${item.uploadId}/file`:`altara-bot-attachments-v1/${snapshot.botId}/${item.uploadId}/file`;
    if(value?.ok!==true || url.protocol!=='https:' || url.origin!==origin.origin || url.username || url.password || url.hash
      || url.pathname!==`/storage/v1/object/sign/${path}`
      || !url.searchParams.get('token') || [...url.searchParams.keys()].some(key=>!['token','download'].includes(key))
      || url.searchParams.getAll('token').length!==1 || url.searchParams.getAll('download').length>1
      || !Number.isFinite(remaining) || remaining<=now() || !Number.isFinite(expires) || expires<=now() || expires>now()+65000 || expires>remaining)throw Error('private_attachment_response_invalid');
    return {url:url.href,expiresAt:expires};
  };
}
