import { readAltaraLocalePreference } from './locale.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uuid = value => /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(String(value || ''));
export const POLL_DURATIONS = [1,6,24,72,168];
export function validatePollDraft({question,options,durationHours}) {
  const clean = {question:String(question || '').trim(),options:(Array.isArray(options)?options:[]).map(x=>String(x).trim()),durationHours:Number(durationHours)};
  if (!clean.question || clean.question.length>200) throw Error('invalid_poll_question');
  if (clean.options.length<2 || clean.options.length>10 || clean.options.some(x=>!x || x.length>100)
    || new Set(clean.options.map(x=>x.toLocaleLowerCase())).size!==clean.options.length) throw Error('invalid_poll_options');
  if (!POLL_DURATIONS.includes(clean.durationHours)) throw Error('invalid_poll_duration');
  return clean;
}
export function pollMessageQuestion(message) {
  if (!uuid(message?.id)) return '';
  try { const p=JSON.parse(message.content);return p?.type==='altara_poll_v1' && typeof p.question==='string' ? p.question.slice(0,200) : ''; } catch { return ''; }
}
export function pollMessageSlot(message,content='') {
  return `<div data-poll-message="${esc(message.id)}" data-poll-conversation="${esc(message.conversation_id)}">${content || `<p>${esc(pollMessageQuestion(message))}</p><span class="serverPollMuted" role="status">${pollText('Loading poll…','A carregar votação…')}</span>`}</div>`;
}
export const pollText = (en,pt) => readAltaraLocalePreference().startsWith('pt') ? pt : en;
export function renderPollCard(p,{text=pollText,busy=false,error='',widget=false,now=Date.now()}={}) {
  const closed=!!p.closed_at || Date.parse(p.expires_at)<=now;
  const counts=p.options.map((_,i)=>Math.max(0,Number(p.counts?.[i])||0));
  const total=counts.reduce((a,b)=>a+b,0),own=Number.isInteger(p.own)?p.own:null;
  const endedAt=p.closed_at || p.expires_at;
  const end=new Intl.DateTimeFormat(readAltaraLocalePreference().startsWith('pt')?'pt-PT':'en',{dateStyle:'short',timeStyle:'short'}).format(new Date(endedAt));
  return `<section class="serverPollCard${widget?' is-widget':''}" data-poll-card="${esc(p.message_id)}" aria-label="${esc(p.question)}" aria-busy="${busy}">
    <div class="serverPollEyebrow"><span>${text('POLL','VOTAÇÃO')}${widget?' · #'+esc(p.channel_name):''}</span><span>${closed?text('Closed','Encerrada'):text('Open','Aberta')}</span></div>
    <h3>${esc(p.question)}</h3><div class="serverPollOptions" role="group" aria-label="${text('Choose one option','Escolhe uma opção')}">
    ${p.options.map((option,i)=>{const pct=total?Math.round(counts[i]*100/total):0;return `<button type="button" class="serverPollOption${own===i?' is-selected':''}" data-poll-vote="${esc(p.message_id)}" data-option="${i}" aria-pressed="${own===i}" ${closed||busy||!p.can_vote?'disabled':''}><span class="serverPollBar" style="width:${pct}%" aria-hidden="true"></span><span class="serverPollOptionText">${own===i?'<span aria-hidden="true">✓ </span>':''}${esc(option)}</span><span class="serverPollCount">${counts[i]} · ${pct}%</span></button>`;}).join('')}
    </div><div class="serverPollFooter"><span>${total} ${text(total===1?'vote':'votes',total===1?'voto':'votos')} · ${text('One choice','Uma opção')}</span><time datetime="${esc(endedAt)}">${closed?text('Ended','Terminou'):text('Ends','Termina')} ${esc(end)}</time></div>
    ${error?`<p class="serverPollError" role="alert">${esc(error)}</p>`:''}
    <div class="serverPollActions">${widget?`<button class="btn ghost" type="button" data-poll-open="${esc(p.conversation_id)}">${text('Open chat','Abrir chat')}</button>`:''}${!closed&&p.can_close?`<button class="btn ghost" type="button" data-poll-close="${esc(p.message_id)}" ${busy?'disabled':''}>${text('End poll','Encerrar votação')}</button>`:''}</div>
  </section>`;
}

