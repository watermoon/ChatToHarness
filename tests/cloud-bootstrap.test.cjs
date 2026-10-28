'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {CloudBootstrap,subdomain,urls,config}=require('../app/cloud-bootstrap.cjs');
const source=path.resolve(__dirname,'../cloud-router');
const kvId='a'.repeat(32);
const encryption={isEncryptionAvailable:()=>true,
 encryptString:secret=>Buffer.from('encrypted:'+secret,'utf8'),
 decryptString:buf=>{assert.ok(buf.toString().startsWith('encrypted:'));return buf.toString().slice(10);}};
function scenario() {
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'cth-bootstrap-test-'));
 const sourceDir=path.join(home,'cloud-router');
 const wrangler=path.join(sourceDir,'node_modules/wrangler/bin/wrangler.js');
 fs.mkdirSync(path.dirname(wrangler),{recursive:true});
 fs.writeFileSync(wrangler,'// test fixture only\n');
 const calls=[],inputs=[],fetchCalls=[];
 let deployed=false;
 const runner=async(node,script,args,opts)=>{
  calls.push(args.slice());
  if(args[0]==='secret')inputs.push(opts.input);
  if(args[0]==='deploy'&&args.includes('--config')&&args.some(x=>String(x).endsWith('router.jsonc')))deployed=true;
  if(args[0]==='auth'&&args[1]==='token')return {code:0,stdout:JSON.stringify({type:'oauth',token:'x'.repeat(64)})};
  if(args[0]==='kv'&&args[2]==='list')return {code:0,stdout:'[]'};
  if(args[0]==='kv'&&args[2]==='create')return {code:0,stdout:'{"id":"'+kvId+'"}'};
  return {code:0,stdout:'ok'};
 };
 const fetcher=async(url,opts)=>{
  if(url.includes('api.cloudflare.com/')) {
   let result;
   if(url.endsWith('accounts?per_page=100'))
     result=[{id:'b'.repeat(32),name:'Test account'}];
   else if(url.includes('/workers/subdomain'))result={subdomain:'watermoon3322'};
   else if(url.includes('/storage/kv/namespaces'))result=[];
    else if(url.endsWith('/workers/scripts'))result=deployed?
      [{id:'chattoharness-auth'},{id:'chattoharness-cloud-router'}]:[];
   else throw Error('MOCK_UNEXPECTED_API_REQUEST');
   return {status:200,json:async()=>({success:true,result})};
  }
  fetchCalls.push({url,opts});
  return {status:deployed?(url.includes('.workers.dev/mcp')?401:200):404};
 };
 const bootstrap=new CloudBootstrap({home,safeStorage:encryption,nodePath:process.execPath,sourceDir,runner,fetcher});
 return {home,sourceDir,calls,inputs,fetchCalls,bootstrap};
}
test('workers.dev identity is normalized and rejects arbitrary origins or shell metacharacters',()=>{
 assert.equal(subdomain('watermoon3322.workers.dev'),'watermoon3322');
 assert.equal(urls('watermoon3322').mcp,
   'https://chattoharness-cloud-router.watermoon3322.workers.dev/mcp');
 for(const value of ['','evil.com','../x','x;rm -rf /','a b','🌸'])assert.throws(()=>subdomain(value));
});
test('generated configs bind only read-only tools and keep OAuth KV separate from device hub',()=>{
 const auth=config(source,'watermoon3322',kvId,'auth'),router=config(source,'watermoon3322',kvId,'router');
 assert.equal(auth.kv_namespaces[0].id,kvId);
 assert.deepEqual(router.vars.ALLOWED_TOOLS,'get_harness_status');
 assert.equal(router.durable_objects.bindings[0].class_name,'DeviceHub');
 assert.equal(router.services[0].service,'chattoharness-auth');
 assert.equal(auth.vars.OWNER_AUTH_EPOCH,router.vars.OWNER_AUTH_EPOCH);
});
test('one click provisions KV, encrypts 256-bit owner key, deploys Workers and confirms 401',async(t)=>{
 const s=scenario();t.after(()=>fs.rmSync(s.home,{recursive:true,force:true}));
 const r=await s.bootstrap.init({subdomain:'watermoon3322'});
 assert.equal(r.phase,'ready');
 assert.equal(s.inputs.length,1);
 assert.match(s.inputs[0],/^[a-f0-9]{64}$/);
 assert.equal(JSON.stringify(r).includes(s.inputs[0]),false);
 assert.equal(fs.readFileSync(path.join(s.home,'cloudflare-bootstrap','credentials.json'),'utf8').includes(s.inputs[0]),false);
 assert.equal(s.fetchCalls.length,6); // 3 preflight + 3 post-deployment live probes
 assert.ok(s.calls.some(x=>x[0]==='deploy'));
 const clipboard={writeText(v){assert.equal(v,s.inputs[0]);}};
 assert.deepEqual(s.bootstrap.copyOwnerKey(clipboard),{copied:true});
 const second=new CloudBootstrap({home:s.home,safeStorage:encryption,nodePath:process.execPath,sourceDir:s.sourceDir,
   runner:s.bootstrap.runner,fetcher:s.bootstrap.fetcher});
 assert.equal(second.status().ready,false); // Do not trust the saved completion flag without live verification.
 await second.preview();
 assert.equal(second.status().ready,true);
 assert.equal(second.ownerKey(),s.inputs[0]);
});
test('invalid encryption and failed verification fail closed',async(t)=>{
 const a=scenario();t.after(()=>fs.rmSync(a.home,{recursive:true,force:true}));
 a.bootstrap.safeStorage={isEncryptionAvailable:()=>false};
 assert.equal((await a.bootstrap.init({subdomain:'watermoon3322'})).error,'CLOUD_SECURE_STORAGE_REQUIRED');
 assert.equal(a.calls.length,0);
 const b=scenario();t.after(()=>fs.rmSync(b.home,{recursive:true,force:true}));
 const originalFetcher=b.bootstrap.fetcher;
 b.bootstrap.fetcher=async(url,opts)=>{
   const response=await originalFetcher(url,opts);
   return url.endsWith('/mcp')&&response.status===401?{status:200}:response;
 };
 const res=await b.bootstrap.init({subdomain:'watermoon3322',existingKvId:kvId});
 assert.equal(res.phase,'failed');
 assert.equal(res.error,'CLOUD_REMOTE_VERIFICATION_FAILED');
 assert.equal(res.ready,false);
 assert.equal(b.inputs.length,1);
});


