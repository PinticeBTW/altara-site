const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const utc=value=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
const icsText=value=>String(value||'').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
function fold(line) {
  let result='',length=0;
  for(const char of line){const bytes=new TextEncoder().encode(char).length;if(length+bytes>75){result+='\r\n ';length=1;}result+=char;length+=bytes;}
  return result;
}
export function eventCalendarLocation(event) {
  return [...new Set([event.location,event.venue_address].filter(Boolean))].join(', ');
}
export function buildEventCalendar(events) {
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//ALTARA//Server Events//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:ALTARA','REFRESH-INTERVAL;VALUE=DURATION:PT1H','X-PUBLISHED-TTL:PT1H'];
  for(const event of events){
    if(!Number.isFinite(new Date(event.starts_at).getTime()))continue;
    lines.push('BEGIN:VEVENT',`UID:${icsText(event.id)}@events.altaraapp.com`,`DTSTAMP:${utc(event.updated_at||event.created_at||event.starts_at)}`,`DTSTART:${utc(event.starts_at)}`);
    if(event.ends_at&&Number.isFinite(new Date(event.ends_at).getTime()))lines.push(`DTEND:${utc(event.ends_at)}`);
    lines.push(`SUMMARY:${icsText(event.title)}`,`DESCRIPTION:${icsText(event.description)}`,`LOCATION:${icsText(eventCalendarLocation(event))}`,'STATUS:CONFIRMED','TRANSP:TRANSPARENT','END:VEVENT');
  }
  return lines.concat('END:VCALENDAR').map(fold).join('\r\n')+'\r\n';
}
export function googleEventCalendarUrl(event) {
  const url=new URL('https://calendar.google.com/calendar/r/eventedit');
  const end=event.ends_at||event.starts_at;
  Object.entries({action:'TEMPLATE',text:event.title,dates:`${utc(event.starts_at)}/${utc(end)}`,details:event.description||'',location:eventCalendarLocation(event)}).forEach(([k,v])=>url.searchParams.set(k,v));
  return url.href;
}
export function downloadEventCalendar(event) {
  const url=URL.createObjectURL(new Blob([buildEventCalendar([event])],{type:'text/calendar;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='altara-event.ics';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
export function renderEventCalendarMenu(event,text,interested) {
  return `<details class="eventCalendarPicker"><summary>${text('Add to calendar','Adicionar ao calendário')}</summary><div class="eventCalendarChoices"><small>${interested?text('In your ALTARA calendar','No teu calendário ALTARA'):text('Choose Going to add to ALTARA','Escolhe Vou para adicionar ao ALTARA')}</small><small>${text('Save a copy in your calendar','Guarda uma cópia no teu calendário')}</small><a href="${esc(googleEventCalendarUrl(event))}" target="_blank" rel="noopener noreferrer">Google Calendar ↗</a><button type="button" data-home-action="calendar-download" data-id="${esc(event.id)}">${text('Apple / Outlook (.ics)','Apple / Outlook (.ics)')}</button></div></details>`;
}
