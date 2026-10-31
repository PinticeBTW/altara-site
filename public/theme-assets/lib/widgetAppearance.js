// A closed, presentation-only protocol shared by native and isolated widgets.
// These two functions are also embedded in the dependency-free hosted SDK.
export function normalizeWidgetAppearance(input) {
  const keys = ['version','active','colorScheme','colors','fontFamily','fontSize','lineHeight','radius','spacing','controlHeight','borderWidth','blur','shadow','reducedMotion','reducedTransparency'];
  const colorKeys = ['background','surface','surfaceRaised','input','text','muted','accent','accentText','border','success','warning','danger'];
  const fonts = ['"Segoe UI", system-ui, sans-serif','Arial, Helvetica, sans-serif','Georgia, "Times New Roman", serif','Consolas, "SFMono-Regular", monospace'];
  const record = (value, names) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return Reflect.ownKeys(descriptors).length === names.length && names.every(key => descriptors[key] && Object.hasOwn(descriptors[key], 'value'));
  };
  const color = value => typeof value === 'string' && value.length <= 100 && (
    /^#(?:[a-f\d]{3}|[a-f\d]{4}|[a-f\d]{6}|[a-f\d]{8})$/i.test(value) ||
    /^(?:rgb|rgba|hsl|hsla)\([\d\s.,%+\-/]+\)$/i.test(value) ||
    /^(?:oklch|oklab|lch|lab)\([\d\s.%+\-/]+\)$/i.test(value) ||
    /^color\((?:srgb|srgb-linear|display-p3) [\d\s.%+\-/]+\)$/i.test(value)
  );
  try {
    if (!record(input, keys) || !record(input.colors, colorKeys) || input.version !== 1 ||
      !['active','reducedMotion','reducedTransparency'].every(key => typeof input[key] === 'boolean') ||
      !['dark','light'].includes(input.colorScheme) || !fonts.includes(input.fontFamily) || !colorKeys.every(key => color(input.colors[key]))) return null;
    const limits = {fontSize:[10,24],lineHeight:[1,2],radius:[0,32],spacing:[4,32],controlHeight:[24,64],borderWidth:[0,3],blur:[0,24],shadow:[0,48]};
    for (const [key,[min,max]] of Object.entries(limits)) if (typeof input[key] !== 'number' || !Number.isFinite(input[key]) || input[key] < min || input[key] > max) return null;
    const result = {};
    for (const key of keys) result[key] = key === 'colors' ? Object.freeze(Object.fromEntries(colorKeys.map(name => [name,input.colors[name]]))) : input[key];
    return Object.freeze(result);
  } catch { return null; }
}

