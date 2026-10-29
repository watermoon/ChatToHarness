'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {resetManagedCloud}=require('../app/cloud-full-reset.cjs');
const ACCOUNT='b'.repeat(32),KV='d'.repeat(32);
const names=['chattoharness-cloud-router','chattoharness-auth'];
function scenario({failAt='',shared=false}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cth-cloud-reset-'));
 const calls=[],deleted=new Set(),saved=[],events=[],record={
   schema:1,complete:true,subdomain:'watermoon3322',accountId:ACCOUNT,
   kvId:KV,encryptedKey:'encrypted-owner-secret'
 };
 const b={record,dir,file:path.join(dir,'credentials.json'),phase:'ready',error:'',busy:false,remote:'deployed',
   workerInventory:{auth:true,router:true},
   fetcher:async(url,opts={})=>{
     const method=opts.method||'GET';
     calls.push({url,method});
     if(method==='DELETE'){
       if(url.includes(failAt)&&failAt)throw Error('CLOUD_FAKE_REMOTE_UNAVAILABLE');
       deleted.add(url);return response(200,{});
     }
     if(url.endsWith('/owner-reset-device-hub')){
       assert.equal(method,'POST');
       assert.equal(JSON.parse(opts.body).owner_secret,'a'.repeat(64));
       events.push('durable-cleared');
       return {status:200,json:async()=>({cleared:true})};
     }
     if(url.includes('/workers/scripts?'))return response(200,
       [...names.map(id=>({id})),...(shared?[{id:'other-worker'}]:[])]);
     if(url.includes('/workers/scripts/')&&url.endsWith('/settings')){
       const owner=url.includes('chattoharness-auth');
       const other=url.includes('other-worker');
       return response(200,{bindings:owner||other&&shared?[{type:'kv_namespace',namespace_id:KV}]:[]});
     }
     if(url.includes('/storage/kv/namespaces?'))return response(200,[{id:KV,title:'OAUTH_KV'}]);
     if(deleted.has(url))return {status:404};
     if(url.includes('/storage/kv/namespaces/'))return response(200,{id:KV});
     if(url.includes('/workers/scripts/'))return response(200,{id:'exists'});
     throw Error('UNEXPECTED_TEST_REQUEST');
   },
   cli:async args=>{
     if(args[0]==='auth')return JSON.stringify({type:'oauth',token:'synthetic-test-token-xxx'});
     if(args[0]==='deploy'){events.push('deployed-reset-router');return 'ok';}
     throw Error('UNEXPECTED_TEST_CLI');
   },
   configs:()=>({router:'router.jsonc'}),ownerKey:()=> 'a'.repeat(64),
   findOptions:async()=>({needs:undefined,accountId:ACCOUNT,kvId:KV,subdomain:'watermoon3322'}),
   save:()=>saved.push(JSON.parse(JSON.stringify(record))),
   phaseSet(phase,error=''){this.phase=phase;this.error=error;events.push(phase);},
   onChange:()=>{},status(){return {phase:this.phase,error:this.error,record:this.record};}
 };
 return {b,calls,deleted,saved,events};
}
function response(status,result){return {status,json:async()=>({success:true,result,result_info:{total_pages:1}})};}
test('reset requires exact phrase before any cloud call',async()=>{
 const s=scenario();
 await assert.rejects(resetManagedCloud(s.b,{confirmation:'reset'}),/CLOUD_RESET_CONFIRMATION_REQUIRED/);
 assert.equal(s.calls.length,0);assert.equal(s.saved.length,0);
});
test('reset destroys only expected resources in safe order and then clears local',async()=>{
 const s=scenario();let local=0;
 const state=await resetManagedCloud(s.b,{confirmation:'RESET CHATTOHARNESS',clearLocal:()=>{
   local++;s.events.push('local-cleared');s.b.record=null;
 }});
 assert.equal(state.phase,'not_initialized',state.error);
 assert.equal(local,1);
 assert.deepEqual(s.events.filter(x=>x==='durable-cleared'||x==='local-cleared'),
  ['durable-cleared','local-cleared']);
 assert.deepEqual(s.calls.filter(x=>x.method==='DELETE').map(x=>x.url.split('/').pop()),
  ['chattoharness-cloud-router','chattoharness-auth',KV]);
 assert.equal(s.saved.at(-1).resetStage,'local_cleanup');
});
test('remote failure retains owner credentials and resumes at failing stage',async()=>{
 const s=scenario({failAt:'chattoharness-auth'});let local=0;
 const callback=()=>{local++;};
 const first=await resetManagedCloud(s.b,{confirmation:'RESET CHATTOHARNESS',clearLocal:callback});
 assert.equal(first.phase,'failed');
 assert.equal(first.record.resetStage,'delete_auth');
 assert.equal(local,0);
 assert.ok(first.record.encryptedKey);
 const original=s.b.fetcher;
 s.b.fetcher=async(url,opts)=>{if(opts?.method==='DELETE'&&url.includes('chattoharness-auth')){s.deleted.add(url);return response(200,{});}return original(url,opts);};
 const second=await resetManagedCloud(s.b,{confirmation:'RESET CHATTOHARNESS',clearLocal:callback});
 assert.equal(second.phase,'not_initialized');
 assert.equal(local,1);
 assert.equal(s.events.filter(x=>x==='durable-cleared').length,1);
});
test('foreign Worker sharing OAuth KV blocks deletion and preserves all local files',async()=>{
 const s=scenario({shared:true});let local=0;
 const result=await resetManagedCloud(s.b,{confirmation:'RESET CHATTOHARNESS',clearLocal:()=>{local++;}});
 assert.equal(result.phase,'failed');
 assert.equal(result.error,'CLOUD_RESET_KV_SHARED');
 assert.equal(local,0);assert.equal(s.saved.length,0);
 assert.equal(s.calls.some(x=>x.method==='DELETE'),false);
});
test('local cleanup failure is retryable without replaying deleted remote resources',async()=>{
 const s=scenario();let attempts=0;
 const cb=()=>{if(++attempts===1)throw Error('LOCAL_CLEANUP_FAILED');};
 const first=await resetManagedCloud(s.b,{confirmation:'RESET CHATTOHARNESS',clearLocal:cb});
 assert.equal(first.error,'LOCAL_CLEANUP_FAILED');
 assert.equal(s.b.record.resetStage,'local_cleanup');
 const count=s.calls.filter(x=>x.method==='DELETE').length;
 const second=await resetManagedCloud(s.b,{confirmation:'RESET CHATTOHARNESS',clearLocal:cb});
 assert.equal(second.phase,'not_initialized');
 assert.equal(s.calls.filter(x=>x.method==='DELETE').length,count);
 assert.equal(attempts,2);
});
test('tampered reset journal cannot skip identity verification to delete another account',async()=>{
 const s=scenario();let local=0;
 s.b.record.resetStage='delete_router';
 s.b.record.resetProof='f'.repeat(64);
 const result=await resetManagedCloud(s.b,{confirmation:'RESET CHATTOHARNESS',clearLocal:()=>{local++;}});
 assert.equal(result.phase,'failed');
 assert.equal(result.error,'CLOUD_RESET_JOURNAL_SCOPE_UNVERIFIED');
 assert.equal(local,0);
 assert.equal(s.calls.some(x=>x.method==='DELETE'),false);
});
test('DeviceHub internal reset clears WebSockets and all persistent device storage',async()=>{
 const {DeviceHub}=await import('../cloud-router/src/worker.mjs');
 const socket={close(){this.closed=true;}};
 const actions=[];
 const ctx={
   getWebSockets:()=>[socket],
   storage:{
     async deleteAlarm(){actions.push('alarm');},
     async deleteAll(){actions.push('all');}
   }
 };
 const hub=new DeviceHub(ctx,{});
 const reply=await hub.fetch(new Request('https://hub.internal/internal-reset-device-hub',{method:'POST'}));
 assert.equal(reply.status,200);
 assert.deepEqual(await reply.json(),{cleared:true});
 assert.equal(socket.closed,true);
 assert.deepEqual(actions,['alarm','all']);
});
