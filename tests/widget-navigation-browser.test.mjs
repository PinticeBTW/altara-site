import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const enabled=!!process.env.ALTARA_PTBR_PLAYWRIGHT&&!!process.env.ALTARA_WIDGET_SITE_URL;
test('widget navigation restores views and scroll; background refresh keeps unchanged cards mounted',{skip:!enabled},async()=>{
 const {chromium}=createRequire(import.meta.url)(process.env.ALTARA_PTBR_PLAYWRIGHT);
 const browser=await chromium.launch({executablePath:process.env.ALTARA_PTBR_CHROME,headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1680,height:850}});
  // Exercise the actual periodic callback without waiting ten seconds per assertion.
  await context.addInitScript(()=>{const interval=window.setInterval.bind(window);window.setInterval=(fn,ms,...args)=>interval(fn,ms===10000?600:ms,...args);});
  if(process.env.ALTARA_WIDGET_SOURCE)await context.route('**/widget-assets/*.js',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(process.env.ALTARA_WIDGET_SOURCE,path.basename(new URL(route.request().url()).pathname)),'utf8')}));
  const author='00000000-0000-4000-8000-000000000001';
  const rows=Array.from({length:12},(_,i)=>({id:`00000000-0000-4000-8000-${String(i+10).padStart(12,'0')}`,author_id:author,kind:'hosted',sdkVersion:2,name:`Counter ${i+1}`,description:'Keep track of a daily habit.',version:'1.0.0',manifest_url:`https://widgets.example.com/${i}/manifest.json`,entry_url:`https://widgets.example.com/${i}/index.html`,permissions:['storage'],status:'published'}));
  let reads=0;
  await context.route('https://tbbgwjmmaiclkhssimhf.supabase.co/**',async route=>{
   const url=new URL(route.request().url());let data=[];
   if(url.pathname.includes('/home_widget_releases')){reads++;const id=url.searchParams.get('id')?.slice(3);const found=id?rows.filter(r=>r.id===id):rows;data=route.request().headers().accept?.includes('object')?found[0]:found;}
   else if(url.pathname.includes('/rpc/widget_marketplace_details'))data=rows.map(r=>({id:r.id,author_id:author,creator_name:'Maker',creator_username:'maker',downloads:2,rating_count:0}));
   await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.ALTARA_WIDGET_SITE_URL;
  await page.goto(base+'/marketplace');
  await page.getByRole('button',{name:'Preview & install',exact:true}).nth(11).waitFor();
  await page.evaluate(()=>{window.__firstWidget=document.querySelector('.widgetMarketCard');});
  const before=reads;
  await page.waitForTimeout(1500);
  assert.ok(reads>before,'periodic refresh fetched data');
  assert.equal(await page.evaluate(()=>window.__firstWidget===document.querySelector('.widgetMarketCard')),true,'unchanged refresh preserves DOM');
  await page.getByRole('button',{name:'Preview & install',exact:true}).nth(10).scrollIntoViewIfNeeded();
  const scroll=await page.evaluate(()=>window.scrollY);
  await page.getByRole('button',{name:'Preview & install',exact:true}).nth(10).click();
  await page.getByRole('heading',{name:'Counter 11',exact:true}).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('widget'),rows[10].id);
  await page.getByRole('checkbox',{name:'I understand and want to use this external widget.',exact:true}).check();
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.goBack();
  await page.getByRole('button',{name:'Preview & install',exact:true}).nth(11).waitFor();
  await page.waitForFunction(expected=>Math.abs(window.scrollY-expected)<8,scroll);
  assert.equal(new URL(page.url()).searchParams.has('widget'),false);
  await page.goForward();await page.getByRole('heading',{name:'Counter 11',exact:true}).waitFor();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'Preview & install',exact:true}).nth(11).waitFor();
  await page.getByRole('button',{name:'Manage widgets',exact:true}).click();
  assert.equal(new URL(page.url()).searchParams.get('view'),'installed');
  await page.reload();await page.getByRole('button',{name:'Sign in to see your widgets',exact:true}).waitFor();
  await page.goBack();await page.getByRole('button',{name:'Preview & install',exact:true}).nth(11).waitFor();
  rows[0]={...rows[0],name:'Changed counter'};
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.getByRole('heading',{name:'Changed counter',exact:true}).waitFor();
  await page.goto(base+'/marketplace?creator='+author);
  await page.getByRole('button',{name:'Preview & install',exact:true}).first().click();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('link',{name:'← All widgets',exact:true}).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('creator'),author);
  await page.goto(base+'/marketplace?widget='+rows[0].id);
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'Preview & install',exact:true}).nth(11).waitFor();
  assert.equal(new URL(page.url()).searchParams.has('widget'),false,'direct links have a safe catalog fallback');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
