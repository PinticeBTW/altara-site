import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const enabled = !!process.env.ALTARA_PTBR_PLAYWRIGHT && !!process.env.ALTARA_WIDGET_SITE_URL;
test('website catalog preserves login destination and installs into the account without publishing', {skip:!enabled}, async () => {
  const {chromium}=createRequire(import.meta.url)(process.env.ALTARA_PTBR_PLAYWRIGHT);
  const browser=await chromium.launch({executablePath:process.env.ALTARA_PTBR_CHROME,headless:true});
  const actor='00000000-0000-4000-8000-000000000001';
  let release={snapshot_html:'<h1>Fixed baseline</h1>',snapshot_sha256:createHash('sha256').update('<h1>Fixed baseline</h1>').digest('hex'),id:'00000000-0000-4000-8000-000000000002',author_id:'00000000-0000-4000-8000-000000000003',kind:'hosted',sdkVersion:2,name:'Focus counter',description:'A widget used only in this browser test.',version:'1.0.0',manifest_url:'https://widgets.example.com/manifest.json',entry_url:'https://widgets.example.com/index.html',permissions:['storage'],icon_url:'https://widgets.example.com/icon.svg'};
  try {
    for(const authenticated of [false,true]) {
      const context=await browser.newContext({viewport:{width:1360,height:1000}});
      let installs=[], writes=0, rating=null, ratingWrites=0, failRating=false;const errors=[];
      const user={id:actor,aud:'authenticated',role:'authenticated',email:'widget-test@example.com',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
      if(authenticated){
        const exp=Math.floor(Date.now()/1000)+3600;
        const token=[{alg:'HS256',typ:'JWT'},{sub:actor,aud:'authenticated',role:'authenticated',exp},'test-signature'].map((v,i)=>i<2?Buffer.from(JSON.stringify(v)).toString('base64url'):v).join('.');
        await context.addInitScript(({user,token,exp})=>window===window.top && localStorage.setItem('sb-tbbgwjmmaiclkhssimhf-auth-token',JSON.stringify({access_token:token,refresh_token:'test-refresh',token_type:'bearer',expires_at:exp,expires_in:3600,user})),{user,token,exp});
      }
    if(process.env.ALTARA_WIDGET_SOURCE) await context.route('**/widget-assets/*.js',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(process.env.ALTARA_WIDGET_SOURCE,path.basename(new URL(route.request().url()).pathname)),'utf8')}));
      await context.route('https://tbbgwjmmaiclkhssimhf.supabase.co/**',async route=>{
        const url=new URL(route.request().url());let body=[];
        if(url.pathname.endsWith('/user'))body=user;
        else if(url.pathname.includes('/home_widget_releases'))body=route.request().headers().accept?.includes('object')?release:[release];
        else if(url.pathname.includes('/rpc/widget_marketplace_details'))body=[{id:release.id,author_id:release.author_id,creator_name:'Test Creator',creator_username:'testmaker',downloads:writes?1:0,rating_count:rating?1:0,rating_average:rating?.stars??null}];
        else if(url.pathname.includes('/rpc/widget_project_rating')){
          const payload=route.request().postDataJSON();
          if(payload.p_stars){
            if(failRating){failRating=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Test rating failure'})});}
            ratingWrites++;rating={stars:payload.p_stars};
          }
          if(payload.p_remove)rating=null;
          body=rating;
        }
        else if(url.pathname.includes('/home_widget_installs')){if(route.request().method()==='PATCH')installs=installs.map(row=>({...row,...route.request().postDataJSON()}));body=route.request().headers().accept?.includes('object')?installs[0]:installs;}
        else if(url.pathname.includes('/rpc/install_home_widget')){writes++;const payload=route.request().postDataJSON();assert.equal(payload.p_source_id,release.id);assert.equal(payload.p_package.icon_url,release.icon_url);body=[{...payload.p_package,id:'00000000-0000-4000-8000-000000000004',user_id:actor,source_id:release.id,active:true}];installs=body;}
        await route.fulfill({contentType:'application/json',body:JSON.stringify(body),headers:{'access-control-allow-origin':'*'}});
      });
      await context.route('https://widgets.example.com/icon.svg',route=>route.fulfill({contentType:'image/svg+xml',headers:{'access-control-allow-origin':'*'},body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="gold"/></svg>'}));
      await context.route('https://widgets.example.com/index.html',route=>route.fulfill({contentType:'text/html',body:'<p>Widget preview</p>'}));
      await context.route('**/login.html?*', route=>route.fulfill({contentType:'text/html',body:'<h1>Sign in</h1>'}));
      const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
      await page.goto(process.env.ALTARA_WIDGET_SITE_URL+'/widgets');
      await page.locator('.widgetMarketIcon img').waitFor();
      await page.waitForFunction(()=>document.querySelector('.widgetMarketIcon img')?.naturalWidth>0);
      assert.equal(new URL(page.url()).pathname,'/marketplace','legacy widget links redirect to the catalog');
      await page.getByRole('link',{name:'Test Creator @testmaker'}).waitFor();
      assert.equal(await page.getByRole('button',{name:'Developers',exact:true}).count(),0,'no editor tab in public catalog');
      await page.getByRole('button',{name:'Themes · Coming soon',exact:true}).click();
      await page.getByRole('heading',{name:'A new look is on its way.'}).waitFor();
      await page.getByRole('button',{name:'Widgets',exact:true}).click();
      let second;
      if(authenticated){second=await context.newPage();await second.goto(process.env.ALTARA_WIDGET_SITE_URL+'/marketplace');await second.getByRole('button',{name:'Manage widgets',exact:true}).click();await second.getByText('No community widgets installed yet.',{exact:true}).waitFor();}
      await page.getByRole('button',{name:'Preview & install',exact:true}).click();
      assert.equal(await page.locator('.widgetMarket').evaluate(el=>getComputedStyle(el).borderTopStyle),'solid','marketplace styles load from the active build');
      assert.equal(await page.locator('iframe').count(),0, 'catalog details do not start external code');
      if(authenticated){
        for(const [width,height] of [[1360,1000],[390,700]]){
          await page.setViewportSize({width,height});
          await page.getByRole('button',{name:'Report widget',exact:true}).click();
          const report=page.getByRole('dialog',{name:'Report widget',exact:true});
          const bounds=await report.boundingBox();
          assert.ok(Math.abs(bounds.x+bounds.width/2-width/2)<2,'report dialog is horizontally centered');
          assert.ok(Math.abs(bounds.y+bounds.height/2-height/2)<2,'report dialog is vertically centered');
          assert.ok(bounds.x>=0 && bounds.y>=0 && bounds.x+bounds.width<=width && bounds.y+bounds.height<=height,'report fits the viewport');
          const heading=report.getByRole('heading',{name:'Report widget',exact:true});
          assert.ok(await heading.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))<=24,'modal title does not inherit the landing page heading size');
          assert.equal(await report.getByRole('button',{name:'Cancel',exact:true}).isVisible(),true);
          if(process.env.ALTARA_WIDGET_EVIDENCE){fs.mkdirSync(process.env.ALTARA_WIDGET_EVIDENCE,{recursive:true});await page.screenshot({path:path.join(process.env.ALTARA_WIDGET_EVIDENCE,`report-website-${width}.png`)});}
          await page.keyboard.press('Escape');
          await report.waitFor({state:'detached'});
        }
        await page.setViewportSize({width:1360,height:1000});
      }
      assert.equal(await page.getByRole('button',{name:'Add to ALTARA',exact:true}).isDisabled(),true);
      const copy=page.getByRole('button',{name:'Copy widget link',exact:true});
      assert.equal(await copy.isDisabled(),true);
      for (const width of [1360,390]) {
        await page.setViewportSize({width,height:1000});
        const before=await page.locator('.widgetMarket').boundingBox();
        await page.getByRole('button',{name:'About this widget’s access',exact:true}).click();
        const after=await page.locator('.widgetMarket').boundingBox();
        assert.equal(after.width,before.width,'details must not widen the page');
        assert.equal(after.height,before.height,'details must not lengthen the page');
        const popup=await page.locator('.widgetSafetyDialog').boundingBox();
        assert.ok(popup.width<=480 && popup.x>=0 && popup.x+popup.width<=width);
        await page.getByRole('button',{name:'Close details',exact:true}).click();
      }
      await page.setViewportSize({width:1360,height:1000});
      await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.copiedWidgetLink=value;}}}));
      await page.getByRole('checkbox').check();
      await copy.click();
      assert.equal(await page.evaluate(()=>window.copiedWidgetLink),process.env.ALTARA_WIDGET_SITE_URL+'/marketplace?widget='+release.id);
      await page.getByRole('checkbox').uncheck();
      assert.equal(await copy.isDisabled(),true);
      await page.getByRole('checkbox').check();
      await page.getByRole('button',{name:'Add to ALTARA',exact:true}).click();
      if(authenticated){
        await page.getByRole('button',{name:'Added to your account'}).waitFor();assert.equal(writes,1);
        const originalId=installs[0].id;
        release={...release,id:'00000000-0000-4000-8000-000000000012',version:'2.0.0',snapshot_html:'<h1>Fixed preview</h1>',snapshot_sha256:createHash('sha256').update('<h1>Fixed preview</h1>').digest('hex')};
        assert.equal(installs[0].version,'1.0.0','publishing does not automatically upgrade');
        await page.goto(process.env.ALTARA_WIDGET_SITE_URL+'/marketplace?widget='+release.id);
        const update=page.getByRole('button',{name:'Update to v2.0.0',exact:true});
        await update.waitFor();assert.equal(await update.isDisabled(),true);
        await page.getByRole('checkbox').check();
        await page.getByRole('button',{name:'Open preview',exact:true}).click();
        await page.frameLocator('.widgetMarketPreview > iframe').frameLocator('iframe').getByText('Fixed preview',{exact:true}).waitFor();
        await update.click();
        await page.getByRole('button',{name:'Added to your account'}).waitFor();
        assert.equal(installs[0].id,originalId);assert.equal(installs[0].version,'2.0.0');assert.equal(writes,2);

        assert.equal(await page.locator('.widgetSafety').isVisible(),false,'install dismisses the pre-install notice');
        await second.getByRole('heading',{name:'Focus counter',exact:true}).waitFor({timeout:4000});
        assert.equal(await second.getByRole('button',{name:/^(Pause|Enable)$/}).count(),0);
        await page.getByRole('radio',{name:'4 ★',exact:true}).check();
        await page.getByRole('button',{name:'Save rating',exact:true}).click();
        await page.getByRole('button',{name:'Edit rating',exact:true}).waitFor();
        await page.getByText('1 installs · ★ 4.0 (1)',{exact:true}).waitFor();
        assert.equal(await page.getByRole('radio').count(),0,'saving closes the editor');
        assert.equal(await page.getByRole('button',{name:'Edit rating',exact:true}).evaluate(el=>el===document.activeElement),true,'saving restores keyboard focus');
        assert.equal(await page.getByRole('button',{name:'Rate widget',exact:true}).count(),0,'rated widgets do not prompt for another rating');
        await page.reload();
        await page.getByRole('button',{name:'Edit rating',exact:true}).waitFor();
        assert.equal(await page.getByRole('radio').count(),0,'reopening keeps the saved rating collapsed');
        assert.equal(ratingWrites,1,'reading a rating never changes it');
        await page.getByRole('button',{name:'Edit rating',exact:true}).click();
        assert.equal(await page.getByRole('radio',{name:'4 ★',exact:true}).isChecked(),true);
        assert.equal(await page.getByRole('radio',{name:'4 ★',exact:true}).evaluate(el=>el===document.activeElement),true,'editing focuses the saved score');
        await page.getByRole('radio',{name:'5 ★',exact:true}).check();
        await page.locator('.widgetRatings').getByRole('button',{name:'Cancel',exact:true}).click();
        assert.equal(rating.stars,4,'cancelling does not overwrite the saved rating');
        assert.equal(await page.getByRole('radio').count(),0);
        assert.equal(await page.getByRole('button',{name:'Edit rating',exact:true}).evaluate(el=>el===document.activeElement),true,'cancelling restores keyboard focus');
        await page.getByRole('button',{name:'Edit rating',exact:true}).click();
        await page.getByRole('radio',{name:'5 ★',exact:true}).check();
        failRating=true;
        await page.getByRole('button',{name:'Save rating',exact:true}).click();
        await page.getByText('Could not save your rating. Check that the widget is still installed and try again.',{exact:true}).waitFor();
        assert.equal(rating.stars,4,'failed edits preserve the saved rating');
        assert.equal(await page.getByRole('radio',{name:'5 ★',exact:true}).isChecked(),true,'failed edits keep the chosen score for retry');
        await page.getByRole('button',{name:'Save rating',exact:true}).click();
        await page.getByText('1 installs · ★ 5.0 (1)',{exact:true}).waitFor();
        await page.getByRole('button',{name:'Edit rating',exact:true}).click();
        await page.getByRole('button',{name:'Remove rating',exact:true}).click();
        await page.getByText('1 installs · No ratings yet',{exact:true}).waitFor();
        assert.equal(await page.getByRole('radio').count(),5,'removing a rating allows a fresh rating');
        await page.goto(process.env.ALTARA_WIDGET_SITE_URL+'/marketplace?widget='+release.id);
        await page.getByRole('button',{name:'Added to your account'}).waitFor();
        assert.equal(await page.locator('.widgetSafety').isVisible(),false,'installed listings reopen without repeated consent');
        await page.getByRole('button',{name:'Back',exact:true}).click();
        await page.getByRole('button',{name:'Preview & install',exact:true}).waitFor();
        assert.equal(new URL(page.url()).searchParams.has('widget'),false,'back exits a direct listing link');
        await page.getByRole('button',{name:'Manage widgets',exact:true}).click();await page.getByRole('heading',{name:'Focus counter',exact:true}).waitFor();
        await page.getByRole('button',{name:'Check for updates',exact:true}).click();
        await page.getByRole('button',{name:'No updates available',exact:true}).waitFor();
        await second.getByRole('button',{name:'Uninstall',exact:true}).click();
        await page.getByText('No community widgets installed yet.',{exact:true}).waitFor({timeout:4000});
        await second.close();
        installs=installs.map(row=>({...row,active:true}));
        await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
        await page.getByRole('heading',{name:'Focus counter',exact:true}).waitFor();
        await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      }else{
        await page.waitForURL('**/login.html?*');const target=new URL(page.url()).searchParams.get('return_to');assert.equal(target,`/marketplace?widget=${release.id}`);assert.equal(writes,0);
      }
      assert.deepEqual(errors,[]);await context.close();
    }
  }finally{await browser.close();}
});
