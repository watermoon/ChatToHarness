'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {RemoteToolAccess}=require('../app/remote-tool-access.cjs');
const {CloudRouterService}=require('../app/cloud-router-service.cjs');
function fakeTool(name,hints={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}){
 return {name,description:name,inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:hints};
}
test('device rechecks grants before and after remote prompt; revocation denies subsequent calls',async t=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloud-access-integration-'));
 t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const calls=[];
 const manager={
  visibleTools:()=>[fakeTool('get_config'),fakeTool('kill_process',{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:false})],
  call:async(name,args)=>{calls.push([name,args]);return {structuredContent:{ok:true,name}};},
  broker:{results:{tools:()=>[]}}
 };
 let decision=true,prompts=0;
 const access=new RemoteToolAccess({home,approve:async()=>{prompts++;return decision;}});
 const service=new CloudRouterService({manager,remoteAccess:access,
  identity:{id:'rocket',name:'Rocket',platform:'win32'}});
 assert.equal(service.catalog().tools.length,0);
 access.set(manager,{name:'get_config',enabled:true});
 assert.deepEqual(service.catalog().tools.map(item=>item.name),['get_config']);
 assert.equal((await service.execute('get_config',{})).structuredContent.ok,true);
 access.set(manager,{name:'get_config',enabled:false});
 await assert.rejects(service.execute('get_config',{}),/TOOL_DENIED/);
 access.set(manager,{name:'kill_process',enabled:true});
 decision=false;
 await assert.rejects(service.execute('kill_process',{pid:100}),/REMOTE_USER_DECLINED/);
 assert.equal(calls.length,1);
 decision=true;
 assert.equal((await service.execute('kill_process',{pid:100})).structuredContent.ok,true);
 assert.equal(prompts,2);
 assert.equal(calls.length,2);
 access.clearSessions();
});
test('disconnect revokes Computer Use approvals without changing stored grants',async t=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloud-access-disconnect-'));
 t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const grant=new RemoteToolAccess({home,approve:async()=>true});
 const computerUse=fakeTool('computer_use',{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:true});
 const manager={visibleTools:()=>[computerUse],broker:{results:{tools:()=>[]}}};
 grant.set(manager,{name:'computer_use',enabled:true});
 const token=await grant.before(computerUse,{action:'open_session',session_title:'test'});
 grant.after(token,{structuredContent:{session_id:'s-1'}});
 const service=new CloudRouterService({manager,remoteAccess:grant,
  identity:{id:'rocket',name:'Rocket',platform:'win32'}});
 service.stop();
 await assert.rejects(grant.before(computerUse,{action:'observe',session_id:'s-1'}),/NOT_APPROVED/);
 assert.equal(grant.enabled(computerUse),true);
});
