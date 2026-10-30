// Optional SDK for hosted ALTARA widgets. No account tokens or identifiers are
// exposed. The parent grants a dedicated port scoped to this widget installation.
/* ALTARA widget appearance: generated start */
// Generated from lib/widgetAppearance.js. Run scripts/sync-widget-appearance.cjs after source changes.
const WIDGET_APPEARANCE_CSS = "\nhtml[data-altara-widget-appearance=\"auto\"] { color-scheme:var(--altara-widget-color-scheme); }\nhtml[data-altara-widget-appearance=\"auto\"] body { background-color:transparent!important; color:var(--altara-widget-text)!important; font-family:var(--altara-widget-font-family)!important; font-size:var(--altara-widget-font-size)!important; line-height:var(--altara-widget-line-height)!important; }\nhtml[data-altara-widget-appearance=\"auto\"] :is(button,input,select,textarea) { font-family:var(--altara-widget-font-family)!important; font-size:var(--altara-widget-font-size)!important; color:var(--altara-widget-text)!important; accent-color:var(--altara-widget-accent)!important; }\nhtml[data-altara-widget-appearance=\"auto\"] :where(button,select,textarea,input:not([type=\"checkbox\"]):not([type=\"radio\"]):not([type=\"range\"]):not([type=\"color\"]):not([type=\"file\"]):not([type=\"hidden\"])) { background-color:var(--altara-widget-input)!important; border:var(--altara-widget-border-width) solid var(--altara-widget-border)!important; border-radius:var(--altara-widget-radius)!important; padding:calc(var(--altara-widget-spacing) * .4) calc(var(--altara-widget-spacing) * .7)!important; min-height:var(--altara-widget-control-height); }\nhtml[data-altara-widget-appearance=\"auto\"] button { background-color:var(--altara-widget-surface-raised)!important; }\nhtml[data-altara-widget-appearance=\"auto\"] :is(a,progress) { color:var(--altara-widget-accent)!important; accent-color:var(--altara-widget-accent)!important; }\nhtml[data-altara-widget-appearance=\"auto\"] :is(small,figcaption,.muted,[data-altara-widget-role=\"muted\"]) { color:var(--altara-widget-muted)!important; }\nhtml[data-altara-widget-appearance=\"auto\"] :is(fieldset,details,article,section,aside,.card,.panel,[data-altara-widget-role=\"surface\"]) { background-color:var(--altara-widget-surface)!important; color:var(--altara-widget-text)!important; border-color:var(--altara-widget-border)!important; border-radius:var(--altara-widget-radius)!important; }\nhtml[data-altara-widget-appearance=\"auto\"] :is(.column,.row) { gap:var(--altara-widget-spacing)!important; }\nhtml[data-altara-widget-appearance=\"auto\"] [data-altara-widget-role=\"accent\"] { background-color:var(--altara-widget-accent)!important; color:var(--altara-widget-accent-text)!important; }\nhtml[data-altara-widget-appearance=\"auto\"] :is(.success,[data-altara-widget-role=\"success\"]) { color:var(--altara-widget-success)!important; }\nhtml[data-altara-widget-appearance=\"auto\"] :is(.warning,[data-altara-widget-role=\"warning\"]) { color:var(--altara-widget-warning)!important; }\nhtml[data-altara-widget-appearance=\"auto\"] :is(.error,[role=\"alert\"],[data-altara-widget-role=\"danger\"]) { color:var(--altara-widget-danger)!important; }\nhtml[data-altara-widget-appearance=\"auto\"] [aria-invalid=\"true\"] { border-color:var(--altara-widget-danger)!important; }\nhtml[data-altara-widget-appearance=\"auto\"] :is(button,input,select,textarea,a,[tabindex]):focus-visible { outline:2px solid var(--altara-widget-accent)!important; outline-offset:2px!important; }\nhtml[data-altara-widget-appearance=\"auto\"] :is(input,textarea)::placeholder { color:var(--altara-widget-muted)!important; opacity:1!important; }\nhtml[data-altara-widget-appearance=\"auto\"][data-altara-widget-reduced-motion=\"true\"] *,html[data-altara-widget-appearance=\"auto\"][data-altara-widget-reduced-motion=\"true\"] *::before,html[data-altara-widget-appearance=\"auto\"][data-altara-widget-reduced-motion=\"true\"] *::after { animation-duration:.01ms!important; animation-iteration-count:1!important; transition-duration:.01ms!important; scroll-behavior:auto!important; }\n";
function normalizeWidgetAppearance(input) {
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
function installWidgetAppearance(doc) {
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
/* ALTARA widget appearance: generated end */
const appearanceRuntime = installWidgetAppearance(document);
let port, sequence = 0, resolveReady;
const pending = new Map();
const ready = new Promise(resolve => { resolveReady = resolve; });
window.addEventListener('message', event => {
  if (event.source !== window.parent || event.data?.version !== 1) return;
  if (event.data.type === 'altara:widget:appearance') {
    const appearance = normalizeWidgetAppearance(event.data.appearance);
    if (appearance) appearanceRuntime.apply(appearance);
    return;
  }
  if (event.data.type !== 'altara:widget:connect' || !event.ports?.[0]) return;
  const appearance = normalizeWidgetAppearance(event.data.appearance);
  if (appearance) appearanceRuntime.apply(appearance);
  port?.close(); port = event.ports[0];
  port.onmessage = ({ data }) => {
    const task = pending.get(data?.id); if (!task) return;
    pending.delete(data.id); clearTimeout(task.timer);
    if (data.error) task.reject(Error(data.error)); else task.resolve(data.value);
  };
  port.start(); resolveReady({ permissions: [...(event.data.permissions || [])] });
});
function request(method, key, value) {
  return new Promise((resolve, reject) => {
    const id = String(++sequence);
    const timer = setTimeout(() => { pending.delete(id); reject(Error('ALTARA did not respond. Open this widget inside ALTARA and check its permissions.')); }, 5000);
    pending.set(id, { resolve, reject, timer });
    ready.then(() => {
      if (!pending.has(id)) return;
      try { port.postMessage({ id, method, key, value }); }
      catch (error) { pending.delete(id); clearTimeout(timer); reject(error); }
    });
  });
}
export const altara = Object.freeze({
  ready,
  appearance: Object.freeze({ get: () => appearanceRuntime.get(), subscribe: listener => appearanceRuntime.subscribe(listener) }),
  storage: Object.freeze({ get: key => request('storage.get', key), set: (key, value) => request('storage.set', key, value), delete: key => request('storage.delete', key) })
});
