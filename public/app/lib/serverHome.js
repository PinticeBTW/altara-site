import { openEventAttendees, hydrateEventResponders } from './serverEventResponses.js';
import { searchEventPlaces, placeMapUrl } from './serverEventPlaces.js';
import { downloadEventCalendar } from './serverEventCalendar.js';
import { subscribeServerEvents } from './serverEventsRealtime.js';
import { safeGoogleMapsUrl } from './serverEventMaps.js';
import { renderServerEventCard, syncServerEventCards } from './serverEventCard.js';
import { createEventDraft, eventFromDraft, localEventDate, renderServerEventEditor } from './serverEventEditor.js';
import { readAltaraLocalePreference } from './locale.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const SERVER_WIDGETS = ['notes', 'checklist', 'polls'];
export function normalizeServerWidgets(value) {
  const order = Array.isArray(value?.order) ? [...new Set(value.order.filter(x => SERVER_WIDGETS.includes(x)))] : [...SERVER_WIDGETS];
  return { order, notes: String(value?.notes || '').slice(0,4000),
    checklist: (Array.isArray(value?.checklist) ? value.checklist : []).slice(0,100).map((row,index)=>({id:String(row.id||index),text:String(row.text||'').slice(0,200),done:row.done===true})),
    wide: (Array.isArray(value?.wide)?value.wide:[]).filter(id=>SERVER_WIDGETS.includes(id)) };

}
export function validateServerEvent(value, now = Date.now()) {
  const title = String(value.title || '').trim();
  const description = String(value.description || '').trim();
  const location = String(value.location || '').trim();
  const start = new Date(value.starts_at).getTime();
  const end = value.ends_at ? new Date(value.ends_at).getTime() : null;
  if (!title || title.length > 100 || description.length > 2000 || location.length > 200) return 'text';
  if ((value.location_kind==='physical'&&!String(value.venue_address||'').trim()) || String(value.venue_address||'').length>500 || String(value.maps_url||'').length>2000 || (value.maps_url&&!safeGoogleMapsUrl(value.maps_url))) return 'place';
  const unchangedStart=value.id && Math.abs(start-new Date(value.original_starts_at).getTime())<60000;
  if (!Number.isFinite(start) || (start <= now && !unchangedStart) || (end !== null && (!Number.isFinite(end) || end <= start))) return 'date';
  return null;
}
export function createServerHome({ client, context, channels, openChannel, eventChannels = channels, openEventChannel = openChannel, onEventsChanged = () => {}, connectCalendar = () => {}, mountLayout, releaseLayout = () => {} }) {
  let host, current, view = 'widgets', events = [], interested = new Set(), widgets, loading = false, error = '', busy = false, editing, generation = 0, returnFocus, editLayout=false, addOpen=false, eventError='', drag=null, picker='', pickerMonth='', refreshTimer=null, refreshFingerprint='';
  let placeRequest=null,attendeesDialog=null;
  let stopRealtime=()=>{}, refreshDebounce=null, refreshDirty=false, pendingInterests=new Set();
  const pt = () => readAltaraLocalePreference().startsWith('pt');
  const text = (en, por) => pt() ? por : en;
  const key = () => `altara.server-home.v1:${current.userId}:${current.id}`;
  const label = id => ({ events: text('Upcoming events','Próximos eventos'), channels: text('Channel shortcuts','Atalhos para canais'), notes: text('My notes','As minhas notas'), checklist: text('Checklist','Checklist') })[id];
  const button = (action, caption, extra = '') => `<button type="button" class="btn ghost" data-home-action="${action}" ${extra}>${caption}</button>`;
  function saveWidgets() { try { localStorage.setItem(key(), JSON.stringify(widgets)); } catch { error = text('Could not save your widgets on this device.','Não foi possível guardar os widgets neste dispositivo.'); } }
  function syncNavigation(active = '') {
    document.querySelectorAll('[data-server-home]').forEach(button => {
      if (active && button.dataset.serverId === current?.id && button.dataset.serverHome === active) button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    });
  }
  function close() { attendeesDialog?.close();attendeesDialog=null; placeRequest?.abort();placeRequest=null;stopRealtime();stopRealtime=()=>{};clearTimeout(refreshDebounce);refreshDirty=false;document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('online',requestRefresh);syncNavigation(); clearInterval(refreshTimer); refreshTimer=null; generation++; releaseLayout(); host?.remove(); host = null; document.getElementById('dmMain')?.classList.remove('serverHomeOpen'); returnFocus?.focus?.(); }
  function date(value) { return new Intl.DateTimeFormat(pt() ? 'pt-PT' : 'en', { dateStyle:'medium', timeStyle:'short' }).format(new Date(value)); }
  function eventCards(list, compact=false) {
    if (loading) return `<p class="serverHomeMuted" role="status">${text('Loading events…','A carregar eventos…')}</p>`;
    if (eventError) return `<div class="serverHomeEmpty" role="status"><span aria-hidden="true">▦</span><p>${escape(eventError)}</p>${button('refresh',text('Try again','Tentar novamente'))}</div>`;
    if (!list.length) return `<div class="serverHomeEmpty"><span aria-hidden="true">▦</span><h3>${text('No upcoming events','Sem eventos marcados')}</h3><p>${text('New server events will appear here automatically.','Os novos eventos do servidor aparecem aqui automaticamente.')}</p></div>`;
    return list.map(event => renderServerEventCard(event,{text,channels:eventChannels(current.id),interested:interested.has(event.id),manage:current.manage,busy:busy||pendingInterests.has(event.id),compact})).join('');
  }

  function widgetBody(id) {
    if (id === 'checklist') return `<div class="serverHomeChecklist"><p class="serverHomeMuted">${widgets.checklist.filter(row=>row.done).length}/${widgets.checklist.length} ${text('complete','concluídas')}</p>${widgets.checklist.map(row=>`<div class="serverHomeTask"><label><input type="checkbox" data-task-toggle="${escape(row.id)}" ${row.done?'checked':''}><span class="${row.done?'is-done':''}">${escape(row.text)}</span></label>${button('delete-task','×',`data-id="${escape(row.id)}" aria-label="${text('Delete task','Apagar tarefa')}"`)}</div>`).join('')}<form data-task-form><input name="task" maxlength="200" required placeholder="${text('Add a task…','Adicionar tarefa…')}" aria-label="${text('New task','Nova tarefa')}"><button type="submit" class="btn ghost" ${widgets.checklist.length>=100?'disabled':''}>+</button></form></div>`;
    if (id === 'notes') return `<p class="serverHomeMuted">${text('Private to you, saved on this device.','Só tu vês estas notas, guardadas neste dispositivo.')}</p><textarea data-home-notes maxlength="4000" placeholder="${text('Remember something for this server…','Aponta algo para este servidor…')}">${escape(widgets.notes)}</textarea><small data-note-status aria-live="polite"></small>`;
    const rows = channels(current.id);
    return rows.length ? `<div class="serverHomeChannels">${rows.map(row=>button('channel',`<span aria-hidden="true">#</span> ${escape(row.name)}`,`data-id="${escape(row.id)}"`)).join('')}</div>` : `<p class="serverHomeMuted">${text('No accessible text channels.','Não há canais de texto acessíveis.')}</p>`;
  }
  function form() {
    return renderServerEventEditor({draft:editing, channels:eventChannels(current.id), text, picker, month:pickerMonth, busy:busy||loading, error});
  }
  function render() {
    if (!host) return;
    syncNavigation(editing ? 'events' : view);
    releaseLayout();
    host.classList.toggle('is-editing',editLayout);
    host.innerHTML = `<header class="serverHomeHeader"><div><small>${escape(current.name)}</small><h1>${editing?text('Event','Evento'):view==='events'?text('Events','Eventos'):text('Widgets','Widgets')}</h1></div><div class="serverHomeToolbar">${view==='events'&&!editing&&current.manage?'<button type="button" class="btn primary serverEventCreate" data-home-action="create">'+text('+ Create event','+ Criar evento')+'</button>':''}</div></header>
    ${error&&!editing?`<p class="serverHomeError" role="alert">${escape(error)}</p>`:''}
    <div class="serverHomeContent">${editing ? form() : view==='events'?`<div class="serverEventsFeed">${eventCards(events)}</div>`:`
      <div data-server-native-widgets></div>`}</div>`;
    if (!editing && view==='widgets' && mountLayout) mountLayout({
      container:host.querySelector('[data-server-native-widgets]'), toolbar:host.querySelector('.serverHomeToolbar'),
      current, saved:widgets, body:widgetBody,
    });
  }
  function patchEvents() {
    if(!host||editing)return;
    const feed=host.querySelector('.serverEventsFeed');
    if(feed)syncServerEventCards(feed,eventCards(events));
    const main=host.querySelector('.serverEventsWidgetMain');
    if(main)syncServerEventCards(main,eventCards(events.filter(row=>new Date(row.ends_at||row.starts_at).getTime()>Date.now()).slice(0,1),true));
    const all=host.querySelector('.serverEventsWidgetFooter [data-home-action="events"]');
    if(all)all.textContent=text('All events','Todos os eventos')+(events.length?' · '+events.length:'');
  }
  function onVisible(){if(!document.hidden)requestRefresh();}
  function requestRefresh(){
    refreshDirty=true;clearTimeout(refreshDebounce);
    refreshDebounce=setTimeout(()=>{
      if(!host||document.hidden||editing||busy||loading||pendingInterests.size)return;
      refreshDirty=false;void load(true);
    },150);
  }
  async function load(quiet=false) {
    if(quiet&&(editing||busy||loading||pendingInterests.size)){refreshDirty=true;return;}
    const token=++generation;loading=true;if(!quiet){eventError='';render();}
    const result=await client.from('altara_server_events_v1').select('*').eq('server_id',current.id).or('starts_at.gte.'+new Date(new Date().setHours(0,0,0,0)).toISOString()+',ends_at.gte.'+new Date().toISOString()).order('starts_at').limit(100).then(value=>value,()=>({error:true}));
    let summaries={data:[]};
    if(!result.error&&result.data?.length)summaries=await Promise.resolve(client.rpc('altara_event_response_summaries_v1',{p_event_ids:result.data.map(e=>e.id)})).catch(()=>({error:true}));
    if(!summaries.error){
      try{
        const people=await hydrateEventResponders(client,(summaries.data||[]).flatMap(row=>row.preview||[]));
        const profiles=new Map(people.map(person=>[person.user_id,person]));
        for(const row of summaries.data||[])row.preview=(row.preview||[]).map(person=>({...person,display_name:profiles.get(person.user_id)?.display_name,username:profiles.get(person.user_id)?.username,avatar_url:profiles.get(person.user_id)?.avatar_url}));
      }catch{summaries.error=true;}
    }
    if(token!==generation||!host)return;
    loading=false;
    if(result.error||summaries.error){
      if(quiet)return;
      eventError=text('Events are temporarily unavailable. Reconnecting automatically…','Os eventos estão temporariamente indisponíveis. A restabelecer a ligação…');
    }else{eventError='';events=(result.data||[]).map(e=>({...e,rsvp:summaries.data?.find(r=>r.event_id===e.id)||{going:0,not_going:0,own:null,preview:[]}}));attendeesDialog?.refresh();interested=new Set(events.filter(row=>row.rsvp.own==='going').map(row=>row.id));}
    if(quiet)patchEvents();else render();
    if(refreshDirty)requestRefresh();
  }
  async function setResponse(id,response) {
    const row=events.find(row=>row.id===id);if(!row||pendingInterests.has(id)||!['going','not_going'].includes(response)||row.rsvp.own===response||new Date(row.starts_at).getTime()<=Date.now())return;
    const mount=host,previous=structuredClone(row.rsvp),next=response;
    generation++;loading=false;pendingInterests.add(id);
    if(previous.own)row.rsvp[previous.own]=Math.max(0,row.rsvp[previous.own]-1);
    if(next)row.rsvp[next]++;row.rsvp.own=next;
    row.rsvp.preview=(row.rsvp.preview||[]).filter(p=>p.user_id!==current.userId);
    if(next)row.rsvp.preview.unshift({user_id:current.userId,response:next,...current.profile});
    if(next==='going')interested.add(id);else interested.delete(id);
    host.querySelector('[data-interest-error]')?.remove();patchEvents();
    try{
      const query=client.from('altara_server_event_interests_v1');
      const result=await (previous.own?query.update({response:next}).eq('event_id',id).eq('user_id',current.userId):query.insert({event_id:id,server_id:current.id,user_id:current.userId,response:next}));
      if(result.error)throw result.error;if(host!==mount)return;onEventsChanged();
    }catch{
      if(host!==mount)return;row.rsvp=previous;if(previous.own==='going')interested.add(id);else interested.delete(id);
      const notice=document.createElement('p');notice.className='serverHomeError';notice.dataset.interestError='';notice.setAttribute('role','alert');notice.textContent=text('Could not save your response. Please try again.','Não foi possível guardar a resposta. Tenta novamente.');host.querySelector('.serverHomeContent')?.prepend(notice);
    }finally{if(host===mount){pendingInterests.delete(id);patchEvents();requestRefresh();}}
  }
  async function mutate(operation) {
    if(busy)return; const token=++generation, mount=host; loading=false;busy=true;error='';render();
    try {const result=await operation();if(result.error)throw result.error;if(token!==generation||!host)return;editing=null;onEventsChanged();await load();}
    catch {if(token===generation&&host){error=text('Could not save. Check your connection and server permissions, then try again.','Não foi possível guardar. Verifica a ligação e as permissões e tenta novamente.');}}
    finally {if(host===mount){busy=false;render();}}
  }
  async function click(event) {
    const btn=event.target.closest('[data-home-action]');if(!btn)return;
    const action=btn.dataset.homeAction,id=btn.dataset.id;
    if(action==='close'){close();return;}
    if(action==='calendar-connect'){connectCalendar();return;}
    if(action==='calendar-download'){const row=events.find(row=>row.id===id);if(row)downloadEventCalendar(row);return;}
    if(editing&&action==='place-search'){
      if(editing.place_searching)return;
      const draft=editing,mount=host;placeRequest?.abort();placeRequest=new AbortController();
      draft.place_query=String(draft.place_query||draft.venue_address||draft.location||'').trim();
      if(draft.place_query.length<3){draft.place_message=text('Enter a place and city.','Escreve um local e a cidade.');render();return;}
      draft.place_searching=true;draft.place_message='';draft.place_results=[];render();
      const request=placeRequest,timeout=setTimeout(()=>request.abort(),12000);
      try{const rows=await searchEventPlaces(draft.place_query,{signal:placeRequest.signal});if(editing!==draft||host!==mount)return;draft.place_results=rows;draft.place_message=rows.length?text('Choose your meeting point','Escolhe o ponto de encontro'):text('No places found. Try adding a city, or enter the address below.','Sem resultados. Acrescenta a cidade ou escreve a morada abaixo.');}
      catch(e){if(editing===draft&&host===mount)draft.place_message=text('Search unavailable. Try again, or enter the address below.','Pesquisa indisponível. Tenta novamente ou escreve a morada abaixo.');}
      finally{clearTimeout(timeout);draft.place_searching=false;if(editing===draft&&host===mount)render();}return;
    }
    if(editing&&action==='place-select'){
      const place=editing.place_results?.[Number(id)];if(!place)return;
      editing.location=place.name;editing.venue_address=place.address;editing.maps_url=placeMapUrl(place);editing.place_results=[];editing.place_message='';render();return;
    }
    if(busy)return;
    if(action==='widgets'||action==='events'){view=action;editing=null;error='';await load();return;}
    if(action==='refresh'){await load();return;}
    if(action==='channel'){close();openChannel(id);return;}
    if(action==='event-channel'){
      if(!eventChannels(current.id).some(row=>row.id===id)){error=text('This channel is no longer available.','Este canal já não está disponível.');render();return;}
      close();openEventChannel(id);return;
    }
    if(editing && (action.startsWith('calendar-')||action.startsWith('location-')||action.startsWith('end-'))){
      if(action==='calendar-open'){picker=picker===id?'':id;pickerMonth=editing[id+'_date'].slice(0,7)||localEventDate(new Date()).slice(0,7);}
      if(action==='calendar-close'){picker='';}
      if(action==='calendar-prev'||action==='calendar-next'){const d=new Date(pickerMonth+'-01T12:00');d.setMonth(d.getMonth()+(action==='calendar-next'?1:-1));pickerMonth=localEventDate(d).slice(0,7);}
      if(action==='calendar-day' && picker){editing[picker+'_date']=id;picker='';error='';}
      if(['location-channel','location-other','location-physical'].includes(action)){editing.location_kind=action.slice('location-'.length);}
      if(action==='end-add'){editing.has_end=true;const d=new Date(editing.start_date+'T'+editing.start_time);d.setHours(d.getHours()+1);const value=createEventDraft({starts_at:d});editing.end_date=value.start_date;editing.end_time=value.start_time;}
      if(action==='end-remove'){editing.has_end=false;if(picker==='end')picker='';}
      render();
      if(action==='calendar-open')(host.querySelector('.eventCalendar [aria-pressed="true"]:not(:disabled)')||host.querySelector('.eventCalendarGrid button:not(:disabled)'))?.focus();
      if(action==='calendar-day'||action==='calendar-close')host.querySelector('[data-home-action="calendar-open"][data-id="'+(btn.closest('.eventDateGroup')?.querySelector('[data-id]')?.dataset.id||'start')+'"]')?.focus();
      return;
    }
    if(action==='edit-layout'){editLayout=!editLayout;addOpen=false;render();return;}
    if(action==='add-picker'){addOpen=!addOpen;render();return;}
    if(action==='add-widget'&&SERVER_WIDGETS.includes(id)){if(!widgets.order.includes(id))widgets.order.push(id);addOpen=false;saveWidgets();render();return;}
    if(action==='remove-widget'){widgets.order=widgets.order.filter(x=>x!==id);saveWidgets();render();return;}
    if(action==='size'){widgets.wide=widgets.wide.includes(id)?widgets.wide.filter(x=>x!==id):[...widgets.wide,id];saveWidgets();render();return;}
    if(action==='delete-task'){widgets.checklist=widgets.checklist.filter(row=>row.id!==id);saveWidgets();render();return;}
    if(action==='up'||action==='down'){const i=widgets.order.indexOf(id),j=i+(action==='up'?-1:1);if(i>0&&j>0&&j<widgets.order.length){[widgets.order[i],widgets.order[j]]=[widgets.order[j],widgets.order[i]];saveWidgets();render();}return;}
    if(action==='response'){await setResponse(id,btn.dataset.response);return;}
    if(action==='attendees'){const row=events.find(e=>e.id===id);if(row)attendeesDialog=openEventAttendees(client,row,text);return;}
    if(!current.manage)return;
    if(action==='create'||action==='edit'){generation++;loading=false;error='';picker='';editing=createEventDraft(action==='edit'?events.find(row=>row.id===id):{});render();host.querySelector('input[name="title"]')?.focus();}
    if(action==='cancel-edit'){editing=null;view='events';error='';render();requestRefresh();}
    if(action==='delete'&&editing?.id){if(!window.confirm(text('Cancel this event for everyone?','Cancelar este evento para todos?')))return;await mutate(()=>client.from('altara_server_events_v1').delete().eq('id',editing.id).eq('server_id',current.id).select('id').single());}
  }
  async function open(id, nextView='widgets') {
    close(); current=context(id);if(!current?.userId)return;view=nextView==='widgets'?'widgets':'events';editLayout=false;addOpen=false;eventError='';events=[];interested=new Set();picker='';editing=nextView==='create'&&current.manage?createEventDraft():null;busy=false;error='';pendingInterests=new Set();
    try {widgets=normalizeServerWidgets(JSON.parse(localStorage.getItem(key())||'null'));}catch{widgets=normalizeServerWidgets();}
    const parent=document.getElementById('dmMain');if(!parent)return;
    returnFocus=document.activeElement;host=document.createElement('section');host.className='serverHome';host.setAttribute('aria-label',text('Server homepage','Homepage do servidor'));parent.appendChild(host);parent.classList.add('serverHomeOpen');
    host.addEventListener('click',event=>{void click(event);});
    host.addEventListener('change',event=>{if(editing&&event.target.closest('.serverHomeForm')&&event.target.name){editing[event.target.name]=event.target.value;if(event.target.name==='venue_address')editing.maps_url='';return;}if(event.target.matches('[data-task-toggle]')){const row=widgets.checklist.find(row=>row.id===event.target.dataset.taskToggle);if(row){row.done=event.target.checked;saveWidgets();render();}return;}const id=event.target.dataset.widget;if(!SERVER_WIDGETS.includes(id))return;widgets.order=event.target.checked?[...widgets.order.filter(x=>x!==id),id]:widgets.order.filter(x=>x!==id);saveWidgets();render();});
    host.addEventListener('input',event=>{if(editing&&event.target.closest('.serverHomeForm')&&event.target.name){editing[event.target.name]=event.target.value;if(event.target.name==='venue_address'){editing.maps_url='';host.querySelector('.eventPlaceMap')?.remove();}return;}if(!event.target.matches('[data-home-notes]'))return;widgets.notes=event.target.value;saveWidgets();host.querySelector('[data-note-status]').textContent=text('Saved on this device','Guardado neste dispositivo');});
    host.addEventListener('submit',event=>{event.preventDefault();if(event.target.matches('[data-task-form]')){const input=event.target.elements.task;const value=input.value.trim();if(value&&widgets.checklist.length<100){widgets.checklist.push({id:crypto.randomUUID(),text:value.slice(0,200),done:false});saveWidgets();render();host.querySelector('[name=task]')?.focus();}return;}if(!event.target.matches('.serverHomeForm')||!current.manage||busy||loading)return;const data=eventFromDraft(editing);const issue=validateServerEvent(data);
    if(data.channel_id&&!eventChannels(current.id).some(row=>row.id===data.channel_id)){error=text('Choose an available channel.','Escolhe um canal disponível.');render();return;}if(issue){error=issue==='place'?text('Enter a full address and a valid Google Maps link (or leave the link empty).','Introduz uma morada completa e um link válido do Google Maps (ou deixa o link vazio).'):issue==='date'?(new Date(data.starts_at).getTime()<=Date.now()?text('The start time has already passed. Choose a later time.','A hora de início já passou. Escolhe uma hora mais tarde.'):text('Check the times: use 24h format and an end after the start.','Verifica as horas: usa o formato de 24h e um fim posterior ao início.')):text('Check the event name and text lengths.','Verifica o nome e o tamanho dos textos.');render();return;}const row={venue_address:data.venue_address,maps_url:data.maps_url,title:data.title.trim(),description:data.description.trim(),location:data.location.trim(),channel_id:data.channel_id,starts_at:new Date(data.starts_at).toISOString(),ends_at:data.ends_at?new Date(data.ends_at).toISOString():null};void mutate(()=>editing?.id?client.from('altara_server_events_v1').update(row).eq('id',editing.id).eq('server_id',current.id).select('id').single():client.from('altara_server_events_v1').insert({...row,server_id:current.id,created_by:current.userId}).select('id').single());});
    host.addEventListener('pointerdown',event=>{
      const handle=event.target.closest('[data-drag-handle]');if(!handle||!editLayout||event.button!==0)return;
      drag={id:handle.dataset.id,target:handle.dataset.id,pointerId:event.pointerId};handle.setPointerCapture(event.pointerId);event.preventDefault();handle.closest('[data-home-widget]').classList.add('is-dragging');
    });
    host.addEventListener('pointermove',event=>{
      if(!drag)return;const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-home-widget]');
      if(target&&host.contains(target)){drag.target=target.dataset.homeWidget;host.querySelectorAll('.is-drop-target').forEach(el=>el.classList.remove('is-drop-target'));target.classList.add('is-drop-target');}
      const rect=host.getBoundingClientRect();if(event.clientY>rect.bottom-50)host.scrollTop+=12;else if(event.clientY<rect.top+50)host.scrollTop-=12;
    });
    const finish=commit=>{if(!drag)return;const {id,target}=drag;drag=null;if(commit&&id!==target){const order=widgets.order.filter(x=>x!==id);order.splice(widgets.order.indexOf(target),0,id);widgets.order=order;saveWidgets();}render();};
    host.addEventListener('pointerup',()=>finish(true));host.addEventListener('pointercancel',()=>finish(false));
    host.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.name==='place_query'){event.preventDefault();host.querySelector('[data-home-action=place-search]')?.click();return;}if(event.key==='Escape'&&picker){event.preventDefault();const key=picker;picker='';render();host.querySelector('[data-home-action="calendar-open"][data-id="'+key+'"]')?.focus();return;}const handle=event.target.closest('[data-drag-handle]');if(!handle)return;if(event.key==='Escape'){finish(false);return;}const offset={ArrowLeft:-1,ArrowUp:-1,ArrowRight:1,ArrowDown:1}[event.key];if(!offset)return;event.preventDefault();const i=widgets.order.indexOf(handle.dataset.id),j=i+offset;if(j>=0&&j<widgets.order.length){[widgets.order[i],widgets.order[j]]=[widgets.order[j],widgets.order[i]];saveWidgets();render();host.querySelector(`[data-drag-handle][data-id="${handle.dataset.id}"]`)?.focus();}});
    const openedHost=host;
    stopRealtime=subscribeServerEvents(client,current.id,requestRefresh,id=>events.some(row=>row.id===id),(status,error)=>{if(host===openedHost){host.dataset.eventsConnection=status;if(error||status==='SUBSCRIBED')host.dataset.eventsConnectionError=error;}});
    document.addEventListener('visibilitychange',onVisible);window.addEventListener('online',requestRefresh);
    await load();
    if(host!==openedHost)return;
    refreshTimer=setInterval(requestRefresh,30000);
    if(editing)host?.querySelector('input[name="title"]')?.focus();
  }
  return {open,close,getView:id => host && current?.id === id ? (editing ? 'events' : view) : ''};
}