test('readonly cloud detection reports deployed service without overwriting missing local key',async(t)=>{
 const s=scenario();t.after(()=>fs.rmSync(s.home,{recursive:true,force:true}));
 s.bootstrap.fetcher=async(url,opts)=>{
   if(url.includes('api.cloudflare.com/'))return (await Promise.resolve({
     status:200,json:async()=>({success:true,result:
       url.endsWith('accounts?per_page=100')?[{id:'b'.repeat(32),name:'Test'}]:
       url.includes('/workers/subdomain')?{subdomain:'watermoon3322'}:
       url.endsWith('/workers/scripts')?[{id:'chattoharness-auth'},{id:'chattoharness-cloud-router'}]:[]})
   }));
   return {status:url.endsWith('/mcp')?401:200};
 };
 const discovered=await s.bootstrap.preview();
 assert.equal(discovered.remote,'deployed');
 assert.equal(discovered.hasOwnerKey,false);
 const deployed=await s.bootstrap.init({});
 assert.equal(deployed.phase,'failed');
 assert.equal(deployed.error,'CLOUD_ALREADY_DEPLOYED_OWNER_KEY_MISSING');
 assert.equal(s.calls.filter(x=>x[0]==='secret'||x[0]==='deploy').length,0);
});
test('remote network failure is distinguishable from not deployed',async(t)=>{
 const s=scenario();t.after(()=>fs.rmSync(s.home,{recursive:true,force:true}));
 s.bootstrap.fetcher=async()=>{throw Error('network unavailable');};
 assert.equal(await s.bootstrap.checkRemote('watermoon3322'),'unreachable');
 assert.equal(s.bootstrap.status().remote,'unreachable');
});

test('HTTP 404 alone cannot prove service is absent; authenticated inventory can',async(t)=>{
 const s=scenario();t.after(()=>fs.rmSync(s.home,{recursive:true,force:true}));
 assert.equal(await s.bootstrap.checkRemote('watermoon3322',null),'unreachable');
 assert.equal(await s.bootstrap.checkRemote('watermoon3322',{auth:false,router:false}),'not_deployed');
});
test('checking without Cloudflare login never falsely reports an uninitialized deployment',async(t)=>{
 const s=scenario();t.after(()=>fs.rmSync(s.home,{recursive:true,force:true}));
 s.bootstrap.cli=async()=>{throw Error('CLOUD_LOGIN_REQUIRED');};
 const state=await s.bootstrap.preview();
 assert.equal(state.phase,'authorization_required');
 assert.equal(state.remote,'unchecked');
 assert.equal(state.ready,false);
});

test('unverified stored owner key cannot silently adopt an existing remote deployment',async(t)=>{
 const s=scenario();t.after(()=>fs.rmSync(s.home,{recursive:true,force:true}));
 s.bootstrap.record={schema:1,subdomain:'watermoon3322',accountId:'b'.repeat(32),
   kvId,encryptedKey:encryption.encryptString('a'.repeat(64)).toString('base64'),
   complete:false};
 s.bootstrap.fetcher=async(url)=>{
   if(url.includes('api.cloudflare.com/')){
     const result=url.endsWith('accounts?per_page=100')?
       [{id:'b'.repeat(32),name:'Test'}]:
       url.includes('/workers/subdomain')?{subdomain:'watermoon3322'}:
       url.includes('/storage/kv/namespaces')?[{id:kvId,title:'OAUTH_KV'}]:
       url.endsWith('/workers/scripts')?
         [{id:'chattoharness-auth'},{id:'chattoharness-cloud-router'}]:[];
     return {status:200,json:async()=>({success:true,result})};
   }
   return {status:url.endsWith('/mcp')?401:200};
 };
 const preview=await s.bootstrap.preview();
 assert.equal(preview.phase,'recovery_required');
 assert.equal(preview.ready,false);
 const start=await s.bootstrap.init({});
 assert.equal(start.error,'CLOUD_DEPLOYED_KEY_NOT_VERIFIED');
 assert.equal(s.bootstrap.record.complete,false);
 assert.equal(s.calls.filter(x=>x[0]==='deploy'||x[0]==='secret').length,0);
});
