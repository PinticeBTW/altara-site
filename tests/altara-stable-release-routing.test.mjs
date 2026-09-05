import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createLinuxArtifactRedirectResponse, createWindowsArtifactRedirectResponse, resolveLinuxRelease, resolveWindowsRelease } from '../app/lib/altara-linux-release.ts';
import { createPlatformAwareDownloadResponse } from '../app/lib/altara-download-platform.ts';
const api='https://api.github.com/repos/PinticeBTW/altara-updates/releases/latest';
const quiet={error(){}};
function release(version='0.1.127') {
 const tag=`v${version}`;
 return { tag_name:tag,draft:false,prerelease:false,published_at:'2026-09-05T21:07:23Z',assets:[`Altara.Setup.${version}.exe`,`Altara-${version}-x86_64.AppImage`,`Altara-${version}-amd64.deb`,`Altara.${version}.tar.gz`,`README-LINUX-${version}.txt`,`SHA256SUMS-linux-${version}.txt`].map(name=>({name,state:'uploaded',size:123,browser_download_url:`https://github.com/PinticeBTW/altara-updates/releases/download/${tag}/${name}`}))};
}
const responseFor=p=>async(url,init)=>{assert.equal(url,api);assert.deepEqual(init.next.tags,['altara-latest-stable-release']);return Response.json(p)};
async function route(platform,payload){const fetcher=responseFor(payload);return createPlatformAwareDownloadResponse(new Headers({'User-Agent':platform}),{windows:()=>createWindowsArtifactRedirectResponse(fetcher,quiet),linuxDebian:()=>createLinuxArtifactRedirectResponse('debian',fetcher,quiet),linuxGeneric:()=>createLinuxArtifactRedirectResponse('application',fetcher,quiet)});}
test('promoted 0.1.127 resolves through the stable website routes',async()=>{
 for(const [ua,file] of [['Windows NT 10.0','Altara.Setup.0.1.127.exe'],['X11; Ubuntu; Linux x86_64','Altara-0.1.127-amd64.deb'],['X11; Linux x86_64','Altara-0.1.127-x86_64.AppImage']]){
 const r=await route(ua,release());assert.equal(r.status,302);assert.equal(r.headers.get('location'),`https://github.com/PinticeBTW/altara-updates/releases/download/v0.1.127/${file}`);assert.equal(r.headers.get('cache-control'),'private, no-store');}
});
test('new stable release updates both platform resolution and displayed versions',async()=>{
 for(const version of ['0.1.127','0.1.128']){const p=release(version);assert.equal(resolveWindowsRelease(p).version,version);assert.equal(resolveLinuxRelease(p).version,version);const r=await route('Windows NT 10.0',p);assert.ok(r.headers.get('location').endsWith(`/v${version}/Altara.Setup.${version}.exe`));}
 const page=await readFile(new URL('../app/downloads/page.tsx',import.meta.url),'utf8');assert.match(page,/fetchLatestWindowsRelease\(\)/);assert.match(page,/fetchLatestLinuxRelease\(\)/);assert.match(page,/WindowsDownloadOption version=\{windowsRelease\?\.version\}/);assert.match(page,/LinuxDownloadOption version=\{linuxRelease\?\.version\}/);
});
test('stable website route still refuses prerelease and draft payloads',async()=>{
 for(const change of [{prerelease:true},{draft:true},{prerelease:undefined}]){const p={...release(),...change};assert.equal((await route('Windows NT 10.0',p)).headers.get('location'),'/downloads?status=windows-unavailable');assert.equal((await route('X11; Linux x86_64',p)).headers.get('location'),'/download/linux?status=unavailable');}
});
test('stable route refuses missing platform package and wrong repository or protocol',async()=>{
 const wrongs=['http://github.com/PinticeBTW/altara-updates/releases/download/v0.1.127/Altara.Setup.0.1.127.exe','https://github.com/Other/altara-updates/releases/download/v0.1.127/Altara.Setup.0.1.127.exe','https://example.org/Altara.Setup.0.1.127.exe'];
 for(const url of wrongs){const p=release();p.assets[0].browser_download_url=url;assert.equal((await route('Windows NT 10.0',p)).headers.get('location'),'/downloads?status=windows-unavailable');}
 const missing=release();missing.assets=missing.assets.filter(a=>!a.name.endsWith('.exe'));assert.equal((await route('Windows NT 10.0',missing)).headers.get('location'),'/downloads?status=windows-unavailable');
});
test('stable resolution retains safe fallback on network and malformed responses',async()=>{
 for(const fetcher of [async()=>{throw Error('network')},async()=>new Response('not json'),async()=>new Response('',{status:503})]){assert.equal((await createWindowsArtifactRedirectResponse(fetcher,quiet)).headers.get('location'),'/downloads?status=windows-unavailable');assert.equal((await createLinuxArtifactRedirectResponse('application',fetcher,quiet)).headers.get('location'),'/download/linux?status=unavailable');}
});
test('every active download route selects stable resolution, not a pinned prerelease',async()=>{
 const routes=['app/download/route.ts','app/api/download/windows/route.ts','app/api/download/linux/route.ts',...['appimage','deb','portable','readme','checksum'].map(k=>`app/api/download/linux/${k}/route.ts`)];
 for(const route of routes){const source=await readFile(new URL(`../${route}`,import.meta.url),'utf8');assert.doesNotMatch(source,/Manual|0\.1\.127/);assert.match(source,/create(?:Linux|Windows)ArtifactRedirectResponse/);}
 for(const filename of ['app/components/site-chrome.tsx','app/download/linux/page.tsx','app/downloads/page.tsx']){const source=await readFile(new URL(`../${filename}`,import.meta.url),'utf8');assert.doesNotMatch(source,/0\.1\.127|prerelease|This release does not enable/);}
});
