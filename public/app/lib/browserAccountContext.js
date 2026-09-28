/* Run before application modules. Each web account gets its own browser storage
 * namespace; the desktop uses native Chromium session partitions instead. */
(() => {
  if (window.altaraDesktop?.isDesktopApp || window.altaraWebAccounts) return;
  const nativeLocal = window.localStorage, nativeSession = window.sessionStorage;
  const registryKey = '__altara_accounts_v1', activeKey = '__altara_account_active_v1';
  const prefixRoot = '__altara_account_data:';
  const validId = id => id === 'default' || /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);
  const initial = () => ({version:1,activeId:'default',accounts:[{id:'default',signedIn:false}]});
  function read() {
    try {
      const data=JSON.parse(nativeLocal.getItem(registryKey));
      if(data?.version===1&&Array.isArray(data.accounts)&&data.accounts.length>0&&data.accounts.length<=5
        &&data.accounts.every(a=>validId(a.id))&&data.accounts.some(a=>a.id===data.activeId))return data;
    } catch {}
    return initial();
  }
  const boot=read(), tabId=nativeSession.getItem(activeKey);
  const currentId=boot.accounts.some(a=>a.id===tabId)?tabId:boot.activeId;
  nativeSession.setItem(activeKey,currentId);
  const prefix=currentId==='default'?'':prefixRoot+currentId+':';
  const reserved=key=>key===registryKey||key===activeKey||key.startsWith(prefixRoot);
  function scopedStorage(storage) {
    const keys=()=>Array.from({length:storage.length},(_,i)=>storage.key(i)).filter(key=>key!==null&&(prefix?key.startsWith(prefix):!reserved(key))).map(key=>prefix?key.slice(prefix.length):key);
    const api={getItem:key=>storage.getItem(prefix+String(key)),setItem:(key,value)=>storage.setItem(prefix+String(key),String(value)),removeItem:key=>storage.removeItem(prefix+String(key)),clear:()=>keys().forEach(key=>storage.removeItem(prefix+key)),key:index=>keys()[Number(index)]??null};
    return new Proxy({}, {
      get:(_target,key)=>key==='length'?keys().length:key===Symbol.toStringTag?'Storage':key in api?api[key]:typeof key==='string'?api.getItem(key):undefined,
      set:(_target,key,value)=>{api.setItem(key,value);return true;},
      deleteProperty:(_target,key)=>{api.removeItem(key);return true;},
      ownKeys:()=>keys(),getOwnPropertyDescriptor:(_target,key)=>keys().includes(key)?{configurable:true,enumerable:true,writable:true,value:api.getItem(key)}:undefined,
    });
  }
  const local=scopedStorage(nativeLocal), temporary=scopedStorage(nativeSession);
  Object.defineProperty(window,'localStorage',{configurable:true,value:local});
  Object.defineProperty(window,'sessionStorage',{configurable:true,value:temporary});
  const nativeIDB=window.indexedDB;
  if(nativeIDB)Object.defineProperty(window,'indexedDB',{configurable:true,value:new Proxy(nativeIDB,{
    get(target,key){
      if(key==='open'||key==='deleteDatabase')return (name,...args)=>target[key](prefix+String(name),...args);
      if(key==='databases')return async()=> (await target.databases()).filter(db=>prefix?db.name?.startsWith(prefix):!db.name?.startsWith(prefixRoot)).map(db=>({...db,name:prefix?db.name.slice(prefix.length):db.name}));
      const value=target[key];return typeof value==='function'?value.bind(target):value;
    },
  })});
  const NativeBroadcast=window.BroadcastChannel;
  if(NativeBroadcast)window.BroadcastChannel=class extends NativeBroadcast {constructor(name){super(prefix+name);}};
  // Native events carry physical keys. Only deliver this account's logical keys.
  window.addEventListener('storage',event=>{
    if(!event.isTrusted)return;
    event.stopImmediatePropagation();
    if(event.key===registryKey||event.key===activeKey)return;
    if(event.key!==null&&(prefix?!event.key.startsWith(prefix):reserved(event.key)))return;
    const translated=new Event('storage');
    for(const [key,value]of Object.entries({key:event.key===null?null:prefix?event.key.slice(prefix.length):event.key,oldValue:event.oldValue,newValue:event.newValue,url:event.url,storageArea:event.storageArea===nativeSession?temporary:local}))Object.defineProperty(translated,key,{value});
    window.dispatchEvent(translated);
  },true);
  function write(data){nativeLocal.setItem(registryKey,JSON.stringify(data));}
  function select(id){const data=read();if(!validId(id)||!data.accounts.some(a=>a.id===id))throw Error('unknown_account');if(id===currentId)return {ok:true,unchanged:true};nativeSession.setItem(activeKey,id);write({...data,activeId:id});window.location.replace(new URL('./index.html',document.baseURI).href);return {ok:true};}
  Object.defineProperty(window,'altaraWebAccounts',{value:Object.freeze({
    list:async()=>({...read(),activeId:currentId,limit:5}),
    remember:async profile=>{
      const data=read();let fields={signedIn:false};
      if(profile){if(!/^[0-9a-f-]{36}$/i.test(profile.userId||''))throw Error('invalid_account_user');fields={userId:profile.userId,username:String(profile.username||'').slice(0,80),displayName:String(profile.displayName||'').slice(0,120),avatarUrl:String(profile.avatarUrl||'').slice(0,2048),signedIn:true};}
      write({...data,accounts:data.accounts.map(a=>a.id===currentId?{...a,...fields}:a)});return {ok:true};
    },
    switchTo:async id=>select(id),
    add:async()=>{const data=read();let id=data.accounts.find(a=>a.id!==currentId&&!a.userId)?.id;if(!id){if(data.accounts.length>=5)throw Error('account_limit');id=crypto.randomUUID();write({...data,accounts:[...data.accounts,{id,signedIn:false}]});}return select(id);},
  })});
})();
