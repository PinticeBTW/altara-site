// A shared browser session may change in another tab. Retire the old UI now,
// then let the normal bootstrap adopt the current session outside the auth lock.
export function createAuthIdentityTransition({getUserId,readSessionUserId,retire,reload,onError=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}={}) {
  let generation=0,timer=null,retired=false,reloading=false;
  function observe(sessionUserId,{signedOut=false}={}) {
    const next=String(sessionUserId || ''),current=String(getUserId() || '');
    generation++;if(timer!==null)clearTimer(timer);timer=null;
    if(reloading || !current)return false;
    if((next && next!==current || signedOut===true && !next) && !retired){retired=true;retire();}
    if(!retired)return false;
    const run=generation;
    timer=setTimer(async()=>{
      timer=null;
      try {
        const actual=String(await readSessionUserId() || '');
        if(run!==generation || reloading)return;
        // The reload carries no selected account or credential. Even an A-B-A
        // transition bootstraps the latest authoritative session, not target B.
        reloading=true;reload(actual);
      } catch(error) {
        if(run!==generation || reloading)return;
        onError(error);reloading=true;reload();
      }
    },0);
    return true;
  }
  return {observe,dispose:()=>{generation++;if(timer!==null)clearTimer(timer);timer=null;}};
}
