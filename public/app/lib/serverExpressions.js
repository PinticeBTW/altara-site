import { normalizeServerResourceList } from './serverBotResources.js';
// Custom emoji/sticker controls are deferred; retain existing assets and implementation.
export const SERVER_EXPRESSIONS_UI_ENABLED=false;
const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const esc=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function expressionToken(row){return row.kind==='emoji'?`<:${row.name}:${row.id}>`:`<sticker:${row.id}>`;}
export function renderServerExpressionTokens(escapedText,put=value=>value){
  const expression=new RegExp(`&lt;:([a-zA-Z0-9_]{2,32}):(${UUID})&gt;|&lt;sticker:(${UUID})&gt;`,'gi');
  return String(escapedText || '').replace(expression,(_literal,name,emoji,sticker)=>{
    const kind=emoji?'emoji':'sticker',id=(emoji||sticker).toLowerCase();
    return put(`<span class="serverExpression serverExpression--${kind}" data-server-expression="${id}" data-expression-kind="${kind}"><span>${name?`:${esc(name)}:`:'Sticker'}</span></span>`);
  });
}

// URLs exist only for authenticated, currently visible server assets. A scope
// change releases every object URL and prevents late requests mounting media.
export function createServerExpressionView({document,rpc,getScope,loadMedia,onList=()=>{}}){
  let scope='',generation=0,listRevision=0,rows=[],listFlight=null,disposed=false,scheduled=false,observed=new WeakSet();
  const urls=new Map(),flights=new Map();
  const key=value=>value?.actor&&value?.serverId&&value?.allowed?[value.actor,value.serverId,value.channelId,value.navigation].join(':'):'';
  const current=(captured,run)=>!disposed&&captured===scope&&key(getScope())===captured&&run===generation;
  function reset(){
    generation++;listRevision++;scope='';rows=[];listFlight=null;flights.clear();observed=new WeakSet();visibility?.disconnect();
    for(const value of urls.values())URL.revokeObjectURL(value.url);urls.clear();
    for(const node of document.querySelectorAll('[data-server-expression]')){node.querySelector('img')?.remove();node.classList.remove('is-ready');}
  }
  async function list({fresh=false}={}){
    const context=getScope(),wanted=key(context);
    if(wanted!==scope){reset();scope=wanted;}
    if(!scope)return [];
    if(fresh){listRevision++;listFlight=null;observed=new WeakSet();visibility?.disconnect();}
    if(listFlight)return listFlight;
    const captured=scope,run=generation,revision=listRevision;
    listFlight=(async()=>{
      try{
        const result=await rpc('altara_server_expression_action_v1',{p_server_id:context.serverId,p_action:'expression_list',p_payload:{},p_request_id:null});
        if(!current(captured,run)||revision!==listRevision)return [];
        if(result?.error)throw result.error;
        rows=normalizeServerResourceList('expressions',result?.data,context.serverId);
        const assets=new Set(rows.map(row=>row.asset_id));
        for(const [asset,value] of urls)if(!assets.has(asset)){URL.revokeObjectURL(value.url);urls.delete(asset);}
        for(const node of document.querySelectorAll('[data-server-expression]'))if(!rows.some(row=>row.id===node.dataset.serverExpression&&row.kind===node.dataset.expressionKind)){node.querySelector('img')?.remove();node.classList.remove('is-ready');}
        onList(rows);return rows;
      }catch(_){
        if(current(captured,run)&&revision===listRevision){
          rows=[];generation++;flights.clear();observed=new WeakSet();visibility?.disconnect();
          for(const value of urls.values())URL.revokeObjectURL(value.url);urls.clear();
          for(const node of document.querySelectorAll('[data-server-expression]')){node.querySelector('img')?.remove();node.classList.remove('is-ready');}
        }
        return [];
      }
    })();return listFlight;
  }
  async function media(row){
    const owns=()=>rows.some(value=>value.id===row.id&&value.kind===row.kind&&value.asset_id===row.asset_id);
    if(!owns())return null;
    if(urls.has(row.asset_id))return urls.get(row.asset_id).url;
    if(flights.has(row.asset_id))return flights.get(row.asset_id);
    if(flights.size>=6||urls.size>=32)return null;
    const captured=scope,run=generation,context=getScope();
    const flight=(async()=>{
      const blob=await loadMedia(row.asset_id,context.serverId);
      if(!current(captured,run)||!owns())return null;
      const url=URL.createObjectURL(blob);urls.set(row.asset_id,{url});return url;
    })();flights.set(row.asset_id,flight);
    try{return await flight;}finally{if(current(captured,run))flights.delete(row.asset_id);}
  }
  async function mount(node){
    const captured=scope,run=generation,row=rows.find(value=>value.id===node.dataset.serverExpression&&value.kind===node.dataset.expressionKind);
    if(!row||node.querySelector('img')||node.dataset.expressionLoading===String(run))return;
    node.dataset.expressionLoading=String(run);
    try{
      const url=await media(row);
      if(!url||!node.isConnected||!current(captured,run)||!rows.some(value=>value.id===row.id&&value.kind===row.kind&&value.asset_id===row.asset_id))return;
      const img=document.createElement('img');img.src=url;img.alt=row.kind==='emoji'?`:${row.name}:`:row.name;img.loading='lazy';img.decoding='async';node.append(img);
      node.classList.add('is-ready');
    }catch(_){/* The readable name remains when a grant is unavailable. */}
    finally{if(node.isConnected)delete node.dataset.expressionLoading;}
  }
  const visibility=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
    for(const entry of entries)if(entry.isIntersecting){visibility.unobserve(entry.target);void mount(entry.target);}
  },{rootMargin:'150px'}):null;
  async function refresh(){
    await list();if(!scope)return;
    for(const node of document.querySelectorAll('[data-server-expression]')){
      if(observed.has(node))continue;observed.add(node);
      if(visibility)visibility.observe(node);else void mount(node);
    }
  }
  const observer=new MutationObserver(()=>{
    if(scheduled||disposed)return;scheduled=true;queueMicrotask(()=>{scheduled=false;void refresh();});
  });
  observer.observe(document.body,{subtree:true,childList:true});
  return {list,reset,refresh,dispose:()=>{disposed=true;observer.disconnect();visibility?.disconnect();reset();}};
}
