const copy = {
  en: { switch:'Switch accounts', add:'Add account', current:'Current', login:'Sign in', empty:'New account', close:'Close', hint:'Accounts stay signed in on this device. Switching ends the current call.', pending:'Switching account…', error:'Could not switch accounts. Please try again.', limit:'You can keep up to 5 accounts on this device.', title:'Your accounts', loading:'Loading accounts…' },
  pt: { switch:'Trocar de conta', add:'Adicionar conta', current:'Atual', login:'Iniciar sessão', empty:'Nova conta', close:'Fechar', hint:'As contas ficam com sessão iniciada neste dispositivo. Trocar de conta termina a chamada atual.', pending:'A trocar de conta…', error:'Não foi possível trocar de conta. Tenta novamente.', limit:'Podes guardar até 5 contas neste dispositivo.', title:'As tuas contas', loading:'A carregar contas…' },
};
export function desktopAccountText(key) {
  const lang = typeof document !== 'undefined' ? document.documentElement.lang : 'en';
  return (String(lang).startsWith('pt') ? copy.pt : copy.en)[key] || copy.en[key] || key;
}
let beforeSwitch = async () => {};
export function setAccountSwitchCleanup(callback) { beforeSwitch = callback; }
export function getDesktopAccountsBridge() { return globalThis.window?.altaraDesktop?.accounts || globalThis.window?.altaraWebAccounts || null; }
export async function rememberDesktopAccount(profile) {
  const bridge=getDesktopAccountsBridge();
  if(!bridge)return;
  if(!profile?.id)return bridge.remember(null);
  const avatar=String(profile.avatar_url || profile.avatarUrl || '');
  return bridge.remember({userId:String(profile.id),username:String(profile.username||'').slice(0,80),displayName:String(profile.display_name||profile.username||'').slice(0,120),avatarUrl:avatar.startsWith('https://')?avatar.slice(0,2048):''});
}
const escape = value => String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function accountListHtml(snapshot) {
  return snapshot.accounts.map(account => {
    const active=account.id===snapshot.activeId;
    const name=account.displayName || account.username || desktopAccountText('empty');
    const label=active?desktopAccountText('current'):account.signedIn?'@'+(account.username||name):desktopAccountText('login');
    // Only HTTPS public avatars; display labels never become markup.
    let avatar='';try{const url=new URL(account.avatarUrl);if(url.protocol==='https:'&&!url.username&&!url.password)avatar=url.href;}catch{}
    return `<button class="desktopAccountRow${active?' is-current':''}" type="button" data-account-id="${escape(account.id)}"${active?' disabled aria-current="true"':''}><span class="desktopAccountAvatar">${avatar?`<img src="${escape(avatar)}" alt="" referrerpolicy="no-referrer">`:escape(name.slice(0,1).toUpperCase())}</span><span class="desktopAccountIdentity"><strong>${escape(name)}</strong><span>${escape(label)}</span></span>${active?'<span class="desktopAccountCheck" aria-hidden="true">✓</span>':'<span aria-hidden="true">›</span>'}</button>`;
  }).join('');
}
function ensureStyles() {
  if(document.getElementById('desktopAccountsStyle'))return;
  const link=document.createElement('link');link.id='desktopAccountsStyle';link.rel='stylesheet';link.href=new URL('./desktopAccounts.css',import.meta.url).href;document.head.append(link);
}
export async function openDesktopAccountSwitcher({ profile = null } = {}) {
  const bridge=getDesktopAccountsBridge();if(!bridge)return;
  if(document.querySelector('.desktopAccountDialog[open]'))return;
  ensureStyles();
  const dialog=document.createElement('dialog');dialog.className='desktopAccountDialog';dialog.setAttribute('aria-labelledby','desktopAccountsTitle');
  dialog.innerHTML=`<header><h2 id="desktopAccountsTitle">${escape(desktopAccountText('title'))}</h2><button class="desktopAccountClose" type="button" aria-label="${escape(desktopAccountText('close'))}">×</button></header><div class="desktopAccountList"></div><p class="desktopAccountHint">${escape(desktopAccountText('hint'))}</p><button class="desktopAccountAdd" type="button" disabled>＋ ${escape(desktopAccountText('add'))}</button><p class="desktopAccountStatus" role="status">${escape(desktopAccountText('loading'))}</p>`;
  document.body.append(dialog);dialog.showModal();let busy=false;
  const status=dialog.querySelector('.desktopAccountStatus'),add=dialog.querySelector('.desktopAccountAdd');
  const close=()=>{if(!busy)dialog.close();};
  dialog.querySelector('.desktopAccountClose').addEventListener('click',close);
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  async function load() {
    try {
      if(profile?.id)await rememberDesktopAccount(profile);
      const snapshot=await bridge.list();if(!dialog.isConnected)return;
      dialog.querySelector('.desktopAccountList').innerHTML=accountListHtml(snapshot);
      add.disabled=snapshot.accounts.length>=snapshot.limit&&!snapshot.accounts.some(a=>a.id!==snapshot.activeId&&!a.userId);
      status.textContent=add.disabled?desktopAccountText('limit'):'';
    } catch {status.textContent=desktopAccountText('error');}
  }
  async function change(id) {
    if(busy)return;busy=true;status.textContent=desktopAccountText('pending');
    dialog.querySelectorAll('button').forEach(button=>{button.disabled=true;});
    try {await beforeSwitch();const result=await (id?bridge.switchTo(id):bridge.add());if(result?.ok!==true)throw Error('switch_failed');if(result.unchanged){busy=false;dialog.close();}}
    catch {busy=false;await load();dialog.querySelector('.desktopAccountClose').disabled=false;status.textContent=desktopAccountText('error');}
  }
  dialog.querySelector('.desktopAccountList').addEventListener('click',event=>{const row=event.target.closest('[data-account-id]');if(row&&!row.disabled)void change(row.dataset.accountId);});
  add.addEventListener('click',()=>void change(null));
  await load();
}
export function mountLoginAccountSwitcher() {
  if(!getDesktopAccountsBridge())return;
  const existing=document.getElementById('loginAccountSwitcher');
  if(existing){existing.textContent=desktopAccountText('switch');return;}
  ensureStyles();const button=document.createElement('button');button.id='loginAccountSwitcher';button.type='button';button.className='desktopAccountLoginSwitch';button.textContent=desktopAccountText('switch');
  button.addEventListener('click',()=>void openDesktopAccountSwitcher());
  (document.querySelector('main')||document.body).append(button);
}
