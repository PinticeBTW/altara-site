const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const scope=value=>value&&uuid(value.userId)&&uuid(value.serverId)&&uuid(value.channelId)&&value.channelType==='text'
  ?[value.userId,value.serverId,value.channelId,value.navigation].join(':'):'';
const missing=error=>['PGRST202','42883'].includes(error?.code)&&String(error.message||'').includes('altara_channel_modes_read_v1');

// One read per navigation. Repeated renders share it; no timers or polling.
export function createForumComposerMode({rpc,getContext,onChange=()=>{}}){
  let owner=null;
  const current=value=>owner===value&&scope(getContext())===value.key;
  function snapshot(){return owner&&current(owner)?{mode:owner.mode,loading:!!owner.flight,error:owner.error,supported:owner.supported}:null;}
  function reset(){owner=null;}
  async function read({force=false}={}){
    const context=getContext(),key=scope(context);if(!key){reset();return null;}
    if(owner?.key!==key)owner={key,mode:'normal',loaded:false,flight:null,error:'',supported:true};
    const value=owner;if(value.flight)return value.flight;if(value.loaded&&!force)return snapshot();
    const task=(async()=>{
      try{
        const result=await Promise.resolve().then(()=>rpc('altara_channel_modes_read_v1',{p_server_id:context.serverId,p_channel_id:context.channelId}));
        if(!current(value))return null;
        if(result?.error){if(missing(result.error)){value.mode='normal';value.supported=false;value.error='';return snapshot();}throw result.error;}
        const data=result?.data;
        if(data?.ok!==true||data.server_id!==context.serverId||data.channel_id!==context.channelId||!['normal','forum'].includes(data.mode)||data.state!=='active')throw Error('invalid_channel_mode_response');
        value.mode=data.mode;value.error='';value.supported=true;return snapshot();
      }catch(error){if(current(value))value.error='Não foi possível confirmar o modo do canal.';return null;}
      finally{if(current(value)){value.loaded=true;value.flight=null;onChange(snapshot());}}
    })();value.flight=task;return task;
  }
  return{read,reset,snapshot};
}
