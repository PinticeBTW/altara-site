const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const identityPattern=new RegExp(`^sv2:(${UUID}):(${UUID})$`,'i');
const uuidPattern=new RegExp(`^${UUID}$`,'i');
export function serverVoiceMediaUserId(identity) {
  return identityPattern.exec(String(identity||''))?.[1]?.toLowerCase()||String(identity||'').trim();
}
export function serverVoiceChannelRoom(server,channel) {
  if(!uuidPattern.test(server)||!uuidPattern.test(channel)) throw new Error('invalid_media_room_ids');
  return `server-voice-v2:${server.toLowerCase()}:${channel.toLowerCase()}`;
}
export function createServerVoiceChannelMedia({supabase,uuid=()=>crypto.randomUUID(),now=()=>performance.now(),onInvalidated=()=>{}}) {
  const entries=new Map();
  const histories=[];
  const command=async body=>{
    const {data,error}=await supabase.rpc('server_voice_media_command_v1',{p_command:body});
    if(error||data?.ok===false) throw Object.assign(new Error(error?.message||'stale_media_authority'),{code:error?.code});
    return data;
  };
  const fence=entry=>({serverId:entry.head.server_id,sessionId:entry.sessionId,generation:entry.head.generation,
    expectedClock:String(entry.head.clock),operationId:entry.head.operation_id});
  return {
    peek:server=>entries.get(server)||null,
    history:()=>histories.map(x=>({...x})),
    async join({serverId,channelId,intent='join',isCurrent=()=>true}) {
      const prior=entries.get(serverId);
      let sessionId=prior&&!prior.closed?prior.sessionId:uuid();
      const operationId=uuid();
      const entry={sessionId,operationId,closed:false,head:null,channelId,
        timing:{acceptedClick:now(),oldMediaInaccessible:null,transportReady:null,microphoneReady:null,remoteMediaReady:null,uiReady:null}};
      entries.set(serverId,entry);
      const status=await command({action:'status',serverId});
      if(entry.closed||entries.get(serverId)!==entry||!isCurrent()) throw new Error('stale_media_response');
      if(status.phase!=='enabled') throw new Error('server_voice_media_cutover_pending');
      if(intent==='reconnect' && (!status.row || status.row.channel_id!==channelId || prior?.closed
        || !['active','invalidated'].includes(status.head.phase)
        || (prior&&status.head.session_id!==prior.sessionId))) throw new Error('stale_reconnect_channel');
      if(intent==='join' && status.head.phase==='left' && prior?.head?.generation) {
        sessionId=uuid();entry.sessionId=sessionId;
      }
      if(prior&&!prior.closed&&prior.channelId===channelId&&status.row&&status.row.channel_id!==channelId) {
        throw new Error('stale_reconnect_channel');
      }
      entry.head=status.head;
      const result=await supabase.functions.invoke('server-voice-media-v2',{body:{action:'join',serverId,channelId,sessionId,operationId,intent,expectedClock:String(status.head.clock)}});
      if(result.error||result.data?.ok!==true) throw Object.assign(new Error(result.data?.error||result.error?.message||'media_join_failed'),{code:result.data?.error});
      if(entry.closed||entries.get(serverId)!==entry||!isCurrent()) {
        // Compensate only this logical session. A newer session cannot be erased.
        await command({action:'cancel',serverId,operationId:result.data.mediaAuthority?.operation_id,
          generation:result.data.mediaAuthority?.generation});
        throw new Error('stale_media_response');
      }
      const data=result.data;
      if(data.mediaProtocol!=='server_voice_media_v1'||data.roomName!==serverVoiceChannelRoom(serverId,channelId)
        ||data.mediaAuthority?.session_id!==sessionId||data.mediaAuthority?.operation_id!==operationId
        ||!data.mediaAuthority?.generation) throw new Error('invalid_media_response');
      entry.head=data.mediaAuthority;
      entry.timing.authorityReady=now();
      entry.timing.provider=data.mediaTimings||null;
      // Provider offsets use a different clock. This is an observed upper bound,
      // not a fabricated SFU receive-stop measurement.
      if(data.mediaTimings?.sourceAccessRevoked!=null) entry.timing.oldMediaInaccessible=entry.timing.authorityReady;
      histories.push(entry.timing);
      return data;
    },
    async heartbeat(serverId,{muted,deafened,sessionId,channelId}={}) {
      const entry=entries.get(serverId);
      if(!entry?.head||entry.closed) throw new Error('media_session_closed');
      if((sessionId&&sessionId!==entry.sessionId)||(channelId&&channelId!==entry.channelId)) throw new Error('stale_media_heartbeat');
      try { return await command({...fence(entry),action:'heartbeat',muted,deafened}); }
      catch(error) {
        if(!entry.closed && entries.get(serverId)===entry && !entry.recoveryRequested
          && entry.head.operation_id===entry.operationId
          && /stale_media_generation|media_assignment_inactive|media_access_denied/.test(error.message)) {
          entry.recoveryRequested=true;
          void Promise.resolve(onInvalidated({serverId,channelId:entry.channelId,sessionId:entry.sessionId,error})).catch(()=>{});
        }
        throw error;
      }
    },
    async leave(serverId,{sessionId}={}) {
      const entry=entries.get(serverId);
      const target=sessionId||entry?.sessionId;
      if(!target) return false;
      if(entry?.sessionId===target) entry.closed=true; // Before any network await.
      const result=await command({action:'leave',serverId,sessionId:target});
      // The same endpoint drains durable revocation work; worker also retries it.
      void supabase.functions.invoke('server-voice-media-v2',{body:{action:'leave',serverId,sessionId:target}}).catch(()=>{});
      return result;
    },
    mark(serverId,milestone) {
      if(!['oldMediaInaccessible','transportReady','microphoneReady','remoteMediaReady','uiReady'].includes(milestone)) throw new Error('unknown_media_milestone');
      const entry=entries.get(serverId);if(entry) entry.timing[milestone]=now();
    },
  };
}
