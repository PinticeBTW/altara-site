#!/usr/bin/env node
import { open, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { validateCommunityThemePackage } from '../lib/communityThemePackages.js';
import { canonicalThemeJson } from '../lib/themeCanonical.js';

async function readSource(file, limit) {
  const handle = await open(file, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > limit) throw Error('Theme source must be a regular file within the package/CSS size limit.');
    const buffer = Buffer.alloc(limit + 1);
    let total = 0;
    while (total < buffer.length) {
      const { bytesRead } = await handle.read(buffer, total, buffer.length - total, null);
      if (!bytesRead) break;
      total += bytesRead;
    }
    if (total > limit) throw Error('Theme source exceeds the package/CSS size limit.');
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, total)); }
    catch { throw Error('Theme source must contain valid UTF-8 text.'); }
  } finally { await handle.close(); }
}

export async function runThemePackage(args, { cwd = process.cwd(), stdout = process.stdout } = {}) {
  const usage = 'Usage: node scripts/theme-package.mjs --check theme.altara-theme.json\n       node scripts/theme-package.mjs --build metadata.json theme.css output.altara-theme.json';
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { stdout.write(usage + '\n'); return; }
  let value, destination;
  if (args[0] === '--check' && args.length === 2) {
    value = await readSource(path.resolve(cwd, args[1]), 1536 * 1024);
  } else if (args[0] === '--build' && args.length === 4) {
    const metadata = JSON.parse(await readSource(path.resolve(cwd, args[1]), 1536 * 1024));
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw Error('Metadata must be a JSON object.');
    const allowed = new Set(['format', 'apiVersion', 'name', 'author', 'version', 'description', 'assets', 'layout']);
    if (Object.keys(metadata).some(key => !allowed.has(key))) throw Error('Metadata contains unsupported fields. CSS must come from the separate CSS file.');
    value = { ...metadata, css: await readSource(path.resolve(cwd, args[2]), 96 * 1024) };
    destination = path.resolve(cwd, args[3]);
  } else throw Error(usage);
  const safe = validateCommunityThemePackage(value), text = canonicalThemeJson(safe);
  if (destination) {
    // Never replace an author's existing source or package. Choose a new filename
    // for a rebuilt version; validation happens before the exclusive creation.
    await writeFile(destination, text, { encoding: 'utf8', flag: 'wx' });
  }
  stdout.write(JSON.stringify({ valid: true, name: safe.name, version: safe.version, apiVersion: safe.apiVersion,
    bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex'), ...(destination ? { file: destination } : {}) }, null, 2) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runThemePackage(process.argv.slice(2)).catch(error => { process.stderr.write(`Theme package: ${error.message}\n`); process.exitCode = 1; });
}
