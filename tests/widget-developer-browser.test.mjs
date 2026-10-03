import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const enabled=!!process.env.ALTARA_PTBR_PLAYWRIGHT&&!!process.env.ALTARA_WIDGET_SITE_URL;
test('developer hub separates authoring, custom publication metadata, creator profiles and themes', {skip:!enabled}, async()=>{
  const {chromium}=createRequire(import.meta.url)(process.env.ALTARA_PTBR_PLAYWRIGHT);
  const browser=await chromium.launch({executablePath:process.env.ALTARA_PTBR_CHROME,headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1360,height:1000}}), actor='00000000-0000-4000-8000-000000000001';
    const exp=Math.floor(Date.now()/1000)+3600,user={id:actor,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}};
    const token=[{alg:'HS256',typ:'JWT'},{sub:actor,aud:'authenticated',role:'authenticated',exp},'test-signature'].map((v,i)=>i<2?Buffer.from(JSON.stringify(v)).toString('base64url'):v).join('.');
    await context.addInitScript(({user,token,exp})=>window===window.top&&localStorage.setItem('sb-tbbgwjmmaiclkhssimhf-auth-token',JSON.stringify({access_token:token,refresh_token:'test-refresh',token_type:'bearer',expires_at:exp,expires_in:3600,user})),{user,token,exp});
    let published=null;const errors=[], filters=[];
    if(process.env.ALTARA_WIDGET_SOURCE) await context.route('**/widget-assets/*.js',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(process.env.ALTARA_WIDGET_SOURCE,path.basename(new URL(route.request().url()).pathname)),'utf8')}));
    await context.route('https://tbbgwjmmaiclkhssimhf.supabase.co/**',async route=>{
      const url=new URL(route.request().url());let body=[];
      if(url.pathname.endsWith('/user'))body=user;
      else if(url.pathname.includes('/home_widget_releases')){
        if(route.request().method()==='POST')published={...route.request().postDataJSON(),id:'00000000-0000-4000-8000-000000000009',status:'published'};
        if(route.request().method()==='PATCH')published={...published,...route.request().postDataJSON()};
        filters.push(url.searchParams.get('author_id'));
        body=route.request().headers().accept?.includes('object')?published:published?[published]:[];
      }else if(url.pathname.includes('/rpc/widget_marketplace_details'))body=published?[{id:published.id,author_id:actor,creator_name:'Test Maker',creator_username:'maker',downloads:0,rating_count:0,rating_average:null}]:[];
      await route.fulfill({contentType:'application/json',body:JSON.stringify(body),headers:{'access-control-allow-origin':'*'}});
    });
    await context.route('https://widget.example.com/manifest.json',route=>route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({manifest_version:1,name:'Original name',description:'Original description',version:'1.0.0',entry:'./index.html',icon:'./icon.svg',permissions:['storage']})}));
    await context.route('https://widget.example.com/icon.svg',route=>route.fulfill({contentType:'image/svg+xml',headers:{'access-control-allow-origin':'*'},body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="gold"/></svg>'}));
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    const base=process.env.ALTARA_WIDGET_SITE_URL;
    await page.goto(base+'/developers');
    await page.getByRole('heading',{name:'What will you create?'}).waitFor();
    await page.getByRole('link',{name:/02 \/ WIDGETS/}).click();
    await page.getByRole('heading',{name:'Widget studio',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Explore',exact:true}).count(),0);
    await page.getByLabel('Manifest link',{exact:true}).fill('https://widget.example.com/manifest.json');
    await page.getByRole('button',{name:'Load widget',exact:true}).click();
    await page.getByLabel('Title',{exact:true}).fill('My focus companion');
    await page.getByLabel('Description',{exact:true}).fill('Count the moments that matter.');
    assert.equal(await page.locator('iframe').count(),0,'publication never needs to execute external code');
    assert.equal(await page.getByRole('button',{name:'Publish free',exact:true}).isDisabled(),true);
    await page.locator('[name=release]').setInputFiles({name:'release.html',mimeType:'text/html',buffer:Buffer.from('<h1>Fixed test widget</h1>')});
    await page.getByRole('button',{name:'Publish free',exact:true}).click();
    await page.getByRole('button',{name:'Published',exact:true}).waitFor();
    assert.equal(published.snapshot_html,'<h1>Fixed test widget</h1>');assert.match(published.snapshot_sha256,/^[a-f0-9]{64}$/);
    assert.equal(published.icon_url,'https://widget.example.com/icon.svg');assert.equal(published.name,'My focus companion');assert.equal(published.description,'Count the moments that matter.');assert.equal(published.author_id,actor);
    await page.getByRole('button',{name:'Published widgets',exact:true}).click();
    await page.getByRole('button',{name:'Manage publication',exact:true}).waitFor();assert.ok(filters.includes('eq.'+actor));
    await page.getByRole('link',{name:'Test Maker @maker'}).click();
    await page.getByRole('heading',{name:'My focus companion',exact:true}).waitFor();assert.equal(new URL(page.url()).searchParams.get('creator'),actor);
    await page.getByRole('button',{name:'Preview & install',exact:true}).click();
    await page.getByText('Creators cannot rate their own widgets.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Remove from store',exact:true}).count(),0,'public catalog does not mix in author tools');
    await page.goto(base+'/developers/widgets');
    await page.getByRole('button',{name:'Published widgets',exact:true}).click();
    await page.getByRole('button',{name:'Manage publication',exact:true}).click();
    await page.getByRole('button',{name:'Remove from store',exact:true}).click();
    await page.getByText('Unlisted · Existing installs still work',{exact:true}).waitFor();assert.equal(published.status,'unlisted');
    await page.getByRole('button',{name:'Manage publication',exact:true}).click();
    const disable=page.getByRole('button',{name:'Disable for installed users',exact:true});
    assert.equal(await disable.isDisabled(),true);
    await page.getByRole('checkbox',{name:'I understand this stops existing installations.',exact:true}).check();
    await disable.click();await page.getByText('Disabled',{exact:true}).waitFor();assert.equal(published.status,'disabled');
    await page.getByRole('button',{name:'Manage publication',exact:true}).click();
    await page.getByRole('button',{name:'Publish again',exact:true}).click();await page.getByText('Published',{exact:true}).waitFor();assert.equal(published.status,'published');
    await page.goto(base+'/developers/themes');
    await page.getByRole('heading',{name:'Themes, made by you.'}).waitFor();
    await page.setViewportSize({width:390,height:844});
    for(const route of ['/developers','/developers/widgets','/marketplace']){
      await page.goto(base+route);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,route+' fits mobile');
    }
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
