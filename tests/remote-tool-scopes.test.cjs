'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {RemoteToolAccess,group}=require('../app/remote-tool-access.cjs');
const {createDeviceCatalog}=require('../app/cloud-router-catalog.cjs');
const read={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
const write={readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:false};
const def=(name,annotations=read)=>({name,description:name,inputSchema:{type:'object',properties:{},additionalProperties:false},annotations});
const tools=[def('git_status'),def('git_diff'),def('read_file',{...read,openWorldHint:true}),
 def('write_file',write),def('kill_process',write),def('computer_use',{...write,openWorldHint:true})];
const manager={visibleTools:()=>tools,broker:{results:{tools:()=>[]}}};
function fixture(t,approve=async()=>true){
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'remote-grant-scopes-'));
 t.after(()=>fs.rmSync(home,{force:true,recursive:true}));
 let changeCount=0;
 const access=new RemoteToolAccess({home,approve,onChange:()=>changeCount++});
 return {home,access,changes:()=>changeCount};
}
test('automatic default permits current connection or permanently, explicit denial wins',t=>{
 const {home,access}=fixture(t);
 assert.equal(access.autoAllow,true);
 assert.equal(access.autoScope,'session','new profiles default to connection-scoped automatic allow');
 assert.equal(access.scope(tools[3]),'session');
 access.set(manager,{name:'kill_process',enabled:false});
 const denied=access.list(manager).tools.find(x=>x.name==='kill_process');
 assert.equal(denied.allowed,false);
 const off=access.setAutoAllow({enabled:false,scope:'session'});
 assert.equal(off.auto_allow,false);
 assert.equal(access.scope(tools[3]),'disabled');
 assert.equal(access.scope(tools[4]),'disabled');
 assert.equal(access.setAutoAllow({enabled:true,scope:'permanent'}).auto_scope,'permanent');
 assert.equal(access.scope(tools[3]),'permanent');
 assert.equal(access.scope(tools[4]),'disabled','explicit local deny has priority');
 const saved=JSON.parse(fs.readFileSync(access.file,'utf8'));
 assert.equal(saved.auto_allow,true);
 assert.equal(saved.auto_scope,'permanent');
 const restored=new RemoteToolAccess({home});
 assert.equal(restored.autoAllow,true);
 assert.equal(restored.autoScope,'permanent');
 assert.equal(restored.scope(tools[4]),'disabled');
 restored.setAutoAllow({enabled:false,scope:'session'});
 assert.equal(new RemoteToolAccess({home}).enabled(tools[0]),false);
 assert.throws(()=>restored.setAutoAllow({enabled:true,scope:'once'}),/INVALID_ARGUMENTS/);
 assert.throws(()=>restored.setAutoAllow({enabled:'true',scope:'permanent'}),/INVALID_ARGUMENTS/);
});
test('last manually selected grant scope is persistent and used as UI preference',t=>{
 const {access,home}=fixture(t);
 assert.equal(access.list(manager).preferred_scope,'permanent');
 access.set(manager,{name:'git_status',enabled:true,scope:'once'});
 assert.equal(access.list(manager).preferred_scope,'once');
 const restarted=new RemoteToolAccess({home});
 assert.equal(restarted.list(manager).preferred_scope,'once');
 restarted.set(manager,{name:'read_file',enabled:false});
 assert.equal(restarted.list(manager).preferred_scope,'once','denial must not alter chosen allow mode');
 restarted.set(manager,{name:'read_file',enabled:true,scope:'session'});
 assert.equal(new RemoteToolAccess({home}).list(manager).preferred_scope,'session');
});
test('all/group grants validate and commit atomically with one catalog update',t=>{
 const {access,changes}=fixture(t);
 const names=tools.map(x=>x.name);
 const updated=access.set(manager,{names,enabled:true,scope:'permanent'});
 assert.equal(updated.remote_count,names.length);
 assert.equal(changes(),1);
 assert.equal(updated.tools.find(x=>x.name==='git_status').group,'project');
 assert.equal(updated.tools.find(x=>x.name==='computer_use').group,'desktop');
 assert.equal(updated.tools.find(x=>x.name==='kill_process').group,'process');
 assert.throws(()=>access.set(manager,{names:['git_diff','unknown'],enabled:false}),/UNKNOWN_TOOL/);
 assert.equal(access.list(manager).remote_count,names.length);
 assert.equal(changes(),1);
 access.set(manager,{names:['git_status','git_diff'],enabled:false});
 assert.equal(access.list(manager).remote_count,names.length-2);
});
test('session-scoped grants disappear on disconnect and restart, including default-safe tools',t=>{
 const {access,home}=fixture(t);
 access.set(manager,{names:['git_status','write_file'],enabled:true,scope:'session'});
 assert.equal(access.list(manager).tools.find(x=>x.name==='git_status').grant_scope,'session');
 assert.equal(access.list(manager).tools.find(x=>x.name==='write_file').grant_scope,'session');
 const restarted=new RemoteToolAccess({home});
 assert.equal(restarted.enabled(tools[0]),false);
 assert.equal(restarted.enabled(tools[3]),false);
 access.clearSessions();
 assert.equal(access.enabled(tools[0]),false);
 assert.equal(access.enabled(tools[3]),false);
});
test('one-time grants permit one invocation, reject concurrent reuse and change catalog version',async t=>{
 const {access}=fixture(t);
 access.set(manager,{name:'write_file',enabled:true,scope:'once'});
 const before=createDeviceCatalog(manager,access);
 const token=await access.before(tools[3],{path:'fixture'});
 await assert.rejects(access.before(tools[3],{path:'fixture'}),/ALREADY_USED/);
 access.after(token,{ok:true});
 access.finish(token);
 assert.equal(access.enabled(tools[3]),false);
 const after=createDeviceCatalog(manager,access);
 assert.equal(before.version,after.version,'local authorization cannot change remote catalog');
 await assert.rejects(access.before(tools[3],{}),/NOT_GRANTED/);
});
test('one-time Computer Use is one approved operation session, not one click',async t=>{
 let promptCount=0;
 const {access}=fixture(t,async()=>{promptCount++;return true;});
 const cu=tools.at(-1);
 access.set(manager,{name:'computer_use',enabled:true,scope:'once'});
 const token=await access.before(cu,{action:'open_session',session_title:'authorized test'});
 access.after(token,{structuredContent:{session_id:'local-session',expires_at:Date.now()+300000}});
 access.finish(token);
 assert.equal(promptCount,0);
 await assert.rejects(access.before(cu,{action:'open_session',session_title:'duplicate'}),/ALREADY_USED/);
 const observe=await access.before(cu,{action:'observe',session_id:'local-session'});
 access.after(observe,{ok:true});
 assert.equal(promptCount,0);
 const close=await access.before(cu,{action:'close_session',session_id:'local-session'});
 access.after(close,{closed:true});
 assert.equal(access.enabled(cu),false);
 await assert.rejects(access.before(cu,{action:'observe',session_id:'local-session'}),/NOT_GRANTED/);
});
test('destructive tool obeys local grant without repeat dialog',async t=>{
 let prompts=0;
 const {access}=fixture(t,async()=>{prompts++;throw Error('NO_DIALOG_ALLOWED')});
 access.set(manager,{name:'kill_process',enabled:true,scope:'permanent'});
 await access.before(tools[4],{pid:1});
 await access.before(tools[4],{pid:2});
 access.set(manager,{name:'kill_process',enabled:true,scope:'session'});
 await access.before(tools[4],{pid:3});
 assert.equal(prompts,0);
 access.clearSessions();
 await assert.rejects(access.before(tools[4],{pid:4}),/NOT_GRANTED/);
});
test('old boolean grant file migrates without enabling a dangerous grant',t=>{
 const {home}=fixture(t);
 fs.writeFileSync(path.join(home,'remote-tool-grants.json'),
  JSON.stringify({schema_version:1,grants:{write_file:false,git_status:true}}));
 const restored=new RemoteToolAccess({home});
 assert.equal(restored.enabled(tools[3]),false);
 assert.equal(restored.enabled(tools[0]),true);
 restored.set(manager,{name:'git_status',enabled:true,scope:'once'});
 assert.equal(JSON.parse(fs.readFileSync(restored.file,'utf8')).schema_version,2);
});
test('invalid scopes, duplicate or oversized batches never modify an existing selection',t=>{
 const {access}=fixture(t);
 for(const input of [
  {names:['git_status'],enabled:true,scope:'unlimited'},
  {names:['git_status','git_status'],enabled:true,scope:'permanent'},
  {names:[],enabled:true},
  {names:['write_file','invalid_tool'],enabled:true}
 ])assert.throws(()=>access.set(manager,input));
 assert.equal(access.enabled(tools[3]),true);
 assert.equal(access.enabled(tools[0]),true);
});

