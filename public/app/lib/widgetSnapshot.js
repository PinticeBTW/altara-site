export const MAX_SNAPSHOT_BYTES = 524288;
export function snapshotFields(input) {
  if (input.snapshot_html == null && input.snapshot_sha256 == null) return {};
  if (typeof input.snapshot_html !== 'string' || !input.snapshot_html.trim()
    || new TextEncoder().encode(input.snapshot_html).length > MAX_SNAPSHOT_BYTES
    || !/^[a-f0-9]{64}$/.test(input.snapshot_sha256 || '')) throw Error('Invalid fixed widget release (maximum 512 KB).');
  return { snapshot_html: input.snapshot_html, snapshot_sha256: input.snapshot_sha256 };
}
async function digest(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const hashSource = async text => `'sha256-${btoa(String.fromCharCode(...await digest(text)))}'`;
function inspect(html) {
  // Template contents are inert: inspecting an uploaded release must not run code
  // or load its images, frames or scripts into the publishing page.
  const template = document.createElement('template'); template.innerHTML = html;
  if (template.content.querySelector('script[src],link[rel="stylesheet"],iframe,frame,object,embed,base,meta[http-equiv]')) {
    throw Error('Use one self-contained HTML file: inline its scripts and styles, and remove frames, base tags and HTTP meta tags.');
  }
  for (const node of template.content.querySelectorAll('*')) {
    if (Array.from(node.attributes).some(attr => /^on/i.test(attr.name))) throw Error('Use addEventListener instead of HTML event attributes.');
    for (const attr of ['src', 'srcset', 'href', 'poster']) {
      const value = node.getAttribute(attr);
      if (value && !value.startsWith('data:') && !value.startsWith('#')) throw Error('Embed images, fonts and media as data URLs. Network APIs can be called from JavaScript.');
    }
  }
  return template;
}
export async function createWidgetSnapshot(pkg, html) {
  const snapshot = snapshotFields({ snapshot_html: html, snapshot_sha256: hex(await digest(html)) });
  inspect(html);
  return { ...pkg, ...snapshot };
}
export async function snapshotDocument(pkg) {
  const snapshot = snapshotFields(pkg);
  if (hex(await digest(snapshot.snapshot_html)) !== snapshot.snapshot_sha256) throw Error('The saved widget release failed its integrity check.');
  const template = inspect(snapshot.snapshot_html);
  const hashes = await Promise.all(Array.from(template.content.querySelectorAll('script'), script => hashSource(script.textContent)));
  // Network is a release permission, so a publisher cannot turn it on for an
  // already-installed snapshot. Live development previews are a separate mode.
  const connections = pkg.permissions?.includes('network') ? 'https:' : "'none'";
  const common = `default-src 'none'; script-src ${hashes.join(' ') || "'none'"}; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src ${connections}; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';`;
  const inner = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${common} frame-src 'none';"><meta name="referrer" content="no-referrer">${template.innerHTML}`;
  // A separate opaque parent confines child navigation to local blobs. The
  // widget cannot edit this frame's CSP or obtain the application's DOM/bridge.
  const source = `const child=document.createElement('iframe');child.sandbox='allow-scripts';child.referrerPolicy='no-referrer';child.setAttribute('allow',"camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; payment 'none'; usb 'none'; display-capture 'none'");child.title='Fixed widget release';let ready=false,pending;function forward(){if(ready&&pending){child.contentWindow.postMessage(pending.data,'*',pending.ports);pending=null;}}window.addEventListener('message',e=>{if(e.source===parent&&e.data?.type==='altara:widget:connect'&&e.ports.length){pending={data:e.data,ports:[e.ports[0]]};forward();}});child.onload=()=>{ready=true;forward();};child.src=URL.createObjectURL(new Blob([${JSON.stringify(inner).replace(/</g, '\\u003c')}],{type:'text/html'}));document.body.append(child);`;
  const policy = common.replace(/script-src [^;]+;/, `script-src ${[...hashes, await hashSource(source)].join(' ')};`);
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy} frame-src blob:;"><meta name="referrer" content="no-referrer"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#1d1c1a}iframe{display:block;width:100%;height:100%;border:0}</style><body><script>${source}</script></body>`;
}
