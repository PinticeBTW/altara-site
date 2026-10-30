import {bindBotComponents} from './botComponents.js';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const key=value=>value?[value.userId,value.sourceKind,value.originServerId,value.botId,value.threadId,value.parentChannelId,value.conversationId,value.navigation].join(':'):'';
// Reuse the interaction renderer, while keeping the two real source tables and
// their private result authority separate from guild messages.
export function createBotSurfaceInteractions(root,{rpc,invoke,getActor,getContext,...options}={}) {
  if(typeof rpc!=='function'||typeof getContext!=='function')throw TypeError('invalid_surface_interactions');
  const context=()=>{
    const value=getContext();
    return value&&['dm','thread'].includes(value.sourceKind)&&uuid(value.userId)&&uuid(value.originServerId)
      &&(value.sourceKind==='dm'?uuid(value.botId):uuid(value.threadId)&&uuid(value.parentChannelId))?value:null;
  };
  const mapped=async(name,args)=>{
    const before=context(),scope=key(before);
    if(!before||getActor()!==before.userId)throw Error('component_cancelled');
    let target,body={...args};
    if(['bots_invoke_component_v1','bots_invoke_private_component_v1'].includes(name)) {
      target='bots_invoke_surface_component_v1';body.p_source_kind=before.sourceKind;
      if(name==='bots_invoke_private_component_v1')body.p_message_id=null;
    } else if(name==='bots_component_entities_v1') {
      target='bots_surface_component_entities_v1';body.p_source_kind=before.sourceKind;
    } else if(name==='bots_surface_component_result_v1')target=name;
    else target=({bots_component_result_v1:'bots_surface_component_result_v1',bots_interaction_result_v1:'bots_surface_component_result_v1',
      bots_submit_modal_v1:'bots_submit_surface_modal_v1',bots_get_component_delivery_route_v1:'bots_get_surface_component_delivery_route_v1'})[name];
    if(!target)throw Error('invalid_surface_rpc');
    const result=await rpc(target,body);
    if(scope!==key(context())||getActor()!==before.userId)throw Error('component_cancelled');
    return result;
  };
  return bindBotComponents(root,{...options,rpc:mapped,getActor,getContext,resultsVersion:'surface',acceptSource:kind=>context()?.sourceKind===kind,
    invoke:async(name,body)=>{
      const before=context(),scope=key(before);
      if(!before||getActor()!==before.userId)throw Error('component_cancelled');
      const result=await invoke(name,{...body,source_kind:before.sourceKind});
      if(scope!==key(context())||getActor()!==before.userId)throw Error('component_cancelled');
      return result;
    },
  });
}