export const WIDGET_APPEARANCE_CSS = `
html[data-altara-widget-appearance="auto"] { color-scheme:var(--altara-widget-color-scheme); }
html[data-altara-widget-appearance="auto"] body { background-color:transparent!important; color:var(--altara-widget-text)!important; font-family:var(--altara-widget-font-family)!important; font-size:var(--altara-widget-font-size)!important; line-height:var(--altara-widget-line-height)!important; }
html[data-altara-widget-appearance="auto"] :is(button,input,select,textarea) { font-family:var(--altara-widget-font-family)!important; font-size:var(--altara-widget-font-size)!important; color:var(--altara-widget-text)!important; accent-color:var(--altara-widget-accent)!important; }
html[data-altara-widget-appearance="auto"] :where(button,select,textarea,input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="file"]):not([type="hidden"])) { background-color:var(--altara-widget-input)!important; border:var(--altara-widget-border-width) solid var(--altara-widget-border)!important; border-radius:var(--altara-widget-radius)!important; padding:calc(var(--altara-widget-spacing) * .4) calc(var(--altara-widget-spacing) * .7)!important; min-height:var(--altara-widget-control-height); }
html[data-altara-widget-appearance="auto"] button { background-color:var(--altara-widget-surface-raised)!important; }
html[data-altara-widget-appearance="auto"] :is(a,progress) { color:var(--altara-widget-accent)!important; accent-color:var(--altara-widget-accent)!important; }
html[data-altara-widget-appearance="auto"] :is(small,figcaption,.muted,[data-altara-widget-role="muted"]) { color:var(--altara-widget-muted)!important; }
html[data-altara-widget-appearance="auto"] :is(fieldset,details,article,section,aside,.card,.panel,[data-altara-widget-role="surface"]) { background-color:var(--altara-widget-surface)!important; color:var(--altara-widget-text)!important; border-color:var(--altara-widget-border)!important; border-radius:var(--altara-widget-radius)!important; }
html[data-altara-widget-appearance="auto"] :is(.column,.row) { gap:var(--altara-widget-spacing)!important; }
html[data-altara-widget-appearance="auto"] [data-altara-widget-role="accent"] { background-color:var(--altara-widget-accent)!important; color:var(--altara-widget-accent-text)!important; }
html[data-altara-widget-appearance="auto"] :is(.success,[data-altara-widget-role="success"]) { color:var(--altara-widget-success)!important; }
html[data-altara-widget-appearance="auto"] :is(.warning,[data-altara-widget-role="warning"]) { color:var(--altara-widget-warning)!important; }
html[data-altara-widget-appearance="auto"] :is(.error,[role="alert"],[data-altara-widget-role="danger"]) { color:var(--altara-widget-danger)!important; }
html[data-altara-widget-appearance="auto"] [aria-invalid="true"] { border-color:var(--altara-widget-danger)!important; }
html[data-altara-widget-appearance="auto"] :is(button,input,select,textarea,a,[tabindex]):focus-visible { outline:2px solid var(--altara-widget-accent)!important; outline-offset:2px!important; }
html[data-altara-widget-appearance="auto"] :is(input,textarea)::placeholder { color:var(--altara-widget-muted)!important; opacity:1!important; }
html[data-altara-widget-appearance="auto"][data-altara-widget-reduced-motion="true"] *,html[data-altara-widget-appearance="auto"][data-altara-widget-reduced-motion="true"] *::before,html[data-altara-widget-appearance="auto"][data-altara-widget-reduced-motion="true"] *::after { animation-duration:.01ms!important; animation-iteration-count:1!important; transition-duration:.01ms!important; scroll-behavior:auto!important; }
`;

export function installWidgetAppearance(doc) {
  const key = Symbol.for('altara.widget.appearance.v1');
  if (doc[key]) return doc[key];
  let current = null, signature = '', style = null, disposed = false;
  const listeners = new Set();
  const names = {surfaceRaised:'surface-raised',accentText:'accent-text',fontFamily:'font-family',fontSize:'font-size',lineHeight:'line-height',controlHeight:'control-height',borderWidth:'border-width'};
  const clear = () => { style?.remove(); style = null; doc.documentElement.removeAttribute('data-altara-widget-appearance'); doc.documentElement.removeAttribute('data-altara-widget-reduced-motion'); };
  const runtime = Object.freeze({
    apply(input) {
      if (disposed) return false;
      const appearance = normalizeWidgetAppearance(input);
      if (!appearance) return false;
      const next = JSON.stringify(appearance);
      if (next === signature) return true;
      signature = next; current = appearance;
      if (!appearance.active) clear();
      else {
        const values = {...appearance.colors,fontFamily:appearance.fontFamily,fontSize:appearance.fontSize+'px',lineHeight:appearance.lineHeight,radius:appearance.radius+'px',spacing:appearance.spacing+'px',controlHeight:appearance.controlHeight+'px',borderWidth:appearance.borderWidth+'px',blur:(appearance.reducedTransparency ? 0 : appearance.blur)+'px',shadow:appearance.shadow+'px','color-scheme':appearance.colorScheme};
        const declarations = Object.entries(values).map(([name,value]) => `--altara-widget-${names[name] || name}:${value}`).join(';');
        if (!style) { style = doc.createElement('style'); style.setAttribute('data-altara-widget-appearance-style','1'); (doc.head || doc.documentElement).append(style); }
        // Values have passed the closed schema above: no author CSS or resources.
        style.textContent = `html[data-altara-widget-appearance="auto"]{${declarations}}\n${WIDGET_APPEARANCE_CSS}`;
        doc.documentElement.setAttribute('data-altara-widget-appearance','auto');
        doc.documentElement.setAttribute('data-altara-widget-reduced-motion',String(appearance.reducedMotion));
      }
      for (const listener of listeners) { try { listener(current); } catch { /* One creator listener cannot block delivery to others. */ } }
      return true;
    },
    get: () => current,
    subscribe(listener) {
      if (typeof listener !== 'function') throw TypeError('Expected an appearance listener.');
      listeners.add(listener); if (current) listener(current);
      return () => listeners.delete(listener);
    },
    dispose() { if (disposed) return; disposed = true; clear(); listeners.clear(); current = null; signature = ''; if (doc[key] === runtime) delete doc[key]; }
  });
  Object.defineProperty(doc,key,{value:runtime,configurable:true});
  return runtime;
}

