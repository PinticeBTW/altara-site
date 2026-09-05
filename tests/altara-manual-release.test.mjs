import assert from 'node:assert/strict';
import test from 'node:test';
import { ALTARA_MANUAL_RELEASE, ALTARA_MANUAL_ASSETS } from '../app/lib/altara-manual-release.ts';
import {
  resolveManualLinuxRelease, resolveManualWindowsRelease,
  resolveLinuxRelease, resolveWindowsRelease,
  createManualLinuxArtifactRedirectResponse, createManualWindowsArtifactRedirectResponse,
  fetchLatestLinuxRelease, LinuxReleaseResolutionError,
} from '../app/lib/altara-linux-release.ts';
import { createPlatformAwareDownloadResponse } from '../app/lib/altara-download-platform.ts';

const prefix = 'https://github.com/PinticeBTW/altara-updates/releases/download/v0.1.127/';
function payload() {
  return {
    id: ALTARA_MANUAL_RELEASE.id, tag_name: 'v0.1.127',
    url: ALTARA_MANUAL_RELEASE.apiUrl, html_url: ALTARA_MANUAL_RELEASE.htmlUrl,
    draft: false, prerelease: true, published_at: '2026-09-05T21:00:00Z',
    assets: Object.entries(ALTARA_MANUAL_ASSETS).map(([name, pin]) => ({
      name, ...pin, state: 'uploaded', browser_download_url: prefix + name,
    })),
  };
}
const fetchPayload = p => async () => Response.json(p);
const quiet = { error() {} };
const denied = fn => assert.throws(fn, error => error instanceof LinuxReleaseResolutionError);

test('manual contract resolves only the six verified 0.1.127 package/document assets', () => {
  assert.equal(Object.keys(ALTARA_MANUAL_ASSETS).length, 6);
  const linux = resolveManualLinuxRelease(payload());
  assert.equal(linux.version, '0.1.127');
  assert.equal(linux.appImage.filename, 'Altara-0.1.127-x86_64.AppImage');
  assert.equal(linux.deb.filename, 'Altara-0.1.127-amd64.deb');
  assert.equal(linux.portable.filename, 'Altara.0.1.127.tar.gz');
  assert.equal(linux.checksum.filename, 'SHA256SUMS-linux-0.1.127.txt');
  assert.equal(linux.readme.filename, 'README-LINUX-0.1.127.txt');
  assert.equal(linux.updateMetadata, null);
  assert.equal(resolveManualWindowsRelease(payload()).application.filename, 'Altara.Setup.0.1.127.exe');
});

test('stable policy still rejects the manual prerelease', () => {
  denied(() => resolveLinuxRelease(payload()));
  denied(() => resolveWindowsRelease(payload()));
});

test('manual policy rejects different release IDs, tags, repositories, draft or stable substitutions', () => {
  for (const change of [
    { id: 1 }, { tag_name: 'v0.1.128' }, { draft: true }, { prerelease: false },
    { url: 'https://api.github.com/repos/Other/altara-updates/releases/383373982' },
    { html_url: 'https://github.com/Other/altara-updates/releases/tag/v0.1.127' },
    { published_at: null },
  ]) {
    denied(() => resolveManualLinuxRelease({ ...payload(), ...change }));
    denied(() => resolveManualWindowsRelease({ ...payload(), ...change }));
  }
});

test('every selected asset requires exact uploaded size and digest; no guessed availability', () => {
  for (const name of Object.keys(ALTARA_MANUAL_ASSETS)) {
    for (const change of [{ state: 'new' }, { size: 0 }, { size: 1 }, { digest: undefined }, { digest: 'sha256:' + '0'.repeat(64) }]) {
      const p = payload(); Object.assign(p.assets.find(a => a.name === name), change);
      denied(() => resolveManualLinuxRelease(p));
      denied(() => resolveManualWindowsRelease(p));
    }
  }
});

