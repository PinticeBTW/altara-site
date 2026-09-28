import { renderEventResponses, renderEventAttendees } from './serverEventResponses.js';
import { renderEventCalendarMenu } from './serverEventCalendar.js';
import { renderEventMaps } from './serverEventMaps.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={voice:'<path d="M3 14v-3a9 9 0 0 1 18 0v3M3 13h4v8H5a2 2 0 0 1-2-2zm18 0h-4v8h2a2 2 0 0 0 2-2z"/>',pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',arrow:'<path d="M7 17 17 7M7 7h10v10"/>',check:'<path d="m5 12 4 4L19 6"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||''}</svg>`;
export function eventScheduleLabel(event,locale='en-GB') {
  const start=new Date(event.starts_at),end=event.ends_at?new Date(event.ends_at):null;
  const day=new Intl.DateTimeFormat(locale,{day:'numeric',month:'short'});
  const time=new Intl.DateTimeFormat(locale,{hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const sameDay=end&&start.toDateString()===end.toDateString();
  return `${day.format(start)} · ${time.format(start)}${end?` – ${sameDay?'':day.format(end)+' · '}${time.format(end)}`:''}`;
}
export function renderServerEventCard(event,{text=(en)=>en,channels=[],interested=false,manage=false,busy=false,compact=false}={}) {
  const locale=text('en-GB','pt-PT'),date=new Date(event.starts_at);
  const count=Number(event.altara_server_event_interests_v1?.[0]?.count||0);
  const started=date.getTime()<=Date.now();
  const status=started?(event.ends_at?(new Date(event.ends_at)>new Date()?text('In progress','A decorrer'):text('Ended','Terminado')):text('Started','Já começou')):'';
  const channel=channels.find(row=>row.id===event.channel_id);
  const location=event.channel_id ? channel
    ? `<button type="button" class="eventPlace" data-home-action="event-channel" data-id="${esc(channel.id)}" title="${text('Open channel','Abrir canal')}">${channel.type==='voice'?icon('voice'):'<span aria-hidden="true">#</span>'}<span>${esc(channel.name)}</span>${icon('arrow')}</button>`
    : `<span class="eventPlace is-restricted" title="${text('You can see this event, but you do not have access to its channel.','Podes ver este evento, mas não tens acesso ao canal.')}" aria-label="${text('Restricted channel. You do not have access to this channel.','Canal restrito. Não tens acesso a este canal.')}">${icon('lock')}${text('Restricted channel','Canal restrito')}</span>`
    : event.location ? `<span class="eventPlace">${icon('pin')}<span>${esc(event.location)}</span></span>`:'';
  return `<article data-event-id="${esc(event.id)}" class="eventSummary${compact?' is-compact':''}"><div class="eventSummaryHeading"><div class="eventDay" aria-hidden="true"><span>${esc(new Intl.DateTimeFormat(locale,{month:'short'}).format(date))}</span><b>${date.getDate()}</b></div><div class="eventSummaryTitle"><h3>${esc(event.title)}</h3><time datetime="${esc(event.starts_at)}">${esc(eventScheduleLabel(event,locale))}${status?` · ${status}`:''}</time></div></div>${event.description?`<p class="eventSummaryDescription">${esc(event.description)}</p>`:''}${location?`<div class="eventSummaryLocation">${location}</div>`:''}${renderEventMaps(event,text)}${renderEventAttendees(event,text)}<div class="eventSummaryActions">${renderEventResponses(event,{text,busy,started})}${renderEventCalendarMenu(event,text,interested)}${manage?`<button type="button" class="eventEdit" data-home-action="edit" data-id="${esc(event.id)}" ${busy?'disabled':''}>${text('Edit event','Editar evento')}</button>`:''}</div></article>`;
}

// Preserve card and button nodes for interest/count changes (focus and scroll included).
export function syncServerEventCards(container, markup) {
  const template=container.ownerDocument.createElement('template');
  template.innerHTML=markup;
  const next=[...template.content.children];
  const existing=new Map([...container.children].filter(el=>el.dataset.eventId).map(el=>[el.dataset.eventId,el]));
  const retained=new Set();
  next.forEach((candidate,index)=>{
    let node=existing.get(candidate.dataset.eventId);
    if(node){
      for(const selector of ['.eventRsvp','.eventAttendees']){
        const oldPart=node.querySelector(selector),newPart=candidate.querySelector(selector);
        if(oldPart&&newPart){
          if(selector==='.eventRsvp'){
            for(const oldButton of oldPart.querySelectorAll('button')){
              const newButton=newPart.querySelector('[data-response="'+oldButton.dataset.response+'"]');
              if(newButton){if(oldButton.innerHTML!==newButton.innerHTML)oldButton.innerHTML=newButton.innerHTML;oldButton.setAttribute('aria-pressed',newButton.getAttribute('aria-pressed'));oldButton.disabled=newButton.disabled;}
            }
          }else if(oldPart.innerHTML!==newPart.innerHTML)oldPart.innerHTML=newPart.innerHTML;
          oldPart.setAttribute('aria-label',newPart.getAttribute('aria-label'));
        }
      }
      const oldEdit=node.querySelector('.eventEdit'),newEdit=candidate.querySelector('.eventEdit');
      if(oldEdit&&newEdit)oldEdit.disabled=newEdit.disabled;
      const oldCalendarHint=node.querySelector('.eventCalendarChoices small'),newCalendarHint=candidate.querySelector('.eventCalendarChoices small');
      if(oldCalendarHint&&newCalendarHint&&oldCalendarHint.textContent!==newCalendarHint.textContent)oldCalendarHint.textContent=newCalendarHint.textContent;
      for(const oldDetails of node.querySelectorAll('details')){const newDetails=candidate.querySelector('details.'+oldDetails.classList[0]);if(newDetails)newDetails.open=oldDetails.open;}
      if(node.outerHTML!==candidate.outerHTML){node.replaceWith(candidate);node=candidate;}
    }else node=candidate;
    if(container.children[index]!==node)container.insertBefore(node,container.children[index]||null);
    retained.add(node);
  });
  [...container.children].forEach(node=>{if(!retained.has(node))node.remove();});
}