export function widgetAppearanceBootstrapSource() {
  return `(()=>{const normalizeWidgetAppearance=${normalizeWidgetAppearance.toString()};const WIDGET_APPEARANCE_CSS=${JSON.stringify(WIDGET_APPEARANCE_CSS)};const installWidgetAppearance=${installWidgetAppearance.toString()};const appearance=installWidgetAppearance(document);window.addEventListener('message',event=>{if(event.source!==parent||event.data?.version!==1||!['altara:widget:appearance','altara:widget:connect','start'].includes(event.data.type))return;appearance.apply(event.data.appearance);});})();`;
}

const brokers = new WeakMap();
const sensitiveSelector = '.altaraConfirmDialog:not(.hidden):not([hidden]),.modal:not(.hidden):not([hidden]),#profileOverlay:not(.hidden):not([hidden]),dialog[open],[data-theme-sensitive="true"]:not(.hidden):not([hidden])';
const sensitiveCandidate = '.altaraConfirmDialog,.modal,#profileOverlay,dialog,[data-theme-sensitive]';
const defaults = {background:'#101010',surface:'#20201e',surfaceRaised:'#2b2a27',input:'#181817',text:'#eeeae4',muted:'#b2aaa0',accent:'#e8cda7',accentText:'#251c16',border:'#514a42',success:'#6fc58c',warning:'#e7b86b',danger:'#ed8686'};

