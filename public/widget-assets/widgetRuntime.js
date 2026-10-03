import { validateWidgetPackage } from './widgetPackages.js';

// Only this trusted renderer runs on the iframe's main thread. Creator code runs
// in a worker with an opaque origin and an inherited, network-denying CSP.
function sandboxRuntime() {
  const root = document.getElementById('view');
  let worker, timer, lastBeat = Date.now(), messageCount = 0, windowStart = Date.now(), started = false, stopped = false;
  const send = data => parent.postMessage(data, '*');
  const stop = message => {
    if (stopped) return;
    stopped = true;
    worker?.terminate(); clearInterval(timer); root.textContent = message;
    send({ type: 'runtime-error', message });
  };
  function render(node, budget = { left: 100 }, depth = 0) {
    if (!node || typeof node !== 'object' || --budget.left < 0 || depth > 8) throw Error('Invalid or oversized view.');
    const tags = { column: 'div', row: 'div', text: 'p', stat: 'strong', button: 'button', input: 'input', progress: 'progress' };
    if (!Object.hasOwn(tags, node.type)) throw Error('Unknown view component.');
    const el = document.createElement(tags[node.type]);
    el.className = node.type;
    if (node.tone === 'muted') el.classList.add('muted');
    if (node.type === 'input') {
      el.value = String(node.value ?? '').slice(0, 2000);
      el.placeholder = String(node.placeholder ?? '').slice(0, 120);
      el.setAttribute('aria-label', String(node.label || node.placeholder || 'Widget input').slice(0, 120));
      el.maxLength = 2000;
      el.onchange = () => worker?.postMessage({ type: 'action', action: String(node.action || '').slice(0, 80), value: el.value });
    } else if (node.type === 'progress') {
      el.max = 100; el.value = Math.min(100, Math.max(0, Number(node.value) || 0));
      el.setAttribute('aria-label', String(node.label || 'Progress').slice(0, 120));
    } else if (node.type === 'column' || node.type === 'row') {
      if (!Array.isArray(node.children) || node.children.length > 100) throw Error('Invalid children.');
      node.children.forEach(child => el.append(render(child, budget, depth + 1)));
    } else {
      el.textContent = String(node.text ?? '').slice(0, 2000);
      if (node.type === 'button') {
        el.type = 'button'; el.disabled = node.disabled === true;
        el.onclick = () => worker?.postMessage({ type: 'action', action: String(node.action || '').slice(0, 80) });
      }
    }
    return el;
  }
  function workerBootstrap(seed) {
    let state = Object.assign(Object.create(null), seed), actionHandler = () => {};
    const send = postMessage.bind(self);
    // Creator code cannot fan out additional workers or communicate with another
    // instance through a shared browser channel.
    for (const name of ['Worker', 'SharedWorker', 'BroadcastChannel']) Object.defineProperty(self, name, { value: undefined, writable: false, configurable: false });
    addEventListener('unhandledrejection', event => { event.preventDefault(); send({ type: 'code-error', message: String(event.reason?.message || 'Unhandled promise rejection.').slice(0, 180) }); });
    self.altara = Object.freeze({
      version: 1,
      render: view => send({ type: 'render', view }),
      onAction: handler => { if (typeof handler !== 'function') throw Error('Expected an action handler.'); actionHandler = handler; },
      storage: Object.freeze({
        get: key => state[String(key)],
        set: (key, value) => {
          key = String(key);
          if (!/^[a-zA-Z0-9_-]{1,64}$/.test(key)) throw Error('Invalid storage key.');
          const next = { ...state, [key]: value };
          if (JSON.stringify(next).length > 16384) throw Error('Widget storage is full (16 KB).');
          state = next; send({ type: 'state', state });
        }
      })
    });
    addEventListener('message', event => { if (event.data?.type === 'action') actionHandler(event.data.action, event.data.value); });
    setInterval(() => send({ type: 'heartbeat' }), 500);
    send({ type: 'heartbeat' });
  }
  addEventListener('message', event => {
    if (event.source !== parent || started || event.data?.type !== 'start') return;
    started = true;
    try {
      const { code, state } = event.data;
      if (typeof code !== 'string' || code.length > 65536) throw Error('Invalid widget code.');
      const source = `(${workerBootstrap.toString()})(${JSON.stringify(state || {})});\n${code}\n//# sourceURL=altara-widget.js`;
      const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      worker = new Worker(url); URL.revokeObjectURL(url);
      worker.onerror = event => { event.preventDefault(); stop(`Widget error: ${String(event.message || 'Code could not run.').slice(0, 180)}`); };
      worker.onmessage = ({ data }) => {
        if (stopped) return;
        try {
          if (Date.now() - windowStart > 1000) { windowStart = Date.now(); messageCount = 0; }
          if (++messageCount > 100) throw Error('Widget sent too many updates.');
          if (JSON.stringify(data).length > 32768) throw Error('Widget update is too large.');
          if (data.type === 'heartbeat') lastBeat = Date.now();
          else if (data.type === 'code-error') stop(`Widget error: ${String(data.message).slice(0, 180)}`);
          else if (data.type === 'render') root.replaceChildren(render(data.view));
          else if (data.type === 'state') {
            if (!data.state || Array.isArray(data.state) || typeof data.state !== 'object' || JSON.stringify(data.state).length > 16384) throw Error('Invalid widget storage.');
            send({ type: 'state', state: data.state });
          }
        } catch (error) { stop(error.message); }
      };
      timer = setInterval(() => { if (Date.now() - lastBeat > 4000) stop('Widget paused because its code stopped responding.'); }, 1000);
    } catch (error) { stop(error.message); }
  });
  send({ type: 'ready' });
}

export function mountWidgetRuntime(container, input, { state = {}, onState = () => {}, onError = () => {} } = {}) {
  const pkg = validateWidgetPackage(input), frame = document.createElement('iframe');
  frame.title = `${pkg.name} widget`; frame.className = 'communityWidgetFrame';
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  const csp = "default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; connect-src 'none'; style-src 'unsafe-inline'; img-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
  frame.srcdoc = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${csp}"><style>
    :root{color-scheme:dark;font:13px system-ui;color:#eae8e4}body{margin:0;padding:4px;overflow-wrap:anywhere}*{box-sizing:border-box}.column{display:flex;flex-direction:column;gap:12px}.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}p{margin:0}.muted{color:#aaa69f}.stat{font-size:38px;line-height:1.1}button,input{font:inherit;color:inherit;background:#232321;border:1px solid #3b3934;border-radius:9px;padding:9px 12px;max-width:100%}button{cursor:pointer}button:hover{border-color:#e8cda7}button:focus-visible,input:focus-visible{outline:2px solid #e8cda7}input{width:100%}progress{accent-color:#e8cda7;width:100%}
    </style></head><body><div id="view">Starting widget…</div><script>(${sandboxRuntime.toString()})();<\/script></body></html>`;
  let alive = true;
  const receive = event => {
    if (!alive || event.source !== frame.contentWindow) return;
    if (event.data?.type === 'ready') frame.contentWindow.postMessage({ type: 'start', code: pkg.code, state }, '*');
    if (event.data?.type === 'runtime-error') onError(String(event.data.message));
    if (event.data?.type === 'state') {
      state = event.data.state;
      try { onState(state); } catch (error) { onError(error.message); dispose(); container.textContent = 'Could not save widget data. Free some local storage and try again.'; }
    }
  };
  function dispose() { alive = false; window.removeEventListener('message', receive); frame.remove(); }
  window.addEventListener('message', receive); container.replaceChildren(frame);
  return { dispose, frame };
}
