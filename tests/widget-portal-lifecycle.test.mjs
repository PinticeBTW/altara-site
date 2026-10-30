import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const sourcePath = new URL('../app/widgets/widget-marketplace-client.tsx', import.meta.url);

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Run the actual component's effect and JSX, replacing only React scheduling,
// its external module and auth boundary. No account, network or storage is used.
function fixture({ developers = true, initialActor, constructError = false, source = fs.readFileSync(sourcePath, 'utf8') } = {}) {
  const hooks = [], effects = [], callbacks = new Set(), modules = [], sessions = [], markets = [];
  const host = { children: [], inert: false, replaceChildren(...children) { this.children = children; } };
  const timers = new Map();
  let hook = 0, dirty = false, tree, mounted = true, time = 0, timerId = 0, inAuth = false, unsubscriptions = 0;
  const settings = { constructError, openError: false, disposeError: false, unsubscribeError: false, initialActor };
  const jsx = (type, props) => ({ type, props: props || {} });
  function nodes(node) {
    if (Array.isArray(node)) return node.flatMap(value => nodes(value));
    if (!node || typeof node !== 'object') return [];
    return [node, ...nodes(node.props?.children)];
  }
  const react = {
    useRef(initial) { const slot = hook++; return hooks[slot] ||= { current: initial }; },
    useState(initial) {
      const slot = hook++;
      if (!(slot in hooks)) hooks[slot] = initial;
      return [hooks[slot], value => { assert.ok(mounted, 'no state updates after unmount'); hooks[slot] = typeof value === 'function' ? value(hooks[slot]) : value; dirty = true; }];
    },
    useEffect(run, dependencies) {
      const slot = hook++, previous = hooks[slot];
      if (!previous || dependencies.some((value, index) => !Object.is(value, previous.dependencies[index]))) {
        hooks[slot] = { dependencies, cleanup: previous?.cleanup };
        effects.push(() => { hooks[slot].cleanup?.(); hooks[slot].cleanup = run(); });
      }
    },
  };
  const client = { auth: {
    getSession() { const session = deferred(); sessions.push(session); return session.promise; },
    onAuthStateChange(callback) {
      callbacks.add(callback);
      if (settings.initialActor !== undefined) callback('INITIAL_SESSION', sessionFor(settings.initialActor));
      return { data: { subscription: { unsubscribe() { callbacks.delete(callback); unsubscriptions++; if (settings.unsubscribeError) throw new Error('private subscription detail'); } } } };
    },
  } };
  const widgetModule = { createWidgetMarketplace(options) {
    assert.equal(inAuth, false, 'runtime starts after the Supabase auth callback returns');
    const market = { options, disposed: 0, opened: '',
      open(tab) { if (settings.openError) throw new Error('private runtime detail'); this.opened = tab; host.children = ['market']; },
      dispose() { this.disposed++; if (settings.disposeError) throw new Error('private cleanup detail'); host.replaceChildren(); },
    };
    markets.push(market); return market;
  } };
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    transformers: { before: [context => root => {
      const visit = node => ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
        ? ts.factory.createCallExpression(ts.factory.createIdentifier('__loadWidgetModule'), undefined, node.arguments)
        : ts.visitEachChild(node, visit, context);
      return ts.visitNode(root, visit);
    }] },
  }).outputText;
  const exports = {};
  const scope = { exports, URL, window: { location: { href: 'https://portal.example.com/developers/widgets', pathname: '/developers/widgets', search: '' } },
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, at: time + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    __loadWidgetModule(url) { const pendingImport = { ...deferred(), url }; modules.push(pendingImport); return pendingImport.promise; },
    require(id) {
      if (id === 'react') return react;
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (id.endsWith('supabase-browser')) return { getSupabaseBrowserClient() { if (settings.constructError) throw new Error('private auth detail'); return client; } };
      return {};
    },
  };
  vm.runInNewContext(compiled, scope, { filename: path.basename(sourcePath.pathname) });
  function render() {
    hook = 0; dirty = false;
    tree = exports.WidgetMarketplaceClient({ developers });
    for (const node of nodes(tree)) if (node.props.ref) node.props.ref.current = host;
    for (const effect of effects.splice(0)) effect();
  }
  async function flush() { for (let index = 0; index < 8; index++) { await Promise.resolve(); if (dirty) render(); } }
  async function advance(ms) {
    const destination = time + ms;
    while (true) {
      const next = [...timers.entries()].filter(([, timer]) => timer.at <= destination).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      time = next[1].at; timers.delete(next[0]); next[1].fn(); await flush();
    }
    time = destination; await flush();
  }
  function emit(actor, event = 'SIGNED_IN') {
    inAuth = true;
    try { for (const callback of callbacks) callback(event, sessionFor(actor)); } finally { inAuth = false; }
  }
  function unmount() { mounted = false; for (const value of hooks) value?.cleanup?.(); }
  render();
  return { settings, host, modules, sessions, markets, widgetModule, callbacks, scope, emit, flush, advance, unmount,
    get unsubscriptions() { return unsubscriptions; }, get timerCount() { return timers.size; },
    text(role) { return nodes(tree).filter(node => node.props?.role === role).map(node => nodes(node.props.children).length ? '' : node.props.children).flat().join(''); },
    retry() { const button = nodes(tree).find(node => node.type === 'button' && node.props.children === 'Try again'); assert.ok(button, 'retry is visible'); button.props.onClick(); },
    replayEffect() { for (const value of hooks) if (value?.dependencies) value.dependencies = []; dirty = true; },
  };
}

