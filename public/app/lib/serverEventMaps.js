import { coordinatesFromMap } from './serverEventPlaces.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function safeGoogleMapsUrl(value) {
  try {
    const url=new URL(String(value||'').trim());
    if(url.protocol!=='https:'||url.username||url.password||url.port)return '';
    if(url.hostname==='maps.app.goo.gl'||(url.hostname==='goo.gl'&&url.pathname.startsWith('/maps/'))||
      (['google.com','www.google.com','maps.google.com'].includes(url.hostname)&&(url.pathname==='/maps'||url.pathname.startsWith('/maps/'))))return url.href;
  }catch{}
  return '';
}
export function eventMapLinks(event) {
  const address=String(event.venue_address||'').trim();
  if(!address||event.channel_id)return [];
  const point=coordinatesFromMap(event.maps_url);
  const q=encodeURIComponent(point?`${point.lat},${point.lon}`:address);
  return [
    {name:'Google Maps',href:safeGoogleMapsUrl(event.maps_url)||`https://www.google.com/maps/dir/?api=1&destination=${q}`},
    {name:'Apple Maps',href:`https://maps.apple.com/?daddr=${q}`},
    {name:'Waze',href:point?`https://waze.com/ul?ll=${q}&navigate=yes`:`https://waze.com/ul?q=${q}`},
  ];
}
export function renderEventMaps(event,text=en=>en) {
  const links=eventMapLinks(event);
  if(!links.length)return '';
  return `<div class="eventVenue"><span class="eventVenueAddress">${esc(event.venue_address)}</span><details class="eventMapPicker"><summary>${text('Open in Maps','Abrir nos mapas')} ↗</summary><div class="eventMapChoices">${links.map(link=>`<a href="${esc(link.href)}" target="_blank" rel="noopener noreferrer">${link.name} ↗</a>`).join('')}</div></details></div>`;
}
