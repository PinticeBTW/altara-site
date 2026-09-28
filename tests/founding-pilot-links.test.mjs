import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import config from '../next.config.ts';

test('legacy root invite enters the web app without redirecting ordinary homepage visits',async()=>{
 const rules=await config.redirects();
 const rule=rules.find(r=>r.source==='/' && r.has?.some(h=>h.type==='query'&&h.key==='server_invite'));
 assert.equal(rule.destination,'/app/index.html'); assert.equal(rule.permanent,false);
 assert.equal(rules.some(r=>r.source==='/'&&!r.has),false);
});
test('an official backend root URL cannot override the working web invite destination',()=>{
 const source=readFileSync(new URL('../public/app/app.js',import.meta.url),'utf8');
 const start=source.indexOf('function buildServerInviteUrlFromCode(code) {');
 const end=source.indexOf('function extractServerInviteCodeFromUrl(',start);
 for(const desktop of [false,true]){
  const context={URL,window:{location:{origin:'https://www.altaraapp.com',pathname:'/app/index.html'}},getDesktopBridge:()=>desktop,normalizeServerInviteCode:c=>c,extractServerInviteCodeFromUrl:()=> 'testcode'};
  vm.createContext(context);vm.runInContext(source.slice(start,end),context);
  const link=vm.runInContext("resolveServerInviteUrl('https://www.altaraapp.com/?server_invite=testcode','testcode')",context);
  assert.equal(link,desktop?'altara://invite/testcode':'https://www.altaraapp.com/app/index.html?server_invite=testcode');
 }
});
