export function calendarDateKey(value) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function createServerCalendar(client) {
  const cache = new Map(), pending = new Map();
  let room=null,watching='',timer=null,retry=null,onChange=()=>{};
  const stop=()=>{if(room)client.removeChannel(room);room=null;watching='';clearTimeout(timer);clearTimeout(retry);};
  client.auth?.onAuthStateChange?.((_event,session)=>{if(watching&&session?.user?.id!==watching){stop();cache.clear();}});
  function connect(){
    const user=watching;if(!user||!client.channel)return;
    const changed=()=>{if(user!==watching)return;clearTimeout(timer);timer=setTimeout(()=>onChange(),180);};
    const next=client.channel('personal-calendar:'+user+':'+Math.random().toString(36).slice(2),{config:{private:true}});room=next;
    next.on('postgres_changes',{event:'INSERT',schema:'public',table:'altara_server_event_interests_v1',filter:'user_id=eq.'+user},changed)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'altara_server_event_interests_v1',filter:'user_id=eq.'+user},changed)
      .on('postgres_changes',{event:'DELETE',schema:'public',table:'altara_server_event_interests_v1'},payload=>{if(payload.old?.user_id===user||cache.get(user)?.events.some(e=>e.id===payload.old?.event_id))changed();})
      .on('postgres_changes',{event:'*',schema:'public',table:'altara_server_events_v1'},payload=>{if(cache.get(user)?.events.some(e=>e.id===(payload.new?.id||payload.old?.id)))changed();})
      .subscribe(status=>{if(room!==next)return;if(status==='SUBSCRIBED')changed();else if(['CLOSED','TIMED_OUT','CHANNEL_ERROR'].includes(status)){clearTimeout(retry);retry=setTimeout(()=>{if(room!==next)return;room=null;client.removeChannel(next);connect();},5000);}});
  }
  return {
    watch(userId,callback) { onChange=callback;if(watching===userId)return;stop();watching=userId;connect(); },
    dispose:stop,
    get(userId) { return cache.get(userId)?.events || []; },
    async refresh(userId, force=false) {
      if (!userId) return;
      if (pending.has(userId)) return pending.get(userId);
      if (!force && Date.now()-(cache.get(userId)?.at||0)<30000) return;
      const request = (async()=>{
        try {
          const {data,error}=await client.from('altara_server_event_interests_v1')
            .select('altara_server_events_v1!inner(id,server_id,title,starts_at,ends_at,location,venue_address,description)')
            .eq('response','going').eq('user_id',userId).gte('altara_server_events_v1.starts_at',new Date(Date.now()-86400000).toISOString());
          if (error) throw error;
          const events=(data||[]).map(row=>row.altara_server_events_v1).flat().filter(row=>row&&calendarDateKey(row.starts_at))
            .sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));
          cache.set(userId,{at:Date.now(),events});
        } catch { /* Keep the last successful calendar while reconnecting. */ }
      })().finally(()=>pending.delete(userId));
      pending.set(userId,request);await request;
    },
  };
}