// Both surfaces consume these same authoritative snapshots; counts never live in localStorage.
export function createPollStore(client) {
  async function rpc(name,args) { const result=await client.rpc(name,args);if(result.error)throw result.error;return result.data; }
  return {
    channels: serverId=>rpc('altara_get_server_poll_channels_v1',{p_server_id:serverId}),
    read: (serverId,ids=null)=>rpc('altara_get_server_polls_v1',{p_server_id:serverId,p_message_ids:ids}),
    create: (conversationId,draft,requestId)=>{const d=validatePollDraft(draft);return rpc('altara_create_server_poll_v1',{p_message_id:requestId,p_conversation_id:conversationId,p_question:d.question,p_options:d.options,p_duration_hours:d.durationHours});},
    vote: (id,option)=>rpc('altara_vote_server_poll_v1',{p_message_id:id,p_option:option}),
    close: id=>rpc('altara_close_server_poll_v1',{p_message_id:id}),
  };
}

export function createServerPolls({client,context,channels,canCreate,openChannel,onCreated=()=>{}}) {
  const store=createPollStore(client),rows=new Map(),pending=new Set(),errors=new Map(),rendered=new WeakMap();
  let scope='',signature='',generation=0,channel=null,scheduled=0,ticker=0,observer=null,dialog=null;
  let active=[],loadError='',loading=false,disposed=false,dirty=false,readInFlight=false;
  let createChannels=[];
  const eligibleChannels=()=>channels().filter(c=>createChannels.some(allowed=>allowed.conversationId===c.conversationId));
  const text=pollText;
  const messageNodes=()=>[...document.querySelectorAll('[data-poll-message]')];
  const widgetNodes=()=>[...document.querySelectorAll('[data-server-polls-widget]')];
  function messageSlot(message) {
    const ctx=context(),p=rows.get(message.id);
    const valid=scope===`${ctx.userId||''}:${ctx.serverId||''}` && p?.server_id===ctx.serverId && p?.conversation_id===message.conversation_id;
    return pollMessageSlot(message,valid?renderPollCard(p,{busy:pending.has(p.message_id),error:errors.get(p.message_id)}):'');
  }
  function friendly(error) {
    const message=String(error?.message || error || '');
    if (/poll_closed/.test(message)) return text('This poll has ended.','Esta votação já terminou.');
    if (/invalid_poll/.test(message)) return text('Enter a question and 2–10 different, non-empty options.','Escreve uma pergunta e 2–10 opções diferentes, sem opções vazias.');
    if (/42501|forbidden|permission|row-level security/i.test(message+' '+error?.code)) return text('You no longer have permission for this poll.','Já não tens permissão para esta votação.');
    if (/PGRST202|does not exist|schema cache/.test(message+' '+error?.code)) return text('Polls are not available on this server yet.','As votações ainda não estão disponíveis neste servidor.');
    return text('Could not update the poll. Try again.','Não foi possível atualizar a votação. Tenta novamente.');
  }
  function replace(node,html) {
    if(rendered.get(node)===html)return;
    const focus=node.contains(document.activeElement)?document.activeElement:null;
    const vote=focus?.dataset.pollVote,option=focus?.dataset.option,close=focus?.dataset.pollClose;
    node.innerHTML=html;rendered.set(node,html);
    const next=vote?[...node.querySelectorAll('[data-poll-vote]')].find(x=>x.dataset.pollVote===vote&&x.dataset.option===option):close?node.querySelector('[data-poll-close]'):null;
    next?.focus({preventScroll:true});
  }
  function paint() {
    const ctx=context();
    for(const node of messageNodes()) {
      const p=rows.get(node.dataset.pollMessage);
      const valid=p && p.server_id===ctx.serverId && p.conversation_id===node.dataset.pollConversation;
      replace(node,valid?renderPollCard(p,{busy:pending.has(p.message_id),error:errors.get(p.message_id)}):`<p class="serverPollMuted" role="status">${esc(loadError || (loading?text('Loading poll…','A carregar votação…'):text('Poll unavailable.','Votação indisponível.')))}</p>${loadError?`<button class="btn ghost" data-poll-refresh>${text('Try again','Tentar novamente')}</button>`:''}`);
    }
    for(const node of widgetNodes()) {
      if(node.dataset.serverPollsWidget!==ctx.serverId)continue;
      const list=active.map(id=>rows.get(id)).filter(p=>p&&!p.closed_at&&Date.parse(p.expires_at)>Date.now());
      replace(node,`<div class="serverPollWidgetList">${loadError?`<p class="serverPollError" role="status">${esc(loadError)}</p><button class="btn ghost" data-poll-refresh>${text('Try again','Tentar novamente')}</button>`:list.length?list.map(p=>renderPollCard(p,{widget:true,busy:pending.has(p.message_id),error:errors.get(p.message_id)})).join(''):`<div class="serverPollEmpty"><strong>${loading?text('Loading polls…','A carregar votações…'):text('What shall we decide?','O que vamos decidir?')}</strong><p>${text('Active polls from your channels appear here.','As votações ativas dos teus canais aparecem aqui.')}</p></div>`}</div><div class="serverPollWidgetFooter">${eligibleChannels().length?`<button class="btn ghost" type="button" data-poll-create>${text('+ Create poll','+ Criar votação')}</button>`:''}</div>`);
    }
  }
  async function refresh() {
    if(disposed||document.hidden)return;
    if(readInFlight){dirty=true;return;}
    const ctx=context(),key=`${ctx.userId||''}:${ctx.serverId||''}`;
    const messages=messageNodes(),widgets=widgetNodes().filter(x=>x.dataset.serverPollsWidget===ctx.serverId);
    if(!ctx.userId||!ctx.serverId)return;
    const token=generation;readInFlight=true;loading=true;paint();
    try {
      const ids=[...new Set(messages.map(x=>x.dataset.pollMessage).filter(uuid))];
      const batches=[];for(let i=0;i<ids.length;i+=100)batches.push(store.read(ctx.serverId,ids.slice(i,i+100)));
      const [allowed,current,...history]=await Promise.all([store.channels(ctx.serverId),widgets.length?store.read(ctx.serverId):Promise.resolve([]),...batches]);
      if(token!==generation||key!==scope||disposed)return;
      rows.clear();for(const p of [...current,...history.flat()])rows.set(p.message_id,p);
      createChannels=Array.isArray(allowed)?allowed:[];active=current.map(p=>p.message_id);loadError='';
    }catch(error){if(token===generation){rows.clear();active=[];createChannels=[];loadError=friendly(error);}}
    finally {readInFlight=false;if(token===generation){loading=false;syncComposer();paint();}if(dirty){dirty=false;schedule(true);}}
  }
  function reconcile(force=false) {
    if(disposed)return;
    const ctx=context(),key=`${ctx.userId||''}:${ctx.serverId||''}`;
    if(scope!==key) {
      generation++;scope=key;signature='';rows.clear();active=[];createChannels=[];errors.clear();loadError='';loading=false;
      if(channel)void client.removeChannel(channel);channel=null;
      if(dialog)dialog.close();
      paint(); // Clear the previous server immediately, even while an old read is pending.
    }
    const ids=messageNodes().map(x=>x.dataset.pollMessage).sort().join(',');
    const widget=widgetNodes().some(x=>x.dataset.serverPollsWidget===ctx.serverId);
    const next=`${key}:${ids}:${widget}`;
    const visible=!!ctx.serverId&&(!!ids||widget);
    if(visible&&!channel&&typeof client.channel==='function') {
      channel=client.channel(`server-polls:${ctx.serverId}:${Math.random().toString(36).slice(2)}`,{config:{private:true}})
        .on('postgres_changes',{event:'*',schema:'public',table:'altara_server_polls_v1',filter:`server_id=eq.${ctx.serverId}`},()=>schedule(true))
        .subscribe(status=>{if(status==='SUBSCRIBED')schedule(true);});
    }
    if(!visible&&channel){void client.removeChannel(channel);channel=null;}
    syncComposer();
    if(next!==signature||force){signature=next;if(ctx.serverId)void refresh();}else paint();
  }
  function schedule(force=false) {
    dirty=dirty||force;
    if(scheduled||disposed)return;
    scheduled=setTimeout(()=>{scheduled=0;const force=dirty;dirty=false;reconcile(force);},80);
  }
  function syncComposer() {
    const anchor=document.getElementById('btnAttach');if(!anchor)return;
    let button=document.getElementById('btnCreateServerPoll');
    if(!button){button=document.createElement('button');button.type='button';button.id='btnCreateServerPoll';button.className='btn ghost serverPollComposer';button.dataset.pollCreate='chat';button.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 19V10M12 19V5M19 19v-6"/></svg>';anchor.after(button);}
    const ctx=context();button.hidden=!ctx.serverId||ctx.channelType!=='text'||!!ctx.widget||!canCreate()||!eligibleChannels().some(c=>c.conversationId===ctx.conversationId);
    button.disabled=!canCreate()||!eligibleChannels().some(c=>c.conversationId===ctx.conversationId);button.title=button.disabled?text('You need Create Polls permission in this channel.','Precisas da permissão Criar votações neste canal.'):text('Create poll','Criar votação');button.setAttribute('aria-label',text('Create poll','Criar votação'));
  }
  function openCreate(fromChat=false) {
    const ctx=context(),available=eligibleChannels();if(!ctx.userId||!available.length||(fromChat&&(!canCreate()||!available.some(c=>c.conversationId===ctx.conversationId))))return;
    if(dialog){dialog.focus();return;}
    const owner=document.activeElement,scopeAtOpen=scope;
    let requestId=crypto.randomUUID(),lastPayload='',busy=false;
    dialog=document.createElement('dialog');const formDialog=dialog;dialog.className='serverPollDialog';dialog.setAttribute('aria-labelledby','serverPollDialogTitle');
    const selected=fromChat?ctx.conversationId:available[0].conversationId;
    dialog.innerHTML=`<form><header><h2 id="serverPollDialogTitle">${text('Create a poll','Criar votação')}</h2><button class="btn ghost" type="button" data-poll-cancel aria-label="${text('Cancel','Cancelar')}">×</button></header><label>${text('Channel','Canal')}<select name="channel" ${fromChat?'disabled':''}>${available.map(c=>`<option value="${esc(c.conversationId)}" ${c.conversationId===selected?'selected':''}># ${esc(c.name)}</option>`).join('')}</select></label><label>${text('Question','Pergunta')}<input name="question" maxlength="200" required placeholder="${text('What are we playing tonight?','O que vamos jogar hoje?')}"></label><div data-poll-draft-options></div><button type="button" class="btn ghost" data-poll-add-option>${text('+ Add option','+ Adicionar opção')}</button><label>${text('Duration','Duração')}<select name="duration">${POLL_DURATIONS.map(h=>`<option value="${h}" ${h===24?'selected':''}>${h<24?h+' '+text('hours','horas'):(h/24)+' '+text(h===24?'day':'days',h===24?'dia':'dias')}</option>`).join('')}</select></label><p class="serverPollMuted">${text('One vote per person. Click your choice again to remove your vote.','Um voto por pessoa. Clica novamente na tua opção para retirar o voto.')}</p><p data-poll-form-error class="serverPollError" role="alert"></p><footer><button type="button" class="btn ghost" data-poll-cancel>${text('Cancel','Cancelar')}</button><button type="submit" class="btn primary">${text('Publish poll','Publicar votação')}</button></footer></form>`;
    function updateOptions() {
      const rows=[...dialog.querySelectorAll('[data-poll-draft-option]')];
      rows.forEach((row,i)=>{row.querySelector('span').textContent=text('Option','Opção')+' '+(i+1);row.querySelector('button').disabled=rows.length<=2;});
      dialog.querySelector('[data-poll-add-option]').disabled=rows.length>=10;
    }
    function addOption() {const row=document.createElement('label');row.dataset.pollDraftOption='';row.innerHTML=`<span></span><div><input name="option" maxlength="100" required><button type="button" class="btn ghost" data-poll-remove-option aria-label="${text('Remove option','Remover opção')}">×</button></div>`;dialog.querySelector('[data-poll-draft-options]').append(row);updateOptions();return row;}
    addOption();addOption();
    dialog.addEventListener('click',event=>{if(busy)return;const target=event.target.closest('button');if(target?.hasAttribute('data-poll-cancel'))dialog.close();if(target?.hasAttribute('data-poll-add-option')&&dialog.querySelectorAll('[name=option]').length<10)addOption().querySelector('input').focus();if(target?.hasAttribute('data-poll-remove-option')&&dialog.querySelectorAll('[name=option]').length>2){target.closest('label').remove();updateOptions();}});
    dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
    dialog.addEventListener('close',()=>{formDialog.remove();if(dialog===formDialog)dialog=null;owner?.isConnected&&owner.focus();},{once:true});
    dialog.querySelector('form').addEventListener('submit',async event=>{
      event.preventDefault();if(busy)return;
      const form=event.target,notice=form.querySelector('[data-poll-form-error]');
      try {
        const d=validatePollDraft({question:form.elements.question.value,options:[...form.querySelectorAll('[name=option]')].map(x=>x.value),durationHours:form.elements.duration.value});
        const conversationId=form.elements.channel.value;
        if(scopeAtOpen!==scope||!eligibleChannels().some(c=>c.conversationId===conversationId))throw Error('poll_forbidden');
        const payload=JSON.stringify([conversationId,d]);if(lastPayload&&lastPayload!==payload)requestId=crypto.randomUUID();lastPayload=payload;
        busy=true;notice.textContent='';form.querySelectorAll('button,input,select').forEach(x=>x.disabled=true);
        const id=await store.create(conversationId,d,requestId);
        if(scopeAtOpen!==scope)return;
        formDialog.close();schedule(true);onCreated({messageId:id,conversationId});
      }catch(error){notice.textContent=friendly(error);}
      finally{busy=false;if(formDialog.isConnected){form.querySelectorAll('button,input,select').forEach(x=>x.disabled=false);form.elements.channel.disabled=fromChat;updateOptions();}}
    });
    document.body.append(dialog);dialog.showModal();dialog.querySelector('[name=question]').focus();
  }
  async function click(event) {
    const button=event.target.closest?.('[data-poll-vote],[data-poll-close],[data-poll-open],[data-poll-create],[data-poll-refresh]');
    if(!button||button.disabled)return;
    event.preventDefault();event.stopPropagation();
    if(button.hasAttribute('data-poll-create')){openCreate(button.dataset.pollCreate==='chat');return;}
    if(button.hasAttribute('data-poll-refresh')){schedule(true);return;}
    if(button.dataset.pollOpen){openChannel(button.dataset.pollOpen);return;}
    const id=button.dataset.pollVote||button.dataset.pollClose,p=rows.get(id),token=generation;
    if(!p||pending.has(id)||p.server_id!==context().serverId)return;
    pending.add(id);errors.delete(id);paint();
    try {if(button.dataset.pollClose)await store.close(id);else await store.vote(id,p.own===Number(button.dataset.option)?null:Number(button.dataset.option));}
    catch(error){if(token===generation)errors.set(id,friendly(error));}
    finally{pending.delete(id);if(token===generation){await refresh();paint();}}
  }
  const onVisible=()=>{if(!document.hidden)schedule(true);};
  document.addEventListener('click',click,true);document.addEventListener('visibilitychange',onVisible);window.addEventListener('online',onVisible);
  observer=new MutationObserver(()=>schedule());const root=document.getElementById('dmMain');if(root)observer.observe(root,{childList:true,subtree:true});
  ticker=setInterval(()=>schedule(true),30000);schedule();
  return {messageSlot,sync:()=>schedule(),refresh:()=>schedule(true),invalidatePermissions:(serverId)=>{if(serverId!==context().serverId)return;generation++;createChannels=[];rows.clear();active=[];syncComposer();paint();schedule(true);},dispose:()=>{disposed=true;generation++;clearTimeout(scheduled);clearInterval(ticker);observer.disconnect();if(channel)void client.removeChannel(channel);dialog?.close();document.removeEventListener('click',click,true);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('online',onVisible);document.getElementById('btnCreateServerPoll')?.remove();}};
}
