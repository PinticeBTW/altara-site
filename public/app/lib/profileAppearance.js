import { normalizeHex, mix, alpha, contrastRatio, getContrastText } from '../theme/colors.js';

export const PROFILE_APPEARANCE_DEFAULT = Object.freeze({
  version: 1, enabled: false, mode: 'dark', gradient: true,
  background: '#182330', backgroundEnd: '#292039', accent: '#a9c9ff', banner: '#324a68',
});

export function normalizeProfileAppearance(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    version: 1, enabled: raw.enabled === true, mode: raw.mode === 'light' ? 'light' : 'dark',
    gradient: raw.gradient !== false,
    ...Object.fromEntries(['background', 'backgroundEnd', 'accent', 'banner'].map(key =>
      [key, normalizeHex(raw[key], PROFILE_APPEARANCE_DEFAULT[key])])),
  };
}

export function profileAppearancePalette(value) {
  const normalized = normalizeProfileAppearance(value);
  // Default is a public profile style too, independent of the viewer's app.
  const settings = normalized.enabled ? normalized : {
    ...normalized, mode:'dark', gradient:false, background:'#111111',
    backgroundEnd:'#111111', accent:'#e8cfae', banner:'#202020',
  };
  const light = settings.mode === 'light';
  const text = light ? '#171a21' : '#faf8f5';
  const limit = light ? '#ffffff' : '#080b12';
  const readableSurface = input => {
    let color = input;
    for (let step = 0; contrastRatio(text, color) < 7 && step < 32; step++) color = mix(color, limit, .12);
    return color;
  };
  const start = readableSurface(settings.background);
  const end = readableSurface(settings.gradient ? settings.backgroundEnd : settings.background);
  const surface = mix(start, end, .5);
  const panel = normalized.enabled ? readableSurface(mix(surface, '#ffffff', light ? .5 : .035)) : '#171717';
  let muted = mix(text, surface, .28);
  for (let i = 0; i < 24 && [start, end, panel].some(bg => contrastRatio(muted, bg) < 4.5); i++) muted = mix(muted, text, .15);
  const accent = settings.accent;
  return { ...settings, start, end, surface, panel, text, muted, accent,
    accentText: getContrastText(accent, {light:'#ffffff',dark:'#101217'}),
    border: alpha(text, !normalized.enabled ? .10 : light ? .18 : .16), hover: mix(panel, text, .08),
    backgroundPaint: settings.gradient ? `linear-gradient(150deg, ${start}, ${end})` : start,
  };
}

const TOKENS = ['bg','surface','panel','text','muted','accent','accent-text','border','hover','banner','name'];
const ALTARA_TOKENS = ['bg','app-bg','bg-gradient','surface','surface-elevated','surface-panel','surface-muted','text','text-muted','text-soft','accent','accent-strong','accent-text','border','border-strong','input','hover'];

export function clearProfileAppearance(element) {
  if (!element || element === element.ownerDocument?.body || element === element.ownerDocument?.documentElement) return;
  delete element.dataset.profileAppearance;
  delete element.dataset.profileMode;
  for (const token of TOKENS) element.style.removeProperty(`--profile-${token}`);
  for (const token of ALTARA_TOKENS) element.style.removeProperty(`--altara-${token}`);
}

// All tokens live on a profile surface. Never write to documentElement or body.
export function applyProfileAppearance(element, value, { nameColor = '' } = {}) {
  if (!element || element === element.ownerDocument?.body || element === element.ownerDocument?.documentElement) return;
  const settings = normalizeProfileAppearance(value);
  clearProfileAppearance(element);
  element.dataset.profileAppearance = settings.enabled ? 'custom' : 'default';
  const p = profileAppearancePalette(settings);
  element.dataset.profileMode = p.mode;
  let name = normalizeHex(nameColor, p.text);
  for (let step = 0; step < 32 && [p.start,p.end,p.panel].some(bg => contrastRatio(name,bg) < 4.5); step++) name = mix(name,p.text,.15);
  const vars = { bg:p.backgroundPaint, surface:p.surface, panel:p.panel, text:p.text, muted:p.muted,
    accent:p.accent, 'accent-text':p.accentText, border:p.border, hover:p.hover, banner:p.banner, name };
  for (const [key,color] of Object.entries(vars)) element.style.setProperty(`--profile-${key}`,color);
  const altara = {bg:p.surface,'app-bg':p.backgroundPaint,'bg-gradient':p.backgroundPaint,surface:p.surface,
    'surface-elevated':p.panel,'surface-panel':p.panel,'surface-muted':p.panel,text:p.text,'text-muted':p.muted,
    'text-soft':p.muted,accent:p.accent,'accent-strong':p.accent,'accent-text':p.accentText,border:p.border,
    'border-strong':p.border,input:p.panel,hover:p.hover};
  for (const [key,color] of Object.entries(altara)) element.style.setProperty(`--altara-${key}`,color);
}

