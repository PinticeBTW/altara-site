import { readAltaraLocalePreference } from './locale.js';
const text=(en,pt)=>readAltaraLocalePreference().startsWith('pt')?pt:en;
export function renderCalendarConnectionCard() {
  return `<section class="settingsManualConnectionsPanel calendarConnectionCard"><div><div class="settingsSectionTitle">${text('Calendars','Calendários')}</div><p class="settingsHint">${text('Google Calendar · Apple Calendar · Outlook. Use Add to calendar on an event to save a copy.','Google Calendar · Apple Calendar · Outlook. Usa Adicionar ao calendário num evento para guardar uma cópia.')}</p></div><button type="button" class="btn ghost" data-action="calendar-connect">${text('Calendar options','Opções do calendário')}</button></section>`;
}
export async function openCalendarConnections(client) {
  document.querySelector('.calendarConnectionDialog')?.close();
  const previous=document.activeElement,dialog=document.createElement('dialog');dialog.className='calendarConnectionDialog';
  dialog.innerHTML=`<form method="dialog"><h2>${text('Calendar subscription','Subscrição do calendário')}</h2><button class="btn ghost" aria-label="${text('Close','Fechar')}">×</button></form><p>${text('Optional: subscribe to your Going events to receive future changes. For a single event, use Add to calendar and save it in your calendar app.','Opcional: subscreve os eventos em que vais para receber alterações futuras. Para um evento, usa Adicionar ao calendário e guarda-o na tua app.')}</p><div class="calendarConnectionBody" aria-live="polite">${text('Loading…','A carregar…')}</div>`;
  document.body.append(dialog);dialog.showModal();
  let account;
  const authWatch=client.auth?.onAuthStateChange?.((_event,session)=>{const id=session?.user?.id||'';if(account!==undefined&&account!==id)dialog.close();account=id;});
  dialog.addEventListener('close',()=>{authWatch?.data?.subscription?.unsubscribe();dialog.remove();previous?.focus();},{once:true});
  const body=dialog.querySelector('.calendarConnectionBody');let url='',working=false;
  function show(enabled){
    body.innerHTML=`<span class="calendarConnectionStatus">${enabled?text('Subscription available','Subscrição disponível'):text('Not enabled','Por ativar')}</span><div class="calendarConnectionActions"><button type="button" class="btn primary" data-calendar="enable">${enabled?text('Show subscription link','Ver link de subscrição'):text('Enable calendar subscription','Ativar subscrição do calendário')}</button>${enabled?`<button type="button" class="btn ghost" data-calendar="disable">${text('Disable subscription','Desativar subscrição')}</button>`:''}</div><p class="settingsHint">${text('This is a read-only subscription, not account sign-in. Google and Apple control how often they check for changes. Edit events in ALTARA.','Esta ligação é uma subscrição de leitura, sem iniciar sessão na conta. O Google e a Apple definem a frequência de atualização. Edita os eventos no ALTARA.')}</p>`;
  }
  function options(){
    show(true);
    const section=document.createElement('div');section.className='calendarSubscriptionOptions';
    section.innerHTML=`<div class="calendarConnectionActions"><a class="btn primary" data-calendar-google target="_blank" rel="noopener noreferrer">${text('Google: add by URL ↗','Google: adicionar por URL ↗')}</a><a class="btn ghost" data-calendar-apple>Apple Calendar ↗</a><button type="button" class="btn ghost" data-calendar="copy">${text('Copy subscription link','Copiar link de subscrição')}</button></div><p>${text('Copy the subscription link, then paste it into Google’s From URL field and add the calendar. Apple: add a Subscription Calendar. Opening these options alone does not subscribe you.','Copia o link, cola-o no campo A partir de URL do Google e adiciona o calendário. Apple: adiciona um Calendário de assinatura. Abrir estas opções não ativa a subscrição na outra app.')}</p><p class="settingsHint">${text('Keep this link private: anyone with it can read your subscribed events. Disabling it blocks future access; remove the calendar in your other app to clear cached events.','Guarda este link só para ti: quem o tiver consegue ler os eventos subscritos. Desativar bloqueia o acesso futuro; remove o calendário na outra app para limpar eventos guardados.')}</p><small data-calendar-status role="status"></small>`;
    section.querySelector('[data-calendar-google]').href='https://calendar.google.com/calendar/u/0/r/settings/addbyurl';
    section.querySelector('[data-calendar-apple]').href=url.replace(/^https:/,'webcal:');body.append(section);
  }
  body.addEventListener('click',async event=>{
    const button=event.target.closest('[data-calendar]');if(!button||working)return;
    const action=button.dataset.calendar;
    if(action==='copy'){try{await navigator.clipboard.writeText(url);body.querySelector('[data-calendar-status]').textContent=text('Link copied.','Link copiado.');}catch{const field=document.createElement('input');field.readOnly=true;field.value=url;field.setAttribute('aria-label',text('Private subscription link','Link privado de subscrição'));body.append(field);field.select();}return;}
    working=true;button.disabled=true;
    try{
      const {data,error}=await client.rpc('altara_calendar_subscription_v1',{p_action:action});if(error)throw error;
      if(!dialog.isConnected)return;
      if(action==='enable'){
        if(!/^[a-f0-9]{64}$/.test(data?.token||''))throw new Error('invalid_subscription');
        url=client.supabaseUrl.replace(/\/$/,'')+'/functions/v1/calendar-feed?token='+data.token;options();
      }else{url='';show(false);}
    }catch{if(dialog.isConnected){button.disabled=false;let notice=body.querySelector('[data-calendar-error]');if(!notice){notice=document.createElement('p');notice.dataset.calendarError='';notice.setAttribute('role','alert');body.append(notice);}notice.textContent=text('Could not update the subscription. Please try again.','Não foi possível atualizar a subscrição. Tenta novamente.');}}
    finally{working=false;}
  });
  const {data,error}=await client.rpc('altara_calendar_subscription_v1',{p_action:'status'});
  if(dialog.isConnected){if(error)body.textContent=text('Calendar connections are temporarily unavailable.','As ligações de calendário estão temporariamente indisponíveis.');else show(!!data?.enabled);}
}
