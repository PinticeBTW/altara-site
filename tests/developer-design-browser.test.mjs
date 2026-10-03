import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const enabled=Boolean(process.env.ALTARA_PTBR_PLAYWRIGHT&&process.env.ALTARA_BOT_SITE_URL);

test('developer layout fits desktop and mobile, keeps navigation and keyboard controls usable', {skip:!enabled,timeout:120000}, async()=>{
  const {chromium}=createRequire(import.meta.url)(process.env.ALTARA_PTBR_PLAYWRIGHT);
  const browser=await chromium.launch({executablePath:process.env.ALTARA_PTBR_CHROME,headless:true});
  const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const user={id:id(1),aud:'authenticated',role:'authenticated',email:'design@example.com',app_metadata:{},user_metadata:{display_name:'pintice'}};
  const exp=Math.floor(Date.now()/1000)+3600;
  const token=[{alg:'HS256',typ:'JWT'},{sub:user.id,aud:'authenticated',role:'authenticated',exp},'test-signature'].map((value,index)=>index<2?Buffer.from(JSON.stringify(value)).toString('base64url'):value).join('.');
  const apps=[{app_id:id(11),bot_id:id(21),bot_name:'LEYLEY',app_name:'LEYLEY',bot_description:'A little help for your community. Commands, answers and good company.',bot_is_public:true,bot_last_used_at:new Date().toISOString(),default_install_permissions:['bot:send_messages','bot:use_slash_commands','bot:read_basic_channel_metadata','bot:manage_own_commands','bot:add_reactions','bot:read_message_history']},
    {app_id:id(12),bot_id:id(22),bot_name:'Community helper',bot_is_public:false}];
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(({user,token,exp})=>localStorage.setItem('sb-tbbgwjmmaiclkhssimhf-auth-token',JSON.stringify({access_token:token,refresh_token:'test-refresh',expires_at:exp,user})),{user,token,exp});
  const writes=[];
  let auditReads=0;
  const longValue='test-role-'.repeat(120);
  await context.route('https://tbbgwjmmaiclkhssimhf.supabase.co/**',async route=>{
    const name=new URL(route.request().url()).pathname.split('/').pop();
    const body=route.request().method()==='POST'?route.request().postDataJSON():{};
    let data=[];
    if(name==='user')data=user;
    else if(name==='bots_list_my_apps')data=apps;
    else if(name==='bots_get_my_app_profile')data=apps.filter(app=>app.app_id===body.p_app_id);
    else if(name==='bots_get_event_intents_v1')data={available:true,intents:['messages','message_content']};
    else if(name==='bots_list_app_commands')data=[{command_id:id(31),name:'ping',description:'Check whether your bot is online.',status:'active'}];
    else if(name==='bot_audit_logs'){
      auditReads++;
      data=[{id:id(41),action:'bot.permissions_updated',created_at:'2026-10-01T10:43:00Z',metadata:{install_id:id(51),permissions:['bot:send_messages','bot:read_message_history'],long_value:longValue,note:'<img src=x onerror=alert(1)>',read:auditReads}},
        {id:id(42),action:'bot.managed_role_synced',created_at:'2026-10-01T10:31:00Z',metadata:{managed_role_id:id(52)}},
        {id:id(43),action:'bot.future_event',created_at:'2026-10-01T10:05:00Z',metadata:{new_field:true}}];
    }
    else if(route.request().method()!=='GET'&&!['bots_get_interaction_endpoint','bots_list_interaction_logs'].includes(name))writes.push(name);
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data),headers:{'access-control-allow-origin':'*'}});
  });
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const base=process.env.ALTARA_BOT_SITE_URL;
  const folder=fileURLToPath(new URL('../output/playwright/',import.meta.url));mkdirSync(folder,{recursive:true});
  const fits=async label=>{
    const metrics=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,
      clipped:[...document.querySelectorAll('.developerTopBrand,.developerUserButton,.developerPanel,.developerAppCard,.developerMain .devButton,.developerAppSelect select')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).map(el=>el.className)}));
    assert.ok(metrics.scroll<=metrics.width+1,`${label} must fit: ${JSON.stringify(metrics)}`);
    assert.deepEqual(metrics.clipped,[],`${label} controls must not be clipped`);
  };
  try {
    for(const [path,heading] of [['/developers','What will you create?'],['/developers/applications','My Bots'],[`/developers/applications/${id(11)}/profile`,'Profile'],[`/developers/applications/${id(11)}/permissions`,'Permissions'],[`/developers/applications/${id(11)}/intents`,'Intents'],[`/developers/applications/${id(11)}/code`,'Code'],[`/developers/applications/${id(11)}/logs`,'Logs'],['/developers/docs','Docs']]){
      await page.goto(`${base}${path}`);
      await page.getByRole('heading',{name:heading,exact:true}).waitFor();
      if(path.includes('/applications'))await page.waitForFunction(()=>document.querySelector('select')?.options.length>=3);
      const slug=heading.toLowerCase().replaceAll(' ','-').replace('?','');
      await fits(`${heading} desktop`);
      await page.screenshot({path:`${folder}/developer-${slug}-desktop.png`,fullPage:true});
      await page.setViewportSize({width:390,height:844});
      await fits(`${heading} mobile`);
      if(path.includes('/applications/')||path.endsWith('/docs')){
        const headingBox=await page.getByRole('heading',{name:heading,exact:true}).boundingBox();
        assert.ok(headingBox.y<450,'mobile content appears before a long section menu');
        assert.equal(await page.getByRole('navigation',{name:'Bot sections'}).isVisible(),false);
      }
      await page.screenshot({path:`${folder}/developer-${slug}-mobile.png`,fullPage:true});
      await page.setViewportSize({width:1440,height:1000});
    }
    await page.goto(`${base}/developers/applications/${id(11)}/logs`);
    await page.getByText('Server permissions updated',{exact:true}).waitFor();
    const log=page.locator('.logRow').first(),details=log.locator('details');
    assert.equal(await details.getAttribute('open'),null,'raw metadata starts collapsed');
    await details.locator('summary').focus();await page.keyboard.press('Enter');
    assert.notEqual(await details.getAttribute('open'),null,'technical details open from the keyboard');
    assert.equal(JSON.parse(await log.locator('pre code').textContent()).long_value,longValue,'all metadata remains available');
    assert.equal(await log.locator('img').count(),0,'untrusted metadata stays text');
    assert.equal(await page.getByText('Future event',{exact:true}).count(),1,'new audit actions remain visible');
    for(const width of [1440,1024,820,390,320]){
      await page.setViewportSize({width,height:844});await fits(`expanded logs at ${width}`);
      const bounds=await log.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,
        children:[...el.querySelectorAll('*')].filter(child=>child.getBoundingClientRect().right>el.getBoundingClientRect().right+1).map(child=>child.tagName)}));
      assert.ok(bounds.scroll<=bounds.width+1,`long log metadata wraps at ${width}`);
      assert.deepEqual(bounds.children,[],`log children stay inside their card at ${width}`);
    }
    await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:`${folder}/developer-logs-expanded-desktop.png`,fullPage:true});
    const previousRead=JSON.parse(await log.locator('pre code').textContent()).read;
    await page.getByRole('button',{name:'Refresh',exact:true}).click();
    await page.waitForFunction(previous=>JSON.parse(document.querySelector('.logRow pre code').textContent).read>previous,previousRead);
    await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:`${folder}/developer-logs-expanded-mobile.png`,fullPage:true});
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(`${base}/developers/applications/${id(11)}/permissions`);
    await page.getByRole('heading',{name:'Permissions',exact:true}).waitFor();
    const reaction=page.getByRole('checkbox',{name:/Add Reactions/});
    await reaction.focus();
    assert.match(await reaction.evaluate(el=>getComputedStyle(el).outlineStyle),/solid/,'checkbox has visible keyboard focus');
    await page.keyboard.press('Space');assert.equal(await reaction.isChecked(),false);
    assert.equal(await page.getByRole('button',{name:'Save permissions',exact:true}).isEnabled(),true);
    assert.equal(await page.getByRole('checkbox',{name:/Send Messages/}).isDisabled(),true);
    for(const width of [1180,1024,820,800,390,320]){
      await page.setViewportSize({width,height:844});await fits(`permissions at ${width}`);
      if(width>800){
        const header=await page.locator('.developerTopBar').boundingBox();
        const sidebar=await page.locator('.developerSidebar').boundingBox();
        assert.ok(sidebar.y>=header.y+header.height-1,'sidebar clears the sticky header');
      }
    }
    await page.setViewportSize({width:390,height:844});
    const sections=page.getByRole('button',{name:/Sections/});
    await sections.focus();await page.keyboard.press('Enter');assert.equal(await sections.getAttribute('aria-expanded'),'true');
    const intents=page.getByRole('navigation',{name:'Bot sections'}).getByRole('link',{name:'Intents',exact:true});
    await intents.click();await page.getByRole('heading',{name:'Intents',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:/Sections/}).getAttribute('aria-expanded'),'false');
    await page.getByRole('button',{name:/Sections/}).click();
    assert.equal(await page.getByRole('navigation',{name:'Bot sections'}).getByRole('link',{name:'Intents',exact:true}).getAttribute('aria-current'),'page');
    await page.getByRole('button',{name:/Sections/}).click();
    await page.locator('.developerUserButton').click();await page.getByRole('menu',{name:'Account menu'}).waitFor();await fits('mobile account menu');
    await page.keyboard.press('Escape');assert.equal(await page.getByRole('menu',{name:'Account menu'}).count(),0);
    assert.deepEqual(writes,[],'layout tests never mutate the backend');
    assert.deepEqual(errors,[]);
  } finally {await context.close();await browser.close();}
});
