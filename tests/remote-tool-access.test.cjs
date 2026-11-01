'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {RemoteToolAccess}=require('../app/remote-tool-access.cjs');
const {createDeviceCatalog}=require('../app/cloud-router-catalog.cjs');
const safe={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
const mutable={readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:false};
const visual={...mutable,openWorldHint:true};
const def=(name,annotations=safe)=>({name,description:name,inputSchema:{type:'object',properties:{},additionalProperties:false},annotations});
const manager=()=>({visibleTools:()=>[
 def('git_status'),def('write_file',mutable),def('kill_process',mutable),
 def('force_terminate',mutable),def('computer_use',visual),
 def('read_file',{...safe,openWorldHint:true})
]});
function create(t,approve=async()=>false){
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'remote-tool-grant-test-'));
 t.after(()=>fs.rmSync(home,{force:true,recursive:true}));
 return {home,access:new RemoteToolAccess({home,approve})};
}
test('tool grants are local, explicit, persistent; default remote catalog stays read-only',t=>{
 const m=manager(),{home,access}=create(t);
 assert.deepEqual(createDeviceCatalog(m,access).tools.map(x=>x.name),['git_status']);
 assert.equal(access.list(m).total,6);
 assert.equal(access.list(m).remote_count,1);
 access.set(m,{name:'write_file',enabled:true});
 access.set(m,{name:'computer_use',enabled:true});
 access.set(m,{name:'read_file',enabled:true});
 const catalog=createDeviceCatalog(m,access);
 assert.deepEqual(catalog.tools.map(x=>x.name),['computer_use','git_status','read_file','write_file']);
 assert.deepEqual(catalog.tools.find(x=>x.name==='computer_use').remoteGrant,{mode:'session'});
 assert.equal(catalog.tools.find(x=>x.name==='computer_use').annotations.openWorldHint,true);
 assert.deepEqual(catalog.tools.find(x=>x.name==='write_file').remoteGrant,{mode:'persistent'});
 assert.equal(catalog.tools.find(x=>x.name==='git_status').remoteGrant,undefined);
 const fresh=new RemoteToolAccess({home});
 assert.equal(fresh.list(m).remote_count,4);
 fresh.set(m,{name:'computer_use',enabled:false});
 assert.equal(createDeviceCatalog(m,fresh).tools.some(x=>x.name==='computer_use'),false);
 assert.throws(()=>fresh.set(m,{name:'not_real',enabled:true}),/UNKNOWN_TOOL/);
});
test('Computer Use requires one consent per operation session, not per click',async t=>{
 let prompts=0;
 const {access}=create(t,async()=>{prompts++;return true;});
 const m=manager(),cu=def('computer_use',visual);
 access.set(m,{name:'computer_use',enabled:true});
 await assert.rejects(access.before(cu,{action:'observe',session_id:'unknown'}),/NOT_APPROVED/);
 const granted=await access.before(cu,{action:'open_session',session_title:'test window'});
 access.after(granted,{structuredContent:{session_id:'operation-1',expires_at:Date.now()+60000}});
 await access.before(cu,{action:'observe',session_id:'operation-1'});
 await access.before(cu,{action:'click',session_id:'operation-1'});
 await access.before(cu,{action:'type',session_id:'operation-1'});
 assert.equal(prompts,1);
 const closing=await access.before(cu,{action:'close_session',session_id:'operation-1'});
 access.after(closing,{structuredContent:{closed:true}});
 await assert.rejects(access.before(cu,{action:'observe',session_id:'operation-1'}),/NOT_APPROVED/);
 const second=await access.before(cu,{action:'open_session',session_title:'other window'});
 access.after(second,{structuredContent:{session_id:'operation-2'}});
 assert.equal(prompts,2);
 access.set(m,{name:'computer_use',enabled:false});
 await assert.rejects(access.before(cu,{action:'click',session_id:'operation-2'}),/NOT_GRANTED/);
});
test('destructive process termination requires approval for every call',async t=>{
 let approvals=0;
 const {access}=create(t,async()=>++approvals===1);
 const m=manager(),kill=def('kill_process',mutable);
 access.set(m,{name:'kill_process',enabled:true});
 await access.before(kill,{pid:123});
 await assert.rejects(access.before(kill,{pid:123}),/USER_DECLINED/);
 assert.equal(approvals,2);
 await assert.rejects(access.before(kill,{pid:123},{expiresAt:Date.now()-1}),/REQUEST_EXPIRED/);
 assert.equal(approvals,2);
 access.set(m,{name:'kill_process',enabled:false});
 await assert.rejects(access.before(kill,{pid:123}),/NOT_GRANTED/);
});
test('denied approvals, expiry and disconnect never authorize input',async t=>{
 const {access}=create(t,async()=>false),m=manager(),cu=def('computer_use',visual);
 access.set(m,{name:'computer_use',enabled:true});
 await assert.rejects(access.before(cu,{action:'open_session'}),/USER_DECLINED/);
 access.approve=async()=>true;
 await assert.rejects(access.before(cu,{action:'open_session'},{expiresAt:Date.now()-1}),/REQUEST_EXPIRED/);
 const gate=await access.before(cu,{action:'open_session'});
 access.after(gate,{structuredContent:{session_id:'s1'}});
 access.clearSessions();
 await assert.rejects(access.before(cu,{action:'observe',session_id:'s1'}),/NOT_APPROVED/);
});



test('remote terminal commands cannot bypass per-call confirmation',async t=>{
 let confirmed=0;
 const {access}=create(t,async()=>{confirmed++;return true;});
 const shell=def('start_task',mutable),m={visibleTools:()=>[shell]};
 access.set(m,{name:'start_task',enabled:true});
 assert.equal(access.mode('start_task'),'per_call');
 await access.before(shell,{command:'echo safe'});
 await access.before(shell,{command:'echo safe'});
 assert.equal(confirmed,2);
});
test('revoking a grant while confirmation is open rejects the delayed approval',async t=>{
 let respond;
 const {access}=create(t,()=>new Promise(resolve=>{respond=resolve;}));
 const action=def('kill_process',mutable),m=manager();
 access.set(m,{name:'kill_process',enabled:true});
 const pending=access.before(action,{pid:345});
 await new Promise(resolve=>setImmediate(resolve));
 access.set(m,{name:'kill_process',enabled:false});
 respond(true);
 await assert.rejects(pending,/REMOTE_GRANT_REVOKED/);
});
test('listing windows is allowed after tool opt-in without granting control of a session',async t=>{
 let prompts=0;
 const {access}=create(t,async()=>{prompts++;return true;});
 const m=manager(),cu=def('computer_use',visual);
 access.set(m,{name:'computer_use',enabled:true});
 assert.deepEqual(await access.before(cu,{action:'list_windows'}),{});
 assert.equal(prompts,0);
 await assert.rejects(access.before(cu,{action:'click',session_id:'missing'}),/NOT_APPROVED/);
});
