import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const commerceDatabase = !!process.env.ALTARA_THEME_COMMERCE_PG_BIN && !!process.env.ALTARA_THEME_COMMERCE_PG_WORK;
const enabled = !!process.env.ALTARA_PTBR_PLAYWRIGHT && !!process.env.ALTARA_THEME_SITE_URL && (commerceDatabase || !!process.env.ALTARA_THEME_PG_BIN && !!process.env.ALTARA_THEME_PG_WORK);
const appSource = path.resolve(process.env.ALTARA_THEME_APP_SOURCE || '../ALTARA');
const staticSource = path.resolve(process.env.ALTARA_THEME_STATIC_SOURCE || appSource);
const actorA = '00000000-0000-4000-8000-000000000001', actorB = '00000000-0000-4000-8000-000000000002';
const authKey = 'sb-tbbgwjmmaiclkhssimhf-auth-token';
const sha256=value=>createHash('sha256').update(value).digest('hex');
const requiredModules=['communityThemeMarketplace.js','communityThemesUi.js','themeCommerce.js','widgetRefunds.js'].map(name=>'/theme-assets/lib/'+name);
function observeActualLocalAssets(context){
  const verifiedAssets=new Map(),pending=[],faults=[];
  context.on('response',response=>{
    const url=new URL(response.url());
    if(url.origin!==new URL(process.env.ALTARA_THEME_SITE_URL).origin||!url.pathname.startsWith('/theme-assets/')||!url.pathname.endsWith('.js'))return;
    const check=(async()=>{
      const source=path.resolve(staticSource,url.pathname.slice('/theme-assets/'.length));
      assert.equal(source.startsWith(staticSource+path.sep),true,'source fingerprint remains inside the frozen theme asset source');
      const headers=response.headers();
      if(response.status()===304){
        const previous=verifiedAssets.get(url.pathname);
        assert.ok(previous?.etag,'a native cache revalidation requires a previously fingerprinted 200 response');
        assert.equal((await response.request().allHeaders())['if-none-match'],previous.etag);
        assert.equal(headers.etag,previous.etag);
        previous.revalidated_304_count=(previous.revalidated_304_count||0)+1;
        return;
      }
      const body=await response.body(),expected=sha256(fs.readFileSync(source));
      assert.equal(response.status(),200);assert.equal(sha256(body),expected,'Next serves exact frozen JavaScript bytes: '+url.pathname);
      verifiedAssets.set(url.pathname,{sha256:expected,bytes:body.length,etag:headers.etag,content_type:headers['content-type'],csp:headers['content-security-policy']});
    })();
    pending.push(check);check.catch(error=>faults.push(error));
  });
  return {verifiedAssets,verify:async()=>{await Promise.allSettled(pending);assert.deepEqual(faults,[]);}};
}
async function syntheticFetchTransport(context,dispatch){
  // Keep Chromium's native module loading intact. Fetch interception cancels
  // shared ES-module imports in this test browser, even for unmatched routes.
  // Only the explicit synthetic backend goes through the real handler binding.
  const remote=[];
  context.on('request',request=>{if(new URL(request.url()).hostname==='tbbgwjmmaiclkhssimhf.supabase.co')remote.push(request.url());});
  await context.exposeBinding('__altaraSyntheticThemeFetch',async({frame,page},request)=>{
    assert.equal(frame,page.mainFrame());
    assert.equal(new URL(request.url).hostname,'tbbgwjmmaiclkhssimhf.supabase.co');
    return dispatch(request);
  });
  await context.addInitScript(()=>{
    if(window!==window.top)return;
    const original=window.fetch.bind(window);
    window.fetch=async(input,init)=>{
      const request=new Request(input,init);
      if(new URL(request.url).hostname!=='tbbgwjmmaiclkhssimhf.supabase.co')return original(input,init);
      const result=await window.__altaraSyntheticThemeFetch({url:request.url,method:request.method,headers:Object.fromEntries(request.headers),body:['GET','HEAD'].includes(request.method)?null:await request.text()});
      return new Response(result.body,{status:result.status,headers:result.headers});
    };
  });
  return ()=>assert.deepEqual(remote,[],'synthetic Auth and API requests never leave the browser for the hosted backend');
}

