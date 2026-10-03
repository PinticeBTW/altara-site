import {normalizePrivateUploadReference} from './messageMediaPolicy.js';
import {resolveTrustedAttachmentDeliveryUrl} from './trustedUploadClient.js';
const types=new Set(['image/png','image/jpeg','image/gif','image/webp','application/pdf','application/zip','video/mp4','video/webm','audio/ogg','audio/mpeg','audio/wav','text/plain','text/csv','application/json']);

// Only descriptors rebuilt by the bot upload authority reach the media broker.
export function botAttachmentItems(metadata, content='', supabaseOrigin='', row=null) {
  if(!Array.isArray(metadata?.attachments) || metadata.attachments.length>10)return [];
  let hydrated=[];
  try {const parsed=JSON.parse(content);if(parsed?.type==='attachments' && Array.isArray(parsed.items))hydrated=parsed.items;}catch{}
  const ids=new Set();let bytes=0;
  const items=[];
  for(const item of metadata.attachments) {
    const reference=normalizePrivateUploadReference(item?.referenceUrl||item?.url||'');
    const uploadId=String(item?.uploadId||item?.upload_id||'').toLowerCase();
    const size=Number(item?.size);
    if(!reference || reference!==`altara-private-upload:${uploadId}` || ids.has(uploadId)
      || !Number.isSafeInteger(size) || size<1 || size>8*1024*1024 || typeof item.name!=='string'
      || (!types.has(item.mime) && !(item.mime==='application/octet-stream' && /\.(txt|csv|json|log)$/i.test(item.name))))return [];
    ids.add(uploadId);bytes+=size;if(bytes>16*1024*1024)return [];
    const resolved=hydrated.find(entry=>entry?.uploadId===uploadId);
    const url=resolveTrustedAttachmentDeliveryUrl(row,{...item,...resolved,uploadId,referenceUrl:reference},{supabaseOrigin})||reference;
    items.push({type:'attachment',uploadId,referenceUrl:reference,url,name:item.name.slice(0,180),size,mime:item.mime});
  }
  return items;
}
