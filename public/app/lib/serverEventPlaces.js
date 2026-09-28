const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cache=new Map();
let lastRequest=0;

export function normalizePlace(feature) {
  const [lon,lat]=feature?.geometry?.coordinates||[];
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return null;
  const p=feature.properties||{};
  const street=[p.street,p.housenumber].filter(Boolean).join(' ');
  const address=[...new Set([p.name,street,p.postcode,p.city||p.town||p.village,p.state,p.country].filter(Boolean))].join(', ').slice(0,500);
  return address?{name:String(p.name||p.street||p.city||address).slice(0,200),address,lat,lon}:null;
}

// Explicit searches only. Cache repeat requests and keep the public demo's use modest.
// A self-hosted Photon endpoint can be supplied through the application config.
export async function searchEventPlaces(query,{signal,fetcher=fetch,endpoint=globalThis.ALTARA_PLACE_SEARCH_URL||'https://photon.komoot.io/api/'}={}) {
  const q=String(query||'').trim().slice(0,200);
  if(q.length<3)return [];
  const key=endpoint+'|'+q.toLowerCase();
  if(cache.has(key))return cache.get(key);
  if(Date.now()-lastRequest<1200)throw new Error('rate_limit');
  lastRequest=Date.now();
  const url=new URL(endpoint);url.searchParams.set('q',q);url.searchParams.set('limit','5');
  const result=await fetcher(url,{signal,credentials:'omit',referrerPolicy:'no-referrer'});
  if(!result.ok)throw new Error('place_search_unavailable');
  const payload=await result.json();
  const rows=(payload.features||[]).map(normalizePlace).filter(Boolean).slice(0,5);
  if(cache.size>=50)cache.delete(cache.keys().next().value);
  cache.set(key,rows);return rows;
}
export function placeMapUrl(place) {
  return `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lon}`;
}
export function coordinatesFromMap(value) {
  try{
    const url=new URL(value);
    if(!['www.google.com','google.com','maps.google.com'].includes(url.hostname))return null;
    const match=(url.searchParams.get('query')||url.searchParams.get('destination')||'').match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
    if(!match)return null;
    const lat=Number(match[1]),lon=Number(match[2]);
    return Math.abs(lat)<=90&&Math.abs(lon)<=180?{lat,lon}:null;
  }catch{return null;}
}
export function renderPlaceSearch(d,text) {
  const point=coordinatesFromMap(d.maps_url);
  const map=point?`https://www.openstreetmap.org/export/embed.html?bbox=${point.lon-.006},${Math.max(-90,point.lat-.004)},${point.lon+.006},${Math.min(90,point.lat+.004)}&layer=mapnik&marker=${point.lat},${point.lon}`:'';
  return `<div class="eventPlaceSearch"><label>${text('Find a place','Pesquisar local')}<div class="eventPlaceSearchRow"><input name="place_query" value="${esc(d.place_query||'')}" maxlength="200" placeholder="${text('Venue or address, city','Local ou morada, cidade')}" autocomplete="off"><button type="button" data-home-action="place-search" ${d.place_searching?'disabled':''}>${d.place_searching?text('Searching…','A pesquisar…'):text('Search','Pesquisar')}</button></div></label><div class="eventPlaceResults" aria-live="polite">${d.place_message?`<small>${esc(d.place_message)}</small>`:''}${(d.place_results||[]).map((p,i)=>`<button type="button" data-home-action="place-select" data-id="${i}"><strong>${esc(p.name)}</strong><span>${esc(p.address)}</span></button>`).join('')}</div>${map?`<iframe class="eventPlaceMap" title="${text('Selected meeting point','Ponto de encontro selecionado')}" src="${esc(map)}" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>`:''}<small class="eventPlaceAttribution">${text('Place search','Pesquisa de locais')}: Photon · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a></small></div>`;
}
