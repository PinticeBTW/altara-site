import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../public');
for (const route of ['index.html', '404.html', 'oauth2/authorize/index.html']) {
  test(`application assets resolve from the nested route ${route}`, () => {
    const html = readFileSync(path.join(root, 'app', route), 'utf8');
    const base = new URL(`/app/${route}`, 'https://altara.example');
    const tags = html.match(/<(?:script|link|img)\b[^>]*>/gi) || [];
    let checked = 0;
    for (const tag of tags) {
      const value = tag.match(/\b(?:src|href)=["']([^"']+)["']/)?.[1];
      if (!value || /^(?:https?:|data:|blob:)/.test(value)) continue;
      const url = new URL(value.replaceAll('&amp;', '&'), base);
      assert.equal(existsSync(path.join(root, decodeURIComponent(url.pathname))), true, `${route}: ${value}`);
      checked++;
    }
    assert.ok(checked >= 8);
    assert.match(html, /href="\/app\/style\.css\?v=bot-inbox-controls-v10"/);
  });
}
