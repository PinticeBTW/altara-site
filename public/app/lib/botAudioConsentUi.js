export function createBotAudioConsentUi({bridge,getContext,document:doc=globalThis.document}) {
 let dialog=null,badge=null,watch=null,sequence=0;
 const el=(tag,text)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 const button=(text,handler)=>{const node=el('button',text);node.type='button';node.addEventListener('click',handler);return node;};
 const styleBox=node=>Object.assign(node.style,{color:'#eee',background:'#20201e',border:'1px solid #49463f',borderRadius:'12px',padding:'20px',font:'14px system-ui',maxWidth:'min(440px,90vw)'});
 function close(){sequence++;clearInterval(watch);watch=null;if(dialog){const focus=dialog.previousFocus;dialog.remove();dialog=null;if(focus?.isConnected)focus.focus();}}
 function update(entries=bridge.snapshot()) {
  badge?.remove();badge=null;
  if(!entries.length)return;
  badge=el('div');badge.setAttribute('role','status');styleBox(badge);
  Object.assign(badge.style,{position:'fixed',bottom:'90px',right:'20px',zIndex:10050,padding:'12px',boxShadow:'0 8px 24px #0008'});
  badge.append(el('p',entries.some(e=>e.active)?(entries.some(e=>e.recording)?'Microfone partilhado com um bot para gravação.':'Microfone partilhado com um bot.'):'A ligar partilha de microfone…'),button('Parar partilha',async()=>{await Promise.all(entries.map(e=>bridge.revoke(e.captureId)));update();}));doc.body.append(badge);
 }
 async function open({botId}={}) {
  close();const ctx=getContext(),key=[ctx.userId,ctx.serverId,ctx.channelId,ctx.mediaGeneration].join(':'),run=sequence;
  dialog=el('dialog');dialog.previousFocus=doc.activeElement;dialog.setAttribute('aria-label','Partilha de microfone com bots');styleBox(dialog);
  const heading=el('h2','Partilha de microfone'),body=el('div'),notice=el('p');notice.setAttribute('role','status');
  dialog.append(heading,el('p','O áudio é enviado ao responsável pelo bot e pode ser guardado. Partilha apenas se confiares nele. Podes parar a qualquer momento.'),body,notice,button('Fechar',close));
  const current=()=>dialog && run===sequence && key===[getContext().userId,getContext().serverId,getContext().channelId,getContext().mediaGeneration].join(':');
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});doc.body.append(dialog);dialog.showModal();
  watch=setInterval(()=>{if(!current())close();},250);
  const refresh=async()=>{
   body.replaceChildren();notice.textContent='A carregar pedidos…';
   try {
    const captures=await bridge.list();if(!current())return;notice.textContent='';
    for(const capture of captures.filter(row=>!botId || row.bot_id===botId)) {
     const active=bridge.snapshot().find(row=>row.captureId===capture.capture_id);
     const card=el('section');card.append(el('h3',capture.bot_name||'Bot'),el('p',capture.recording?'Este pedido inclui gravação.':'Este pedido permite receber o teu microfone.'));
     if(active)card.append(button('Retirar consentimento',async()=>{await bridge.revoke(capture.capture_id);update();if(current())void refresh();}));
     else {
      const label=el('label'),agree=el('input');agree.type='checkbox';label.append(agree,doc.createTextNode(capture.recording?' Autorizo a partilha e a gravação do meu microfone.':' Autorizo a partilha do meu microfone com este bot.'));
      const share=button('Partilhar microfone',async()=>{
       if(!agree.checked || !current())return;share.disabled=true;notice.textContent='A ligar…';
       try {await bridge.consent(capture.capture_id,{recording:capture.recording===true});update();if(current())void refresh();}
       catch {if(current()){notice.textContent='Não foi possível partilhar o microfone. Confirma que estás na chamada e tenta novamente.';share.disabled=false;}}
      });share.disabled=true;agree.addEventListener('change',()=>{share.disabled=!agree.checked;});card.append(label,el('br'),share);
     }
     body.append(card);
    }
    if(!body.childNodes.length)body.append(el('p','Não há pedidos ativos nesta chamada.'));
   }catch {if(current())notice.textContent='A partilha não está disponível. Confirma que estás na chamada e que esta função está ativada.';}
  };
  dialog.append(button('Atualizar',()=>void refresh()));await refresh();
 }
 return {open,close,update};
}
