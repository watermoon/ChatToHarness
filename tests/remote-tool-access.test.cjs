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
function create(t,approve=async()=>false,manager){
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'remote-tool-grant-test-'));
 t.after(()=>fs.rmSync(home,{force:true,recursive:true}));
 return {home,access:new RemoteToolAccess({home,manager,approve})};
}
test('all local tools are remotely discoverable; the local grant is the sole authority',async t=>{
 const m=manager(),{home,access}=create(t);
 const initial=createDeviceCatalog(m,access);
 assert.deepEqual(initial.tools.map(x=>x.name),['computer_use','force_terminate','git_status','kill_process','read_file','write_file']);
 assert.equal(access.list(m).remote_count,6);
 access.set(m,{name:'write_file',enabled:false});
 assert.equal(createDeviceCatalog(m,access).version,initial.version);
 assert.ok(createDeviceCatalog(m,access).tools.some(x=>x.name==='write_file'));
 await assert.rejects(access.before(def('write_file',mutable),{}),/NOT_GRANTED/);
 const fresh=new RemoteToolAccess({home});
 assert.equal(fresh.enabled(def('write_file',mutable)),false);
 fresh.set(m,{name:'write_file',enabled:true});
 assert.equal(fresh.enabled(def('write_file',mutable)),true);
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
 assert.equal(prompts,0);
 const closing=await access.before(cu,{action:'close_session',session_id:'operation-1'});
 access.after(closing,{structuredContent:{closed:true}});
 await assert.rejects(access.before(cu,{action:'observe',session_id:'operation-1'}),/NOT_APPROVED/);
 const second=await access.before(cu,{action:'open_session',session_title:'other window'});
 access.after(second,{structuredContent:{session_id:'operation-2'}});
 assert.equal(prompts,0);
 access.set(m,{name:'computer_use',enabled:false});
 await assert.rejects(access.before(cu,{action:'click',session_id:'operation-2'}),/NOT_GRANTED/);
});
test('local scope applies to all tools without an extra confirmation layer',async t=>{
 let approvals=0;
 const m={visibleTools:()=>[...manager().visibleTools(),def('start_task',mutable)]};
 const task=def('start_task',mutable),kill=def('kill_process',mutable),cu=def('computer_use',visual);
 const {access,home}=create(t,async()=>{approvals++;throw Error('SECOND_DIALOG_NOT_ALLOWED')},m);
 access.set(m,{name:'start_task',enabled:true,scope:'once'});
 access.finish(await access.before(task,{command:'one'}));
 assert.equal(access.enabled(task),false);
 await assert.rejects(access.before(task,{command:'again'}),/NOT_GRANTED/);
 access.set(m,{name:'start_task',enabled:true,scope:'session'});
 access.finish(await access.before(task,{command:'two'}));
 access.finish(await access.before(task,{command:'three'}));
 access.clearSessions();
 assert.equal(access.enabled(task),false);
 access.set(m,{name:'start_task',enabled:true,scope:'permanent'});
 const restarted=new RemoteToolAccess({home});
 assert.equal(restarted.enabled(task),true);
 restarted.finish(await restarted.before(task,{command:'four'}));
 await access.before(kill,{pid:10});
 await access.before(kill,{pid:11});
 const first=await access.before(cu,{action:'open_session',session_title:'first'});
 access.after(first,{structuredContent:{session_id:'test-1'}});
 await access.before(cu,{action:'observe',session_id:'test-1'});
 await access.before(cu,{action:'open_session',session_title:'second'});
 assert.equal(approvals,0,'tool list is the only authorization interface');
});

test('termination uses only local tool grants and respects expiry and revocation',async t=>{
 let approvals=0;
 const {access}=create(t,async()=>{approvals++;throw Error('NO_DIALOG_ALLOWED')});
 const m=manager(),kill=def('kill_process',mutable);
 await access.before(kill,{pid:123});
 await access.before(kill,{pid:456});
 assert.equal(approvals,0);
 await assert.rejects(access.before(kill,{pid:123},{expiresAt:Date.now()-1}),/REQUEST_EXPIRED/);
 access.set(m,{name:'kill_process',enabled:false});
 await assert.rejects(access.before(kill,{pid:123}),/NOT_GRANTED/);
});
test('expired requests and disconnects cannot reuse a native control session',async t=>{
 const {access}=create(t,async()=>{throw Error('NO_DIALOG_ALLOWED')}),cu=def('computer_use',visual);
 await assert.rejects(access.before(cu,{action:'open_session'},{expiresAt:Date.now()-1}),/REQUEST_EXPIRED/);
 const gate=await access.before(cu,{action:'open_session'});
 access.after(gate,{structuredContent:{session_id:'s1'}});
 access.clearSessions();
 await assert.rejects(access.before(cu,{action:'observe',session_id:'s1'}),/NOT_APPROVED/);
});



test('terminal commands never trigger a second authorization dialog',async t=>{
 let confirmed=0;
 const shell=def('start_task',mutable),m={visibleTools:()=>[shell]};
 const {access}=create(t,async()=>{confirmed++;throw Error('NO_DIALOG_ALLOWED')},m);
 await access.before(shell,{command:'echo safe'});
 await access.before(shell,{command:'echo again'});
 access.set(m,{name:'start_task',enabled:false});
 await assert.rejects(access.before(shell,{command:'echo denied'}),/NOT_GRANTED/);
 assert.equal(confirmed,0);
});
test('revocation invalidates outstanding operation generation',async t=>{
 const {access}=create(t);
 const action=def('kill_process',mutable),m=manager();
 const token=await access.before(action,{pid:345});
 access.set(m,{name:'kill_process',enabled:false});
 assert.throws(()=>access.after(token,{ok:true}),/REMOTE_GRANT_REVOKED/);
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