const nativeScope = 'body[data-altara-community-theme]:not(.authPage):not(:has('+sensitiveSelector+')) .app';
const nativeWidgetCss = `
${nativeScope} [data-theme-slot="widget-card"] {
  --altara-surface:var(--altara-widget-resolved-surface);--altara-surface-elevated:var(--altara-widget-resolved-surface-raised);--altara-input:var(--altara-widget-resolved-input);
  --altara-text:var(--altara-widget-resolved-text);--altara-text-soft:var(--altara-widget-resolved-muted);--altara-text-muted:var(--altara-widget-resolved-muted);
  --altara-accent:var(--altara-widget-resolved-accent);--altara-accent-strong:var(--altara-widget-resolved-accent);--altara-accent-soft:color-mix(in srgb,var(--altara-widget-resolved-accent) 16%,transparent);--altara-accent-text:var(--altara-widget-resolved-accent-text);
  --altara-border:var(--altara-widget-resolved-border);--altara-border-strong:var(--altara-widget-resolved-border);--altara-success:var(--altara-widget-resolved-success);--altara-warning:var(--altara-widget-resolved-warning);--altara-danger:var(--altara-widget-resolved-danger);
  --surface-1:var(--altara-widget-resolved-surface);--surface-2:var(--altara-widget-resolved-surface-raised);--text-main:var(--altara-widget-resolved-text);--text-soft:var(--altara-widget-resolved-muted);--text-muted:var(--altara-widget-resolved-muted);--stroke:var(--altara-widget-resolved-border);--stroke-strong:var(--altara-widget-resolved-border);--accent:var(--altara-widget-resolved-accent);--font-display:var(--altara-widget-resolved-font-family);
  background-color:var(--altara-widget-resolved-surface);background-image:none;color:var(--altara-widget-resolved-text);
  border-color:var(--altara-widget-resolved-border);border-width:var(--altara-widget-resolved-border-width);border-radius:var(--altara-widget-resolved-radius);
  font-family:var(--altara-widget-resolved-font-family);font-size:var(--altara-widget-resolved-font-size);line-height:var(--altara-widget-resolved-line-height);
  padding:var(--altara-widget-resolved-spacing);gap:calc(var(--altara-widget-resolved-spacing) * .65);
  backdrop-filter:blur(var(--altara-widget-resolved-blur));-webkit-backdrop-filter:blur(var(--altara-widget-resolved-blur));
  box-shadow:0 6px var(--altara-widget-resolved-shadow) rgba(0,0,0,.18);
}
${nativeScope} [data-theme-slot="widget-card"] :is(.widgetCard__value,.widgetCard__label,[data-theme-slot="widget-title"]) {color:var(--altara-widget-resolved-text);font-family:inherit;}
${nativeScope} [data-theme-slot="widget-card"] :is(.widgetCard__meta,small,[data-altara-widget-role="muted"]) {color:var(--altara-widget-resolved-muted);}
${nativeScope} [data-theme-slot="widget-card"] :is(button,input,select,textarea) {font-family:var(--altara-widget-resolved-font-family);color:var(--altara-widget-resolved-text);accent-color:var(--altara-widget-resolved-accent);}
${nativeScope} [data-theme-slot="widget-card"] :where(.btn,button:not(.widgetCardTool):not(.widgetResizeHandle),select,textarea,input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="file"]):not([type="hidden"])) {background-color:var(--altara-widget-resolved-input);background-image:none;border-color:var(--altara-widget-resolved-border);border-radius:var(--altara-widget-resolved-radius);}
${nativeScope} [data-theme-slot="widget-card"] :is(.btn.primary,[data-altara-widget-role="accent"]) {background-color:var(--altara-widget-resolved-accent);color:var(--altara-widget-resolved-accent-text);}
${nativeScope} [data-theme-slot="widget-card"] [data-altara-widget-role="success"] {color:var(--altara-widget-resolved-success);}
${nativeScope} [data-theme-slot="widget-card"] [data-altara-widget-role="warning"] {color:var(--altara-widget-resolved-warning);}
${nativeScope} [data-theme-slot="widget-card"] [data-altara-widget-role="danger"] {color:var(--altara-widget-resolved-danger);}
${nativeScope} [data-theme-slot="widget-card"] :is(button,input,select,textarea,a,[tabindex]):focus-visible {outline:2px solid var(--altara-widget-resolved-accent);outline-offset:2px;}
`;

// Preview remains script-free and opaque. These fixed rules show the same
// shared tokens on synthetic native controls without running a widget/theme.
export function widgetThemePreviewCss() {
  const values = {...defaults,fontFamily:'"Segoe UI", system-ui, sans-serif',fontSize:'13px',lineHeight:'1.45',radius:'12px',spacing:'12px',controlHeight:'34px',borderWidth:'1px',blur:'12px',shadow:'18px'};
  const names = {surfaceRaised:'surface-raised',accentText:'accent-text',fontFamily:'font-family',fontSize:'font-size',lineHeight:'line-height',borderWidth:'border-width',controlHeight:'control-height'};
  const paletteFallbacks = {background:'--altara-bg',surface:'--altara-surface',surfaceRaised:'--altara-surface-elevated',input:'--altara-input',text:'--altara-text',muted:'--altara-text-muted',accent:'--altara-accent',accentText:'--ui-primary-text',border:'--altara-border',success:'--altara-success',warning:'--altara-warning',danger:'--altara-danger'};
  const declarations = Object.entries(values).map(([name,value])=>{
    const suffix = names[name] || name;
    const fallback = paletteFallbacks[name] ? `var(${paletteFallbacks[name]},${value})` : value;
    return `--altara-widget-preview-${suffix}:var(--altara-widget-${suffix},${fallback})`;
  }).join(';');
  const styles = nativeWidgetCss.replaceAll('--altara-widget-resolved-','--altara-widget-preview-');
  return `${nativeScope}{${declarations}}\n${styles}\n@media(prefers-reduced-transparency:reduce){body:not([data-altara-theme-transparency="glass"]) .app{--altara-widget-preview-blur:0px;--altara-widget-preview-surface:rgb(from var(--altara-widget-surface,#20201e) r g b)}}body[data-altara-theme-transparency="solid"] .app{--altara-widget-preview-blur:0px;--altara-widget-preview-surface:rgb(from var(--altara-widget-surface,#20201e) r g b)}`;
}