test('real CloudRouterService dispatch consumes a one-time grant and denies stale retry',async t=>{
 const {access}=fixture(t);
 const {CloudRouterService}=require('../app/cloud-router-service.cjs');
 let calls=0;
 const provider={
  visibleTools:()=>[def('write_file',write)],
  broker:{results:{tools:()=>[]}},
  call:async()=>{calls++;return {structuredContent:{ok:true}};}
 };
 const service=new CloudRouterService({
  manager:provider,remoteAccess:access,identity:{id:'rocket',name:'Rocket',platform:'win32'}
 });
 access.set(provider,{name:'write_file',enabled:true,scope:'once'});
 const version=service.catalog().version;
 assert.equal((await service.execute('write_file',{path:'test'})).structuredContent.ok,true);
 assert.equal(calls,1);
 assert.equal(access.enabled(provider.visibleTools()[0]),false);
 assert.equal(service.catalog().version,version,'cloud catalog does not conceal revoked local tools');
 await assert.rejects(service.execute('write_file',{path:'test'}),/TOOL_DENIED/);
 assert.equal(calls,1);
 service.stop();
});
test('closing a Computer Use session without successful native close keeps grant but not approved session after disconnect',async t=>{
 const {access}=fixture(t);
 const cu=tools.at(-1);
 access.set(manager,{name:'computer_use',enabled:true,scope:'permanent'});
 const open=await access.before(cu,{action:'open_session',session_title:'test'});
 access.after(open,{structuredContent:{session_id:'s1'}});
 access.clearSessions();
 assert.equal(access.enabled(cu),true);
 await assert.rejects(access.before(cu,{action:'observe',session_id:'s1'}),/NOT_APPROVED/);
});

test('stale one-time completion cannot consume a newer grant',async t=>{
 const {access}=fixture(t);
 access.set(manager,{name:'write_file',enabled:true,scope:'once'});
 const old=await access.before(tools[3],{path:'old'});
 access.set(manager,{name:'write_file',enabled:true,scope:'once'});
 access.finish(old);
 assert.equal(access.enabled(tools[3]),true);
 const next=await access.before(tools[3],{path:'new'});
 access.finish(next);
 assert.equal(access.enabled(tools[3]),false);
});
test('revocation while a Computer Use open_session executes cannot restore session approval',async t=>{
 const {access}=fixture(t);
 const cu=tools.at(-1);
 access.set(manager,{name:'computer_use',enabled:true,scope:'once'});
 const opening=await access.before(cu,{action:'open_session',session_title:'test'});
 access.set(manager,{name:'computer_use',enabled:false});
 assert.throws(()=>access.after(opening,{structuredContent:{session_id:'revoked'}}),/GRANT_REVOKED/);
 access.finish(opening);
 assert.equal(access.sessions.size,0);
 assert.equal(access.enabled(cu),false);
});
