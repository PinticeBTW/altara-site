// Deliberately separate from normal call subscriptions. Only a clone of the
// consenting user's microphone is published to a bot-specific capture room.
export function createBotAudioConsentBridge({supabase,loadLiveKit,getContext,getMicrophoneTrack,onChange=()=>{},now=Date.now}) {
 const entries=new Map();let stopped=false,sequence=0;
 const contextKey=ctx=>[ctx?.userId,ctx?.serverId,ctx?.channelId,ctx?.mediaGeneration].join(':');
 const invoke=async(action,ctx,extra={})=>{
  const {data,error}=await supabase.functions.invoke('altara-bot-audio-capture',{body:{action,server_id:ctx.serverId,channel_id:ctx.channelId,...extra}});
  if(error || data?.ok!==true)throw new Error('bot_audio_consent_failed');return data;
 };
 const notify=()=>onChange([...entries.values()].map(e=>({captureId:e.captureId,botId:e.botId,recording:e.recording,active:e.active})));
 const release=e=>{
  if(e.released)return;e.released=true;
  clearTimeout(e.renewTimer);clearTimeout(e.expiryTimer);e.clone?.stop();e.active=false;
  if(e.room)void Promise.resolve(e.room.disconnect()).catch(()=>{});
  if(entries.get(e.captureId)===e)entries.delete(e.captureId);notify();
 };
 const retire=async e=>{
  release(e);
  if(e.consentId && e.revokedId!==e.consentId){e.revokedId=e.consentId;try{await invoke('revoke',e.context,{capture_id:e.captureId,consent_id:e.consentId});}catch{ /* Audio stopped locally; the capture heartbeat also retires expired consents. */ }}
 };
 const valid=e=>!stopped && entries.get(e.captureId)===e && contextKey(getContext())===e.key && getMicrophoneTrack()===e.original && e.original?.readyState!=='ended';
 const renew=e=>{
  if(e.renewTask)return e.renewTask;
  clearTimeout(e.renewTimer);
  e.renewTask=(async()=>{
  if(!valid(e)){await retire(e);return;}
  try{
   const data=await invoke('renew',e.context,{capture_id:e.captureId,consent_id:e.consentId});
   if(!valid(e) || data.consent_id!==e.consentId || data.media_generation!==e.context.mediaGeneration){await retire(e);return;}
   const expiry=Date.parse(data.expires_at);if(!Number.isFinite(expiry) || expiry<=now() || expiry>now()+22000)throw Error('invalid_consent_lease');
   clearTimeout(e.expiryTimer);e.expiryTimer=setTimeout(()=>{void retire(e);},Math.max(0,expiry-now()-250));
   e.renewTimer=setTimeout(()=>{void renew(e);},8000);
   e.suspended=false;sync();
  }catch{await retire(e);}
  })().finally(()=>{e.renewTask=null;});
  return e.renewTask;
 };
 const sync=()=>{
  const ctx=getContext();
  for(const e of [...entries.values()]){
   if(!valid(e)){void retire(e);continue;}
   if(e.clone)e.clone.enabled=e.active && !e.suspended && e.original.enabled!==false && !ctx.muted && !ctx.deafened;
  }
 };
 const monitor=setInterval(sync,250);
 return {
  async list(){const ctx=getContext();if(stopped || !ctx?.userId || !ctx.serverId || !ctx.channelId || !ctx.mediaGeneration)return [];
   const data=await invoke('list',ctx);return Array.isArray(data.captures)?data.captures:[];},
  async consent(captureId,{recording=false}={}){
   if(stopped || typeof recording!=='boolean')throw Error('invalid_audio_consent');
   const ctx={...getContext()},key=contextKey(ctx),original=getMicrophoneTrack();
   if(!ctx.userId || !ctx.serverId || !ctx.channelId || !ctx.mediaGeneration || !original || original.kind!=='audio' || original.readyState==='ended')throw Error('voice_not_ready');
   if(entries.has(captureId))await retire(entries.get(captureId));
   const e={captureId,context:ctx,key,original,sequence:++sequence,recording,active:false};entries.set(captureId,e);notify();
   try{
    const data=await invoke('consent',ctx,{capture_id:captureId,allow_listen:true,allow_record:recording});
    e.consentId=data.consent_id;e.botId=data.bot_id;
    if(!valid(e) || data.capture_id!==captureId || data.media_generation!==ctx.mediaGeneration || data.recording!==recording
     || data.can_publish_audio!==true || data.can_subscribe_audio!==false || !data.token || !/^wss:\/\//.test(data.livekit_url)
     || data.room_name!==`bot-audio:${data.bot_id}:${ctx.serverId}:${ctx.channelId}:${captureId}`)throw Error('invalid_consent_lease');
    const lk=await loadLiveKit();if(!valid(e))throw Error('voice_assignment_changed');
    e.clone=original.clone();e.clone.enabled=false;
    e.room=new lk.Room({adaptiveStream:false,dynacast:false});
    e.room.on(lk.RoomEvent.Disconnected,()=>{void retire(e);});
    // Never resume a consent mirror through SDK reconnect before checking it.
    e.room.on(lk.RoomEvent.Reconnecting,()=>{e.suspended=true;e.clone.enabled=false;});
    e.room.on(lk.RoomEvent.Reconnected,()=>{void renew(e);});
    await e.room.connect(data.livekit_url,data.token,{autoSubscribe:false});
    if(!valid(e))throw Error('voice_assignment_changed');
    await renew(e);if(!valid(e))throw Error('consent_expired');
    await e.room.localParticipant.publishTrack(e.clone,{source:lk.Track.Source.Microphone,stopOnMute:false});
    if(!valid(e))throw Error('voice_assignment_changed');
    e.active=true;notify();sync();return {captureId,recording};
   }catch(error){await retire(e);throw new Error('bot_audio_consent_failed');}
  },
  async revoke(captureId){const e=entries.get(captureId);if(e)await retire(e);},
  sync,
  snapshot(){return [...entries.values()].map(e=>({captureId:e.captureId,recording:e.recording,active:e.active}));},
  async stop(){stopped=true;clearInterval(monitor);await Promise.allSettled([...entries.values()].map(retire));},
 };
}
