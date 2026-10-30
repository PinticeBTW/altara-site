const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = value => typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : '';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const resource = kind => kind === 'automod' ? {rpc:'altara_server_automod_action_v1',prefix:'automod',list:'rules',title:'Proteção automática'} : {rpc:'altara_server_expression_action_v1',prefix:'expression',list:'expressions',title:'Emojis e stickers'};
const TIMEOUT_SECONDS = [60,300,600,3600];
export function normalizeAutoModSettings(row) {
  const trigger_type=row.trigger_type ?? 'keywords',enforcement_action=row.enforcement_action ?? 'block';
  if(!['keywords','message_spam'].includes(trigger_type)||!['block','timeout'].includes(enforcement_action))throw Error('invalid_resource_response');
  const spam=row.spam ?? {};
  if(!spam||typeof spam!=='object'||Array.isArray(spam))throw Error('invalid_resource_response');
  if(trigger_type==='message_spam') {
    for(const [key,min,max] of [['window_seconds',5,60],['max_messages',3,20],['max_duplicates',2,10]]) {
      if(!Number.isInteger(spam[key])||spam[key]<min||spam[key]>max)throw Error('invalid_resource_response');
    }
    if(row.keywords.length)throw Error('invalid_resource_response');
  } else if(!row.keywords.length||Object.keys(spam).length)throw Error('invalid_resource_response');
  const timeout_seconds=enforcement_action==='timeout'?row.timeout_seconds:null;
  if(enforcement_action==='timeout'&&!TIMEOUT_SECONDS.includes(timeout_seconds))throw Error('invalid_resource_response');
  return {trigger_type,enforcement_action,spam:{...spam},timeout_seconds};
}
export function serverResourceError(error) {
  const text = `${error?.code || ''} ${error?.message || ''}`;
  if (/42501|denied|permission|not_authenticated/.test(text)) return 'Já não tens permissão para gerir estas definições.';
  if (/PGRST202|42883/.test(text)) return 'Esta função ainda não está disponível neste servidor.';
  if (/quota|limit|rate_limited/.test(text)) return 'Atingiste o limite. Tenta novamente mais tarde.';
  if (/invalid_/.test(text)) return 'Revê o nome, as palavras ou o ficheiro escolhido.';
  if (/conflict/.test(text)) return 'As definições mudaram. Fecha e volta a abrir para rever.';
  return 'Não foi possível confirmar a operação. Podes tentar novamente.';
}

export function normalizeServerResourceList(kind, data, serverId) {
  const shape = resource(kind), rows = data?.[shape.list];
  if (data?.ok !== true || !Array.isArray(rows) || rows.length > 200) throw Error('invalid_resource_response');
  const seen = new Set();
  return rows.map(row => {
    if (!id(row?.id) || id(row.server_id) !== serverId || seen.has(id(row.id)) || typeof row.name !== 'string' || row.name.length > 120) throw Error('invalid_resource_response');
    seen.add(id(row.id));
    if (kind === 'automod') {
      if (typeof row.enabled !== 'boolean' || !Array.isArray(row.keywords) || row.keywords.length > 20 || row.keywords.some(word => typeof word !== 'string' || word.length > 100)) throw Error('invalid_resource_response');
      return {id:id(row.id),name:row.name,enabled:row.enabled,keywords:[...row.keywords],exempt_channel_ids:row.exempt_channel_ids || [],exempt_role_ids:row.exempt_role_ids || [],...normalizeAutoModSettings(row)};
    }
    if (!['emoji','sticker'].includes(row.kind) || !id(row.asset_id)) throw Error('invalid_resource_response');
    return {id:id(row.id),name:row.name,kind:row.kind,asset_id:id(row.asset_id)};
  });
}

