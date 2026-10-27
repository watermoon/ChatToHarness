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
 const calls=[],inputs=[],fetchCalls=[];
 const runner=async(node,script,args,opts)=>{
  calls.push(args.slice());
  if(args[0]==='secret')inputs.push(opts.input);
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
   else throw Error('MOCK_UNEXPECTED_API_REQUEST');
   return {status:200,json:async()=>({success:true,result})};
  }
  fetchCalls.push({url,opts});
  return {status:url.includes('.workers.dev/mcp')?401:200};
 };
 const bootstrap=new CloudBootstrap({home,safeStorage:encryption,nodePath:process.execPath,sourceDir:source,runner,fetcher});
 return {home,calls,inputs,fetchCalls,bootstrap};
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
 assert.equal(s.fetchCalls.length,2);
 assert.ok(s.calls.some(x=>x[0]==='deploy'));
 const clipboard={writeText(v){assert.equal(v,s.inputs[0]);}};
 assert.deepEqual(s.bootstrap.copyOwnerKey(clipboard),{copied:true});
 const second=new CloudBootstrap({home:s.home,safeStorage:encryption,nodePath:process.execPath,sourceDir:source,
   runner:s.bootstrap.runner,fetcher:s.bootstrap.fetcher});
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
 b.bootstrap.fetcher=(url,opts)=>url.includes('api.cloudflare.com/')?originalFetcher(url,opts):Promise.resolve({status:200});
 const res=await b.bootstrap.init({subdomain:'watermoon3322',existingKvId:kvId});
 assert.equal(res.phase,'failed');
 assert.equal(res.error,'CLOUD_REMOTE_VERIFICATION_FAILED');
 assert.equal(res.ready,false);
 assert.equal(b.inputs.length,1);
});
