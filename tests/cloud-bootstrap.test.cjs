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
 for(const name of ['keyring',`keyring-win32-${process.arch}-msvc`]){
  const manifest=path.join(sourceDir,'node_modules','@napi-rs',name,'package.json');
  fs.mkdirSync(path.dirname(manifest),{recursive:true});
  fs.writeFileSync(manifest,'{}');
 }
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
 assert.deepEqual(router.vars.ALLOWED_TOOLS,'get_harness_status,get_tool_result_page,get_tool_result_file');
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
 assert.equal(discovered.mcp_url,urls('watermoon3322').mcp,
   'verified remote URL should be available for automatic device pairing');
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

test('cloud initialization self-check distinguishes absent Node and Wrangler without attempting login or deployment',async t=>{
 const s=scenario();t.after(()=>fs.rmSync(s.home,{recursive:true,force:true}));
 assert.deepEqual(s.bootstrap.runtimeCheck(),
   {ready:true,nodePresent:true,wranglerPresent:true,keyringPresent:true});
 const realNode=s.bootstrap.nodePath;
 s.bootstrap.nodePath=path.join(s.home,'missing-node');
 assert.deepEqual(s.bootstrap.runtimeCheck(),
   {ready:false,nodePresent:false,wranglerPresent:true,keyringPresent:true});
 assert.equal((await s.bootstrap.init({})).error,'CLOUD_NODE_RUNTIME_MISSING');
 assert.equal(s.calls.length,0);
 s.bootstrap.nodePath=realNode;
 fs.rmSync(path.join(s.sourceDir,'node_modules/wrangler/bin/wrangler.js'));
 assert.deepEqual(s.bootstrap.runtimeCheck(),
   {ready:false,nodePresent:true,wranglerPresent:false,keyringPresent:true});
 assert.equal((await s.bootstrap.init({})).error,'CLOUD_WRANGLER_RUNTIME_MISSING');
 assert.equal(s.calls.length,0);
 assert.equal((await s.bootstrap.preview()).error,'CLOUD_WRANGLER_RUNTIME_MISSING');
});

test('Windows cloud login fails locally when native Keyring is absent',async t=>{
 const s=scenario();t.after(()=>fs.rmSync(s.home,{recursive:true,force:true}));
 if(process.platform!=='win32')return;
 fs.rmSync(path.join(s.sourceDir,'node_modules','@napi-rs',`keyring-win32-${process.arch}-msvc`),{recursive:true,force:true});
 assert.equal(s.bootstrap.runtimeCheck().ready,false);
 assert.equal(s.bootstrap.runtimeCheck().keyringPresent,false);
 await assert.rejects(()=>s.bootstrap.cli(['login']),/CLOUD_KEYRING_RUNTIME_MISSING/);
 assert.equal(s.calls.length,0);
});