const PRESETS = [
  {id:'classic',en:'Classic',pt:'Clássico',enabled:false},
  {id:'midnight',en:'Midnight',pt:'Meia-noite',background:'#162237',backgroundEnd:'#302448',accent:'#b6c9ff',banner:'#304c77'},
  {id:'forest',en:'Forest',pt:'Floresta',background:'#152e27',backgroundEnd:'#243b2b',accent:'#a6dfb5',banner:'#32684d'},
  {id:'rose',en:'Rose',pt:'Rosa',background:'#38212e',backgroundEnd:'#271c37',accent:'#f3b6d3',banner:'#874562'},
  {id:'aurora',en:'Aurora',pt:'Aurora',mode:'light',background:'#a3eff1',backgroundEnd:'#bdc5ff',accent:'#5146b5',banner:'#32a8be'},
];
const safeImage = value => { try {const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:'';} catch {return '';} };

export function createProfileAppearanceEditor({host, getProfile, save, onSaved = () => {}, locale = 'en'}) {
  const pt=locale.startsWith('pt');
  const labels=pt ? {
    title:'O teu perfil, à tua maneira',hint:'Personaliza os cartões de perfil que os outros veem. O tema da tua app mantém-se.',
    presets:'Começa com um estilo',enable:'Personalizar as cores do perfil',mode:'Contraste',dark:'Escuro',light:'Claro',
    background:'Fundo',backgroundEnd:'Segunda cor',accent:'Destaque',banner:'Cor do banner',gradient:'Usar gradiente',
    note:'O texto e o fundo ajustam-se para manter a leitura. A imagem do banner atual tem prioridade sobre a cor.',
    preview:'Pré-visualização do perfil',about:'Sobre mim',sample:'Um espaço com a tua personalidade.',message:'Mensagem',
    save:'Guardar alterações',saving:'A guardar…',saved:'Perfil guardado.',reset:'Repor padrão',cancel:'Descartar alterações',
    changed:'Alterações por guardar',error:'Não foi possível guardar. As tuas alterações continuam aqui; tenta novamente.',invalid:'Usa uma cor válida, como #A3EFF1.',
  } : {
    title:'Make your profile yours',hint:'Customize the profile cards other people see. Your app theme stays the same.',
    presets:'Start with a style',enable:'Use custom profile colors',mode:'Contrast',dark:'Dark',light:'Light',
    background:'Background',backgroundEnd:'Second color',accent:'Accent',banner:'Banner color',gradient:'Use a gradient',
    note:'Text and surfaces adjust to stay readable. Your current banner image takes priority over the color.',
    preview:'Profile preview',about:'About me',sample:'A little space with your personality.',message:'Message',
    save:'Save changes',saving:'Saving…',saved:'Profile saved.',reset:'Reset to default',cancel:'Discard changes',
    changed:'Unsaved changes',error:'Could not save. Your changes are still here; please try again.',invalid:'Use a valid color, such as #A3EFF1.',
  };
  let profile=getProfile() || {}, owner=String(profile.id || ''), committed=normalizeProfileAppearance(profile.profile_appearance), draft={...committed}, busy=false;
  const field = key => `<label class="profileAppearanceColor"><span>${labels[key]}</span><div><input type="color" data-profile-color="${key}" aria-label="${labels[key]}"><input type="text" data-profile-hex="${key}" aria-label="${labels[key]} hex" maxlength="7" spellcheck="false" autocomplete="off"></div></label>`;
  host.innerHTML=`<div class="profileAppearanceEditor">
    <div class="profileAppearanceIntro"><span class="profileAppearanceEyebrow">${pt?'ESTILO DO PERFIL':'PROFILE STYLE'}</span><h2>${labels.title}</h2><p>${labels.hint}</p></div>
    <div class="profileAppearanceLayout"><div class="profileAppearanceControls">
      <section class="profileAppearanceSection"><h3>${labels.presets}</h3><div class="profileAppearancePresets">${PRESETS.map(p=>`<button type="button" data-profile-preset="${p.id}" aria-pressed="false"><span style="background:${p.enabled===false?'#111111':`linear-gradient(135deg,${p.banner},${p.backgroundEnd})`}"></span>${pt?p.pt:p.en}</button>`).join('')}</div></section>
      <section class="profileAppearanceSection"><label class="profileAppearanceToggle"><span>${labels.enable}</span><input type="checkbox" data-profile-enabled></label>
        <fieldset class="profileAppearanceFields"><legend>${labels.mode}</legend><div class="profileAppearanceModes"><button type="button" data-profile-mode="dark">${labels.dark}</button><button type="button" data-profile-mode="light">${labels.light}</button></div>
          <div class="profileAppearanceColors">${['background','backgroundEnd','accent','banner'].map(field).join('')}</div>
          <label class="profileAppearanceToggle"><span>${labels.gradient}</span><input type="checkbox" data-profile-gradient></label><p class="profileAppearanceNote">${labels.note}</p>
        </fieldset>
      </section>
    </div><aside class="profileAppearancePreviewColumn"><div class="profileAppearanceEyebrow">${labels.preview}</div>
      <article class="profileAppearancePreview" aria-label="${labels.preview}"><div class="profileAppearancePreviewBanner"></div><div class="profileAppearancePreviewBody"><div class="profileAppearancePreviewAvatar"></div><h3 data-profile-preview-name></h3><p data-profile-preview-handle></p><div class="profileAppearancePreviewAbout"><b>${labels.about}</b><p data-profile-preview-bio></p></div><span class="profileAppearancePreviewAction">${labels.message}</span></div></article>
    </aside></div>
    <div class="profileAppearanceFooter"><span role="status" aria-live="polite" data-profile-status></span><div><button class="btn ghost" type="button" data-profile-reset>${labels.reset}</button><button class="btn ghost" type="button" data-profile-cancel>${labels.cancel}</button><button class="btn primary" type="button" data-profile-save>${labels.save}</button></div></div>
  </div>`;
  const q=selector=>host.querySelector(selector), all=selector=>[...host.querySelectorAll(selector)];
  const status=q('[data-profile-status]');
  const dirty=()=>JSON.stringify(draft)!==JSON.stringify(committed);
  const invalid=()=>!!q('[aria-invalid="true"]');
  const render = () => {
    q('[data-profile-enabled]').checked=draft.enabled;
    q('[data-profile-gradient]').checked=draft.gradient;
    q('fieldset').disabled=busy || !draft.enabled;
    all('[data-profile-mode]').forEach(el=>el.setAttribute('aria-pressed',String(draft.mode===el.dataset.profileMode)));
    all('[data-profile-preset]').forEach(el=>{
      const preset=PRESETS.find(p=>p.id===el.dataset.profilePreset);
      const selected=!draft.enabled?preset.enabled===false:preset.enabled!==false&&['background','backgroundEnd','accent','banner'].every(key=>draft[key]===preset[key])&&draft.mode===(preset.mode||'dark');
      el.setAttribute('aria-pressed',String(selected)); el.disabled=busy;
    });
    all('[data-profile-color]').forEach(el=>el.value=draft[el.dataset.profileColor]);
    all('[data-profile-hex]').forEach(el=>{if(el!==host.ownerDocument.activeElement)el.value=draft[el.dataset.profileHex].toUpperCase();});
    q('[data-profile-color="backgroundEnd"]').disabled=!draft.gradient;
    q('[data-profile-hex="backgroundEnd"]').disabled=!draft.gradient;
    q('[data-profile-save]').disabled=busy||!dirty()||invalid();
    q('[data-profile-save]').textContent=busy?labels.saving:labels.save;
    q('[data-profile-cancel]').disabled=busy||(!dirty()&&!invalid());
    q('[data-profile-reset]').disabled=busy;
    q('[data-profile-enabled]').disabled=busy;
    applyProfileAppearance(q('.profileAppearancePreview'),draft,{nameColor:profile.name_color});
    const name=profile.display_name||profile.username||'ALTARA';
    q('[data-profile-preview-name]').textContent=name;
    q('[data-profile-preview-handle]').textContent='@'+(profile.username||'you');
    q('[data-profile-preview-bio]').textContent=profile.bio||labels.sample;
    const avatar=q('.profileAppearancePreviewAvatar'), avatarUrl=safeImage(profile.avatar_url);
    avatar.replaceChildren();
    if(avatarUrl){const img=host.ownerDocument.createElement('img');img.src=avatarUrl;img.alt='';avatar.append(img);}else avatar.textContent=name.slice(0,1).toUpperCase();
    const banner=q('.profileAppearancePreviewBanner'), bannerUrl=safeImage(profile.banner_url);
    banner.replaceChildren();
    if(bannerUrl){const img=host.ownerDocument.createElement('img');img.src=bannerUrl;img.alt='';banner.append(img);}
  };
  const clearInvalid=()=>all('[data-profile-hex]').forEach(el=>el.removeAttribute('aria-invalid'));
  const change=patch=>{draft=normalizeProfileAppearance({...draft,...patch});status.textContent=dirty()?labels.changed:'';render();};
  host.addEventListener('input',event=>{
    const el=event.target;if(busy)return;
    if(el.matches('[data-profile-color]')){const key=el.dataset.profileColor;q(`[data-profile-hex="${key}"]`).removeAttribute('aria-invalid');change({[key]:el.value});}
    if(el.matches('[data-profile-hex]')){const color=normalizeHex(el.value,'');el.setAttribute('aria-invalid',String(!color));if(color)change({[el.dataset.profileHex]:color});else{status.textContent=labels.invalid;q('[data-profile-save]').disabled=true;q('[data-profile-cancel]').disabled=false;}}
  });
  host.addEventListener('change',event=>{
    if(busy)return;
    if(event.target.matches('[data-profile-enabled]'))change({enabled:event.target.checked});
    if(event.target.matches('[data-profile-gradient]'))change({gradient:event.target.checked});
  });
  host.addEventListener('click',async event=>{
    const el=event.target.closest('button');if(!el||busy)return;
    if(el.dataset.profilePreset){const preset=PRESETS.find(p=>p.id===el.dataset.profilePreset);clearInvalid();change({...PROFILE_APPEARANCE_DEFAULT,enabled:true,...preset});}
    if(el.dataset.profileMode)change({mode:el.dataset.profileMode});
    if(el.hasAttribute('data-profile-reset')){clearInvalid();change(PROFILE_APPEARANCE_DEFAULT);}
    if(el.hasAttribute('data-profile-cancel')){clearInvalid();draft={...committed};status.textContent='';render();}
    if(el.hasAttribute('data-profile-save')&&!invalid()&&dirty()){
      const saving={...draft}, savingOwner=owner;busy=true;status.textContent=labels.saving;render();
      try {
        const saved=await save(saving,savingOwner);
        if(String(getProfile()?.id||'')!==savingOwner)return;
        committed=normalizeProfileAppearance(saved);draft={...committed};onSaved(committed);status.textContent=labels.saved;
      } catch {status.textContent=labels.error;}
      finally {busy=false;render();}
    }
  });
  render();
  return { refresh() {const latest=getProfile()||{};if(busy)return;if(String(latest.id||'')!==owner||!dirty()){profile=latest;owner=String(profile.id||'');committed=normalizeProfileAppearance(profile.profile_appearance);draft={...committed};clearInvalid();status.textContent='';render();}} };
}