function nativeAppearanceLayer(doc) {
  let style = null;
  return { apply(appearance) {
    if (!appearance?.active) { style?.remove(); style = null; return; }
    const names = {surfaceRaised:'surface-raised',accentText:'accent-text',fontFamily:'font-family',fontSize:'font-size',lineHeight:'line-height',borderWidth:'border-width',controlHeight:'control-height'};
    const values = {...appearance.colors,fontFamily:appearance.fontFamily,fontSize:appearance.fontSize+'px',lineHeight:appearance.lineHeight,radius:appearance.radius+'px',spacing:appearance.spacing+'px',controlHeight:appearance.controlHeight+'px',borderWidth:appearance.borderWidth+'px',blur:appearance.blur+'px',shadow:appearance.shadow+'px'};
    if (!style) { style = doc.createElement('style'); style.setAttribute('data-altara-native-widget-appearance','1'); doc.head.insertBefore(style,doc.getElementById('altaraCommunityThemeStyle')); }
    const motion = appearance.reducedMotion ? `${nativeScope} [data-theme-slot="widget-card"],${nativeScope} [data-theme-slot="widget-card"] *,${nativeScope} [data-theme-slot="widget-card"] *::before,${nativeScope} [data-theme-slot="widget-card"] *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important;}` : '';
    style.textContent = `${nativeScope}{${Object.entries(values).map(([name,value])=>'--altara-widget-resolved-'+(names[name] || name)+':'+value).join(';')}}\n${nativeWidgetCss}\n${motion}`;
  },dispose() { style?.remove(); style = null; }};
}

