import { renderPlaceSearch } from './serverEventPlaces.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function localEventDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function localParts(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return {date:'',time:''};
  return {date:localEventDate(date),time:`${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`};
}
export function createEventDraft(event = {}, now = Date.now()) {
  const next = new Date(now + 60*60*1000); next.setMinutes(0,0,0);
  const start = localParts(event.starts_at || next);
  const end = localParts(event.ends_at);
  return {...event, title:event.title || '', description:event.description || '', location:event.location || '', channel_id:event.channel_id || '',
    venue_address:event.venue_address || '', maps_url:event.maps_url || '', original_starts_at:event.starts_at || '',
    location_kind:event.channel_id?'channel':event.venue_address?'physical':event.location?'other':'channel',
    start_date:start.date,start_time:start.time,end_date:end.date,end_time:end.time,has_end:!!event.ends_at};
}
export function eventFromDraft(draft) {
  return {...draft, starts_at:`${draft.start_date}T${draft.start_time}`, ends_at:draft.has_end?`${draft.end_date}T${draft.end_time}`:null,
    channel_id:draft.location_kind==='channel'?(draft.channel_id || null):null,
    location:draft.location_kind!=='channel'?String(draft.location || ''):'',
    venue_address:draft.location_kind==='physical'?String(draft.venue_address||'').trim():'',
    maps_url:draft.location_kind==='physical'?String(draft.maps_url||'').trim():''};
}
export function eventCalendarDays(month) {
  const [year,m] = month.split('-').map(Number);
  const first = new Date(year,m-1,1,12);
  const offset = (first.getDay()+6)%7;
  const count = new Date(year,m,0).getDate();
  return Array.from({length:Math.ceil((offset+count)/7)*7},(_,i)=>{
    const day=i-offset+1; return day<1||day>count?null:localEventDate(new Date(year,m-1,day,12));
  });
}
export function renderServerEventEditor({draft:d,channels,text,picker='',month='',busy=false,error=''}) {
  const locale = text('en-GB','pt-PT');
  const today = localEventDate(new Date());
  const action = (name,label,extra='') => `<button type="button" data-home-action="${name}" ${extra}>${label}</button>`;
  const dateLabel = value => value ? new Intl.DateTimeFormat(locale,{day:'numeric',month:'short',year:'numeric'}).format(new Date(`${value}T12:00`)) : text('Choose a day','Escolher dia');
  const calendar = key => {
    if(picker!==key)return '';
    const currentMonth=month || d[`${key}_date`].slice(0,7) || today.slice(0,7);
    const weekdays=Array.from({length:7},(_,i)=>new Intl.DateTimeFormat(locale,{weekday:'short'}).format(new Date(2026,0,5+i)).slice(0,3));
    return `<div class="eventCalendar" role="group" aria-label="${text('Choose a day','Escolher dia')}"><div class="eventCalendarHead">${action('calendar-prev','‹',`aria-label="${text('Previous month','Mês anterior')}" ${currentMonth<=today.slice(0,7)?'disabled':''}`)}<strong aria-live="polite">${esc(new Intl.DateTimeFormat(locale,{month:'long',year:'numeric'}).format(new Date(`${currentMonth}-01T12:00`)))}</strong>${action('calendar-next','›',`aria-label="${text('Next month','Mês seguinte')}"`)}</div><div class="eventCalendarGrid">${weekdays.map(day=>`<span>${esc(day)}</span>`).join('')}${eventCalendarDays(currentMonth).map(day=>day?action('calendar-day',String(Number(day.slice(-2))),`data-id="${day}" aria-label="${esc(dateLabel(day))}" aria-pressed="${day===d[`${key}_date`]}" ${day<today?'disabled':''} ${day===today?'aria-current="date"':''}`):'<span></span>').join('')}</div><div class="eventCalendarQuick">${action('calendar-day',text('Today','Hoje'),`data-id="${today}"`)}${action('calendar-day',text('Tomorrow','Amanhã'),`data-id="${localEventDate(new Date(new Date().setDate(new Date().getDate()+1)))}"`)}${action('calendar-close',text('Done','Fechar'))}</div></div>`;
  };
  const when = (key,label) => `<div class="eventDateGroup"><span class="eventFieldLabel">${label}</span><div class="eventDateControls">${action('calendar-open',`<span aria-hidden="true">▦</span> ${esc(dateLabel(d[`${key}_date`]))}`,`data-id="${key}" class="eventDateButton" aria-label="${text('Choose','Escolher')} ${label.toLowerCase()}" aria-expanded="${picker===key}"`)}<label class="eventTime"><span class="sr-only">${label} ${text('time','hora')}</span><input name="${key}_time" value="${esc(d[`${key}_time`])}" inputmode="numeric" placeholder="20:00" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" maxlength="5" required aria-label="${label} ${text('time','hora')}" title="HH:mm · 24h"></label></div>${calendar(key)}</div>`;
  const channelLabel=c=>`${c.type==='voice'?'◖◗':'#'} ${c.name}`;
  return `<form class="serverHomeForm eventEditor"><fieldset ${busy?'disabled':''}><div class="eventEditorIntro"><span class="eventEditorIcon" aria-hidden="true">▦</span><div><h2>${d.id?text('Edit event','Editar evento'):text('Bring everyone together','Junta toda a gente')}</h2><p>${text('A time, a place, and something to look forward to.','Uma hora, um lugar e algo para partilhar.')}</p></div></div>
  <label>${text('Event name','Nome do evento')}<input name="title" required maxlength="100" placeholder="${text('e.g. Movie night','Ex.: Noite de cinema')}" value="${esc(d.title)}"></label>
  <label>${text('Description','Descrição')} <span class="eventOptional">${text('optional','opcional')}</span><textarea name="description" maxlength="2000" rows="2" placeholder="${text('What’s the plan?','Qual é o plano?')}">${esc(d.description)}</textarea></label>
  <div class="eventSchedule"><div class="eventScheduleHeading"><span>${text('When','Quando')}</span><small>24h · ${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}</small></div>${when('start',text('Starts','Início'))}${d.has_end?`<div class="eventEndRow">${when('end',text('Ends','Fim'))}${action('end-remove','×',`class="eventRemoveEnd" aria-label="${text('Remove end time','Remover fim')}"`)}</div>`:action('end-add',text('+ Add end time','+ Adicionar fim'), 'class="eventAddEnd"')}</div>
  <div class="eventLocation"><span class="eventFieldLabel">${text('Where','Onde')}</span><div class="eventLocationTabs" role="group" aria-label="${text('Event location','Local do evento')}">${action('location-channel',text('Server channel','Canal do servidor'),`aria-pressed="${d.location_kind==='channel'}"`)}${action('location-physical',text('In person','Presencial'),`aria-pressed="${d.location_kind==='physical'}"`)}${action('location-other',text('External link','Link externo'),`aria-pressed="${d.location_kind==='other'}"`)}</div>${d.location_kind==='channel'?`<select name="channel_id" aria-label="${text('Server channel','Canal do servidor')}" required><option value="">${text('Choose a channel…','Escolher canal…')}</option>${d.channel_id&&!channels.some(c=>c.id===d.channel_id)?`<option value="${esc(d.channel_id)}" selected disabled>${text('Channel unavailable — choose another','Canal indisponível — escolhe outro')}</option>`:''}${['text','voice'].map(type=>`<optgroup label="${type==='voice'?text('Voice channels','Canais de voz'):text('Text channels','Canais de texto')}">${channels.filter(c=>(c.type||'text')===type).map(c=>`<option value="${esc(c.id)}" ${c.id===d.channel_id?'selected':''}>${esc(channelLabel(c))}</option>`).join('')}</optgroup>`).join('')}</select><small>${text('Visible to server members. Channel access follows its permissions.','Visível aos membros do servidor. O acesso ao canal respeita as suas permissões.')}</small>`:`<input name="location" maxlength="200" placeholder="${d.location_kind==='physical'?text('Venue name (optional)','Nome do local (opcional)'):text('A place or meeting link','Um local ou link de encontro')}" aria-label="${text('Location or meeting point','Local ou ponto de encontro')}" value="${esc(d.location)}">`}${d.location_kind==='physical'?`${renderPlaceSearch(d,text)}<label>${text('Full address','Morada completa')}<input name="venue_address" required maxlength="500" placeholder="${text('Street, number, city and country','Rua, número, cidade e país')}" value="${esc(d.venue_address)}"></label><small>${text('Members can open the address in Google Maps, Apple Maps or Waze.','Os membros podem abrir a morada no Google Maps, Apple Maps ou Waze.')}</small>`:''}</div>
  ${error?`<p class="serverHomeError" role="alert">${esc(error)}</p>`:''}<div class="serverHomeFormActions">${d.id?action('delete',text('Cancel event','Cancelar evento'),'class="btn ghost eventCancel"'):''}${action('cancel-edit',text('Back','Voltar'),'class="btn ghost"')}<button class="btn primary" type="submit">${busy?text('Saving…','A guardar…'):d.id?text('Save changes','Guardar alterações'):text('Create event','Criar evento')}</button></div></fieldset></form>`;
}
