import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 5173), clients = new Set();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const reloadScript = `<script>new EventSource('/__altara_reload').onmessage=()=>location.reload();</script>`;
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); res.end(); return; }
  if (pathname === '/__altara_reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Connection': 'keep-alive' });
    res.write(': ready\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep) || path.relative(root, file).split(path.sep).some(part => part.startsWith('.'))) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(file); res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
    if (ext === '.html') data = Buffer.from(data.toString().replace('</body>', reloadScript + '</body>'));
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});
let debounce;
const watcher = fs.watch(root, { recursive: true }, (_event, file) => {
  if (!file || file.includes('node_modules') || file.startsWith('.')) return;
  clearTimeout(debounce); debounce = setTimeout(() => { for (const client of clients) client.write('data: reload\n\n'); }, 150);
});
server.listen(port, '127.0.0.1', () => console.log(`ALTARA widget: http://localhost:${port}/manifest.json\nPaste this link in ALTARA → Edit widgets → Add widget. Save a file to reload the preview.`));
server.on('error', error => { console.error(error.message); watcher.close(); process.exitCode = 1; });
process.on('SIGINT', () => { watcher.close(); for (const client of clients) client.end(); server.close(); });