function readAppearance(doc) {
  const win = doc.defaultView, app = doc.querySelector('.app') || doc.body || doc.documentElement;
  const css = win.getComputedStyle(app);
  const token = name => css.getPropertyValue('--altara-widget-'+name).trim();
  const probe = doc.createElement('span'); probe.hidden = true; probe.setAttribute('data-widget-appearance-probe','');
  // Resolves valid CSS colors once, without forwarding unresolved custom values.
  app.append(probe);
  const resolveColor = (value,fallback) => {
    if (!value || value.length > 200 || /url\s*\(|[;{}<>]/i.test(value) || !win.CSS?.supports('color',value)) return fallback;
    probe.style.color = value;
    return win.getComputedStyle(probe).color || fallback;
  };
  const fallbackTokens = {background:'--altara-bg',surface:'--altara-surface',surfaceRaised:'--altara-surface-elevated',input:'--altara-input',text:'--altara-text',muted:'--altara-text-muted',accent:'--altara-accent',accentText:'--ui-primary-text',border:'--altara-border',success:'--altara-success',warning:'--altara-warning',danger:'--altara-danger'};
  const kebab = value => value.replace(/[A-Z]/g,letter=>'-'+letter.toLowerCase());
  const colors = Object.fromEntries(Object.keys(defaults).map(name => [name,resolveColor(token(kebab(name)) || css.getPropertyValue(fallbackTokens[name]).trim(),defaults[name])]));
  probe.remove();
  const number = (name,fallback,min,max) => { const value = token(name); const parsed = /^\d+(?:\.\d+)?(?:px)?$/.test(value) ? parseFloat(value) : NaN; return Number.isFinite(parsed) ? Math.min(max,Math.max(min,parsed)) : fallback; };
  const preference = doc.body?.dataset.altaraThemeTransparency;
  const reducedTransparency = preference === 'solid' || (preference !== 'glass' && win.matchMedia?.('(prefers-reduced-transparency: reduce)').matches === true);
  if (reducedTransparency) for (const name of ['background','surface','surfaceRaised','input']) {
    // Flatten onto a dark/light base through the browser, preserving the hue.
    const canvas = doc.createElement('canvas'); canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d');
    if (context) { context.fillStyle = css.colorScheme === 'light' ? '#fff' : '#101010'; context.fillRect(0,0,1,1); context.fillStyle = colors[name]; context.fillRect(0,0,1,1); const rgb = context.getImageData(0,0,1,1).data; colors[name] = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`; }
  }
  const stack = token('font-family');
  const fontFamily = ['Arial, Helvetica, sans-serif','Georgia, "Times New Roman", serif','Consolas, "SFMono-Regular", monospace'].includes(stack) ? stack : '"Segoe UI", system-ui, sans-serif';
  return normalizeWidgetAppearance({version:1,active:Boolean(doc.body?.hasAttribute('data-altara-community-theme')) && !doc.body?.classList.contains('authPage') && !doc.querySelector(sensitiveSelector),colorScheme:token('color-scheme') === 'light' || css.colorScheme === 'light' ? 'light' : 'dark',colors,fontFamily,fontSize:number('font-size',13,10,24),lineHeight:number('line-height',1.45,1,2),radius:number('radius',12,0,32),spacing:number('spacing',12,4,32),controlHeight:number('control-height',34,24,64),borderWidth:number('border-width',1,0,3),blur:reducedTransparency ? 0 : number('blur',12,0,24),shadow:number('shadow',18,0,48),reducedMotion:win.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,reducedTransparency});
}

function createBroker(doc) {
  const win = doc.defaultView, listeners = new Set();
  let current = readAppearance(doc), signature = JSON.stringify(current), queued = null;
  const nativeLayer = nativeAppearanceLayer(doc); nativeLayer.apply(current);
  const refresh = () => {
    if (queued != null) { win.cancelAnimationFrame?.(queued); queued = null; }
    const next = readAppearance(doc), nextSignature = JSON.stringify(next);
    if (!next || signature === nextSignature) return;
    current = next; signature = nextSignature;
    nativeLayer.apply(current);
    for (const listener of listeners) { try { listener(current); } catch { /* Isolated delivery. */ } }
  };
  const schedule = () => { if (queued == null) queued = win.requestAnimationFrame ? win.requestAnimationFrame(refresh) : win.setTimeout(refresh,0); };
  const relevant = element => element?.nodeType === 1 && (element.matches(sensitiveCandidate) || element.querySelector(sensitiveCandidate));
  const observer = new win.MutationObserver(records => {
    const ownStyle = node => node?.nodeType === 1 && node.matches('[data-altara-native-widget-appearance]');
    if (records.some(record => !ownStyle(record.target) && !ownStyle(record.target.parentElement) && ((doc.head.contains(record.target) && !(record.target === doc.head && [...record.addedNodes,...record.removedNodes].every(ownStyle))) || (record.type === 'attributes' && ([doc.body,doc.documentElement,doc.querySelector('.app')].includes(record.target) || relevant(record.target))) || (record.type === 'childList' && [...record.addedNodes,...record.removedNodes].some(relevant))))) schedule();
  });
  observer.observe(doc.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden','open','data-theme','data-altara-community-theme','data-altara-theme-transparency','data-theme-sensitive']});
  const media = ['(prefers-reduced-motion: reduce)','(prefers-reduced-transparency: reduce)','(prefers-color-scheme: light)'].map(query => win.matchMedia?.(query)).filter(Boolean);
  media.forEach(query=>query.addEventListener?.('change',schedule)); win.addEventListener('resize',schedule);
  return {get:()=>current,refresh,subscribe(listener) {
    const deliver = value => listener(value); let subscribed = true;
    listeners.add(deliver); try { deliver(current); } catch { /* Match later isolated delivery. */ }
    return () => {
      if (!subscribed) return;
      subscribed = false; listeners.delete(deliver);
      if (!listeners.size) {
        observer.disconnect(); nativeLayer.dispose();
        if (queued != null) { win.cancelAnimationFrame?.(queued); win.clearTimeout(queued); }
        media.forEach(query=>query.removeEventListener?.('change',schedule)); win.removeEventListener('resize',schedule); brokers.delete(doc);
      }
    };
  }};
}

export function subscribeWidgetAppearance(doc,listener) {
  if (typeof listener !== 'function') throw TypeError('Expected an appearance listener.');
  let broker = brokers.get(doc);
  if (!broker) { broker = createBroker(doc); brokers.set(doc,broker); }
  return broker.subscribe(listener);
}
export function getWidgetAppearance(doc) { return brokers.get(doc)?.get() || readAppearance(doc); }
export function refreshWidgetAppearance(doc) { brokers.get(doc)?.refresh(); }
