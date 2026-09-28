// Stores only the existing random registration nonce, never policy/account data.
// This nonce grants nothing: the backend binds it to a signed Auth session and
// a separate operator review. A new window/process may need a fresh review.
export function createAccountPrivacyClientIdentity(getUserId, {persist=false,storage=undefined}={}) {
 let id="",key="";
 const valid=value=>typeof value==="string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
 const store=()=>{try{return storage===undefined?globalThis.sessionStorage:storage;}catch(_){return null;}};
 return {
  get() {
   if(id)return id;
   if(persist) {
    key=`altara.accountPrivacy.clientInstance.v1:${String(getUserId()||"")}`;
    try{const saved=store()?.getItem(key);if(valid(saved))id=saved;}catch(_){}
   }
   if(id)return id;
   try{id=globalThis.crypto?.randomUUID?.()||"";}catch(_){}
   if(!valid(id)){id="";return "";}
   if(persist){try{store()?.setItem(key,id);}catch(_){}}
   return id;
  },
  clear(previousUserId) {
   if(key){try{store()?.removeItem(key);}catch(_){}}
   if(persist && previousUserId){try{store()?.removeItem(`altara.accountPrivacy.clientInstance.v1:${String(previousUserId)}`);}catch(_){}}
   id="";key="";
  },
 };
}
