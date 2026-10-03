import { altara } from './altara-sdk.js';

const output = document.querySelector('#count');
const status = document.querySelector('#status');
let count = 0, connected = false;
const draw = () => { output.textContent = String(count); };

// Your UI is an ordinary web page. The SDK is only needed for ALTARA features.
if (window.parent !== window) {
  altara.ready.then(async () => {
    try {
      count = Number(await altara.storage.get('count')) || 0;
      connected = true; draw(); status.textContent = 'Saved in this widget on this device.';
    } catch (error) { status.textContent = error.message; }
  });
} else status.textContent = 'Standalone preview. Open in ALTARA to save progress.';

let saveQueue = Promise.resolve();
function update(next) {
  count = next; draw();
  if (connected) saveQueue = saveQueue.then(() => altara.storage.set('count', next)).catch(error => { status.textContent = error.message; });
}
document.querySelector('#increment').onclick = () => update(count + 1);
document.querySelector('#reset').onclick = () => update(0);