test('manual destinations reject protocol, host, repository, tag, filename and query injection', () => {
  for (const destination of [
    prefix.replace('https:', 'http:') + 'Altara.Setup.0.1.127.exe',
    prefix.replace('github.com', 'evil.example') + 'Altara.Setup.0.1.127.exe',
    prefix.replace('PinticeBTW', 'Other') + 'Altara.Setup.0.1.127.exe',
    prefix.replace('v0.1.127', 'v0.1.125') + 'Altara.Setup.0.1.127.exe',
    prefix + 'other.exe', prefix + 'Altara.Setup.0.1.127.exe?redirect=evil',
  ]) {
    const p = payload(); p.assets.find(a => a.name.endsWith('.exe')).browser_download_url = destination;
    denied(() => resolveManualWindowsRelease(p));
  }
  const p = payload(); p.assets[0].browser_download_url = 'https://evil.example/asset';
  const name = p.assets[0].name;
  denied(() => name.endsWith('.exe') ? resolveManualWindowsRelease(p) : resolveManualLinuxRelease(p));
});

test('missing platform asset denies that route without redirecting to another release', async () => {
  for (const [name, kind, fallback] of [
    ['Altara-0.1.127-amd64.deb', 'deb', '/download/linux?status=deb-unavailable'],
    ['Altara-0.1.127-x86_64.AppImage', 'appimage', '/download/linux?status=appimage-unavailable'],
    ['Altara.0.1.127.tar.gz', 'portable', '/download/linux?status=portable-unavailable'],
  ]) {
    const p = payload(); p.assets = p.assets.filter(a => a.name !== name);
    const response = await createManualLinuxArtifactRedirectResponse(kind, fetchPayload(p), quiet);
    assert.equal(response.headers.get('location'), fallback);
  }
  const p = payload(); p.assets = p.assets.filter(a => !a.name.endsWith('.exe'));
  assert.equal((await createManualWindowsArtifactRedirectResponse(fetchPayload(p), quiet)).headers.get('location'), '/downloads?status=windows-unavailable');
});

test('duplicate packages fail; unreviewed legacy checksum or updater manifest is never selected', () => {
  const duplicate = payload(); duplicate.assets.push(duplicate.assets.find(a => a.name.endsWith('.AppImage')));
  denied(() => resolveManualLinuxRelease(duplicate));
  const p = payload(); p.assets = p.assets.filter(a => !a.name.startsWith('SHA256SUMS'));
  for (const name of ['latest-linux.yml', 'Altara.0.1.127.tar.gz.sha256', 'Altara-0.1.127-arm64.AppImage'])
    p.assets.push({ name, size: 123, state: 'uploaded', browser_download_url: prefix + name });
  const result = resolveManualLinuxRelease(p);
  assert.equal(result.checksum, null);
  assert.equal(result.updateMetadata, null);
});

test('platform routing composes real manual resolver, exact API and private redirects', async () => {
  const requests = [];
  const fetcher = async (url, init) => { requests.push({ url, init }); return Response.json(payload()); };
  for (const [ua, filename] of [
    ['Mozilla/5.0 Windows NT 10.0; Win64; x64', 'Altara.Setup.0.1.127.exe'],
    ['Mozilla/5.0 X11; Ubuntu; Linux x86_64', 'Altara-0.1.127-amd64.deb'],
    ['Mozilla/5.0 X11; Linux x86_64', 'Altara-0.1.127-x86_64.AppImage'],
  ]) {
    const r = await createPlatformAwareDownloadResponse(new Headers({ 'User-Agent': ua }), {
      windows: () => createManualWindowsArtifactRedirectResponse(fetcher, quiet),
      linuxDebian: () => createManualLinuxArtifactRedirectResponse('debian', fetcher, quiet),
      linuxGeneric: () => createManualLinuxArtifactRedirectResponse('application', fetcher, quiet),
    });
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), prefix + filename);
    assert.equal(r.headers.get('cache-control'), 'private, no-store');
    assert.equal(r.headers.get('vary'), 'Sec-CH-UA-Platform, User-Agent');
  }
  assert.equal(requests.length, 3);
  for (const request of requests) {
    assert.equal(request.url, ALTARA_MANUAL_RELEASE.tagApiUrl);
    assert.deepEqual(request.init.next.tags, ['altara-manual-release-0.1.127']);
  }
});

test('manual API failure retains safe fallback; stable fetch still uses releases/latest', async () => {
  const fail = async () => new Response('', { status: 503 });
  const result = await createManualWindowsArtifactRedirectResponse(fail, quiet);
  assert.equal(result.headers.get('location'), '/downloads?status=windows-unavailable');
  let requested;
  await assert.rejects(fetchLatestLinuxRelease(async url => { requested = url; return Response.json(payload()); }));
  assert.equal(requested, 'https://api.github.com/repos/PinticeBTW/altara-updates/releases/latest');
});
