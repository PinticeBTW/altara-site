import { botEmbedUrl } from "./botEmbeds.js";
const escape = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const text = (v,n) => typeof v === "string" ? [...v].slice(0,n).join("") : "";
const uuid = v => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export function botMessageComponents(message) {
 if (message?.source !== "bot_channel_messages") return [];
 return Array.isArray(message.metadata?.components) ? message.metadata.components.slice(0,5) : [];
}

export function renderBotComponents(message) {
 const rows=botMessageComponents(message), meta=message?.metadata || {};
 const id=message?.bot_channel_message_id || message?.message_id || message?.response_message_id || message?.id?.replace(/^bot:/,"");
 if (!rows.length || !uuid(id) || !uuid(meta.components_revision)) return "";
 const expired=!Number.isFinite(Date.parse(meta.components_expires_at)) || Date.parse(meta.components_expires_at)<=Date.now();
 const html=rows.map(row=>{
  if (row?.type!==1 || !Array.isArray(row.components)) return "";
  return `<div class="botComponents__row">${row.components.slice(0,5).map(c=>{
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
   return "";
  }).join("")}</div>`;
 }).join("");
 return `<div class="botComponents" data-bot-message-id="${escape(id)}" data-bot-revision="${escape(meta.components_revision)}">${html}<div class="botComponents__status" role="status" aria-live="polite">${expired?'These actions have expired.':''}</div></div>`;
}

const errorText = error => /expired|not_available/.test(error?.message||"") ? "This action is no longer available." : /denied|permission/.test(error?.message||"") ? "You cannot use this action in this channel." : /rate_limited/.test(error?.message||"") ? "Please wait before trying again." : "The bot could not complete this action. Try again.";

export function bindBotComponents(root, {rpc, getActor = ()=>""} = {}) {
 const pending=new Set();let generation=0;
 const dialogs=new Set();
 const status=(box,value)=>{const node=box.querySelector('[role="status"]');if(node)node.textContent=value;};
 const call=async(name,args)=>{const response=await rpc(name,args);if(response.error)throw response.error;return response.data;};
 const wait=async(eventId,actor,visible)=>{
  for(let n=0;n<25;n++){
   if(getActor()!==actor || !visible())throw Error("component_cancelled");
   const result=await call("bots_component_result_v1",{p_event_id:eventId});
   if(result?.status==="responded")return result.response;
   if(!["pending","claimed"].includes(result?.status))throw Error("component_expired");
   await new Promise(resolve=>setTimeout(resolve,n<5?750:1250));
  }
  throw Error("component_timeout");
 };
 const showModal=(parentId,modal,actor)=>{
  if (!modal || !Array.isArray(modal.components) || getActor()!==actor)return;
  const doc=root.ownerDocument || root, dialog=doc.createElement("dialog");
  dialog.className="botComponentModal";
  const titleId="bot-modal-"+crypto.randomUUID();
  dialog.setAttribute("aria-labelledby",titleId);
  dialog.innerHTML=`<form><header><h2 id="${titleId}">${escape(text(modal.title,45))}</h2><button type="button" data-close aria-label="Close form">×</button></header><div class="botComponentModal__fields">${modal.components.slice(0,5).map(r=>r.components?.[0]).filter(c=>c?.type===4).map((c,i)=>{
   const id=titleId+"-"+i, attrs=`id="${id}" name="${escape(text(c.custom_id,100))}" minlength="${Math.max(0,Number(c.min_length)||0)}" maxlength="${Math.min(2000,Math.max(1,Number(c.max_length)||2000))}" placeholder="${escape(text(c.placeholder,100))}" ${c.required!==false?'required':''}`;
   return `<label for="${id}">${escape(text(c.label,45))}${c.style===2?`<textarea ${attrs}>${escape(text(c.value,2000))}</textarea>`:`<input type="text" ${attrs} value="${escape(text(c.value,2000))}">`}</label>`;
  }).join("")}</div><p role="status" aria-live="polite"></p><footer><button type="button" data-close>Cancel</button><button type="submit" class="botComponentButton botComponentButton--1">Submit</button></footer></form>`;
  doc.body.append(dialog);dialogs.add(dialog);
  const requestId=crypto.randomUUID();let busy=false;
  dialog.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>dialog.close()));
  dialog.addEventListener('close',()=>{dialogs.delete(dialog);dialog.remove();},{once:true});
  dialog.querySelector('form').addEventListener('submit',async event=>{
   event.preventDefault();if(busy || getActor()!==actor){if(getActor()!==actor)dialog.close();return;}
   busy=true;const button=dialog.querySelector('[type="submit"]');button.disabled=true;
   const fields=Object.fromEntries(new FormData(event.target));
   const message=dialog.querySelector('[role="status"]');message.textContent="Waiting for the bot…";
   try{
    const queued=await call("bots_submit_modal_v1",{p_parent_id:parentId,p_fields:fields,p_request_id:requestId});
    await wait(queued.id,actor,()=>dialog.isConnected);dialog.close();
   }catch(error){if(dialog.isConnected)message.textContent=errorText(error);}
   finally{busy=false;button.disabled=false;}
  });
  dialog.showModal();
 };
 const invoke=async(control,values)=>{
  const box=control.closest('[data-bot-message-id]');if(!box)return;
  const key=box.dataset.botMessageId+":"+control.dataset.botCustomId;
  if(pending.has(key))return;
  pending.add(key);const actor=getActor(),run=generation;const disabled=Array.from(box.querySelectorAll('button,select')).map(node=>[node,node.disabled]);
  disabled.forEach(([node])=>node.disabled=true);status(box,"Waiting for the bot…");
  try{
   const queued=await call("bots_invoke_component_v1",{p_message_id:box.dataset.botMessageId,p_revision:box.dataset.botRevision,p_custom_id:control.dataset.botCustomId,p_values:values,p_request_id:crypto.randomUUID()});
   const response=await wait(queued.id,actor,()=>root.isConnected!==false && generation===run);
   if(getActor()!==actor)return;
   if(response?.action==="modal")showModal(queued.id,response.modal,actor);
   status(box,"Done.");
  }catch(error){if(error.message!=="component_cancelled")status(box,errorText(error));}
  finally{pending.delete(key);disabled.forEach(([node,was])=>node.disabled=was);}
 };
 const click=event=>{const button=event.target?.closest?.('button[data-bot-custom-id]');if(button && root.contains(button) && !button.disabled)void invoke(button,[]);};
 const submit=event=>{const form=event.target?.closest?.('form.botComponentMenu');if(form && root.contains(form)){event.preventDefault();void invoke(form,Array.from(form.querySelector('select').selectedOptions).map(o=>o.value).filter(Boolean));}};
 root.addEventListener('click',click);root.addEventListener('submit',submit);
 const reset=()=>{generation++;pending.clear();for(const dialog of dialogs)dialog.close();};
 const dispose=()=>{reset();root.removeEventListener('click',click);root.removeEventListener('submit',submit);};
 dispose.reset=reset;
 return dispose;
}