test('theme public guide and source downloads stay usable without Auth or the catalogue backend', {
  skip: !process.env.ALTARA_PTBR_PLAYWRIGHT || !process.env.ALTARA_THEME_SITE_URL, timeout: 120000,
}, async t => {
  const { chromium } = createRequire(import.meta.url)(process.env.ALTARA_PTBR_PLAYWRIGHT);
  const browser = await chromium.launch({ headless: true, ...(process.env.ALTARA_PTBR_CHROME ? { executablePath: process.env.ALTARA_PTBR_CHROME } : {}) });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  t.after(() => context.close());
  const origin = new URL(process.env.ALTARA_THEME_SITE_URL).origin;
  const external = [], errors = [],assets=observeActualLocalAssets(context),{verifiedAssets}=assets;
  const assertNoRemote=await syntheticFetchTransport(context,async request=>{
    const url = new URL(request.url);
    external.push(url.pathname);
    return {status:404,headers:{'content-type':'application/json'},body:JSON.stringify({code:'NOT_FOUND',message:'Requested function was not found'})};
  });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(origin + '/developers/themes/guide');
  assert.equal(response.status(), 200);
  await page.getByRole('heading', { name: 'Build an ALTARA theme.', exact: true }).waitFor();
  const contents=page.getByRole('navigation', { name: 'Guide contents' }).getByRole('link');
  assert.equal(await contents.count(), 10);
  assert.deepEqual(await contents.evaluateAll(links=>links.map(link=>link.getAttribute('href'))),['#start','#style','#build','#test','#publish','#selling','#updates','#refunds','#limits','#safety']);
  assert.equal(await page.getByRole('button', { name: /Sign in|Publish version/ }).count(), 0);
  assert.equal(await page.locator('#publish').textContent().then(text => text.includes('No ALTARA+ is required.')), true);
  await page.getByRole('heading',{name:'Validation reduces risk. It does not guarantee safety.',exact:true}).waitFor();
  assert.match(await page.locator('#safety').textContent(),/Ctrl\+Alt\+Shift\+T/);
  assert.match(await page.locator('#safety').textContent(),/not an antivirus scan/);
  assert.match(await page.locator('#safety').textContent(),/Widgets have a separate execution/);
  const selling=await page.locator('#selling').textContent(),updates=await page.locator('#updates').textContent(),refunds=await page.locator('#refunds').textContent();
  assert.match(selling,/A free version or working demo is not required/);
  assert.match(selling,/Deleting a public file later does not remove repository history/);
  assert.match(selling,/Sharing your ALTARA listing does not transfer a purchase/);
  assert.match(selling,/creator can install their own paid theme without buying/);
  assert.match(selling,/does not promise copy-proof browser DRM/);
  assert.match(updates,/Existing buyers do not pay again for later versions of the same project/);
  assert.match(updates,/explicitly accept the update/);
  assert.match(updates,/Creators cannot rate their own themes/);
  assert.match(refunds,/5% commission/);assert.match(refunds,/14 days worldwide/);
  assert.match(refunds,/Applicable rights.*can be raised later/);
  assert.match(refunds,/queued instruction or approval is not a completed refund/);
  assert.match(refunds,/partial refund keeps theme access/);assert.match(refunds,/full refund ends paid access when no other valid purchase/);
  assert.equal(await page.locator('#refunds').getByRole('link',{name:'Read the complete theme withdrawal and refund policy →'}).getAttribute('href'),'/theme-refunds');
  const { validateCommunityThemePackage } = await import(pathToFileURL(path.join(appSource, 'lib/communityThemePackages.js')));
  const code = await page.locator('.themeGuideFilePair pre').allTextContents();
  assert.equal(validateCommunityThemePackage({ ...JSON.parse(code[0]), css: code[1] }).apiVersion, 2, 'guide code examples use the real validator');
  const pending = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download source kit ↓', exact: true }).click();
  const downloaded = await pending; assert.equal(await downloaded.failure(), null);
  assert.equal(downloaded.suggestedFilename(), 'community-theme-starter-kit.zip');
  assert.deepEqual(fs.readFileSync(await downloaded.path()), fs.readFileSync(path.join(appSource, 'theme/community-theme-starter-kit.zip')));
  const starter = await page.request.get(origin + '/theme-assets/theme/community-theme-starter.altara-theme.json');
  assert.equal(starter.status(), 200); assert.equal(validateCommunityThemePackage(await starter.text()).apiVersion, 2);
  for (const width of [1360, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.ALTARA_THEME_EVIDENCE) {
      fs.mkdirSync(process.env.ALTARA_THEME_EVIDENCE, { recursive: true });
      await page.screenshot({ path: path.join(process.env.ALTARA_THEME_EVIDENCE, 'theme-programming-guide-' + width + '.png') });
    }
  }
  assert.equal(external.some(url => url.includes('/auth/v1') || url.includes('/functions/v1')), false, 'guide works without a session or catalogue request');
  for(const policyPath of ['/theme-refunds','/widget-refunds']){
    assert.equal((await page.goto(origin+policyPath)).status(),200);
    await page.getByRole('heading',{name:'Our 14-day commercial withdrawal policy',exact:true}).waitFor();
    const policy=await page.locator('.legal-content').textContent();
    assert.match(policy,/paid widget and theme purchases/);assert.match(policy,/worldwide commercial policy/);
    assert.match(policy,/do not need to give a reason/);assert.match(policy,/Mandatory rights may provide different or longer/);
    assert.match(policy,/not asked to waive digital-content/);assert.match(policy,/original payment method/);
    assert.match(policy,/corresponding proportion of its 5% commission/);assert.match(policy,/not a second\s+refund to the buyer/);
    assert.match(policy,/partial refund keeps access/);assert.match(policy,/full refund\s+revokes paid access if no other valid purchase/);
    assert.match(policy,/normal reply or a legacy approval alone does not move funds/);
    for(const [name,href]of[['Widget Help & refunds','/marketplace?view=refunds'],['Theme Help & refunds','/themes?view=refunds'],['Widget Buyer requests','/developers/widgets?view=seller-requests'],['Theme Buyer requests','/developers/themes?view=seller-requests']])assert.equal(await page.getByRole('link',{name,exact:true}).getAttribute('href'),href);
    for(const width of [1360,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  }
  await page.setViewportSize({ width: 1360, height: 1000 });
  const catalogue = await page.goto(origin + '/themes'); assert.equal(catalogue.status(), 200);
  await page.getByRole('heading', { name: 'Themes', exact: true }).waitFor();
  await page.getByRole('complementary',{name:'Theme installation safety'}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Read safety precautions →',exact:true}).getAttribute('href'),'/developers/themes/guide#safety');
  await page.locator('.communityThemeMarket .is-error').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Download theme', exact: true }).count(), 0);
  assert.equal(await page.locator('.communityThemeMarket .communityThemesCard').count(), 0, 'backend errors do not become a fabricated catalogue');
  assert.equal(await page.getByRole('link', { name: 'Make a theme ↗', exact: true }).getAttribute('href'), '/developers/themes/guide');
  assert.equal(await page.getByRole('link', { name: 'My projects', exact: true }).getAttribute('href'), '/developers/themes');
  assert.equal(await page.getByRole('link', { name: 'Read the programming guide', exact: true }).getAttribute('href'), '/developers/themes/guide');
  assert.equal(await page.getByRole('link', { name: 'Download starter kit', exact: true }).getAttribute('href'), '/theme-assets/theme/community-theme-starter-kit.zip');
  for (const width of [1360, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.ALTARA_THEME_EVIDENCE) await page.screenshot({ path: path.join(process.env.ALTARA_THEME_EVIDENCE, 'theme-catalogue-unavailable-' + width + '.png') });
  }
  assert.deepEqual(errors, []);
  await assets.verify();assertNoRemote();assert.equal(requiredModules.every(name=>verifiedAssets.has(name)),true);
  if(process.env.ALTARA_THEME_EVIDENCE)fs.writeFileSync(path.join(process.env.ALTARA_THEME_EVIDENCE,'public-guide-module-transport.json'),JSON.stringify({actual_next_responses:true,synthetic_javascript:false,assets:Object.fromEntries(verifiedAssets)},null,2));
});

test('theme portal: two synthetic Auth accounts upload code packages, publish, discover, preview and download verified versions through the real handler and isolated PostgreSQL', { skip: !enabled, timeout: 240000 }, async t => {
  const { createThemeApiHandler } = await import(pathToFileURL(path.join(appSource, 'supabase/functions/_shared/theme-api.mjs')));
  let db;
  if(commerceDatabase){
    const {createThemeCommercePostgresFixture,themeCommerceQuote}=await import(pathToFileURL(path.join(appSource,'tests/fixtures/theme-commerce-postgres.mjs')));
    const financial=await createThemeCommercePostgresFixture();financial.apply();
    financial.sql(`update public.profiles set username=case when id='${actorA}' then 'maker' else 'reader' end,display_name=case when id='${actorA}' then 'Theme Maker' else 'Theme Reader' end where id in('${actorA}','${actorB}');`);
    db={...financial,quote:themeCommerceQuote,rpc:(actor,op,payload={})=>financial.rpc('altara_theme_api_v1',{p_actor:actor,p_op:op,p_payload:payload})};
  }else{
    const {createThemePostgresFixture}=await import(pathToFileURL(path.join(appSource,'tests/fixtures/community-theme-postgres.mjs')));
    db=await createThemePostgresFixture();
  }
  t.after(() => db.stop());
  const { chromium } = createRequire(import.meta.url)(process.env.ALTARA_PTBR_PLAYWRIGHT);
  const browser = await chromium.launch({ headless: true, ...(process.env.ALTARA_PTBR_CHROME ? { executablePath: process.env.ALTARA_PTBR_CHROME } : {}) });
  t.after(() => browser.close());
  const identity = token => {
    try { const value = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); return [actorA, actorB].includes(value.sub) && token.endsWith('.fixture-signature') ? value.sub : null; }
    catch { return null; }
  };
  let failOperation = '', tamperRelease = false, requests = [],verifiedAssets=new Map();
  const handler = createThemeApiHandler({
    createUserClient: token => ({ auth: { getUser: async () => identity(token) ? { data: { user: { id: identity(token) } }, error: null } : { data: { user: null }, error: Error('Synthetic Auth rejected') } },
      rpc: async (name, fields) => {
        assert.equal(name, 'report_altara_theme_v1');
        try { return { data: JSON.parse(db.sql(`set role authenticated;set request.jwt.claim.sub=${db.quote(identity(token))};select public.report_altara_theme_v1(${db.quote(fields.p_release_id)}::uuid,${db.quote(fields.p_category)},${db.quote(fields.p_details)});`)), error: null }; }
        catch (error) { return { data: null, error }; }
      },
    }),
    createServiceClient: () => ({ rpc: async (name, fields) => {
      assert.equal(name, 'altara_theme_api_v1');
      try { return { data: db.rpc(fields.p_actor, fields.p_op, fields.p_payload), error: null }; }
      catch (error) { return { data: null, error }; }
    } }),
  });
  const contexts = [],assetObservers=[],remoteAssertions=[];
  async function sessionContext(actor) {
    const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } }); contexts.push(context);
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const user = { id: actor, aud: 'authenticated', role: 'authenticated', email: 'synthetic-theme@example.invalid', app_metadata: {}, user_metadata: {} };
    const token = [{ alg: 'HS256', typ: 'JWT' }, { sub: actor, aud: 'authenticated', role: 'authenticated', exp }, 'fixture-signature'].map((v, i) => i < 2 ? Buffer.from(JSON.stringify(v)).toString('base64url') : v).join('.');
    if (actor) await context.addInitScript(({ key, user, token, exp }) => window === window.top && localStorage.setItem(key, JSON.stringify({ access_token: token, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_at: exp, expires_in: 3600, user })), { key: authKey, user, token, exp });
    const assets=observeActualLocalAssets(context);assetObservers.push(assets);
    const assertNoRemote=await syntheticFetchTransport(context,async request=>{
      const url = new URL(request.url);
      if (url.pathname.endsWith('/auth/v1/user')) return {status:200,headers:{'content-type':'application/json'},body:JSON.stringify(user)};
      if (url.pathname.endsWith('/functions/v1/theme-commerce'))return {status:200,headers:{'content-type':'application/json'},body:JSON.stringify({ok:true,product_kind:'theme',environment:'test',enabled:false,onboarding_available:false,commission_bps:500,currency:'eur',minimum_price_cents:50,maximum_price_cents:100000,supported_countries:['PT'],seller:{connected:false,ready:false,country:null}})};
      if (!url.pathname.endsWith('/functions/v1/theme-api')) return {status:200,headers:{'content-type':'application/json'},body:'[]'};
      const headers = { ...request.headers, 'content-type': 'application/json' };
      const payload = request.method === 'POST' ? JSON.parse(request.body) : null;
      if(payload){await assets.verify();for(const [name,value]of assets.verifiedAssets)verifiedAssets.set(name,value);assert.equal(requiredModules.every(name=>verifiedAssets.has(name)),true,'the four actual Next module files are verified before the first theme API RPC');}
      if (payload) requests.push({ actor: identity(headers.authorization?.slice(7) || ''), payload });
      if (payload?.op === failOperation) { failOperation = ''; return {status:503,headers:{'content-type':'application/json'},body:JSON.stringify({ok:false,error:'catalogue_unavailable'})}; }
      const response = await handler(new Request(request.url, { method: request.method, headers, ...(request.method === 'POST' ? { body: request.body } : {}) }));
      let text = await response.text();
      if (tamperRelease && payload?.op === 'release') { tamperRelease = false; const result = JSON.parse(text); result.release.sha256 = '0'.repeat(64); text = JSON.stringify(result); }
      return {status:response.status,headers:Object.fromEntries(response.headers),body:text};
    });
    remoteAssertions.push(assertNoRemote);
    return context;
  }
  const a = await sessionContext(actorA), b = await sessionContext(actorB), anonymous = await sessionContext(null);
  const errors = [];
  const maker = await a.newPage(), reader = await b.newPage(), visitor = await anonymous.newPage();
  for (const page of [maker, reader, visitor]) page.on('pageerror', error => errors.push(error.message));
  const captureState=async()=>{
    if([maker,reader,visitor].every(page=>page.isClosed()))return;
    if(process.env.ALTARA_THEME_EVIDENCE){
      fs.mkdirSync(process.env.ALTARA_THEME_EVIDENCE,{recursive:true});
      const state={requests,errors,local_database_only:true,synthetic_auth_only:true,actual_next_javascript:true,assets:Object.fromEntries(verifiedAssets)};
      for(const [name,page]of[['maker',maker],['reader',reader],['visitor',visitor]]){
        try{state[name]={url:page.url(),text:await page.locator('body').innerText()};await page.screenshot({path:path.join(process.env.ALTARA_THEME_EVIDENCE,'theme-portal-final-'+name+'.png')});}catch{}
      }
      fs.writeFileSync(path.join(process.env.ALTARA_THEME_EVIDENCE,'theme-portal-final-state.json'),JSON.stringify(state,null,2));
    }
  };
  t.after(captureState);
  const base = process.env.ALTARA_THEME_SITE_URL;
  let project, firstRelease, publishedScreenshots;
  const noPortalTheme = async page => assert.equal(await page.evaluate(() => document.body.hasAttribute('data-altara-community-theme') || !!document.getElementById('altaraCommunityThemeStyle')), false, 'portal never applies community CSS');

  const { COMMUNITY_THEME_CODE_STARTER } = await import(pathToFileURL(path.join(appSource, 'theme/communityThemeStarter.js')));
  const { canonicalThemeJson, verifyPublishedThemeRelease } = await import(pathToFileURL(path.join(appSource, 'lib/communityThemeAccount.js')));
  const { validateCommunityThemePackage } = await import(pathToFileURL(path.join(appSource, 'lib/communityThemePackages.js')));
  const fixture = { ...COMMUNITY_THEME_CODE_STARTER, name: 'Code portal fixture', author: 'Pretend Administrator', description: 'Synthetic data used only by this local browser test.' };
  const filePayload = pkg => ({ name: 'theme.altara-theme.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pkg)) });
  const downloadPackage = async page => { const [download] = await Promise.all([page.waitForEvent('download'),page.getByRole('button', { name: 'Download theme', exact: true }).click()]); assert.equal(await download.failure(), null); return fs.readFileSync(await download.path(), 'utf8'); };
  let firstDownloaded,portalReady=false;
  const scenario=(name,fn)=>t.test(name,{skip:!portalReady},fn);

  await t.test('creator uploads a code package, validates and previews a private draft without a visual builder', async () => {
    await maker.goto(base + '/developers/themes');
    assert.equal(await maker.getByRole('button', { name: 'Create theme', exact: true }).count(), 0);
    assert.equal(await maker.getByRole('button', { name: 'Library', exact: true }).count(), 0);
    const starter = await maker.request.get(base + '/theme-assets/theme/community-theme-starter.altara-theme.json');
    assert.equal(starter.status(), 200); assert.equal(validateCommunityThemePackage(await starter.text()).apiVersion, 2);
    assert.equal(validateCommunityThemePackage(await maker.locator('.themeCodeExample pre').textContent()).apiVersion, 2, 'published code example is a valid portable package');
    await maker.getByLabel('Import theme package', { exact: true }).setInputFiles(filePayload(fixture));
    await maker.getByText('Validated package · API 2', { exact: true }).waitFor();
    assert.equal(await maker.getByLabel('Theme CSS', { exact: true }).count(), 0);
    await maker.getByRole('button', { name: 'Preview package', exact: true }).click();
    const preview = maker.getByRole('dialog'); await preview.locator('iframe').waitFor();
    assert.equal(await preview.locator('iframe').getAttribute('sandbox'), '');
    await noPortalTheme(maker); assert.equal(db.rpc(null, 'catalogue').total, 0);
    await preview.getByRole('button', { name: 'Close', exact: true }).first().click();
    await maker.getByRole('button', { name: 'Save private draft', exact: true }).click();
    await maker.getByRole('button', { name: 'Replace draft package', exact: true }).waitFor();
    project = db.rpc(actorA, 'projects').projects[0];
    assert.equal(project.draft_package.css, fixture.css); assert.equal(project.creator_id, actorA);
    assert.equal(db.rpc(actorB, 'projects').projects.length, 0); assert.equal(db.rpc(null, 'catalogue').total, 0);
    portalReady=true;
  });
  await scenario('publish retains authoritative identity and optimized presentation assets', async () => {
    await maker.getByRole('button', { name: 'Publish version…', exact: true }).click();
    await maker.getByLabel('Release notes', { exact: true }).fill('First synthetic code release.');
    await maker.getByLabel('Presentation image (up to 512 KiB; optimized to 640px / 96 KiB)', { exact: true }).setInputFiles(path.join(appSource, 'theme/assets/altara-glass-room.webp'));
    await maker.getByText('Image ready.', { exact: true }).waitFor();
    assert.equal(await maker.getByRole('button', { name: 'Publish version', exact: true }).isDisabled(), true);
    await maker.getByRole('checkbox', { name: 'I reviewed this version, its price and my rights to publish it.', exact: true }).check();
    await maker.getByRole('button', { name: 'Publish version', exact: true }).click();
    await maker.getByRole('button', { name: 'Replace draft package', exact: true }).waitFor();
    const catalogue = db.rpc(null, 'catalogue'); assert.equal(catalogue.total, 1);
    assert.equal(catalogue.themes[0].creator_name, 'Theme Maker');
    assert.notEqual(catalogue.themes[0].creator_name, fixture.author);
    publishedScreenshots = catalogue.themes[0].screenshots;
    assert.equal(publishedScreenshots.length, 1);
    assert.ok(Buffer.from(publishedScreenshots[0].base64, 'base64').length <= 96 * 1024);
    firstRelease = db.rpc(actorA, 'detail', { project_id: project.id }).releases[0];
    firstRelease = db.rpc(null, 'release', { release_id: firstRelease.id }).release;
    assert.equal(firstRelease.version, '1.0.0');
  });
  await scenario('anonymous catalogue preview and verified file download never install or activate', async () => {
    await visitor.goto(base + '/themes?theme=' + project.id);
    await visitor.getByRole('button', { name: 'Preview', exact: true }).click();
    await visitor.getByRole('dialog').locator('iframe').waitFor(); await noPortalTheme(visitor);
    await visitor.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).first().click();
    firstDownloaded = await downloadPackage(visitor);
    assert.equal(firstDownloaded, firstRelease.package_text);
    assert.equal(canonicalThemeJson(JSON.parse(firstDownloaded)), firstDownloaded);
    assert.equal((await verifyPublishedThemeRelease(firstRelease)).name, fixture.name);
    assert.equal(db.rpc(actorB, 'installs').installs.length, 0);
    assert.equal(await visitor.getByRole('button', { name: 'Install', exact: true }).count(), 0, 'anonymous free downloads do not offer an account installation');
    assert.equal(await visitor.getByRole('button', { name: 'Library', exact: true }).count(), 1);
  });
  await scenario('a second account downloads without a cloud install; trusted controls fit narrow windows', async () => {
    await reader.goto(base + '/themes');
    await reader.getByRole('button', { name: 'View theme', exact: true }).click();
    assert.equal(await downloadPackage(reader), firstDownloaded);
    assert.equal(db.rpc(actorB, 'installs').installs.length, 0);
    assert.equal(db.rpc(actorA, 'installs').installs.length, 0);
    assert.equal(await reader.evaluate(actor => localStorage.getItem('altara:community-themes:v1:' + actor), actorB), null);
    await noPortalTheme(reader);
    for (const width of [1360, 390]) {
      await reader.setViewportSize({ width, height: 1000 });
      assert.equal(await reader.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (process.env.ALTARA_THEME_EVIDENCE) { fs.mkdirSync(process.env.ALTARA_THEME_EVIDENCE, { recursive: true }); await reader.screenshot({ path: path.join(process.env.ALTARA_THEME_EVIDENCE, 'theme-code-details-' + width + '.png') }); }
    }
    await reader.setViewportSize({ width: 1360, height: 1000 });
  });
  await scenario('replacement stays private, failed publication is retryable and newer download cannot rewrite old bytes', async () => {
    await maker.getByRole('button', { name: 'Replace draft package', exact: true }).click();
    assert.equal(await maker.getByRole('button', { name: 'Save private draft', exact: true }).isDisabled(), true);
    await maker.getByLabel('Draft package file', { exact: true }).setInputFiles(filePayload({ ...fixture, version: '1.1.0', css: fixture.css + '\n.app{--altara-accent:#eacdab}' }));
    await maker.getByRole('button', { name: 'Save private draft', exact: true }).click();
    await maker.getByRole('button', { name: 'Replace draft package', exact: true }).waitFor();
    assert.equal(db.rpc(null, 'catalogue').themes[0].latest_version, '1.0.0');
    assert.deepEqual(db.rpc(actorA, 'projects').projects[0].draft_screenshots, publishedScreenshots);
    await maker.getByRole('button', { name: 'Publish version…', exact: true }).click();
    await maker.getByRole('checkbox', { name: 'I reviewed this version, its price and my rights to publish it.', exact: true }).check();
    failOperation = 'publish'; await maker.getByRole('button', { name: 'Publish version', exact: true }).click();
    await maker.getByText('Could not complete the theme request. Check your connection and try again.', { exact: true }).waitFor();
    assert.equal(db.rpc(null, 'catalogue').themes[0].latest_version, '1.0.0');
    await maker.getByRole('button', { name: 'Publish version', exact: true }).click();
    await maker.getByRole('button', { name: 'Replace draft package', exact: true }).waitFor();
    assert.equal(db.rpc(actorA, 'detail', { project_id: project.id }).releases.length, 2);
    await reader.reload(); const newText = await downloadPackage(reader);
    assert.equal(JSON.parse(newText).version, '1.1.0'); assert.equal(firstDownloaded, firstRelease.package_text);
    assert.equal(db.rpc(actorB, 'installs').installs.length, 0);
  });
  await scenario('network failure and invalid release hashes are rejected before a download', async () => {
    let downloads = 0; const record = () => downloads++; reader.on('download', record);
    failOperation = 'release'; await reader.getByRole('button', { name: 'Download theme', exact: true }).click();
    await reader.getByText('Could not complete the theme request. Check your connection and try again.', { exact: true }).waitFor();
    assert.equal(downloads, 0);
    tamperRelease = true; await reader.getByRole('button', { name: 'Download theme', exact: true }).click();
    await reader.getByText('Theme integrity verification failed.', { exact: true }).waitFor(); assert.equal(downloads, 0);
    reader.off('download', record); assert.equal(JSON.parse(await downloadPackage(reader)).version, '1.1.0');
  });
  await scenario('foreign project edits and invalid packages are refused by the real backend boundary', async () => {
    const current = db.rpc(actorA, 'projects').projects[0];
    const token = await reader.evaluate(key => JSON.parse(localStorage.getItem(key)).access_token, authKey);
    const request = packageData => new Request('https://fixture.invalid/theme-api', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ op: 'save_draft', project_id: current.id, expected_revision: current.revision, package: packageData }) });
    assert.equal((await handler(request(current.draft_package))).status, 404);
    assert.equal((await handler(request({ ...current.draft_package, css: '@import "https://bad.example/theme.css";' }))).status, 400);
    assert.equal(db.rpc(actorA, 'projects').projects[0].revision, current.revision);
    assert.equal(db.rpc(actorB, 'projects').projects.length, 0);
  });
  await scenario('legacy API 1 uploads preserve custom CSS; invalid uploads never save', async () => {
    const imported = { format: 'altara-theme', apiVersion: 1, name: 'Imported API 1 fixture', description: 'Legacy package compatibility.', version: '1.0.0', css: '.panel { color:#eacdab; }\n/* preserved advanced rule */\n[data-theme-slot="widget-title"] { letter-spacing: .02em; }' };
    const before = requests.filter(row => row.payload.op === 'save_draft').length;
    await maker.getByLabel('Import theme package', { exact: true }).setInputFiles(filePayload({ ...imported, css: '@import "https://bad.example/theme.css";' }));
    await maker.locator('.communityThemeMarket .is-error').waitFor();
    assert.equal(requests.filter(row => row.payload.op === 'save_draft').length, before);
    await maker.getByLabel('Import theme package', { exact: true }).setInputFiles(filePayload(imported));
    await maker.getByRole('button', { name: 'Save private draft', exact: true }).click();
    await maker.getByRole('heading', { name: imported.name, exact: true }).waitFor();
    const saved = db.rpc(actorA, 'projects').projects.find(row => row.name === imported.name);
    assert.equal(saved.draft_package.apiVersion, 1); assert.equal(saved.draft_package.css, imported.css);
    assert.equal(db.rpc(null, 'catalogue').total, 1); await noPortalTheme(maker);
    for (const width of [1360, 390]) {
      await maker.setViewportSize({ width, height: 1000 });
      assert.equal(await maker.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (process.env.ALTARA_THEME_EVIDENCE) await maker.screenshot({ path: path.join(process.env.ALTARA_THEME_EVIDENCE, 'theme-code-projects-' + width + '.png') });
    }
  });
  await scenario('signed-out project requests preserve sign-in destination and never show another creator draft', async () => {
    await visitor.goto(base + '/developers/themes'); await visitor.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
    assert.equal(await visitor.getByRole('button', { name: 'Replace draft package', exact: true }).count(), 0);
    await visitor.getByRole('button', { name: 'Sign in', exact: true }).click(); await visitor.waitForURL('**/login.html?*');
    assert.equal(new URL(visitor.url()).searchParams.get('return_to'), '/developers/themes');
    assert.ok(requests.filter(row => ['save_draft', 'publish'].includes(row.payload.op)).every(row => row.actor === actorA));
    assert.equal(requests.some(row => ['install', 'accept_update', 'installs'].includes(row.payload.op)), false);
    assert.deepEqual(errors, []);
  });

  await captureState();
  for(const assets of assetObservers)await assets.verify();for(const assertNoRemote of remoteAssertions)assertNoRemote();
  for (const context of contexts) await context.close();
});