test('owner key rotation on a manually deployed remote keeps Workers, KV and devices untouched',async(t)=>{
 const s=scenario();t.after(()=>fs.rmSync(s.home,{recursive:true,force:true}));
 s.bootstrap.fetcher=async(url)=>{
  if(url.includes('api.cloudflare.com/')){
   const result=url.endsWith('accounts?per_page=100')?[{id:'b'.repeat(32),name:'Test'}]:
     url.includes('/workers/subdomain')?{subdomain:'watermoon3322'}:
     url.includes('/storage/kv/namespaces')?[{id:kvId,title:'OAUTH_KV'}]:
     url.endsWith('/workers/scripts')?[{id:'chattoharness-auth'},{id:'chattoharness-cloud-router'}]:[];
   return {status:200,json:async()=>({success:true,result})};
  }
  return {status:url.endsWith('/mcp')?401:200};
 };
 const result=await s.bootstrap.rotateOwnerKey({});
 assert.equal(result.phase,'ready',result.error);
 assert.equal(result.hasOwnerKey,true);
 assert.equal(s.calls.filter(a=>a[0]==='deploy'||a[0]==='kv').length,0);
 assert.deepEqual(s.calls.filter(a=>a[0]==='secret').map(a=>a.slice(0,3)),
   [['secret','put','OWNER_AUTH_KEY']]);
 assert.equal(s.inputs.length,1);
 assert.match(s.inputs[0],/^[a-f0-9]{64}$/);
 assert.equal(s.bootstrap.ownerKey(),s.inputs[0]);
 const stored=fs.readFileSync(path.join(s.home,'cloudflare-bootstrap/credentials.json'),'utf8');
 assert.ok(!stored.includes(s.inputs[0]));
 assert.equal(s.bootstrap.record.kvId,kvId);
});
test('owner rotation refuses cloud without verified Worker inventory and never writes a secret',async(t)=>{
 const s=scenario();t.after(()=>fs.rmSync(s.home,{recursive:true,force:true}));
 const result=await s.bootstrap.rotateOwnerKey({});
 assert.equal(result.error,'CLOUD_ROTATION_TARGET_UNVERIFIED');
 assert.equal(s.calls.some(a=>a[0]==='secret'),false);
 assert.equal(s.bootstrap.record,null);
});
test('failed owner rotation retries the encrypted saved candidate, not a new random key',async(t)=>{
 const s=scenario();t.after(()=>fs.rmSync(s.home,{recursive:true,force:true}));
 s.bootstrap.fetcher=async(url)=>{
  if(url.includes('api.cloudflare.com/')){
   const result=url.endsWith('accounts?per_page=100')?[{id:'b'.repeat(32),name:'Test'}]:
      url.includes('/workers/subdomain')?{subdomain:'watermoon3322'}:
      url.includes('/storage/kv/namespaces')?[{id:kvId,title:'OAUTH_KV'}]:
      [{id:'chattoharness-auth'},{id:'chattoharness-cloud-router'}];
   return {status:200,json:async()=>({success:true,result})};
  }
  return {status:url.endsWith('/mcp')?401:200};
 };
 const runner=s.bootstrap.runner;
 let fail=true;
 s.bootstrap.runner=async(...args)=>{
  if(args[2][0]==='secret'&&fail){fail=false;throw Error('CLOUD_WRANGLER_FAILED_SECRET');}
  return runner(...args);
 };
 const first=await s.bootstrap.rotateOwnerKey({});
 assert.equal(first.error,'CLOUD_WRANGLER_FAILED_SECRET');
 assert.equal(first.hasOwnerKey,false);
 const ciphertext=s.bootstrap.record.pendingEncryptedKey;
 const second=await s.bootstrap.rotateOwnerKey({});
 assert.equal(second.phase,'ready',second.error);
 assert.equal(second.hasOwnerKey,true);
 assert.equal(s.bootstrap.record.pendingEncryptedKey,undefined);
 assert.equal(s.bootstrap.record.encryptedKey,ciphertext);
});

