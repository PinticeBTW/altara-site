// Changes only invalidate the local snapshot; all content is re-read through RLS.
export function subscribeServerEvents(client,serverId,onChange,hasEvent=()=>false,onStatus=()=>{}) {
  if(typeof client.channel!=='function')return ()=>{};
  let closed=false,channel=null,retryTimer=null,retryMs=1500;
  const notify=()=>{if(!closed)onChange();};
  function connect() {
  if(closed)return;
  const previous=channel;channel=null;
  if(previous)void client.removeChannel(previous);
  const active=client.channel(`server-events:${serverId}:${Math.random().toString(36).slice(2)}`,{config:{private:true}});
  channel=active;
  for(const table of ['altara_server_events_v1','altara_server_event_interests_v1']) {
    for(const event of ['INSERT','UPDATE'])channel.on('postgres_changes',{event,schema:'public',table,filter:`server_id=eq.${serverId}`},notify);
    // DELETE payloads may contain only primary keys. Never use them as content.
    channel.on('postgres_changes',{event:'DELETE',schema:'public',table},payload=>{
      const id=table==='altara_server_events_v1'?payload.old?.id:payload.old?.event_id;
      if(id&&hasEvent(id))notify();
    });
  }
  channel.subscribe((status,error)=>{
    if(closed||channel!==active)return;
    onStatus(status,error?.message||'');
    if(status==='SUBSCRIBED'){clearTimeout(retryTimer);retryTimer=null;retryMs=1500;notify();}
    else if(['CLOSED','CHANNEL_ERROR','TIMED_OUT'].includes(status)&&!retryTimer){
      retryTimer=setTimeout(()=>{retryTimer=null;connect();},retryMs);
      retryMs=Math.min(retryMs*2,30000);
    }
  });
  }
  connect();
  return ()=>{closed=true;clearTimeout(retryTimer);if(channel)void client.removeChannel(channel);};
}
