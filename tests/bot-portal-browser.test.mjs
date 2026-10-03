import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
const enabled=Boolean(process.env.ALTARA_PTBR_PLAYWRIGHT && process.env.ALTARA_BOT_SITE_URL);

test('permission defaults persist, isolate bots, survive late reads and retain failed edits',{skip:!enabled,timeout:120000},async()=>{
  const {chromium}=createRequire(import.meta.url)(process.env.ALTARA_PTBR_PLAYWRIGHT);
  const browser=await chromium.launch({executablePath:process.env.ALTARA_PTBR_CHROME,headless:true});
  const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const actor=id(1),a=id(11),b=id(12);
  const core=['bot:send_messages','bot:use_slash_commands','bot:read_basic_channel_metadata','bot:manage_own_commands'];
  const apps=[{app_id:a,bot_id:id(21),app_name:'Alpha',bot_name:'Alpha',default_install_permissions:[...core,'bot:add_reactions']},
    {app_id:b,bot_id:id(22),app_name:'Beta',bot_name:'Beta',default_install_permissions:[...core,'bot:connect_voice']}];
  const user={id:actor,aud:'authenticated',role:'authenticated',email:'permission-test@example.com',app_metadata:{},user_metadata:{}};
  const exp=Math.floor(Date.now()/1000)+3600;
  const token=[{alg:'HS256',typ:'JWT'},{sub:actor,aud:'authenticated',role:'authenticated',exp},'test-signature'].map((v,i)=>i<2?Buffer.from(JSON.stringify(v)).toString('base64url'):v).join('.');
  const context=await browser.newContext();
  await context.addInitScript(({user,token,exp})=>localStorage.setItem('sb-tbbgwjmmaiclkhssimhf-auth-token',JSON.stringify({access_token:token,refresh_token:'test-refresh',expires_at:exp,user})),{user,token,exp});
  const fulfill=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body),headers:{'access-control-allow-origin':'*'}});
  let lateProfile,pendingSave,mode='ok',writes=[];
  await context.route('https://tbbgwjmmaiclkhssimhf.supabase.co/**',async route=>{
    const name=new URL(route.request().url()).pathname.split('/').pop();
    const body=route.request().method()==='POST'?route.request().postDataJSON():{};
    let data=[];
    if(name==='user')data=user;
    else if(name==='bots_list_my_apps')data=apps;
    else if(name==='bots_get_my_app_profile'){
      data=apps.filter(app=>app.app_id===body.p_app_id);
      if(body.p_app_id===a&&!lateProfile){lateProfile={route,data:structuredClone(data)};return;}
    }
    else if(name==='bots_get_event_intents_v1')return fulfill(route,{code:'PGRST202',message:'Could not find the function bots_get_event_intents_v1'},404);
    else if(name==='bots_update_bot_default_permissions'){
      writes.push(body);
      const app=apps.find(app=>app.bot_id===body.p_bot_id);assert.ok(app,'save uses the bot ID, not the application ID');
      assert.ok(core.every(key=>body.p_permissions.includes(key)),'required grants are retained');
      assert.equal(new Set(body.p_permissions).size,body.p_permissions.length);
      if(mode==='fail')return fulfill(route,{message:'Permission save rejected for testing'},403);
      if(mode==='malformed')return fulfill(route,[{bot_id:b,default_install_permissions:body.p_permissions}]);
      const acknowledged={bot_id:app.bot_id,default_install_permissions:[...body.p_permissions]};
      if(mode==='pending'){pendingSave={route,app,acknowledged};return;}
      app.default_install_permissions=acknowledged.default_install_permissions;data=[acknowledged];
    }
    await fulfill(route,data);
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
  const base=process.env.ALTARA_BOT_SITE_URL;
  const observer=await context.newPage();
  await observer.goto(`${base}/developers/docs`);
  await observer.evaluate(()=>{
    window.botNotifications=[];
    window.botNotificationChannel=new BroadcastChannel('altara:multi-session:v1');
    window.botNotificationChannel.onmessage=event=>{if(event.data?.type==='altara_bot_metadata_changed')window.botNotifications.push(event.data);};
  });
  const checkbox=name=>page.locator('label').filter({has:page.locator('b').filter({hasText:new RegExp(`^${name}(?: · Required)?$`)})}).getByRole('checkbox');
  const save=()=>page.getByRole('button',{name:'Save permissions',exact:true});
  const open=async()=>{await page.goto(`${base}/developers/applications/${a}/permissions`);await page.getByRole('heading',{name:'Permissions',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('select')?.options.length>=3);};
  const select=async id=>{await page.locator('select').first().selectOption(id);await page.waitForURL(`**/developers/applications/${id}`);await page.getByRole('link',{name:'Permissions',exact:true}).click();await page.getByRole('heading',{name:'Permissions',exact:true}).waitFor();};
  try{
    await open();
    assert.equal(await checkbox('Add Reactions').isChecked(),true);
    assert.equal(await checkbox('Connect to Voice').isChecked(),false);
    assert.equal(await checkbox('Send Messages').isDisabled(),true);
    for(const name of ['Consenting Direct Messages','Manage Roles','Kick Members','Ban Members','Timeout Members','Moderate Member Messages','Manage Webhooks','Mention Members','Receive Consenting Microphones','Record Consenting Microphones','Manage Server','Manage Channels']){
      assert.equal(await checkbox(name).isChecked(),false,`${name} requires an explicit permission choice`);
    }
    assert.equal(await save().isDisabled(),true);
    for(let attempt=0;!lateProfile&&attempt<100;attempt++)await page.waitForTimeout(10);
    assert.ok(lateProfile);
    await checkbox('Connect to Voice').check();await save().click();
    await page.getByText('Default permissions saved. Existing servers must authorize permission changes.',{exact:true}).waitFor();
    assert.equal(writes.length,1);
    await observer.waitForFunction(()=>window.botNotifications.length===1);
    assert.deepEqual(await observer.evaluate(()=>window.botNotifications),[{type:'altara_bot_metadata_changed',userId:actor,appId:a,botId:id(21)}]);
    assert.deepEqual(writes[0],{p_bot_id:id(21),p_permissions:[...core,'bot:add_reactions','bot:connect_voice']});
    await fulfill(lateProfile.route,lateProfile.data);
    await page.waitForTimeout(100);
    assert.equal(await checkbox('Connect to Voice').isChecked(),true,'old profile cannot roll back acknowledged defaults');
    assert.equal(await save().isDisabled(),true);
    await page.reload();await page.getByRole('heading',{name:'Permissions',exact:true}).waitFor();
    assert.equal(await checkbox('Connect to Voice').isChecked(),true,'save survives a new page session');
    await page.getByRole('link',{name:'Installation',exact:true}).click();
    const install=page.getByRole('link',{name:'Open',exact:true});await install.waitFor();
    assert.deepEqual(new URL(await install.getAttribute('href'),base).searchParams.get('permissions').split(','),apps[0].default_install_permissions);
    await page.getByRole('link',{name:'Permissions',exact:true}).click();
    await checkbox('Pin Messages').check();
    await select(b);
    assert.equal(await checkbox('Pin Messages').isChecked(),false,'Alpha draft stays out of Beta');
    assert.equal(await checkbox('Add Reactions').isChecked(),false);
    assert.equal(await checkbox('Connect to Voice').isChecked(),true);
    assert.equal(await save().isDisabled(),true);
    await select(a);
    assert.equal(await checkbox('Pin Messages').isChecked(),false,'returning to a bot loads saved defaults');
    await checkbox('Pin Messages').check();
    mode='fail';await save().click();
    await page.getByText('Permission save rejected for testing',{exact:true}).waitFor();
    assert.equal(await checkbox('Pin Messages').isChecked(),true);assert.equal(await save().isDisabled(),false);
    assert.equal(writes.length,2,'failed saves are not silently retried');
    mode='malformed';await save().click();
    await page.getByText('Could not confirm saved permissions. Reload and try again.',{exact:true}).waitFor();
    assert.equal(await save().isDisabled(),false,'wrong-bot acknowledgement cannot clear the draft');
    assert.equal(await observer.evaluate(()=>window.botNotifications.length),1,'failed or malformed saves do not invalidate other tabs');
    mode='pending';await save().click();
    for(let attempt=0;!pendingSave&&attempt<100;attempt++)await page.waitForTimeout(10);
    assert.ok(pendingSave);
    assert.equal(await checkbox('Pin Messages').isDisabled(),true);
    await page.getByRole('button',{name:'Saving...',exact:true}).dispatchEvent('click');
    assert.equal(writes.length,4,'a pending save cannot be replayed by another click');
    await select(b);
    pendingSave.app.default_install_permissions=pendingSave.acknowledged.default_install_permissions;
    await fulfill(pendingSave.route,[pendingSave.acknowledged]);
    await page.getByRole('button',{name:'Save permissions',exact:true}).waitFor();
    assert.equal(await checkbox('Pin Messages').isChecked(),false,'late Alpha save cannot alter Beta');
    assert.equal(await save().isDisabled(),true);
    assert.equal(await page.getByText('Default permissions saved. Existing servers must authorize permission changes.',{exact:true}).count(),0);
    await select(a);assert.equal(await checkbox('Pin Messages').isChecked(),true);assert.equal(await save().isDisabled(),true);
    for(const input of await page.getByRole('checkbox').all())if(!await input.isDisabled())await input.check();
    // Confirm another acknowledged save in the mounted page, after the earlier pending page was left.
    mode='ok';await save().click();
    await page.getByText('Default permissions saved. Existing servers must authorize permission changes.',{exact:true}).waitFor();
    await observer.waitForFunction(()=>window.botNotifications.length===2);
    for(const width of [1280,390]){
      await page.setViewportSize({width,height:844});
      const dimensions=await page.locator('.permissionOutput').evaluate(element=>({scroll:element.scrollWidth,width:element.clientWidth,right:element.getBoundingClientRect().right,viewport:innerWidth}));
      assert.ok(dimensions.scroll<=dimensions.width+1,`permission list wraps at ${width}px`);
      assert.ok(dimensions.right<=dimensions.viewport,`permission list fits viewport at ${width}px`);
    }
    await page.getByRole('button',{name:/Sections/}).click();
    await page.getByRole('link',{name:'Intents',exact:true}).click();
    await page.getByRole('heading',{name:'Intents',exact:true}).waitFor();
    await page.getByText('Event delivery is prepared but has not been activated on the server yet.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('checkbox',{name:/^Messages Intent\b/}).isDisabled(),true);
    assert.deepEqual(errors,[]);
  }finally{await context.close();await browser.close();}
});

test('bot docs and code provide working starter downloads, honest support limits and implemented permission keys',{skip:!enabled,timeout:120000},async()=>{
  const {chromium}=createRequire(import.meta.url)(process.env.ALTARA_PTBR_PLAYWRIGHT);
  const browser=await chromium.launch({executablePath:process.env.ALTARA_PTBR_CHROME,headless:true});
  const actor='00000000-0000-4000-8000-000000000001',app='00000000-0000-4000-8000-000000000011';
  const user={id:actor,aud:'authenticated',role:'authenticated',email:'test@example.com',app_metadata:{},user_metadata:{}};
  const exp=Math.floor(Date.now()/1000)+3600;
  const token=[{alg:'HS256',typ:'JWT'},{sub:actor,aud:'authenticated',role:'authenticated',exp},'test-signature'].map((v,i)=>i<2?Buffer.from(JSON.stringify(v)).toString('base64url'):v).join('.');
  const context=await browser.newContext(),page=await context.newPage(),errors=[],failedChunks=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{
    if(response.status()>=400 && response.url().includes('/_next/static/')) {
      failedChunks.push(`${response.status()} ${new URL(response.url()).pathname}`);
    }
  });
  await context.addInitScript(({user,token,exp})=>localStorage.setItem('sb-tbbgwjmmaiclkhssimhf-auth-token',JSON.stringify({access_token:token,refresh_token:'test-refresh',expires_at:exp,user})),{user,token,exp});
  await context.route('https://tbbgwjmmaiclkhssimhf.supabase.co/**',async route=>{
    const url=route.request().url();
    let data=[];
    if(url.includes('/auth/v1/user'))data=user;
    if(url.includes('bots_list_my_apps'))data=[{app_id:app,bot_id:app,app_name:'Docs bot',bot_name:'Docs bot'}];
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data),headers:{'access-control-allow-origin':'*'}});
  });
  const base=process.env.ALTARA_BOT_SITE_URL;
  try{
    await page.goto(`${base}/developers`);
    await page.getByRole('heading',{name:'What will you create?'}).waitFor();
    await page.goto(`${base}/developers/docs`);
    await page.getByRole('heading',{name:'Moving a Discord bot'}).waitFor();
    assert.match(await page.locator('main').textContent(),/no advertised official npm\/PyPI package/i);
    for(const name of ['FAQ bot (JavaScript)','Calculator bot (Python)']){
      const link=page.getByRole('link',{name,exact:true});
      assert.ok(await link.getAttribute('download')!==null);
      const response=await context.request.get(`${base}${await link.getAttribute('href')}`);
      assert.equal(response.status(),200);
      assert.equal((await response.body()).subarray(0,4).toString('hex'),'504b0304');
    }
    const guide=await context.request.get(`${base}/bot-starters/ALTARA_BOTS_SDK.md`);
    assert.equal(guide.status(),200);assert.match(await guide.text(),/canonical implementation/);
    await page.goto(`${base}/developers/applications/${app}/code`);
    await page.getByRole('heading',{name:'Code',exact:true}).waitFor();
    const block=title=>page.locator('.codeBlock').filter({has:page.getByText(title,{exact:true})}).locator('pre');
    assert.equal(await page.getByRole('group',{name:'Your computer'}).getByRole('button',{name:'Windows (PowerShell)'}).getAttribute('aria-pressed'),'true');
    assert.match(await block('Prepare the downloaded starter').textContent(),/if \(!\(Test-Path \.env\)\)/,'existing token file is preserved');
    assert.equal(await block('Run the downloaded starter').textContent(),'npm start');
    assert.equal(await page.locator('.developerSteps').getByRole('heading').count(),5);
    assert.equal(await page.locator('.developerSteps').getByRole('link',{name:'Token',exact:true}).getAttribute('href'),`/developers/applications/${app}/token`);
    assert.equal(await page.locator('.developerSteps').getByRole('link',{name:'Installation',exact:true}).getAttribute('href'),`/developers/applications/${app}/install`);
    assert.match(await page.locator('pre').last().textContent(),/require\("\.\/altara"\)/);
    await page.getByRole('button',{name:'Python',exact:true}).click();
    assert.match(await block('Prepare the downloaded starter').textContent(),/\.\\\.venv\\Scripts\\python.exe -m pip install -r requirements.txt/);
    assert.equal(await block('Run the downloaded starter').textContent(),'.\\.venv\\Scripts\\python.exe main.py');
    await page.getByRole('button',{name:'macOS / Linux',exact:true}).click();
    assert.match(await block('Prepare the downloaded starter').textContent(),/python3 -m venv \.venv\n\[ -f \.env \] \|\| cp \.env.example \.env\n\.venv\/bin\/python -m pip install/);
    assert.equal(await block('Run the downloaded starter').textContent(),'.venv/bin/python main.py');
    assert.match(await page.locator('pre').last().textContent(),/load_dotenv\(\)/);
    await page.setViewportSize({width:390,height:844});
    const faq=await page.getByRole('link',{name:'FAQ bot (JavaScript)',exact:true}).boundingBox();
    assert.ok(faq.x>=0&&faq.x+faq.width<=390,'mobile download button fits viewport');
    const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,
      overflow:[...document.querySelectorAll('main *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).slice(0,10).map(el=>({tag:el.tagName,className:el.className,right:el.getBoundingClientRect().right}))}));
    assert.ok(layout.scroll<=layout.width+1,`mobile setup has no page-wide overflow: ${JSON.stringify(layout)}`);
    await page.getByText('Bot still offline or not replying?',{exact:true}).click();
    await page.getByText('If no commands appear, check the startup message for successful command sync and confirm you installed the same bot.',{exact:true}).waitFor();
    const screenshotFolder=fileURLToPath(new URL('../output/playwright/',import.meta.url));mkdirSync(screenshotFolder,{recursive:true});
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:`${screenshotFolder}/bot-start-python-mobile.png`,fullPage:true});
    await page.getByRole('button',{name:'JavaScript',exact:true}).click();
    assert.equal(await block('Prepare the downloaded starter').textContent(),'[ -f .env ] || cp .env.example .env');
    assert.equal(await block('Run the downloaded starter').textContent(),'npm start');
    await page.setViewportSize({width:1280,height:844});
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:`${screenshotFolder}/bot-start-desktop.png`,fullPage:true});
    await page.goto(`${base}/developers/applications/${app}/permissions`);
    await page.getByRole('heading',{name:'Permissions',exact:true}).waitFor();
    assert.equal(await page.locator('input[type="checkbox"]:checked').count(),4,'a new bot starts with only the four required permissions');
    for(const input of await page.getByRole('checkbox').all()){
      if(!await input.isDisabled())assert.equal(await input.isChecked(),false,'optional permissions require an explicit choice');
    }
    const connect=page.getByRole('checkbox',{name:/Connect to Voice/});
    assert.equal(await connect.isDisabled(),false);await connect.check();
    assert.match(await page.locator('.permissionOutput code').textContent(),/bot:connect_voice/);
    assert.equal(await page.getByRole('checkbox',{name:/Attach Files/}).isDisabled(),false);
    assert.equal(await page.getByRole('checkbox',{name:/Attach Files/}).isChecked(),false,'file uploads require an explicit permission choice');
    assert.equal(await page.getByRole('checkbox',{name:/Administrator/}).isDisabled(),true);
    assert.deepEqual(failedChunks,[],'developer navigation must load every current build chunk');
    assert.deepEqual(errors,[]);
  }finally{await context.close();await browser.close();}
});
test('bot portal isolates delayed data and tokens, serializes token writes and reports load failures',{skip:!enabled,timeout:120000},async()=>{
  const {chromium}=createRequire(import.meta.url)(process.env.ALTARA_PTBR_PLAYWRIGHT);
  const browser=await chromium.launch({executablePath:process.env.ALTARA_PTBR_CHROME,headless:true});
  const actor='00000000-0000-4000-8000-000000000001';
  const a='00000000-0000-4000-8000-000000000011',b='00000000-0000-4000-8000-000000000012';
  const c='00000000-0000-4000-8000-000000000013';
  const apps=[{app_id:a,bot_id:a,app_name:'Alpha',bot_name:'Alpha'},{app_id:b,bot_id:b,app_name:'Beta',bot_name:'Beta'}];
  const user={id:actor,aud:'authenticated',role:'authenticated',email:'bot-test@example.com',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
  const exp=Math.floor(Date.now()/1000)+3600;
  const token=[{alg:'HS256',typ:'JWT'},{sub:actor,aud:'authenticated',role:'authenticated',exp},'test-signature'].map((v,i)=>i<2?Buffer.from(JSON.stringify(v)).toString('base64url'):v).join('.');
  const context=await browser.newContext();
  await context.addInitScript(({user,token,exp})=>localStorage.setItem('sb-tbbgwjmmaiclkhssimhf-auth-token',JSON.stringify({access_token:token,refresh_token:'test-refresh',token_type:'bearer',expires_at:exp,expires_in:3600,user})),{user,token,exp});
  let pendingAlphaCommands,pendingToken,tokenWrites=0,revokeWrites=0,createdApps=0,failCommands=false;
  const fulfill=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body),headers:{'access-control-allow-origin':'*'}});
  await context.route('https://tbbgwjmmaiclkhssimhf.supabase.co/**',async route=>{
    const url=new URL(route.request().url()),name=url.pathname.split('/').pop();let data=[];
    const body=route.request().method()==='POST'?route.request().postDataJSON():{};
    if(name==='user')data=user;
    else if(name==='bots_list_my_apps')data=apps;
    else if(name==='bots_get_my_app_profile')data=apps.filter(app=>app.app_id===body.p_app_id);
    else if(name==='bots_list_app_commands'){
      if(failCommands)return fulfill(route,{message:'Commands unavailable for testing'},503);
      if(body.p_bot_id===a && !pendingAlphaCommands){pendingAlphaCommands=route;return;}
      data=[{command_id:body.p_bot_id,name:body.p_bot_id===a?'alpha':'beta',description:'Test command',status:'active'}];
    }
    else if(name==='bots_get_interaction_endpoint')data=[{endpoint_url:`https://${body.p_app_id===a?'alpha':'beta'}.example.com/callback`,last_status:'verified'}];
    else if(name==='bots_regenerate_token'){tokenWrites++;pendingToken=route;return;}
    else if(name==='bots_revoke_token'){revokeWrites++;data=[];}
    else if(name==='bots_create_developer_app'){createdApps++;data=[{app_id:c}];}
    else if(name==='bots_create_bot'){
      apps.push({app_id:c,bot_id:c,app_name:'Created bot',bot_name:'Created bot'});
      data=[{bot_id:c,bot_token:'test-only-created-secret'}];
    }
    await fulfill(route,data);
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  const base=process.env.ALTARA_BOT_SITE_URL;
  try {
    await page.goto(`${base}/developers/applications/${a}/commands`);
    await page.getByRole('heading',{name:'Synced commands',exact:true}).waitFor();
    await page.waitForFunction(()=>document.querySelector('select')?.options.length>=3);
    for(let attempt=0;!pendingAlphaCommands && attempt<100;attempt++) await page.waitForTimeout(10);
    assert.ok(pendingAlphaCommands,'Alpha command request was captured');
    await page.locator('select').first().selectOption(b);
    await page.waitForURL(`**/developers/applications/${b}`);
    await page.getByRole('link',{name:'Commands',exact:true}).click();
    await page.getByText('/beta',{exact:true}).waitFor();
    await fulfill(pendingAlphaCommands,[{command_id:a,name:'alpha',description:'Late alpha',status:'active'}]);
    await page.waitForTimeout(150);
    assert.equal(await page.getByText('/alpha',{exact:true}).count(),0,'late previous-bot response stays hidden');
    assert.equal(await page.getByText('/beta',{exact:true}).count(),1);
    await page.getByRole('link',{name:'Token',exact:true}).click();
    await page.getByRole('button',{name:'Reset / Regenerate token'}).click();
    await page.getByRole('button',{name:'Revoke token',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Revoke token',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'Revoke token',exact:true}).dispatchEvent('click');
    assert.equal(revokeWrites,0,'a second mutation is blocked even if click is dispatched');
    await page.locator('select').first().selectOption(a);
    await page.waitForURL(`**/developers/applications/${a}`);
    await page.getByRole('heading',{name:'Profile',exact:true}).waitFor();
    await fulfill(pendingToken,[{bot_token:'test-only-secret-for-beta'}]);
    await page.waitForTimeout(150);
    assert.equal(await page.getByText('test-only-secret-for-beta',{exact:true}).count(),0,'Beta token does not appear on Alpha');
    assert.equal(tokenWrites,1);
    await page.getByRole('link',{name:'Token',exact:true}).click();
    assert.equal(await page.getByText('test-only-secret-for-beta',{exact:true}).count(),0);
    await page.locator('select').first().selectOption(b);
    await page.waitForURL(`**/developers/applications/${b}`);
    await page.getByRole('link',{name:'Token',exact:true}).click();
    await page.getByRole('button',{name:'Reset / Regenerate token'}).click();
    await page.waitForTimeout(50);
    await fulfill(pendingToken,[{bot_token:'test-only-current-secret'}]);
    await page.getByText('test-only-current-secret',{exact:true}).waitFor();
    // Local file validation must precede the first create RPC.
    await page.getByRole('button',{name:'New Bot',exact:true}).click();
    await page.getByLabel('Bot name', {exact:true}).fill('Bad image bot');
    await page.locator('input[name="avatar_file"]').setInputFiles({name:'bad.html',mimeType:'text/html',buffer:Buffer.from('<html>bad</html>')});
    await page.getByRole('button',{name:'Create Bot',exact:true}).click();
    await page.getByText('Upload PNG, JPG/JPEG, WEBP, or GIF images only.',{exact:true}).waitFor();
    assert.equal(createdApps,0);
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.getByRole('button',{name:'New Bot',exact:true}).click();
    await page.getByLabel('Bot name', {exact:true}).fill('Created bot');
    await page.getByRole('button',{name:'Create Bot',exact:true}).click();
    await page.waitForURL(`**/developers/applications/${c}/token`);
    await page.getByText('test-only-created-secret',{exact:true}).waitFor({timeout:5000});
    assert.equal(createdApps,1);
    assert.equal(await page.evaluate(()=>JSON.stringify(localStorage).includes('test-only-created-secret')),false,'token is not persisted in browser storage');
    await page.reload();
    await page.getByRole('heading',{name:'Token',exact:true}).waitFor();
    assert.equal(await page.getByText('test-only-created-secret',{exact:true}).count(),0,'once-only token is cleared by reload');
    failCommands=true;
    await page.locator('select').first().selectOption(a);
    await page.waitForURL(`**/developers/applications/${a}`);
    await page.getByText(/Could not load commands: Commands unavailable for testing/).waitFor();
    assert.deepEqual(errors,[]);
  } finally { await context.close();await browser.close(); }
});

test('bot profile images use verified signed uploads, preserve failed edits and retain creation tokens',{skip:!enabled,timeout:120000},async()=>{
  const {chromium}=createRequire(import.meta.url)(process.env.ALTARA_PTBR_PLAYWRIGHT);
  const browser=await chromium.launch({executablePath:process.env.ALTARA_PTBR_CHROME,headless:true});
  const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const actor=id(1),a=id(11),b=id(12),created=id(13),origin='https://tbbgwjmmaiclkhssimhf.supabase.co';
  const apps=[{app_id:a,bot_id:id(21),app_name:'Alpha',bot_name:'Alpha',bot_is_public:true},{app_id:b,bot_id:id(22),app_name:'Beta',bot_name:'Beta'}];
  const user={id:actor,aud:'authenticated',role:'authenticated',email:'upload-test@example.com',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
  const exp=Math.floor(Date.now()/1000)+3600;
  const token=[{alg:'HS256',typ:'JWT'},{sub:actor,aud:'authenticated',role:'authenticated',exp},'test-signature'].map((v,i)=>i<2?Buffer.from(JSON.stringify(v)).toString('base64url'):v).join('.');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jNMsAAAAASUVORK5CYII=','base64');
  const context=await browser.newContext();
  await context.addInitScript(({user,token,exp})=>localStorage.setItem('sb-tbbgwjmmaiclkhssimhf-auth-token',JSON.stringify({access_token:token,refresh_token:'test-refresh',token_type:'bearer',expires_at:exp,expires_in:3600,user})),{user,token,exp});
  let mode='',pendingComplete,profileWrites=0,directWrites=0,createdBots=0;
  const admissions=new Map(),operations=[];
  const fulfill=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body),headers:{'access-control-allow-origin':'*'}});
  const delivery=row=>`${origin}/storage/v1/object/public/avatars/${actor}/developer-bots/${row.app_id}/${row.upload_context}_${row.upload_id}.png`;
  const complete=row=>({ok:true,upload_id:row.upload_id,public_url:mode==='bad-url'?'https://untrusted.invalid/image.png':delivery(row),visibility:'public',detected_mime:row.mime_type,actual_size:row.file_size,content_class:'image'});
  await context.route(`${origin}/**`,async route=>{
    const url=new URL(route.request().url()),name=url.pathname.split('/').pop();
    if(url.pathname.startsWith('/storage/v1/object/public/'))return route.fulfill({contentType:'image/png',body:png});
    if(url.pathname.startsWith('/storage/v1/object/upload/sign/')){
      operations.push({action:'signed-upload',path:url.pathname,body:route.request().postDataBuffer()});
      assert.ok(url.pathname.includes('/altara-upload-staging-v1/'));
      assert.equal(url.searchParams.get('token'),'test-only-capability');
      return fulfill(route,{Key:'test-staging-image'});
    }
    if(url.pathname.startsWith('/storage/')){directWrites++;return fulfill(route,{message:'new row violates row-level security policy'},403);}
    const body=route.request().method()==='POST'?route.request().postDataJSON():{};
    let data=[];
    if(name==='user')data=user;
    else if(name==='bots_list_my_apps')data=apps;
    else if(name==='bots_get_my_app_profile')data=apps.filter(app=>app.app_id===body.p_app_id);
    else if(name==='altara-upload-authorize'){
      operations.push(body);
      if(body.action==='authorize'){
        if(mode==='deny')return fulfill(route,{ok:false,error:'developer_asset_owner_required'},403);
        const uploadId=id(100+admissions.size),row={...body,upload_id:uploadId};admissions.set(uploadId,row);
        return fulfill(route,{ok:true,upload_id:uploadId,bucket:'altara-upload-staging-v1',path:`${actor}/${uploadId}/image.png`,token:'test-only-capability'});
      }
      const row=admissions.get(body.upload_id);assert.ok(row,'completion uses admitted upload');
      if(mode==='pending'){pendingComplete={route,row};return;}
      if(mode==='reject-content')return fulfill(route,{ok:false,error:'image_content_required'},400);
      return fulfill(route,complete(row));
    }
    else if(name==='bots_update_bot_profile'){
      profileWrites++;operations.push({action:'save-profile',...body});
      const app=apps.find(app=>app.bot_id===body.p_bot_id);assert.ok(app);
      Object.assign(app,{bot_avatar_url:body.p_avatar_url,bot_banner_url:body.p_banner_url});data=[app];
    }
    else if(name==='bots_create_developer_app')data=[{app_id:created}];
    else if(name==='bots_create_bot'){
      createdBots++;apps.push({app_id:created,bot_id:id(23),app_name:'New image bot',bot_name:'New image bot'});
      data=[{bot_id:id(23),bot_token:'test-only-created-image-secret'}];
    }
    await fulfill(route,data);
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
  const base=process.env.ALTARA_BOT_SITE_URL;
  const file={name:'image.png',mimeType:'image/png',buffer:png};
  const open=async()=>{await page.goto(`${base}/developers/applications/${a}/profile`);await page.getByRole('heading',{name:'Profile',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('select')?.options.length>=3);};
  const save=()=>page.getByRole('button',{name:'Save',exact:true}).click();
  const choose=async(kind,image=file)=>{
    await page.locator(`[name="${kind}_file"]`).setInputFiles(image);
    await page.getByRole('dialog',{name:`Adjust ${kind}`}).waitFor();
    await page.getByRole('button',{name:'Apply',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
  };
  const draft=kind=>page.evaluate(async kind=>{
    const element=document.querySelector(kind==='avatar'?'.botProfilePreview .devAvatar':'.botProfilePreview .devBannerPreview');
    const url=element.style.backgroundImage.match(/url\("?(.*?)"?\)/)?.[1];
    if(!url?.startsWith('blob:'))return null;
    const blob=await(await fetch(url)).blob(),image=await createImageBitmap(blob);
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    const pixel=Array.from(ctx.getImageData(image.width/2,image.height/2,1,1).data);
    image.close();return {url,width:canvas.width,height:canvas.height,pixel,bytes:Array.from(new Uint8Array(await blob.arrayBuffer()))};
  },kind);
  try{
    await open();
    const wide=Buffer.from((await page.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.width=900;canvas.height=300;
      const ctx=canvas.getContext('2d');['red','lime','blue'].forEach((color,i)=>{ctx.fillStyle=color;ctx.fillRect(i*300,0,300,300);});
      return canvas.toDataURL('image/png').split(',')[1];
    })),'base64');
    const wideFile={name:'wide.png',mimeType:'image/png',buffer:wide};
    await page.getByRole('button',{name:'Upload avatar',exact:true}).focus();
    await page.locator('[name="avatar_file"]').setInputFiles(wideFile);
    const crop=page.getByRole('group',{name:'Adjust avatar position'});
    await page.getByRole('img',{name:'avatar preview'}).waitFor();
    const avatarBounds=await crop.boundingBox();
    assert.ok(avatarBounds.width>=300&&avatarBounds.height>=300,'avatar crop stays large despite homepage avatar styles');
    assert.ok(Math.abs(avatarBounds.width-avatarBounds.height)<1,'avatar crop is square');
    const titleSize=await page.getByRole('heading',{name:'Adjust avatar',exact:true}).evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
    assert.ok(titleSize>=18&&titleSize<=24,'editor title does not inherit homepage headline sizing');
    if(process.env.ALTARA_BOT_AVATAR_CROP_SCREENSHOT)await page.screenshot({path:process.env.ALTARA_BOT_AVATAR_CROP_SCREENSHOT});
    assert.equal(operations.length,0,'opening preview makes no upload request');
    const previewImage=page.getByRole('img',{name:'avatar preview'});
    const beforeArrow=await previewImage.evaluate(el=>el.style.left);
    await crop.focus();await page.keyboard.press('ArrowRight');
    assert.notEqual(await previewImage.evaluate(el=>el.style.left),beforeArrow,'keyboard adjusts framing');
    for(let n=0;n<6;n++){
      await page.keyboard.press('Tab');
      assert.equal(await page.getByRole('dialog').evaluate(el=>el.contains(document.activeElement)),true,'keyboard focus stays inside editor');
    }
    await page.getByLabel('Zoom',{exact:true}).fill('2');
    await page.getByRole('button',{name:'Reset',exact:true}).click();
    assert.equal(await page.getByLabel('Zoom',{exact:true}).inputValue(),'1','reset restores zoom');
    assert.equal(await previewImage.evaluate(el=>el.style.left),beforeArrow,'reset restores centred framing');
    await page.getByLabel('Zoom',{exact:true}).fill('2');
    const bounds=await crop.boundingBox();
    await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();
    await page.mouse.move(bounds.x-bounds.width,bounds.y+bounds.height/2);await page.mouse.up();
    await page.getByRole('button',{name:'Apply',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.botProfilePreview .devAvatar').style.backgroundImage.includes('blob:'));
    const croppedAvatar=await draft('avatar');
    assert.equal(croppedAvatar.width,512);assert.equal(croppedAvatar.height,512);
    assert.deepEqual(croppedAvatar.pixel,[0,0,255,255],'drag and zoom are reflected in the exported crop');
    assert.equal(await page.getByRole('button',{name:'Upload avatar',exact:true}).evaluate(el=>el===document.activeElement),true,'focus returns after closing editor');
    await page.locator('[name="avatar_file"]').setInputFiles(file);
    await page.getByRole('dialog',{name:'Adjust avatar'}).waitFor();await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({state:'hidden'});
    assert.equal((await draft('avatar')).url,croppedAvatar.url,'cancelling preserves applied draft');
    await page.locator('[name="avatar_file"]').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('not an image')});
    await page.getByText('This image could not be opened. Choose another image.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Apply',exact:true}).isDisabled(),true,'undecodable image is never applied');
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    assert.equal((await draft('avatar')).url,croppedAvatar.url);
    await page.locator('[name="banner_file"]').setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});
    await page.getByText('Upload PNG, JPG/JPEG, WEBP, or GIF images only.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Save',exact:true}).isDisabled(),true);
    assert.equal(operations.length,0,'validate both files before uploading either');
    await page.setViewportSize({width:390,height:844});
    await page.locator('[name="avatar_file"]').setInputFiles(wideFile);
    await page.getByRole('img',{name:'avatar preview'}).waitFor();
    const mobileAvatar=await page.getByRole('group',{name:'Adjust avatar position'}).boundingBox();
    assert.ok(mobileAvatar.width>=280&&Math.abs(mobileAvatar.width-mobileAvatar.height)<1,'mobile avatar remains large and square');
    if(process.env.ALTARA_BOT_AVATAR_MOBILE_SCREENSHOT)await page.screenshot({path:process.env.ALTARA_BOT_AVATAR_MOBILE_SCREENSHOT});
    await page.getByRole('button',{name:'Close image editor',exact:true}).click();
    assert.equal((await draft('avatar')).url,croppedAvatar.url,'close button preserves previous draft');
    await page.locator('[name="banner_file"]').setInputFiles(wideFile);
    await page.getByRole('img',{name:'banner preview'}).waitFor();
    const editorBounds=await page.getByRole('dialog').boundingBox();
    assert.ok(editorBounds.x>=0&&editorBounds.x+editorBounds.width<=390,'editor fits narrow screens');
    assert.ok(Math.abs(editorBounds.x+editorBounds.width/2-195)<2&&Math.abs(editorBounds.y+editorBounds.height/2-422)<2,'editor is centred in viewport');
    if(process.env.ALTARA_BOT_CROP_SCREENSHOT)await page.screenshot({path:process.env.ALTARA_BOT_CROP_SCREENSHOT});
    await page.getByRole('button',{name:'Apply',exact:true}).click();
    await page.setViewportSize({width:1280,height:720});
    await page.waitForFunction(()=>document.querySelector('.botProfilePreview .devBannerPreview').style.backgroundImage.includes('blob:'));
    const croppedBanner=await draft('banner');assert.equal(croppedBanner.width,1600);assert.equal(croppedBanner.height,400);
    assert.equal(operations.length,0,'both previews appear before Save');
    await save();
    await page.getByText('Bot profile saved.',{exact:true}).waitFor();
    assert.deepEqual(operations.map(row=>row.action),['authorize','signed-upload','complete','authorize','signed-upload','complete','save-profile']);
    const authorized=operations.filter(row=>row.action==='authorize');
    assert.deepEqual(authorized.map(row=>row.upload_context),['bot_avatar','bot_banner']);
    assert.ok(authorized.every(row=>row.app_id===a&&row.target_id===id(21)));
    assert.equal(authorized[0].file_size,croppedAvatar.bytes.length);assert.equal(authorized[1].file_size,croppedBanner.bytes.length);
    const uploads=operations.filter(row=>row.action==='signed-upload');
    assert.ok(uploads[0].body.includes(Buffer.from(croppedAvatar.bytes)),'actual upload contains adjusted avatar');
    assert.ok(uploads[1].body.includes(Buffer.from(croppedBanner.bytes)),'actual upload contains adjusted banner');
    const saved=operations.at(-1);assert.equal(saved.p_is_public,true,'profile visibility preserved');
    assert.equal(saved.p_avatar_url,delivery([...admissions.values()][0]));assert.equal(saved.p_banner_url,delivery([...admissions.values()][1]));
    await open();assert.equal(await page.locator('[name="avatar_url"]').inputValue(),saved.p_avatar_url);assert.equal(await page.locator('[name="banner_url"]').inputValue(),saved.p_banner_url);
    for(const denied of ['deny','reject-content','bad-url']){
      mode=denied;await choose('avatar');await save();
      await page.locator('.developerNotice.error').waitFor();assert.equal(profileWrites,1,`${denied} does not publish an unverified image`);
      assert.ok(await draft('avatar'),'upload refusal keeps the editable draft');
    }
    mode='pending';await choose('banner');await save();
    for(let n=0;!pendingComplete&&n<100;n++)await page.waitForTimeout(10);assert.ok(pendingComplete);
    await page.locator('select').first().selectOption(b);await page.waitForURL(`**/developers/applications/${b}`);
    await fulfill(pendingComplete.route,complete(pendingComplete.row));
    await page.waitForFunction(()=>!document.querySelector('.devButton.primary:disabled'));
    assert.equal(profileWrites,1,'switching bots during upload prevents stale profile save');
    await page.locator('.botProfilePreview .devAvatar').waitFor();
    assert.equal(await draft('avatar'),null,'previous bot draft does not leak into next bot');
    mode='';
    const gif=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAAAAAAALAAAAAABAAEAAAIBRAA7','base64');
    await page.locator('[name="avatar_file"]').setInputFiles({name:'animated.gif',mimeType:'image/gif',buffer:gif});
    await page.getByText('GIFs keep their original animation and framing.',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Zoom',{exact:true}).count(),0);
    await page.getByRole('button',{name:'Apply',exact:true}).click();await save();
    await page.getByText('Bot profile saved.',{exact:true}).waitFor();
    assert.equal(operations.filter(row=>row.action==='authorize').at(-1).mime_type,'image/gif');
    assert.ok(operations.filter(row=>row.action==='signed-upload').at(-1).body.includes(gif),'GIF uploaded unchanged to retain animation');
    mode='deny';await page.getByRole('button',{name:'New Bot',exact:true}).click();
    await page.getByLabel('Bot name',{exact:true}).fill('New image bot');await page.locator('[name="avatar_file"]').last().setInputFiles(file);
    await page.getByRole('button',{name:'Create Bot',exact:true}).click();await page.waitForURL(`**/developers/applications/${created}/token`);
    await page.getByText('test-only-created-image-secret',{exact:true}).waitFor();await page.getByText(/Bot created, but its avatar could not be saved/).waitFor();
    assert.equal(createdBots,1,'failed optional avatar never creates a second bot');
    assert.equal(operations.filter(row=>row.action==='authorize').at(-1).target_id,id(23),'creation uploads target existing bot');
    assert.equal(directWrites,0,'never bypass storage policy');assert.deepEqual(errors,[]);
  }finally{await context.close();await browser.close();}
});
