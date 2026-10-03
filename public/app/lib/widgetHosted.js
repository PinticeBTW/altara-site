import { snapshotFields, snapshotDocument, MAX_SNAPSHOT_BYTES } from './widgetSnapshot.js';
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
// Fetch text only. A creator's release is never executed in the publishing page.
export async function fetchWidgetRelease(value, { signal, fetcher = fetch } = {}) {
  const url = widgetUrl(value);
  const controller = new AbortController(), abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, 8000);
  try {
    const response = await fetcher(url.href, { signal: controller.signal, credentials: 'omit', redirect: 'error', mode: 'cors', cache: 'no-store', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw Error(`Release request failed (${response.status}).`);
    if (!/^text\/html\b/i.test(response.headers.get('content-type') || '')) throw Error('Use the release.html link, not the manifest or a download page.');
    if (Number(response.headers.get('content-length')) > MAX_SNAPSHOT_BYTES) throw Error('The release must be at most 512 KB.');
    const reader = response.body.getReader(), chunks = []; let size = 0;
    while (true) {
      const { value: chunk, done } = await reader.read(); if (done) break;
      size += chunk.byteLength;
      if (size > MAX_SNAPSHOT_BYTES) { await reader.cancel(); throw Error('The release must be at most 512 KB.'); }
      chunks.push(chunk);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    if (error.name === 'AbortError') throw Error('Release loading was cancelled or timed out.');
    if (error instanceof TypeError) throw Error('Could not load release.html. Check the link and CORS, or choose the HTML file.');
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
export function widgetUrl(value, { development = false, appOrigin = globalThis.location?.origin } = {}) {
  if (typeof value !== 'string' || value.length > 2048) throw Error('Enter a valid manifest URL.');
  let url; try { url = new URL(value); } catch { throw Error('Enter a full URL, including https://.'); }
  const host = url.hostname.toLowerCase();
  const local = LOOPBACK.has(host);
  if (url.username || url.password || url.hash) throw Error('Widget URLs cannot include passwords or fragments.');
  if (url.origin === appOrigin) throw Error('Host the widget separately from ALTARA.');
  if (local) {
    if (!development || !['http:', 'https:'].includes(url.protocol)) throw Error('Localhost is only available for private testing.');
  } else if (url.protocol !== 'https:' || !host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') || /\.(localhost|local|internal)$/.test(host)) {
    throw Error('Published widgets need a public HTTPS address.');
  }
  return url;
}

export function validateHostedWidget(input, options = {}) {
  if (!input || input.sdkVersion !== 2 || input.kind !== 'hosted') throw Error('Unsupported hosted widget format.');
  const text = (key, max) => {
    const value = input[key];
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw Error(`Invalid widget ${key}.`);
    return value.trim();
  };
  const name = text('name', 60), description = text('description', 240), version = text('version', 32);
  if (!/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(version)) throw Error('Use a version such as 1.0.0.');
  const manifest = widgetUrl(input.manifest_url, options), entry = widgetUrl(input.entry_url, options);
  if (manifest.origin !== entry.origin) throw Error('The widget page and manifest must use the same origin.');
  let icon;
  if (input.icon_url != null && input.icon_url !== '') {
    icon = widgetUrl(input.icon_url, options);
    if (icon.origin !== manifest.origin) throw Error('The widget icon must use the same origin as its manifest.');
  }
  const permissions = input.permissions ?? [];
  if (!Array.isArray(permissions) || permissions.length > 2 || new Set(permissions).size !== permissions.length || permissions.some(p => !['storage', 'network'].includes(p))) throw Error('Supported permissions: storage, network.');
  return { kind: 'hosted', sdkVersion: 2, name, description, version, manifest_url: manifest.href, entry_url: entry.href, permissions: [...permissions], ...(icon ? { icon_url: icon.href } : {}), ...snapshotFields(input) };
}

export async function fetchWidgetManifest(value, { development = false, signal, fetcher = fetch, appOrigin = globalThis.location?.origin } = {}) {
  const url = widgetUrl(value, { development, appOrigin });
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 8000);
  try {
    const response = await fetcher(url.href, { signal: controller.signal, credentials: 'omit', redirect: 'error', mode: 'cors', cache: 'no-store', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw Error(`Manifest request failed (${response.status}).`);
    if (Number(response.headers.get('content-length')) > 65536) throw Error('The manifest is too large.');
    const reader = response.body.getReader(), chunks = []; let size = 0;
    while (true) {
      const { value: chunk, done } = await reader.read(); if (done) break;
      size += chunk.byteLength;
      if (size > 65536) { await reader.cancel(); throw Error('The manifest is too large.'); }
      chunks.push(chunk);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let manifest; try { manifest = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw Error('The manifest must be valid JSON.'); }
    if (manifest.manifest_version !== 1 || typeof manifest.entry !== 'string') throw Error('Use manifest_version: 1 and an entry page.');
    if (manifest.icon != null && (typeof manifest.icon !== 'string' || manifest.icon.length > 2048)) throw Error('Use an image URL for the widget icon.');
    return validateHostedWidget({ kind: 'hosted', sdkVersion: 2, name: manifest.name, description: manifest.description, version: manifest.version, manifest_url: url.href, entry_url: new URL(manifest.entry, url).href, permissions: manifest.permissions ?? [], ...(manifest.icon ? { icon_url: new URL(manifest.icon, url).href } : {}) }, { development, appOrigin });
  } catch (error) {
    if (error.name === 'AbortError') throw Error('Manifest loading was cancelled or timed out.');
    if (error instanceof TypeError) throw Error('Could not load the manifest. Check the URL, HTTPS and CORS headers.');
    throw error;
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}

// Hosted HTML remains an opaque sandbox origin, including after redirects. Never
// add allow-same-origin: an external page could redirect to ALTARA's own origin.
export function mountHostedWidget(container, input, { state = {}, onState = () => {}, development = false } = {}) {
  const pkg = validateHostedWidget(input, { development });
  const frame = document.createElement('iframe');
  frame.title = `${pkg.name} widget`; frame.className = 'communityWidgetFrame';
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  // Best-effort cookie isolation in supporting browsers; the sandbox is still required.
  frame.setAttribute('credentialless', '');
  frame.setAttribute('allow', "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; payment 'none'; usb 'none'; display-capture 'none'");
  let alive = true, port, requests = 0, windowStart = Date.now(), attempt = 0, request, loadTimer;
  const local = LOOPBACK.has(new URL(pkg.entry_url).hostname);
  const tr = (en, pt) => /^pt\b/i.test(document.documentElement.lang) ? pt : en;
  const panel = document.createElement('div'); panel.className = 'widgetLoadStatus'; panel.setAttribute('role', 'status');
  function message(title, description, retry = false) {
    panel.replaceChildren();
    const heading = document.createElement('strong'); heading.textContent = title;
    const detail = document.createElement('p'); detail.textContent = description;
    panel.append(heading, detail); container.replaceChildren(panel);
    if (retry) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn ghost';
      button.textContent = tr('Try again', 'Tentar novamente'); button.onclick = load; panel.append(button);
    }
  }
  function failed() {
    if (!alive) return;
    clearTimeout(loadTimer); detachPort(); frame.remove(); frame.removeAttribute('src'); frame.removeAttribute('srcdoc');
    message(local ? tr('Local widget is offline', 'O widget local está desligado') : tr('Could not load this widget', 'Não foi possível carregar este widget'), local
      ? tr('Start its development server, or install the online version from the catalog. Publishing does not replace this local installation.', 'Inicia o servidor de desenvolvimento ou instala a versão online pelo catálogo. Publicar não substitui esta instalação local.')
      : pkg.snapshot_html ? tr('The saved release could not be verified or opened. Try again, or reinstall it from the Marketplace.', 'Não foi possível verificar ou abrir a versão guardada. Tenta novamente ou reinstala pelo Marketplace.') : tr('Its host may be unavailable or blocking access. Check your connection and try again.', 'O alojamento pode estar indisponível ou a bloquear o acesso. Verifica a ligação e tenta novamente.'), true);
  }
  async function load() {
    if (!alive) return;
    const ticket = ++attempt; request?.abort(); request = new AbortController(); clearTimeout(loadTimer); detachPort(); frame.remove();
    message(tr('Loading widget…', 'A carregar widget…'), new URL(pkg.entry_url).hostname);
    try {
      // Probe the required CORS manifest before opening an opaque frame: iframe
      // load events also fire for browser error pages and cannot prove success.
      if (pkg.snapshot_html) {
        const document = await snapshotDocument(pkg);
        if (!alive || ticket !== attempt) return;
        frame.srcdoc = document;
      } else {
        await fetchWidgetManifest(pkg.manifest_url, { development, signal: request.signal });
        if (!alive || ticket !== attempt) return;
        frame.src = pkg.entry_url;
      }
      if (!alive || ticket !== attempt) return;
      frame.hidden = true; container.append(frame);
      loadTimer = setTimeout(failed, 15000);
    } catch { if (alive && ticket === attempt) failed(); }
  }
  let saved = JSON.parse(JSON.stringify(state));
  function detachPort() { if (port) { port.onmessage = null; port.close(); port = null; } }
  frame.onload = () => {
    if (!alive || !frame.isConnected || (!frame.hasAttribute('src') && !frame.hasAttribute('srcdoc'))) return;
    clearTimeout(loadTimer); panel.remove(); frame.hidden = false;
    detachPort(); requests = 0; windowStart = Date.now();
    const channel = new MessageChannel(); port = channel.port1;
    port.onmessage = ({ data }) => {
      if (!alive || !data || typeof data.id !== 'string' || data.id.length > 80) return;
      if (Date.now() - windowStart > 1000) { requests = 0; windowStart = Date.now(); }
      if (++requests > 60) { detachPort(); return; }
      const reply = { id: data.id };
      try {
        if (JSON.stringify(data).length > 18000) throw Error('Request is too large.');
        if (!pkg.permissions.includes('storage')) throw Error('This widget has not requested storage permission.');
        if (typeof data.key !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(data.key)) throw Error('Invalid storage key.');
        if (data.method === 'storage.get') reply.value = Object.hasOwn(saved, data.key) ? saved[data.key] : null;
        else if (data.method === 'storage.set' || data.method === 'storage.delete') {
          const next = { ...saved };
          if (data.method === 'storage.delete') delete next[data.key];
          else Object.defineProperty(next, data.key, { value: data.value, enumerable: true, configurable: true, writable: true });
          const serialized = JSON.stringify(next);
          if (serialized.length > 16384) throw Error('Widget storage is full (16 KB).');
          const normalized = JSON.parse(serialized); onState(normalized); saved = normalized; reply.value = true;
        } else throw Error('Unsupported SDK method.');
      } catch (error) { reply.error = error.message; }
      port?.postMessage(reply);
    };
    port.start();
    frame.contentWindow.postMessage({ type: 'altara:widget:connect', version: 1, permissions: pkg.permissions }, '*', [channel.port2]);
  };
  frame.onerror = failed;
  void load();
  return { frame, dispose() { alive = false; attempt++; request?.abort(); clearTimeout(loadTimer); frame.onload = null; frame.onerror = null; detachPort(); frame.remove(); panel.remove(); } };
}