function sessionFor(actor) { return actor ? { user: { id: actor } } : null; }
const sessionResult = actor => ({ data: { session: sessionFor(actor) }, error: null });
async function ready(f, actor = 'seller-a') { f.modules[0].resolve(f.widgetModule); f.sessions[0].resolve(sessionResult(actor)); await f.flush(); }

test('bootstrap shows loading instead of an empty studio while module or session is pending', async () => {
  for (const pending of ['module', 'session']) {
    const f = fixture();
    assert.match(f.text('status'), /Loading/);
    if (pending === 'module') f.sessions[0].resolve(sessionResult('seller-a'));
    else f.modules[0].resolve(f.widgetModule);
    await f.flush();
    assert.equal(f.markets.length, 0);
    assert.match(f.text('status'), /Loading/);
    await f.advance(15000);
    assert.match(f.text('alert'), /taking too long/);
    assert.equal(f.text('status'), '');
    f.retry(); await f.flush();
    assert.equal(f.modules[1].url, '/widget-assets/widgetMarketplace.js?retry=1', 'explicit retry bypasses a rejected top-level import');
    const oldModule = f.modules[0], oldSession = f.sessions[0];
    oldModule.resolve(f.widgetModule); oldSession.resolve(sessionResult('obsolete-seller')); await f.flush();
    assert.equal(f.markets.length, 0, 'late timed-out attempt cannot mount');
    f.modules[1].resolve(f.widgetModule); f.sessions[1].resolve(sessionResult('seller-b')); await f.flush();
    assert.equal(f.markets[0].options.getUserId(), 'seller-b');
    assert.equal(f.markets[0].opened, 'developers');
    assert.equal(f.text('alert'), ''); assert.equal(f.text('status'), '');
    f.unmount(); assert.equal(f.timerCount, 0); assert.equal(f.unsubscriptions, 2);
  }
});

test('import and account failures provide retry without refreshing or altering login', async () => {
  for (const failure of ['import', 'session-error', 'session-rejected']) {
    const f = fixture();
    if (failure === 'import') f.modules[0].reject(new Error('private module URL'));
    else if (failure === 'session-error') f.sessions[0].resolve({ data: { session: null }, error: new Error('private auth detail') });
    else f.sessions[0].reject(new Error('private token detail'));
    await f.flush();
    assert.match(f.text('alert'), /Could not/); assert.doesNotMatch(f.text('alert'), /private/);
    f.retry(); await f.flush();
    f.modules[1].resolve(f.widgetModule); f.sessions[1].resolve(sessionResult('buyer-a')); await f.flush();
    assert.equal(f.markets[0].options.getUserId(), 'buyer-a');
    assert.equal(f.scope.window.location.href, 'https://portal.example.com/developers/widgets');
    f.unmount();
  }
});

test('an auth event wins over a stale session result or rejection and renders outside the auth lock', async () => {
  for (const stale of ['result', 'rejection']) {
    const f = fixture(); f.modules[0].resolve(f.widgetModule); await f.flush();
    f.emit('seller-current');
    assert.equal(f.markets.length, 0, 'auth callback does not construct the runtime');
    if (stale === 'result') f.sessions[0].resolve(sessionResult('seller-old'));
    else f.sessions[0].reject(new Error('old failed request'));
    await f.flush(); await f.advance(0);
    assert.equal(f.markets.length, 1); assert.equal(f.markets[0].options.getUserId(), 'seller-current');
    assert.equal(f.text('alert'), ''); f.unmount();
  }
});

test('a synchronous initial auth event is authoritative before getSession starts', async () => {
  const f = fixture({ initialActor: 'current-seller' });
  f.modules[0].resolve(f.widgetModule); f.sessions[0].resolve(sessionResult('stale-seller'));
  await f.flush(); await f.advance(0);
  assert.equal(f.markets.length, 1); assert.equal(f.markets[0].options.getUserId(), 'current-seller');
  f.unmount();
});

test('client initialization errors recover through retry without exposing configuration', async () => {
  const f = fixture({ constructError: true });
  await f.flush();
  assert.match(f.text('alert'), /Could not check your account/);
  f.settings.constructError = false; f.retry(); await f.flush();
  f.modules[1].resolve(f.widgetModule); f.sessions[0].resolve(sessionResult('seller-a')); await f.flush();
  assert.equal(f.markets[0].options.getUserId(), 'seller-a'); f.unmount();
});

