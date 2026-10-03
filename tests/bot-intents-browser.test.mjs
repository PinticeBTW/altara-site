import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';
const enabled=Boolean(process.env.ALTARA_PTBR_PLAYWRIGHT&&process.env.ALTARA_BOT_SITE_URL);
test('intent settings persist per bot, enforce dependencies, retain failed edits and isolate pending saves',{skip:!enabled,timeout:120000},async()=>{
 const {chromium}=createRequire(import.meta.url)(process.env.ALTARA_PTBR_PLAYWRIGHT);
 const browser=await chromium.launch({executablePath:process.env.ALTARA_PTBR_CHROME,headless:true});
 const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const a=id(11),b=id(12),user={id:id(1),aud:'authenticated',role:'authenticated',email:'intents@example.com',app_metadata:{},user_metadata:{}};
 const exp=Math.floor(Date.now()/1000)+3600;
 const token=[{alg:'HS256',typ:'JWT'},{sub:user.id,aud:'authenticated',role:'authenticated',exp},'test-signature'].map((v,i)=>i<2?Buffer.from(JSON.stringify(v)).toString('base64url'):v).join('.');
 const apps=[{app_id:a,bot_id:id(21),bot_name:'Alpha'},{app_id:b,bot_id:id(22),bot_name:'Beta'}];
 const prefs=new Map([[id(21),['messages']],[id(22),['members']]]),writes=[];
 let mode='ok',pending;
 const context=await browser.newContext();
 await context.addInitScript(({user,token,exp})=>localStorage.setItem('sb-tbbgwjmmaiclkhssimhf-auth-token',JSON.stringify({access_token:token,refresh_token:'test-refresh',expires_at:exp,user})),{user,token,exp});
 const fulfill=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data),headers:{'access-control-allow-origin':'*'}});
 await context.route('https://tbbgwjmmaiclkhssimhf.supabase.co/**',async route=>{
   const name=new URL(route.request().url()).pathname.split('/').pop(),body=route.request().method()==='POST'?route.request().postDataJSON():{};
   let data=[];
   if(name==='user')data=user;
   else if(name==='bots_list_my_apps')data=apps;
   else if(name==='bots_get_my_app_profile')data=apps.filter(app=>app.app_id===body.p_app_id);
   else if(name==='bots_get_event_intents_v1'){assert.ok(prefs.has(body.p_bot_id));data={available:true,intents:prefs.get(body.p_bot_id)};}
   else if(name==='bots_set_event_intents_v1'){
     writes.push(body);assert.ok(prefs.has(body.p_bot_id));
     if(mode==='fail')return fulfill(route,{message:'Intent save denied for testing'},403);
     if(mode==='malformed')return fulfill(route,{available:true,intents:['unknown_intent']});
     if(mode==='pending'){pending={route,body};return;}
     prefs.set(body.p_bot_id,body.p_intents);data={available:true,intents:body.p_intents};
   }
   await fulfill(route,data);
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);
 const base=process.env.ALTARA_BOT_SITE_URL;
 const check=name=>page.getByRole('checkbox',{name:new RegExp(`^${name}\\b`)});
 const save=()=>page.getByRole('button',{name:'Save intents',exact:true});
 const ready=async()=>{await page.getByRole('heading',{name:'Intents',exact:true}).waitFor();await check('Messages Intent').waitFor();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('input[type=checkbox]'))[0]?.disabled);};
 try{
   await page.goto(`${base}/developers/applications/${a}/intents`);await ready();
   assert.equal(await check('Messages Intent').isChecked(),true);
   assert.equal(await page.getByRole('checkbox').count(),7,'all seven supported event intents are listed');
   for(const name of ['Messages Intent','Server Members Intent','Message Content Intent','Reactions Intent','Voice States Intent','Direct Messages Intent','Presence Intent']){
     assert.equal(await check(name).isDisabled(),false,`${name} is available when the endpoint is active`);
   }
   await check('Message Content Intent').check();await check('Messages Intent').uncheck();
   assert.equal(await check('Message Content Intent').isChecked(),false);assert.equal(await check('Message Content Intent').isDisabled(),true);
   await check('Messages Intent').check();await check('Message Content Intent').check();await save().click();
   await page.getByText('Event intents saved. Server installation grants and client intents are also required.',{exact:true}).waitFor();
   assert.deepEqual(writes[0],{p_bot_id:id(21),p_intents:['messages','message_content']});assert.equal(await save().isDisabled(),true);
   await page.reload();await ready();assert.equal(await check('Message Content Intent').isChecked(),true);
   await page.getByRole('link',{name:'Installation permissions',exact:true}).click();await page.getByRole('heading',{name:'Permissions',exact:true}).waitFor();
   await page.waitForFunction(()=>!Array.from(document.querySelectorAll('label')).find(el=>el.textContent.includes('Receive Message Events'))?.querySelector('input')?.disabled);
   assert.equal(await check('Receive Message Events').isDisabled(),false);
   await page.getByRole('link',{name:'Intents',exact:true}).click();await ready();
   await check('Server Members Intent').check();mode='fail';await save().click();
   await page.getByText('Intent save denied for testing',{exact:true}).waitFor();assert.equal(await check('Server Members Intent').isChecked(),true);assert.equal(await save().isDisabled(),false);
   mode='malformed';await save().click();await page.getByText('Could not confirm event intent settings.',{exact:true}).waitFor();assert.equal(await save().isDisabled(),false);
   mode='pending';await save().click();
   for(let attempt=0;!pending&&attempt<100;attempt++)await page.waitForTimeout(10);
   assert.ok(pending);await page.getByRole('button',{name:'Saving...',exact:true}).dispatchEvent('click');assert.equal(writes.length,4);
   await page.locator('select').first().selectOption(b);await page.waitForURL(`**/developers/applications/${b}`);
   await page.getByRole('link',{name:'Intents',exact:true}).click();await ready();
   assert.equal(await check('Messages Intent').isChecked(),false);assert.equal(await check('Server Members Intent').isChecked(),true);
   prefs.set(pending.body.p_bot_id,pending.body.p_intents);await fulfill(pending.route,{available:true,intents:pending.body.p_intents});
   assert.equal(await check('Messages Intent').isChecked(),false);assert.equal(await save().isDisabled(),true);
   await page.setViewportSize({width:390,height:844});
   const box=await save().boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);
   assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close();}
});
