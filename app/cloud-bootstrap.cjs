'use strict';
const {discoverCloudflare,inspectWorkerScripts,createWorkersSubdomain}=require('./cloudflare-discovery.cjs');
// Desktop-only first-run bootstrap. Does not depend on MCP, Computer Use or shell access.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const SUB=/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
const ID=/^[a-f0-9]{32}$/i,KEY=/^[a-f0-9]{64}$/;
const AUTH='chattoharness-auth',ROUTER='chattoharness-cloud-router';
function subdomain(v) {
 if(typeof v!=='string')throw Error('CLOUD_SUBDOMAIN_REQUIRED');
 const s=v.trim().replace(/\.workers\.dev$/,'').toLowerCase();
 if(!SUB.test(s))throw Error('CLOUD_SUBDOMAIN_INVALID');
 return s;
}
function urls(s) {
 return {auth:'https://'+AUTH+'.'+s+'.workers.dev',
   mcp:'https://'+ROUTER+'.'+s+'.workers.dev/mcp'};
}
function config(source,s,kv,role,accountId) {
 const u=urls(s),auth=role==='auth';
 const v={name:auth?AUTH:ROUTER,
   main:path.join(source,auth?'auth-server/index.mjs':'src/secure-worker.mjs'),
   compatibility_date:'2026-10-26',compatibility_flags:['global_fetch_strictly_public'],
   workers_dev:true,vars:{OAUTH_ISSUER:u.auth,MCP_RESOURCE_URL:u.mcp,OWNER_AUTH_EPOCH:'v1'}};
 if(accountId){v.account_id=accountId;v.vars.CF_ACCOUNT_ID=accountId;}
 if(auth){if(kv)v.kv_namespaces=[{binding:'OAUTH_KV',id:kv}];}
 else{
   v.vars.ALLOWED_TOOLS='get_harness_status';
   v.durable_objects={bindings:[{name:'DEVICE_HUB',class_name:'DeviceHub'}]};
   v.migrations=[{tag:'v1',new_sqlite_classes:['DeviceHub']}];
   v.services=[{binding:'AUTH_SERVER',service:AUTH}];
 }
 return v;
}
function run(node,script,args,{cwd,input,timeoutMs=180000,onOutput,env={}}={}) {
 return new Promise((resolve,reject)=>{
  const child=spawn(node,[script,...args],{cwd,windowsHide:true,
   stdio:['pipe','pipe','pipe'],env:{...process.env,...env,WRANGLER_SEND_METRICS:'false',NO_COLOR:'1'}});
  let out='',err='',done=false;
  const limit=(s,chunk)=>(s+String(chunk)).slice(-24576);
  child.stdout.on('data',c=>{out=limit(out,c);onOutput?.(String(c));});
  child.stderr.on('data',c=>{err=limit(err,c);onOutput?.(String(c));});
  const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);
   error?reject(error):resolve(result);};
  const timer=setTimeout(()=>{child.kill();finish(Error('CLOUD_WRANGLER_TIMEOUT'));},timeoutMs);
  child.on('error',()=>finish(Error('CLOUD_WRANGLER_START_FAILED')));
  child.on('close',code=>finish(null,{code,stdout:out,stderr:err}));
  child.stdin.end(input===undefined?undefined:input+'\n');
 });
}
function atomic(file,obj) {
 const temp=file+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';
 try{fs.writeFileSync(temp,JSON.stringify(obj,null,2),{flag:'wx',mode:0o600});
  fs.renameSync(temp,file);if(process.platform!=='win32')fs.chmodSync(file,0o600);
 }catch(e){try{fs.rmSync(temp,{force:true});}catch{}throw e;}
}
class CloudBootstrap {
 constructor({home,safeStorage,nodePath,sourceDir,runner=run,fetcher=globalThis.fetch,onChange=()=>{},openExternal=async()=>{},cliEnv=async()=>({})}){
  Object.assign(this,{home,safeStorage,nodePath,sourceDir,runner,fetcher,onChange,openExternal,cliEnv});
  this.dir=path.join(home,'cloudflare-bootstrap');
  this.file=path.join(this.dir,'credentials.json');
  this.phase='idle';this.error='';this.busy=false;
  this.remote='unchecked';this.remoteCheckedAt=null;this.workerInventory=null;
  this.accountChoices=[];this.kvChoices=[];this.discoveredAccountId='';this.discoveredSubdomain='';
  this.selectedKvId='';this.suggestedSubdomain='';this.loginCode='';this.loginOutputTail='';
  this.record=this.read();if(this.record?.complete)this.phase='checking';
 }
 read(){
  try{const s=fs.lstatSync(this.file);
   if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>4096)return null;
   const d=JSON.parse(fs.readFileSync(this.file,'utf8'));
   if(d.schema!==1||!SUB.test(d.subdomain)||!ID.test(d.kvId)||
     typeof d.encryptedKey!=='string'||d.encryptedKey.length>512)return null;
   return d;
  }catch{return null;}
 }
 status(){return {identityMode:'cloudflare',phase:this.phase,error:this.error,busy:this.busy,resetInProgress:Boolean(this.record?.resetStage),
  subdomain:this.record?.subdomain||this.discoveredSubdomain,
  accountId:this.record?.accountId||this.discoveredAccountId,
  accountOptions:this.accountChoices,kvOptions:this.kvChoices,
  suggestedSubdomain:this.suggestedSubdomain,
  loginCode:this.phase==='authorize_browser'?this.loginCode:'',
  guidance:require('./cloud-setup-guidance.cjs').cloudSetupGuidance({
    phase:this.phase,remote:this.remote,error:this.error,
    hasOwnerKey:Boolean(this.record?.encryptedKey)
  }),
  kvId:this.selectedKvId||this.record?.kvId,
  mcp_url:this.remote==='deployed'&&this.discoveredSubdomain?
    urls(this.discoveredSubdomain).mcp:this.record?urls(this.record.subdomain).mcp:'',
  remote:this.remote,remoteCheckedAt:this.remoteCheckedAt,
  hasOwnerKey:Boolean(this.record?.encryptedKey),ready:this.phase==='ready' && this.remote==='deployed'};}
 phaseSet(p,e=''){this.phase=p;this.error=e;this.onChange();}
 save(){fs.mkdirSync(this.dir,{recursive:true,mode:0o700});atomic(this.file,this.record);}
 ownerKey(){
  if(!this.safeStorage?.isEncryptionAvailable?.())throw Error('CLOUD_SECURE_STORAGE_REQUIRED');
  if(!this.record?.encryptedKey)throw Error('CLOUD_OWNER_KEY_NOT_FOUND');
  const key=this.safeStorage.decryptString(Buffer.from(this.record.encryptedKey,'base64'));
  if(!KEY.test(key))throw Error('CLOUD_OWNER_KEY_INVALID');
  return key;
 }
 copyOwnerKey(clipboard){clipboard.writeText(this.ownerKey());return {copied:true};}
 runtimeCheck(){
  // Read-only, no authentication, no child process, no credential disclosure.
  const nodePresent=typeof this.nodePath==='string'&&fs.existsSync(this.nodePath);
  const wrangler=path.join(this.sourceDir,'node_modules/wrangler/bin/wrangler.js');
  const wranglerPresent=fs.existsSync(wrangler);
  return {ready:nodePresent&&wranglerPresent,nodePresent,wranglerPresent};
 }
 async cli(args,input,timeoutMs,onOutput){
  const check=this.runtimeCheck();
  if(!check.nodePresent)throw Error('CLOUD_NODE_RUNTIME_MISSING');
  if(!check.wranglerPresent)throw Error('CLOUD_WRANGLER_RUNTIME_MISSING');
  if(args[0]==='login'&&this.runner===run)require('./cloud-keyring.cjs').prepareKeyring(this.sourceDir);
  const script=path.join(this.sourceDir,'node_modules/wrangler/bin/wrangler.js');
  const res=await this.runner(this.nodePath,script,args,{cwd:this.sourceDir,input,timeoutMs,onOutput,env:await this.cliEnv()});
  if(res.code!==0)throw Error('CLOUD_WRANGLER_FAILED_'+args[0].toUpperCase());
  return res.stdout;
 }
 configs(s,kv,accountId){
  fs.mkdirSync(this.dir,{recursive:true,mode:0o700});
  const a=path.join(this.dir,'auth.jsonc'),b=path.join(this.dir,'router.jsonc');
  atomic(a,config(this.sourceDir,s,kv,'auth',accountId));
  atomic(b,config(this.sourceDir,s,kv,'router',accountId));
  return {auth:a,router:b};
 }
 // A public 404 cannot establish that a worker was never deployed.
 // Only the authenticated Cloudflare script inventory can prove absence.
 async checkRemote(s,inventory=this.workerInventory) {
   if(!SUB.test(s)){this.remote='unchecked';return this.remote;}
   this.remote='checking';this.onChange();
   const {auth,mcp}=urls(s);
   try{
     const [metadata,health,unauthorized]=await Promise.all([
       this.fetcher(auth+'/.well-known/oauth-authorization-server',
         {signal:AbortSignal.timeout(12000)}),
       this.fetcher(new URL('/health',mcp).href,{signal:AbortSignal.timeout(12000)}),
       this.fetcher(mcp,{method:'GET',signal:AbortSignal.timeout(12000)})
     ]);
     const authOk=metadata?.status===200;
     const routerOk=health?.status===200&&unauthorized?.status===401;
     if(authOk&&routerOk&&(!inventory||(inventory.auth&&inventory.router)))
       this.remote='deployed';
     else if(inventory&&!inventory.auth&&!inventory.router&&!authOk&&!routerOk)
       this.remote='not_deployed';
     else if(authOk||routerOk||(inventory&&(inventory.auth!==inventory.router)))
       this.remote='partial';
     else this.remote='unreachable';
   }catch{this.remote='unreachable';}
   this.remoteCheckedAt=Date.now();this.onChange();
   return this.remote;
 }
 async findOptions(input={},allowLogin=false){
   this.workerInventory=null;this.remote='unchecked';this.remoteCheckedAt=null;
   this.phaseSet('discovering');
   let token;
   try{token=await this.cli(['auth','token','--json']);}
   catch(error){
     // Never confuse missing/unusable packaged resources with a login problem.
     const code=String(error?.message||'');
     if(code==='CLOUD_NODE_RUNTIME_MISSING'||code==='CLOUD_WRANGLER_RUNTIME_MISSING'
       ||code==='CLOUD_WRANGLER_START_FAILED'||code==='CLOUD_WRANGLER_TIMEOUT')throw error;
     if(!allowLogin)throw Error('CLOUD_LOGIN_REQUIRED');
     this.loginCode='';this.loginOutputTail='';
     this.phaseSet('authorize_browser');
     await this.cli(['login','--device','--use-keyring','--no-browser'],undefined,360000,chunk=>{
       this.loginOutputTail=(this.loginOutputTail+chunk).slice(-1600);
       // Parse only the short Wrangler device code, never expose CLI output or tokens.
       const m=this.loginOutputTail.match(/(?:enter the code\s*:|user_code=)\s*([A-Za-z0-9]{8,12})/i);
       if(m&&this.loginCode!==m[1]){this.loginCode=m[1];this.onChange();
         void this.openExternal('https://dash.cloudflare.com/oauth2/device?user_code='+encodeURIComponent(m[1])).catch(()=>{});}
     });
     this.loginCode='';this.loginOutputTail='';
     token=await this.cli(['auth','token','--json']);
   }
   const chosenAccount=input.accountId||this.record?.accountId||'';
   const chosenKv=(this.record?.accountId===chosenAccount?this.record?.kvId:'')||'';
   const found=await discoverCloudflare({fetcher:this.fetcher,tokenOutput:token,
     accountId:chosenAccount,kvId:input.kvId||chosenKv});
   this.accountChoices=found.accounts;
   this.kvChoices=found.kvOptions;
   this.discoveredAccountId=found.accountId||'';
   this.discoveredSubdomain=found.subdomain||'';
   this.selectedKvId=found.kvId||'';
   this.suggestedSubdomain=found.suggestedSubdomain||'';
   this.workerInventory=null;
   if(!found.needs){
     try{
       this.workerInventory=await inspectWorkerScripts({
         fetcher:this.fetcher,tokenOutput:token,accountId:found.accountId
       });
     }catch{/* Missing Cloudflare permission or network access != absent. */}
     await this.checkRemote(found.subdomain,this.workerInventory);
   }else this.remote='unchecked';
   this.phaseSet(found.needs==='account'?'choose_account':
     found.needs==='subdomain'?'choose_subdomain':
     found.needs==='kv'?'choose_kv':
     this.remote==='deployed'?
       (!this.record?.encryptedKey?'already_deployed':this.record.complete?'ready':'recovery_required'):
     this.remote==='not_deployed'?'not_initialized':
     this.remote==='partial'?'degraded':'verification_unavailable');
   return found;
 }
 async preview(input={}){
   if(this.busy)return this.status();
   this.busy=true;this.onChange();
   try{await this.findOptions(input,false);}
   catch(e){
     const code=String(e?.message||'CLOUD_DISCOVERY_FAILED').split(':')[0];
     if(this.record?.subdomain){
       const remote=await this.checkRemote(this.record.subdomain,null);
       if(remote==='deployed'){
         this.phaseSet(!this.record.encryptedKey?'already_deployed':
           this.record.complete?'ready':'recovery_required');
       }else this.phaseSet(code==='CLOUD_LOGIN_REQUIRED'?
         'authorization_required':'verification_unavailable',
         code==='CLOUD_LOGIN_REQUIRED'?'':code);
     }else this.phaseSet(code==='CLOUD_LOGIN_REQUIRED'?
       'authorization_required':'verification_unavailable',
       code==='CLOUD_LOGIN_REQUIRED'?'':code);
   }
   finally{this.busy=false;this.onChange();}
   return this.status();
 }
 async rotateOwnerKey(input={}){
  if(this.busy)throw Error('CLOUD_SETUP_BUSY');
  this.busy=true;this.error='';this.onChange();
  try{
   if(!this.safeStorage?.isEncryptionAvailable?.())throw Error('CLOUD_SECURE_STORAGE_REQUIRED');
   const found=await this.findOptions(input,true);
   if(found.needs){this.phaseSet(found.needs==='account'?'choose_account':'choose_kv');return this.status();}
   const s=subdomain(found.subdomain),accountId=found.accountId,kv=found.kvId;
   if(!ID.test(accountId)||!ID.test(kv)||this.remote!=='deployed'||
      this.workerInventory?.auth!==true||this.workerInventory?.router!==true)
     throw Error('CLOUD_ROTATION_TARGET_UNVERIFIED');
   if(this.record&&(this.record.subdomain!==s||this.record.kvId!==kv||
      (this.record.accountId&&this.record.accountId!==accountId)))
     throw Error('CLOUD_EXISTING_ACCOUNT_MISMATCH');
   if(!this.record)this.record={schema:1,subdomain:s,accountId,kvId:kv,encryptedKey:'',complete:false};
   if(!this.record.pendingEncryptedKey){
    this.record.pendingEncryptedKey=this.safeStorage.encryptString(
      crypto.randomBytes(32).toString('hex')).toString('base64');
    this.save(); // Persist encrypted candidate before changing remote secret.
   }
   const candidate=this.safeStorage.decryptString(Buffer.from(this.record.pendingEncryptedKey,'base64'));
   if(!KEY.test(candidate))throw Error('CLOUD_OWNER_KEY_INVALID');
   const files=this.configs(s,kv,accountId);
   this.phaseSet('rotating_owner');
   // Update one existing Worker secret only. No code deploy, migrations or OAuth epoch change.
   await this.cli(['secret','put','OWNER_AUTH_KEY','--config',files.auth],candidate);
   this.record.encryptedKey=this.record.pendingEncryptedKey;
   delete this.record.pendingEncryptedKey;
   this.record.complete=false;this.save();
   this.phaseSet('verifying');
   if(await this.checkRemote(s,{auth:true,router:true})!=='deployed')
     throw Error('CLOUD_REMOTE_VERIFICATION_FAILED');
   this.record.complete=true;this.save();this.phaseSet('ready');
  }catch(e){this.phaseSet('failed',String(e?.message||'CLOUD_ROTATION_FAILED').split(':')[0].slice(0,100));}
  finally{this.busy=false;this.onChange();}
  return this.status();
 }
 async initializeAccount(input={}){
  try{await this.accountConnection(input);return this.status();}
  catch(e){if(e.message!=='CLOUD_ACCOUNT_SELECTION_REQUIRED')this.phaseSet('failed',String(e.message||'CLOUD_SETUP_FAILED'));return this.status();}
 }
 async accountConnection(input={}){
  if(this.busy)throw Error('CLOUD_SETUP_BUSY');
  this.busy=true;this.onChange();
  try{
   let found=await this.findOptions(input,true);
   if(found.needs==='subdomain'&&input.subdomain){
    const auth=await this.cli(['auth','token','--json']);
    await createWorkersSubdomain({fetcher:this.fetcher,tokenOutput:auth,accountId:found.accountId,subdomain:subdomain(input.subdomain)});
    found=await this.findOptions({accountId:found.accountId},false);
   }
   if(found.needs){this.phaseSet('choose_'+found.needs);throw Error('CLOUD_ACCOUNT_SELECTION_REQUIRED');}
   if(!['deployed','partial','not_deployed'].includes(this.remote))throw Error('CLOUD_REMOTE_STATE_UNKNOWN');
   const mcp=urls(found.subdomain).mcp;
   if(input.mcpUrl&&input.mcpUrl!==mcp)throw Error('CLOUD_EXISTING_ACCOUNT_MISMATCH');
   let kv=found.kvId;
   if(!kv){
    if(this.remote!=='not_deployed')throw Error('CLOUD_KV_CREATION_UNVERIFIED');
    this.phaseSet('creating_kv');const files=this.configs(found.subdomain,'',found.accountId);
    const result=await this.cli(['kv','namespace','create','OAUTH_KV','--config',files.auth]);
    kv=result.match(/["']?id["']?\s*[:=]\s*["']?([a-f0-9]{32})/i)?.[1];
    if(!kv)throw Error('CLOUD_KV_CREATION_UNVERIFIED');
   }
   let current=false;
   if(this.remote==='deployed'&&!input.redeploy){
    const health=await this.fetcher(new URL('/health',mcp).href,{signal:AbortSignal.timeout(12000)});
    current=(await health.json()).identity_mode==='cloudflare';
   }
   if(!current){
    const files=this.configs(found.subdomain,kv,found.accountId);
    if(this.remote!=='not_deployed'){
     const headers=require('./cloudflare-discovery.cjs').headersFromWrangler(await this.cli(['auth','token','--json']));
     for(const [role,name] of [['auth',AUTH],['router',ROUTER]]){
      const response=await this.fetcher('https://api.cloudflare.com/client/v4/accounts/'+found.accountId+'/workers/scripts/'+name+'/settings',{headers,signal:AbortSignal.timeout(15000)});
      if(response.status===404)continue;
      if(!response.ok&&response.status!==200)throw Error('CLOUD_API_UNAVAILABLE');
      const data=await response.json();if(!data.success||!Array.isArray(data.result?.bindings))throw Error('CLOUD_API_RESPONSE_INVALID');
      const config=JSON.parse(fs.readFileSync(files[role],'utf8'));
      const prior=Object.fromEntries(data.result.bindings.filter(v=>['plain_text','json'].includes(v.type)).map(v=>[v.name,v.type==='plain_text'?v.text:v.json]));
      config.vars={...prior,...config.vars};atomic(files[role],config);
     }
    }
    this.phaseSet('redeploying_auth');await this.cli(['deploy','--config',files.auth]);
    this.phaseSet('redeploying_router');await this.cli(['deploy','--config',files.router]);
    if(await this.checkRemote(found.subdomain,null)!=='deployed')throw Error('CLOUD_REMOTE_VERIFICATION_FAILED');
   }
   this.record={schema:1,subdomain:found.subdomain,accountId:found.accountId,kvId:kv,encryptedKey:this.record?.encryptedKey||'',complete:true};this.save();
   const auth=JSON.parse(await this.cli(['auth','token','--json']));
   if(!['oauth','api_token'].includes(auth.type)||typeof auth.token!=='string')throw Error('CLOUD_LOGIN_REQUIRED');
   this.phaseSet('ready');return {mcpUrl:mcp,token:auth.token};
  }finally{this.busy=false;this.onChange();}
 }
 async resetCloud(options){return require('./cloud-full-reset.cjs').resetManagedCloud(this,options);}
 async reinitialize() {
   if(this.busy)throw Error('CLOUD_SETUP_BUSY');
   this.busy=true;this.error='';this.onChange();
   try{
     if(!this.safeStorage?.isEncryptionAvailable?.())throw Error('CLOUD_SECURE_STORAGE_REQUIRED');
     const saved=this.record;
     if(!saved?.complete||!saved.encryptedKey||!saved.subdomain||
        !ID.test(saved.accountId||'')||!ID.test(saved.kvId||''))
       throw Error('CLOUD_REINITIALIZE_REQUIRES_MANAGED_SERVICE');
     // A stale or copied local config must not select a different deployed Worker.
     const found=await this.findOptions({accountId:saved.accountId,kvId:saved.kvId},false);
     if(found.needs||this.remote!=='deployed'||
        found.accountId!==saved.accountId||found.kvId!==saved.kvId||
        subdomain(found.subdomain)!==saved.subdomain||
        this.workerInventory?.auth!==true||this.workerInventory?.router!==true)
       throw Error('CLOUD_REINITIALIZE_TARGET_UNVERIFIED');
     // Retain the existing Owner Key and KV contents, including device bindings.
     const files=this.configs(saved.subdomain,saved.kvId,saved.accountId);
     this.phaseSet('redeploying_auth');
     await this.cli(['deploy','--keep-vars','--config',files.auth]);
     this.phaseSet('redeploying_router');
     await this.cli(['deploy','--keep-vars','--config',files.router]);
     this.phaseSet('verifying');
     if(await this.checkRemote(saved.subdomain,{auth:true,router:true})!=='deployed')
       throw Error('CLOUD_REMOTE_VERIFICATION_FAILED');
     this.phaseSet('ready');
   }catch(e){this.phaseSet('failed',String(e?.message||'CLOUD_REINITIALIZE_FAILED').split(':')[0].slice(0,100));}
   finally{this.busy=false;this.onChange();}
   return this.status();
 }
 async init(input){
  if(this.busy)throw Error('CLOUD_SETUP_BUSY');
  this.busy=true;this.error='';this.onChange();
  try{
   if(!this.safeStorage?.isEncryptionAvailable?.())throw Error('CLOUD_SECURE_STORAGE_REQUIRED');
   let found=await this.findOptions(input,true);
   if(found.needs==='subdomain'&&input?.subdomain){
     const requested=subdomain(input.subdomain);
     if(this.record?.subdomain&&this.record.subdomain!==requested)
       throw Error('CLOUD_EXISTING_ACCOUNT_MISMATCH');
     this.phaseSet('creating_subdomain');
     const token=await this.cli(['auth','token','--json']);
     await createWorkersSubdomain({fetcher:this.fetcher,tokenOutput:token,
       accountId:found.accountId,subdomain:requested});
     found=await this.findOptions({accountId:found.accountId},false);
   }
   if(found.needs){
     this.phaseSet(found.needs==='account'?'choose_account':
       found.needs==='subdomain'?'choose_subdomain':'choose_kv');
     return this.status();
   }
   const s=subdomain(found.subdomain),accountId=found.accountId;
   if(this.record&&this.record.subdomain!==s)throw Error('CLOUD_EXISTING_ACCOUNT_MISMATCH');
   if(this.remote==='deployed'){
     if(!this.record?.encryptedKey)
       throw Error('CLOUD_ALREADY_DEPLOYED_OWNER_KEY_MISSING');
     if(!this.record.complete)throw Error('CLOUD_DEPLOYED_KEY_NOT_VERIFIED');
     this.phaseSet('ready');return this.status();
   }
   if(this.remote==='partial'&&!this.record?.encryptedKey)
     throw Error('CLOUD_PARTIAL_DEPLOYMENT_OWNER_KEY_MISSING');
   if(!['not_deployed','partial'].includes(this.remote))
     throw Error('CLOUD_REMOTE_STATE_UNKNOWN');
   let kv=found.kvId;
   this.phaseSet('configuring');
   let files=this.configs(s,kv,accountId);
   if(!kv){
     this.phaseSet('creating_kv');
     const created=await this.cli(['kv','namespace','create','OAUTH_KV','--config',files.auth]);
     kv=created.match(/["']?id["']?\s*[:=]\s*["']?([a-f0-9]{32})/i)?.[1];
     if(!kv)throw Error('CLOUD_KV_CREATION_UNVERIFIED');
     this.kvChoices=[{id:kv,title:'OAUTH_KV'}];
   }
   files=this.configs(s,kv,accountId);
   if(!this.record)this.record={schema:1,subdomain:s,kvId:kv,encryptedKey:'',complete:false};
   this.record.kvId=kv;this.record.accountId=accountId;
   if(!this.record.encryptedKey){
    this.record.encryptedKey=this.safeStorage.encryptString(crypto.randomBytes(32).toString('hex')).toString('base64');
   }
   this.save(); // credential is durable before any non-idempotent deployment
   this.phaseSet('deploying_auth');
   await this.cli(['deploy','--config',files.auth]);
   this.phaseSet('setting_secret');
   await this.cli(['secret','put','OWNER_AUTH_KEY','--config',files.auth],this.ownerKey());
   this.phaseSet('deploying_router');
   await this.cli(['deploy','--config',files.router]);
   this.phaseSet('verifying');
   if(await this.checkRemote(s,null)!=='deployed')
     throw Error('CLOUD_REMOTE_VERIFICATION_FAILED');
   this.record.complete=true;this.save();this.phaseSet('ready');
  }catch(e){this.phaseSet('failed',String(e?.message||'CLOUD_SETUP_FAILED').split(':')[0].slice(0,100));}
  finally{this.busy=false;this.onChange();}
  return this.status();
 }
}
module.exports={CloudBootstrap,subdomain,urls,config,run};