test('effect replay cleans the first subscription and ignores its pending work', async () => {
  const f = fixture();
  f.replayEffect(); await f.flush();
  f.modules[0].resolve(f.widgetModule); f.sessions[0].resolve(sessionResult('obsolete-seller')); await f.flush();
  assert.equal(f.markets.length, 0); assert.equal(f.unsubscriptions, 1);
  f.modules[1].resolve(f.widgetModule); f.sessions[1].resolve(sessionResult('seller-a')); await f.flush();
  assert.equal(f.markets[0].options.getUserId(), 'seller-a'); f.unmount();
  assert.equal(f.unsubscriptions, 2); assert.equal(f.timerCount, 0);
});

test('same-user token events preserve the mounted studio and pending publication form', async () => {
  const f = fixture(); await ready(f);
  const market = f.markets[0]; f.host.children.push('unsaved form');
  f.emit('seller-a', 'TOKEN_REFRESHED'); await f.advance(0);
  assert.equal(f.markets.length, 1); assert.equal(market.disposed, 0);
  assert.deepEqual(f.host.children, ['market', 'unsaved form']); f.unmount();
});

test('identity changes make the old host inert, coalesce events and retire the previous account', async () => {
  const f = fixture(); await ready(f);
  const old = f.markets[0];
  f.emit('seller-b'); f.emit('buyer-c');
  assert.equal(f.host.inert, true);
  await f.advance(0);
  assert.equal(old.disposed, 1); assert.equal(f.markets.length, 2);
  assert.equal(f.markets[1].options.getUserId(), 'buyer-c'); assert.equal(f.host.inert, false);
  f.emit(null, 'SIGNED_OUT'); await f.advance(0);
  assert.equal(f.markets[1].disposed, 1); assert.equal(f.markets[2].options.getUserId(), '');
  f.unmount(); assert.equal(f.markets[2].options.getUserId(), '', 'disposed runtime cannot retain an actor');
});

test('runtime opening exceptions clean partial content and offer a working retry', async () => {
  const f = fixture(); f.settings.openError = true; await ready(f);
  assert.match(f.text('alert'), /Could not open/); assert.deepEqual(f.host.children, []);
  assert.equal(f.markets[0].disposed, 1); assert.equal(f.markets[0].options.getUserId(), '');
  f.settings.openError = false; f.retry(); await f.flush();
  f.modules[1].resolve(f.widgetModule); f.sessions[1].resolve(sessionResult('seller-a')); await f.flush();
  assert.equal(f.markets[1].opened, 'developers'); assert.equal(f.text('alert'), ''); f.unmount();
});

test('unmount ignores queued auth, session and module completions and unsubscribes once', async () => {
  const f = fixture(); const oldCallback = [...f.callbacks][0];
  f.emit('seller-a'); f.unmount();
  oldCallback('SIGNED_IN', sessionFor('seller-b'));
  f.modules[0].resolve(f.widgetModule); f.sessions[0].reject(new Error('late session error'));
  await f.advance(15000);
  assert.equal(f.markets.length, 0); assert.equal(f.unsubscriptions, 1); assert.equal(f.timerCount, 0);
});

test('failed runtime disposal clears the host, invalidates old callbacks and still recovers', async () => {
  const f = fixture(); await ready(f); const old = f.markets[0];
  f.settings.disposeError = true; f.emit('seller-b'); await f.advance(0);
  assert.match(f.text('alert'), /Could not reset widgets/); assert.deepEqual(f.host.children, []);
  assert.equal(old.options.getUserId(), '', 'old runtime cannot inherit the next identity');
  f.settings.disposeError = false; f.retry(); await f.flush();
  f.modules[1].resolve(f.widgetModule); f.sessions[1].resolve(sessionResult('seller-b')); await f.flush();
  assert.equal(f.markets[1].options.getUserId(), 'seller-b'); assert.equal(old.options.getUserId(), '');
  f.unmount(); assert.equal(f.unsubscriptions, 2);
});

test('unmount tolerates runtime and subscription cleanup errors after invalidating the effect', async () => {
  const f = fixture(); await ready(f); const old = f.markets[0];
  f.settings.disposeError = f.settings.unsubscribeError = true;
  assert.doesNotThrow(() => f.unmount());
  assert.deepEqual(f.host.children, []); assert.equal(old.options.getUserId(), '');
  assert.equal(f.unsubscriptions, 1); assert.equal(f.timerCount, 0);
});

test('public marketplace keeps its guest surface and selected widget login return path', async () => {
  const f = fixture({ developers: false }); await ready(f, null);
  const market = f.markets[0];
  assert.equal(market.opened, 'explore'); assert.equal(market.options.surface, 'marketplace');
  market.options.requestSignIn('widget-1');
  assert.equal(f.scope.window.location.href, '/login.html?return_to=%2Fdevelopers%2Fwidgets%3Fwidget%3Dwidget-1');
  f.unmount();
});