// A lost mutation response retains its original request UUID and payload. The
// entire owner is invalidated when the account/server or permissions change.
export function createServerResourceController({rpc,getContext,uuid=()=>crypto.randomUUID(),onChange=()=>{}}) {
  let owner=null;
  const current = value => {
    const context = getContext();
    return value === owner && context?.canManage === true && (value.kind !== 'expressions' || context.expressionsEnabled !== false) && id(context.actor) === value.actor && id(context.serverId) === value.serverId;
  };
  function close(){owner=null;onChange(null);}
  function snapshot(){
    if (!owner) return null;
    if (!current(owner)){close();return null;}
    return {kind:owner.kind,serverId:owner.serverId,rows:structuredClone(owner.rows),loading:owner.loading,saving:owner.saving,error:owner.error,retryable:!!owner.operation};
  }
  const publish = value => {if(current(value))onChange(snapshot());};
  async function read(value){
    const shape=resource(value.kind);value.loading=true;publish(value);
    try {
      const result=await rpc(shape.rpc,{p_server_id:value.serverId,p_action:`${shape.prefix}_list`,p_payload:{},p_request_id:null});
      if (!current(value))return false;
      if(result?.error)throw result.error;
      value.rows=normalizeServerResourceList(value.kind,result?.data,value.serverId);value.error='';return true;
    } catch(error){if(current(value))value.error=serverResourceError(error);return false;}
    finally{if(current(value)){value.loading=false;publish(value);}}
  }
  async function open(kind){
    if(kind==='expressions'&&getContext()?.expressionsEnabled===false){if(owner?.kind==='expressions')close();return false;}
    close();const context=getContext();
    if(!['automod','expressions'].includes(kind)||context?.canManage!==true||(kind==='expressions'&&context.expressionsEnabled===false)||!id(context.actor)||!id(context.serverId))return false;
    const value={actor:id(context.actor),serverId:id(context.serverId),kind,rows:[],loading:false,saving:false,error:'',operation:null};owner=value;
    return read(value);
  }
  async function mutate(action,payload){
    const value=owner;if(!value||!current(value)||value.saving||value.loading)return false;
    const shape=resource(value.kind);
    if(!['create','update','delete'].includes(action))return false;
    if(value.operation)return false;
    value.operation={p_server_id:value.serverId,p_action:`${shape.prefix}_${action}`,p_payload:structuredClone(payload),p_request_id:uuid()};
    return retry();
  }
  async function retry(){
    const value=owner;if(!value?.operation||!current(value)||value.saving)return false;
    value.saving=true;value.error='';publish(value);
    try {
      const result=await rpc(resource(value.kind).rpc,value.operation);
      if(!current(value))return false;
      if(result?.error)throw result.error;
      if(result?.data?.ok!==true || !id(result.data[ value.kind==='automod'?'rule_id':'expression_id']))throw Error('invalid_resource_response');
      value.operation=null;value.saving=false;await read(value);return true;
    }catch(error){
      if(current(value)) {
        value.error=serverResourceError(error);
        if(/42501|invalid_|conflict|quota|rate_limited/.test(`${error?.code || ''} ${error?.message || ''}`))value.operation=null;
      }
      return false;
    }finally{if(current(value)){value.saving=false;publish(value);}}
  }
  return {open,close,snapshot,mutate,retry};
}

