const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Response membership is authorized by the event RPC. Profile identity uses the
// same limited public projection as the rest of ALTARA, not the private table.
export async function hydrateEventResponders(client,people) {
  const ids=[...new Set(people.map(person=>person.user_id).filter(Boolean))],profiles=new Map();
  for(let offset=0;offset<ids.length;offset+=100){
    const {data,error}=await client.rpc('get_public_profiles_by_ids_v1',{p_profile_ids:ids.slice(offset,offset+100)});
    if(error)throw error;
    for(const profile of data||[])profiles.set(profile.id,profile);
  }
  return people.map(person=>{
    const profile=profiles.get(person.user_id);
    return profile?{...person,display_name:profile.display_name,username:profile.username,avatar_url:profile.avatar_url}:person;
  });
}
export function responseAvatar(person) {
  const name=person.display_name||person.username||'?';
  let url='';try{const parsed=new URL(person.avatar_url);if(parsed.protocol==='https:')url=parsed.href;}catch{}
  return `<span class="eventResponseAvatar" title="${esc(name)}">${url?`<img src="${esc(url)}" alt="${esc(name)}" loading="lazy" referrerpolicy="no-referrer">`:esc([...name][0].toUpperCase())}</span>`;
}
export function renderEventResponses(event,{text=(en)=>en,busy=false,started=false}={}) {
  const summary=event.rsvp||{going:0,not_going:0,own:null,preview:[]};
  return `<div class="eventRsvp" role="group" aria-label="${text('Your response','A tua resposta')}">${['going','not_going'].map(response=>`<button type="button" class="eventInterest eventResponse" data-home-action="response" data-response="${response}" data-id="${esc(event.id)}" aria-pressed="${summary.own===response}" ${busy||started||summary.own===response?'disabled':''}>${response==='going'?'✓':'−'} <span>${response==='going'?text('Going','Vou'):text('Not going','Não vou')}</span><span class="eventInterestCount">${Number(summary[response]||0)}</span></button>`).join('')}</div>`;
}
export function renderEventAttendees(event,text=(en)=>en) {
  const summary=event.rsvp||{going:0,not_going:0,preview:[]},total=Number(summary.going||0)+Number(summary.not_going||0);
  return `<button type="button" class="eventAttendees" data-home-action="attendees" data-id="${esc(event.id)}" aria-label="${text('View all responses','Ver todas as respostas')} (${total})"><span class="eventAvatarStack">${(summary.preview||[]).slice(0,5).map(responseAvatar).join('')}</span><span>${total?`${summary.going||0} ${text('going','vão')} · ${summary.not_going||0} ${text('not going','não vão')}`:text('No responses yet','Ainda sem respostas')}</span><span aria-hidden="true">›</span></button>`;
}
export function openEventAttendees(client,event,text=(en)=>en) {
  document.querySelector('.eventAttendeesDialog')?.close();
  const previous=document.activeElement,dialog=document.createElement('dialog');dialog.className='eventAttendeesDialog';
  dialog.innerHTML=`<form method="dialog"><div><small>${text('Responses','Respostas')}</small><h2>${esc(event.title)}</h2></div><button class="btn ghost" aria-label="${text('Close','Fechar')}">×</button></form><p data-response-status role="status"></p><div class="eventAttendeeList"></div><button class="btn ghost" data-response-more hidden>${text('Show more','Mostrar mais')}</button>`;
  document.body.append(dialog);dialog.showModal();
  const responses=['going','not_going'];
  let groups={going:{rows:[],total:0},not_going:{rows:[],total:0}},sequence=0,loading=false;
  const list=dialog.querySelector('.eventAttendeeList'),status=dialog.querySelector('[data-response-status]'),more=dialog.querySelector('[data-response-more]');
  async function load(append=false,quiet=false){
    const token=++sequence;loading=true;more.disabled=true;
    if(!quiet)status.textContent=text('Loading responses…','A carregar respostas…');
    try{
      const results=await Promise.all(responses.map(async response=>{
        const group=groups[response];
        if(append&&group.rows.length>=group.total)return {response,rows:group.rows,total:group.total};
        const result=await client.rpc('altara_event_attendees_v1',{p_event_id:event.id,p_response:response,p_offset:append?group.rows.length:0,p_limit:append?50:Math.max(50,group.rows.length)});
        if(result.error)throw result.error;
        return {response,rows:append?group.rows.concat(result.data?.people||[]):result.data?.people||[],total:Number(result.data?.total||0)};
      }));
      if(token!==sequence||!dialog.open)return;
      const people=await hydrateEventResponders(client,results.flatMap(group=>group.rows));
      if(token!==sequence||!dialog.open)return;
      let offset=0;
      for(const group of results){groups[group.response]={rows:people.slice(offset,offset+group.rows.length),total:group.total};offset+=group.rows.length;}
      const total=results.reduce((sum,group)=>sum+group.total,0);
      const html=responses.map(response=>{
        const group=groups[response];
        if(!group.total)return '';
        return `<section class="eventAttendeeSection"><h3>${response==='going'?text('Going','Vão'):text('Not going','Não vão')} · ${group.total}</h3>${group.rows.map(person=>`<div class="eventAttendeePerson">${responseAvatar(person)}<div><strong>${esc(person.display_name||person.username||text('Member','Membro'))}</strong>${person.username?`<small>@${esc(person.username)}</small>`:''}</div></div>`).join('')}</section>`;
      }).join('');
      if(list.innerHTML!==html)list.innerHTML=html;
      status.textContent=total?`${people.length} / ${total}`:text('No responses here yet.','Ainda sem respostas aqui.');more.hidden=people.length>=total;
    }catch{if(token===sequence&&dialog.open)status.textContent=text('Could not load responses. Reopen the list to try again.','Não foi possível carregar as respostas. Abre a lista para tentar novamente.');}
    finally{if(token===sequence){loading=false;more.disabled=false;}}
  }
  dialog.addEventListener('click',event=>{if(event.target.closest('[data-response-more]')&&!loading)void load(true);});
  dialog.addEventListener('close',()=>{sequence++;dialog.remove();previous?.focus();},{once:true});void load();
  return {refresh:()=>{if(dialog.open&&!loading)void load(false,true);},close:()=>dialog.close()};
}