test('absent workers.dev subdomain requires an explicit action, then registers once without replacing existing resources',async t=>{
 const x=scenario();t.after(()=>fs.rmSync(x.home,{recursive:true,force:true}));
 let activeSubdomain='',creates=0;
 x.bootstrap.fetcher=async(url,opts={})=>{
   if(url.includes('api.cloudflare.com/')){
     let result;
     if(url.endsWith('accounts?per_page=100'))result=[{id:'b'.repeat(32),name:'Account'}];
     else if(url.includes('/workers/subdomain')){
       if(opts.method==='PUT'){
         assert.equal(activeSubdomain,'','never overwrite an existing subdomain');
         activeSubdomain=JSON.parse(opts.body).subdomain;
         creates++;
       }
       result={subdomain:activeSubdomain};
     }else if(url.includes('/storage/kv/namespaces'))result=x.calls.some(c=>c[0]==='kv'&&c.includes('create'))?[{id:kvId,title:'OAUTH_KV'}]:[];
     else if(url.endsWith('/workers/scripts'))
       result=x.calls.some(c=>c[0]==='deploy'&&c.some(v=>String(v).endsWith('router.jsonc')))?
         [{id:'chattoharness-auth'},{id:'chattoharness-cloud-router'}]:[];
     else throw Error('MOCK_UNEXPECTED_API_REQUEST');
     return {status:200,json:async()=>({success:true,result})};
   }
   const deployed=x.calls.some(c=>c[0]==='deploy'&&c.some(v=>String(v).endsWith('router.jsonc')));
   return {status:deployed?(url.endsWith('/mcp')?401:200):404};
 };
 const found=await x.bootstrap.preview();
 assert.equal(found.phase,'choose_subdomain');
 assert.equal(found.suggestedSubdomain,'cth-'+'b'.repeat(8));
 assert.equal(creates,0,'preflight must be read-only');
 assert.equal(x.calls.some(c=>c[0]==='deploy'),false);
 assert.equal(found.guidance.code,'choose_subdomain');
 const initialized=await x.bootstrap.init({subdomain:found.suggestedSubdomain});
 assert.equal(initialized.phase,'ready','init error: '+initialized.error);
 assert.equal(initialized.ready,true);
 assert.equal(creates,1);
 assert.equal(initialized.subdomain,found.suggestedSubdomain);
 assert.equal((await x.bootstrap.init({subdomain:'different-subdomain'})).phase,'ready');
 assert.equal(creates,1,'a ready service cannot register a second account domain');
});
test('Cloudflare subdomain management refuses overwriting existing global account subdomain',async()=>{
 const {createWorkersSubdomain}=require('../app/cloudflare-discovery.cjs');
 let changed=false;
 const result=()=>createWorkersSubdomain({
   tokenOutput:JSON.stringify({type:'oauth',token:'f'.repeat(40)}),
   accountId:'b'.repeat(32),subdomain:'different-subdomain',
   fetcher:async(_url,opts)=>{
     if(opts.method==='PUT')changed=true;
     return {status:200,json:async()=>({success:true,result:{subdomain:'existing-account-domain'}})};
   }
 });
 await assert.rejects(result(),/CLOUD_SUBDOMAIN_ALREADY_EXISTS/);
 assert.equal(changed,false);
});
test('structured cloud guidance does not expose secrets and always provides a targeted next step',()=>{
 const {cloudSetupGuidance}=require('../app/cloud-setup-guidance.cjs');
 const cases=[
   [{phase:'authorization_required',remote:'unchecked'},'login'],
   [{phase:'choose_account',remote:'unchecked'},'choose_account'],
   [{phase:'choose_subdomain',remote:'unchecked'},'choose_subdomain'],
   [{phase:'choose_kv',remote:'unchecked'},'choose_kv'],
   [{phase:'already_deployed',remote:'deployed',hasOwnerKey:false},'owner_recovery'],
   [{phase:'ready',remote:'deployed',hasOwnerKey:true},'ready'],
   [{phase:'failed',remote:'unchecked',error:'CLOUD_WRANGLER_RUNTIME_MISSING'},'runtime']
 ];
 for(const [input,expected] of cases){
  const guide=cloudSetupGuidance(input);
  assert.equal(guide.code,expected);
  assert.equal(guide.totalSteps,6);
  assert.ok(guide.step>=0&&guide.step<=6);
  assert.ok(!JSON.stringify(guide).includes('OWNER_AUTH_KEY'));
  if(guide.helpUrl)assert.match(guide.helpUrl,/^https:\/\/dash\.cloudflare\.com\//);
 }
});

test('multiple accounts and KV namespaces are resolved from existing Worker identity and binding, without guessing',async()=>{
 const {discoverCloudflare}=require('../app/cloudflare-discovery.cjs');
 const a='a'.repeat(32),b='b'.repeat(32),kv1='c'.repeat(32),kv2='d'.repeat(32);
 const tokenOutput=JSON.stringify({type:'oauth',token:'f'.repeat(40)});
 const queried=[];
 const fetcher=async(url)=>{
   queried.push(url);
   let result;
   if(url.endsWith('accounts?per_page=100'))result=[{id:a,name:'Unrelated'},{id:b,name:'ChatToHarness'}];
   else if(url.endsWith('/workers/scripts')&&url.includes('/'+a+'/'))result=[{id:'unrelated-worker'}];
   else if(url.endsWith('/workers/scripts')&&url.includes('/'+b+'/'))
     result=[{id:'chattoharness-auth'},{id:'chattoharness-cloud-router'}];
   else if(url.endsWith('/workers/subdomain')&&url.includes('/'+b+'/'))result={subdomain:'watermoon3322'};
   else if(url.includes('/storage/kv/namespaces')&&url.includes('/'+b+'/'))
     result=[{id:kv1,title:'OAUTH_KV'},{id:kv2,title:'chattoharness-auth-OAUTH_KV'}];
   else if(url.endsWith('/workers/scripts/chattoharness-auth/settings')&&url.includes('/'+b+'/'))
     result={bindings:[{type:'kv_namespace',name:'OAUTH_KV',namespace_id:kv2}]};
   else throw Error('UNEXPECTED_API_'+url);
   return {status:200,json:async()=>({success:true,result})};
 };
 const found=await discoverCloudflare({fetcher,tokenOutput});
 assert.equal(found.needs,null);
 assert.equal(found.accountId,b);
 assert.equal(found.kvId,kv2);
 assert.ok(queried.some(x=>x.endsWith('/workers/scripts/chattoharness-auth/settings')));
});
test('ambiguous accounts and missing verified OAuth KV binding remain user decisions',async()=>{
 const {discoverCloudflare}=require('../app/cloudflare-discovery.cjs');
 const a='a'.repeat(32),b='b'.repeat(32),kv1='c'.repeat(32),kv2='d'.repeat(32);
 const tokenOutput=JSON.stringify({type:'oauth',token:'f'.repeat(40)});
 const fetcher=async(url)=>{
   let result;
   if(url.endsWith('accounts?per_page=100'))result=[{id:a,name:'One'},{id:b,name:'Two'}];
   else if(url.endsWith('/workers/scripts'))result=[];
   else if(url.endsWith('/workers/subdomain'))result={subdomain:'watermoon3322'};
   else if(url.includes('/storage/kv/namespaces'))result=[{id:kv1,title:'OAUTH_KV'},{id:kv2,title:'chattoharness-auth-OAUTH_KV'}];
   else if(url.endsWith('/workers/scripts/chattoharness-auth/settings'))result={bindings:[]};
   else throw Error('UNEXPECTED_API');
   return {status:200,json:async()=>({success:true,result})};
 };
 const first=await discoverCloudflare({fetcher,tokenOutput});
 assert.equal(first.needs,'account');
 const second=await discoverCloudflare({fetcher,tokenOutput,accountId:a});
 assert.equal(second.needs,'kv');
});
test('Wrangler browser device login publishes only short code and clears it after authorization',async t=>{
 const x=scenario();t.after(()=>fs.rmSync(x.home,{recursive:true,force:true}));
 const runner=x.bootstrap.runner;
 let denyOnce=true,seen='';
 const opened=[];x.bootstrap.openExternal=async url=>opened.push(url);
 x.bootstrap.runner=async(node,script,args,opts)=>{
   if(args[0]==='auth'&&denyOnce){denyOnce=false;return {code:1,stdout:'',stderr:''};}
   if(args[0]==='login'){
     assert.equal(args[1],'--device');
     assert.ok(args.includes('--no-browser'));
     opts.onOutput?.('To authorize Wrangler, please visit:\nhttps://dash.cloudflare.com/oauth2/device\nand enter the code:\n jPqK6Qvs\n');
     seen=x.bootstrap.status().loginCode;
     return {code:0,stdout:'Successfully logged in'};
   }
   return runner(node,script,args,opts);
 };
 const result=await x.bootstrap.init({});
 assert.equal(result.phase,'ready',result.error);
 assert.equal(seen,'jPqK6Qvs');
 assert.deepEqual(opened,['https://dash.cloudflare.com/oauth2/device?user_code=jPqK6Qvs']);
 assert.equal(result.loginCode,'');
 assert.equal(result.browserAuthComplete,true,'successful token verification permits closing browser');
 assert.equal(JSON.stringify(result).includes('f'.repeat(64)),false);
});

test('browser close reminder never appears for cancelled authorization or failed token verification',async t=>{
 const x=scenario();t.after(()=>fs.rmSync(x.home,{recursive:true,force:true}));
 let authCalls=0;
 x.bootstrap.runner=async(node,script,args)=>{
   if(args[0]==='auth'){authCalls++;return {code:1,stdout:'',stderr:''};}
   if(args[0]==='login')return {code:0,stdout:'Successfully logged in'};
   throw Error('UNEXPECTED_CLI');
 };
 const result=await x.bootstrap.init({});
 assert.equal(result.phase,'failed');
 assert.equal(authCalls,2,'token must be checked both before and after browser login');
 assert.equal(result.browserAuthComplete,false,'CLI login exit alone is not proof of authorization');
 const y=scenario();t.after(()=>fs.rmSync(y.home,{recursive:true,force:true}));
 y.bootstrap.runner=async(node,script,args)=>{
   if(args[0]==='auth')return {code:1,stdout:'',stderr:''};
   if(args[0]==='login')return {code:1,stdout:'',stderr:''};
   throw Error('UNEXPECTED_CLI');
 };
 const cancelled=await y.bootstrap.init({});
 assert.equal(cancelled.phase,'failed');
 assert.equal(cancelled.browserAuthComplete,false);
});

test('existing Cloudflare authorization never falsely prompts to close a browser tab',async t=>{
 const x=scenario();t.after(()=>fs.rmSync(x.home,{recursive:true,force:true}));
 const result=await x.bootstrap.init({});
 assert.equal(result.phase,'ready',result.error);
 assert.equal(result.browserAuthComplete,false);
});

test('Cloudflare Device Authorization 10404 falls back to standard browser OAuth with Keyring',async t=>{
 const x=scenario();t.after(()=>fs.rmSync(x.home,{recursive:true,force:true}));
 const fetcher=x.bootstrap.fetcher;
 x.bootstrap.fetcher=async(url,opts)=>url.startsWith('https://dash.cloudflare.com/oauth2/device')?
  {status:404,json:async()=>({success:false,errors:[{code:10404,message:'No route for that URI'}]})}:
  fetcher(url,opts);
 const runner=x.bootstrap.runner;let authFailed=true,standardLogins=0;
 x.bootstrap.runner=async(node,script,args,opts)=>{
  if(args[0]==='auth'&&authFailed){authFailed=false;return {code:1,stdout:'',stderr:''};}
  if(args[0]==='login'){
    assert.deepEqual(args,['login','--use-keyring']);
    standardLogins++;
    return {code:0,stdout:'Successfully logged in'};
  }
  return runner(node,script,args,opts);
 };
 const result=await x.bootstrap.init({});
 assert.equal(result.phase,'ready',result.error);
 assert.equal(standardLogins,1);
 assert.equal(result.loginCode,'');
 assert.equal(result.browserAuthComplete,true,'standard OAuth success should show close-browser reminder');
});

test('standard OAuth retains native Keyring errors instead of mislabeling login failure',async t=>{
 const x=scenario();t.after(()=>fs.rmSync(x.home,{recursive:true,force:true}));
 const fetcher=x.bootstrap.fetcher;
 x.bootstrap.fetcher=async(url,opts)=>url.startsWith('https://dash.cloudflare.com/oauth2/device')?
  {status:404,json:async()=>({success:false,errors:[{code:10404,message:'No route for that URI'}]})}:
  fetcher(url,opts);
 x.bootstrap.runner=async(node,script,args)=>{
  if(args[0]==='auth')return {code:1,stdout:'',stderr:''};
  if(args[0]==='login')throw Error('CLOUD_KEYRING_INSTALL_BUSY');
  throw Error('UNEXPECTED_CLI');
 };
 const status=await x.bootstrap.init({});
 assert.equal(status.phase,'failed');
 assert.equal(status.error,'CLOUD_KEYRING_INSTALL_BUSY');
});

test('other Device Authorization HTTP errors never trigger standard OAuth fallback',async t=>{
 const x=scenario();t.after(()=>fs.rmSync(x.home,{recursive:true,force:true}));
 x.bootstrap.fetcher=async()=>({status:404,json:async()=>({success:false,errors:[{code:9999,message:'Missing code'}]})});
 assert.equal(await x.bootstrap.deviceLoginRouteUnavailable(),false);
 x.bootstrap.fetcher=async()=>({status:403,json:async()=>({success:false,errors:[{code:10404,message:'No route for that URI'}]})});
 assert.equal(await x.bootstrap.deviceLoginRouteUnavailable(),false);
 x.bootstrap.fetcher=async()=>{throw Error('network down');};
 assert.equal(await x.bootstrap.deviceLoginRouteUnavailable(),false);
});

test('reinitialize redeploys only existing Workers and preserves Owner Key and KV',async(t)=>{
 const fixture=scenario();
 t.after(()=>fs.rmSync(fixture.home,{recursive:true,force:true}));
 assert.equal((await fixture.bootstrap.init({subdomain:'watermoon3322'})).phase,'ready');
 const record=structuredClone(fixture.bootstrap.record);
 const originalKey=fixture.bootstrap.ownerKey();
 const originalFetcher=fixture.bootstrap.fetcher;
 fixture.bootstrap.fetcher=async(url,opts)=>{
  if(url.includes('/storage/kv/namespaces'))
    return {status:200,json:async()=>({success:true,result:[{id:record.kvId,title:'OAUTH_KV'}]})};
  return originalFetcher(url,opts);
 };
 fixture.calls.length=0;fixture.inputs.length=0;
 const state=await fixture.bootstrap.reinitialize();
 assert.equal(state.phase,'ready',state.error);
 assert.deepEqual(fixture.calls.filter(a=>a[0]==='deploy').map(a=>a.slice(0,2)),
   [['deploy','--keep-vars'],['deploy','--keep-vars']]);
 assert.equal(fixture.calls.some(a=>a[0]==='kv'||a[0]==='secret'),false);
 assert.equal(fixture.inputs.length,0);
 assert.deepEqual(fixture.bootstrap.record,record);
 assert.equal(fixture.bootstrap.ownerKey(),originalKey);
});
test('reinitialize without a trusted local managed service never deploys',async(t)=>{
 const fixture=scenario();
 t.after(()=>fs.rmSync(fixture.home,{recursive:true,force:true}));
 const result=await fixture.bootstrap.reinitialize();
 assert.equal(result.error,'CLOUD_REINITIALIZE_REQUIRES_MANAGED_SERVICE');
 assert.equal(fixture.calls.some(a=>a[0]==='deploy'),false);
});

test('unknown cloud status permits retry while deployment still requires fresh verified absence',async t=>{
 const x=scenario();t.after(()=>fs.rmSync(x.home,{recursive:true,force:true}));
 const original=x.bootstrap.fetcher;let offline=true;
 x.bootstrap.fetcher=async(url,opts)=>{if(offline&&url.includes('.workers.dev'))throw Error('network unavailable');return original(url,opts);};
 const failed=await x.bootstrap.init({});
 assert.equal(failed.remote,'unreachable');
 assert.equal(failed.error,'CLOUD_REMOTE_STATE_UNKNOWN');
 assert.equal(x.calls.some(args=>['deploy','secret','kv'].includes(args[0])),false);
 offline=false;
 assert.equal((await x.bootstrap.init({})).phase,'ready');
});

test('account-only initialization creates service without Owner Key or secret writes',async t=>{
 const x=scenario();t.after(()=>fs.rmSync(x.home,{recursive:true,force:true}));
 const status=await x.bootstrap.initializeAccount({});
 assert.equal(status.phase,'ready',status.error);
 assert.equal(status.identityMode,'cloudflare');
 assert.equal(x.calls.some(args=>args[0]==='secret'),false);
 assert.equal(x.bootstrap.record.encryptedKey,'');
 assert.equal(JSON.stringify(status).includes('x'.repeat(64)),false);
});

test('both generated Workers bind their immutable Cloudflare account identity',()=>{
 const account='b'.repeat(32);
 for(const role of ['auth','router'])assert.equal(config(source,'watermoon3322',kvId,role,account).vars.CF_ACCOUNT_ID,account);
});

test('account migration preserves custom Worker variables and never rotates an Owner Key',async t=>{
 const x=scenario();t.after(()=>fs.rmSync(x.home,{recursive:true,force:true}));
 await x.bootstrap.init({});const original=x.bootstrap.fetcher;
 x.bootstrap.fetcher=async(url,opts)=>{
  if(url.includes('/storage/kv/namespaces'))return {status:200,json:async()=>({success:true,result:[{id:kvId,title:'OAUTH_KV'}]})};
  if(url.endsWith('/settings'))return {status:200,ok:true,json:async()=>({success:true,result:{bindings:[{type:'plain_text',name:'CUSTOM_VAR',text:'preserved'}]}})};
  return original(url,opts);
 };
 const before=x.calls.filter(args=>args[0]==='secret').length;
 const state=await x.bootstrap.initializeAccount({redeploy:true});
 assert.equal(state.phase,'ready',state.error);
 assert.equal(x.calls.filter(args=>args[0]==='secret').length,before);
 for(const role of ['auth','router']){
  const config=JSON.parse(fs.readFileSync(path.join(x.home,'cloudflare-bootstrap',role+'.jsonc'),'utf8'));
  assert.equal(config.vars.CUSTOM_VAR,'preserved');assert.equal(config.vars.CF_ACCOUNT_ID,'b'.repeat(32));
 }
});