export function createServerResourceDialog({document,rpc,getContext,uploadMedia,loadMedia}) {
  let dialog=null,returnFocus=null,controller,selected='',previewGeneration=0,uploading=false,pendingUpload=null,uploadStatus='';
  const previews=new Set();
  function clearPreviews(){previewGeneration++;for(const url of previews)URL.revokeObjectURL(url);previews.clear();}
  function close(){controller.close();}
  function syncAutoModForm(){
    const form=dialog?.querySelector('form'),kind=form?.elements.trigger_type?.value,action=form?.elements.enforcement_action?.value;
    if(!kind)return;
    for(const group of form.querySelectorAll('[data-rule-kind]')){const active=group.dataset.ruleKind===kind;group.hidden=!active;group.disabled=!active;}
    const timeout=form.querySelector('[data-rule-timeout]');if(timeout){timeout.hidden=action!=='timeout';timeout.disabled=action!=='timeout';}
    for(const hint of form.querySelectorAll('[data-rule-action-hint]'))hint.hidden=hint.dataset.ruleActionHint!==action;
  }
  function render(snapshot){
    if(!snapshot){pendingUpload=null;uploading=false;uploadStatus='';clearPreviews();dialog?.close();dialog?.remove();dialog=null;if(returnFocus?.isConnected)returnFocus.focus();return;}
    if(!dialog){
      returnFocus=document.activeElement;dialog=document.createElement('dialog');dialog.className='serverResourceDialog';dialog.setAttribute('aria-label',resource(snapshot.kind).title);document.body.append(dialog);
      // Native dialog owns Escape/Tab; parent settings shortcuts must not close or focus behind it.
      dialog.addEventListener('keydown',e=>{if(e.key==='Escape'||e.key==='Tab')e.stopPropagation();});
      dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('click',handleClick);dialog.addEventListener('submit',handleSubmit);dialog.addEventListener('change',syncAutoModForm);dialog.showModal();
    }
    // Keep input drafts/focus while a write is pending or its response is uncertain.
    if(dialog.querySelector('form')&&(snapshot.saving||snapshot.retryable||uploading||pendingUpload)){
      dialog.querySelector('[data-status]').textContent=uploading?'A enviar imagem…':uploadStatus||(snapshot.saving?'A guardar…':snapshot.error);
      dialog.querySelector('[data-retry]').hidden=!(snapshot.retryable||pendingUpload)||snapshot.saving||uploading;
      dialog.querySelectorAll('form button,form input,form textarea,form select,[data-row],[data-new]').forEach(button=>{button.disabled=true;});return;
    }
    clearPreviews();const generation=previewGeneration,shape=resource(snapshot.kind),row=snapshot.rows.find(value=>value.id===selected);
    const rows=snapshot.rows.map(value=>`<button type="button" data-row="${value.id}" class="serverResourceRow"><span>${snapshot.kind==='expressions'?`<img data-asset="${value.asset_id}" alt="" />`:''}<b>${esc(value.name)}</b></span><small>${snapshot.kind==='automod'?(value.enabled?'Ativa':'Desativada'):value.kind==='emoji'?'Emoji':'Sticker'}</small></button>`).join('');
    const form=snapshot.kind==='automod'
      ? `<label>Nome<input name="name" maxlength="80" required value="${esc(row?.name || '')}" /></label>
        <label>Tipo de proteção<select name="trigger_type" aria-label="Tipo de proteção"><option value="keywords" ${row?.trigger_type!=='message_spam'?'selected':''}>Palavras</option><option value="message_spam" ${row?.trigger_type==='message_spam'?'selected':''}>Excesso de mensagens e repetições</option></select></label>
        <fieldset data-rule-kind="keywords"><label>Palavras a bloquear, uma por linha<textarea name="keywords" maxlength="2020" rows="5" required>${esc(row?.keywords.join('\n') || '')}</textarea></label></fieldset>
        <fieldset data-rule-kind="message_spam"><label>Janela de tempo (segundos)<input name="window_seconds" type="number" min="5" max="60" step="1" required value="${row?.spam.window_seconds ?? 10}" /></label><label>Limite de mensagens<input name="max_messages" type="number" min="3" max="20" step="1" required value="${row?.spam.max_messages ?? 5}" /></label><label>Limite de mensagens repetidas<input name="max_duplicates" type="number" min="2" max="10" step="1" required value="${row?.spam.max_duplicates ?? 3}" /></label><p>Aplica-se por pessoa, dentro da janela escolhida.</p></fieldset>
        <label>Ação<select name="enforcement_action" aria-label="Ação"><option value="block" ${row?.enforcement_action!=='timeout'?'selected':''}>Bloquear o envio</option><option value="timeout" ${row?.enforcement_action==='timeout'?'selected':''}>Castigo temporário</option></select></label>
        <fieldset data-rule-timeout><label>Duração do castigo<select name="timeout_seconds" aria-label="Duração do castigo">${TIMEOUT_SECONDS.map(seconds=>`<option value="${seconds}" ${(row?.timeout_seconds ?? 300)===seconds?'selected':''}>${seconds===3600?'1 hora':`${seconds/60} minuto${seconds===60?'':'s'}`}</option>`).join('')}</select></label></fieldset>
        <p data-rule-action-hint="block">O envio que dispara a regra é bloqueado antes de aparecer no chat.</p><p data-rule-action-hint="timeout">Numa mensagem de texto normal, a mensagem que dispara a regra aparece no chat. Depois, a pessoa fica impedida de enviar durante o tempo escolhido. Votações e envios com anexos ou GIFs que disparem a regra são bloqueados. Exige também permissão para aplicar castigos.</p>
        <label class="serverResourceCheck"><input name="enabled" type="checkbox" ${row?.enabled!==false?'checked':''} />Regra ativa</label><p>Mantêm-se as exceções da regra e as proteções dos cargos.</p>`
      : `<label>Nome<input name="name" pattern="[a-zA-Z0-9_]{2,32}" maxlength="32" required value="${esc(row?.name || '')}" /></label>${row?'':`<label>Tipo<select name="kind"><option value="emoji">Emoji</option><option value="sticker">Sticker</option></select></label><label>Imagem<input name="file" type="file" accept="image/png,image/jpeg,image/gif,image/webp" required /></label><p>PNG, JPEG, GIF ou WebP. Até 512 KB.</p>`}`;
    dialog.innerHTML=`<header><h2>${shape.title}</h2><button type="button" data-close aria-label="Fechar">×</button></header>${snapshot.kind==='expressions'?'<p class="serverResourceIntro">Adiciona imagens personalizadas ao servidor: emojis para mensagens e reações, stickers para enviar no chat.</p>':''}<div class="serverResourceBody"><div class="serverResourceRows">${rows||`<p>${snapshot.loading?'A carregar…':'Ainda não existem entradas.'}</p>`}<button type="button" data-new ${snapshot.loading?'disabled':''}>+ ${snapshot.kind==='automod'?'Nova regra':'Nova imagem'}</button></div><form>${form}<footer><button type="submit" ${snapshot.loading?'disabled':''}>${row?'Guardar':'Criar'}</button>${row?'<button type="button" data-delete>Eliminar</button>':''}</footer></form></div><p data-status role="status">${esc(snapshot.error)}</p><button type="button" data-retry hidden>Tentar novamente</button>`;
    syncAutoModForm();
    if(snapshot.kind==='expressions')for(const img of dialog.querySelectorAll('[data-asset]')){
      void loadMedia(img.dataset.asset).then(blob=>{if(generation!==previewGeneration||!img.isConnected||!controller.snapshot())return;const url=URL.createObjectURL(blob);previews.add(url);img.src=url;}).catch(()=>{if(img.isConnected)img.remove();});
    }
  }
  async function handleClick(event){
    const button=event.target.closest('button');if(!button||button.disabled)return;
    if(button.hasAttribute('data-close'))return close();
    if(button.hasAttribute('data-retry'))return pendingUpload?upload(pendingUpload):controller.retry();
    if(button.hasAttribute('data-new')){selected='';render(controller.snapshot());dialog.querySelector('input[name="name"]').focus();return;}
    if(button.hasAttribute('data-row')){selected=button.dataset.row;render(controller.snapshot());return;}
    if(button.hasAttribute('data-delete')){
      const snapshot=controller.snapshot();if(!snapshot||!selected)return;
      if(!globalThis.confirm('Eliminar esta entrada do servidor?'))return;
      const key=snapshot.kind==='automod'?'rule_id':'expression_id';const target=selected;selected='';await controller.mutate('delete',{[key]:target});
    }
  }
  async function handleSubmit(event){
    event.preventDefault();const snapshot=controller.snapshot();if(!snapshot||snapshot.saving||snapshot.retryable||uploading||pendingUpload)return;
    const form=event.target;if(!form.reportValidity())return;
    const row=snapshot.rows.find(value=>value.id===selected);let payload;
    if(snapshot.kind==='automod') {
      const trigger_type=form.elements.trigger_type.value,enforcement_action=form.elements.enforcement_action.value;
      payload={name:form.elements.name.value.trim(),trigger_type,enforcement_action,keywords:trigger_type==='keywords'?form.elements.keywords.value.split(/\r?\n/).map(value=>value.trim()).filter(Boolean):[],spam:trigger_type==='message_spam'?Object.fromEntries(['window_seconds','max_messages','max_duplicates'].map(key=>[key,Number(form.elements[key].value)])):{},enabled:form.elements.enabled.checked,exempt_channel_ids:row?.exempt_channel_ids || [],exempt_role_ids:row?.exempt_role_ids || []};
      if(enforcement_action==='timeout')payload.timeout_seconds=Number(form.elements.timeout_seconds.value);
      if(row)payload.rule_id=row.id;
    }else{
      payload={name:form.elements.name.value.trim()};
      if(row)payload.expression_id=row.id;
      else {
        const file=form.elements.file.files[0],kind=form.elements.kind.value;
        if(!file||file.size>512*1024){dialog.querySelector('[data-status]').textContent='Escolhe uma imagem até 512 KB.';return;}
        const context=getContext();
        pendingUpload={file,kind,payload:structuredClone(payload),requestId:crypto.randomUUID(),actor:id(context.actor),serverId:id(context.serverId),dialog};
        return upload(pendingUpload);
      }
    }
    await controller.mutate(row?'update':'create',payload);
  }
  async function upload(operation){
    if(uploading||pendingUpload!==operation)return;
    uploading=true;uploadStatus='';render(controller.snapshot());
    const current=()=>pendingUpload===operation&&dialog===operation.dialog&&id(getContext()?.actor)===operation.actor&&id(getContext()?.serverId)===operation.serverId&&!!controller.snapshot();
    try{
      const asset=await uploadMedia(operation.file,operation.kind,operation.requestId);
      if(!current())return;
      if(!id(asset?.asset_id))throw Error('invalid_expression_media_response');
      pendingUpload=null;uploading=false;uploadStatus='';
      await controller.mutate('create',{...operation.payload,kind:operation.kind,asset_id:id(asset.asset_id)});
    }catch(error){
      if(!current())return;
      uploading=false;uploadStatus=serverResourceError(error);
      if(/42501|invalid_|conflict|quota|rate_limited|denied/.test(`${error?.code || ''} ${error?.message || ''}`)){
        pendingUpload=null;
        dialog.querySelectorAll('form button,form input,form textarea,form select,[data-row],[data-new]').forEach(control=>{control.disabled=false;});
        dialog.querySelector('[data-status]').textContent=uploadStatus;dialog.querySelector('[data-retry]').hidden=true;
      }else render(controller.snapshot());
    }
  }
  controller=createServerResourceController({rpc,getContext,onChange:render});
  return {open:kind=>{selected='';return controller.open(kind);},close,sync:()=>controller.snapshot()};
}
