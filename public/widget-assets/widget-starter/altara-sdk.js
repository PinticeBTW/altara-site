// Optional SDK for hosted ALTARA widgets. No account tokens or identifiers are
// exposed. The parent grants a dedicated port scoped to this widget installation.
let port, sequence = 0, resolveReady;
const pending = new Map();
const ready = new Promise(resolve => { resolveReady = resolve; });
window.addEventListener('message', event => {
  if (event.source !== window.parent || event.data?.type !== 'altara:widget:connect' || event.data.version !== 1 || !event.ports[0]) return;
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
export const altara = Object.freeze({ ready, storage: Object.freeze({ get: key => request('storage.get', key), set: (key, value) => request('storage.set', key, value), delete: key => request('storage.delete', key) }) });
