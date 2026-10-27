'use strict';
const {discoverCloudflare}=require('./cloudflare-discovery.cjs');
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
 if(accountId)v.account_id=accountId;
 if(auth){if(kv)v.kv_namespaces=[{binding:'OAUTH_KV',id:kv}];}
 else{
   v.vars.ALLOWED_TOOLS='get_harness_status';
   v.durable_objects={bindings:[{name:'DEVICE_HUB',class_name:'DeviceHub'}]};
   v.migrations=[{tag:'v1',new_sqlite_classes:['DeviceHub']}];
   v.services=[{binding:'AUTH_SERVER',service:AUTH}];
 }
 return v;
}
function run(node,script,args,{cwd,input,timeoutMs=180000}={}) {
 return new Promise((resolve,reject)=>{
  const child=spawn(node,[script,...args],{cwd,windowsHide:true,
   stdio:['pipe','pipe','pipe'],env:{...process.env,WRANGLER_SEND_METRICS:'false',NO_COLOR:'1'}});
  let out='',err='',done=false;
  const limit=(s,chunk)=>(s+String(chunk)).slice(-24576);
  child.stdout.on('data',c=>{out=limit(out,c);});
  child.stderr.on('data',c=>{err=limit(err,c);});
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
 constructor({home,safeStorage,nodePath,sourceDir,runner=run,fetcher=globalThis.fetch,onChange=()=>{}}){
  Object.assign(this,{home,safeStorage,nodePath,sourceDir,runner,fetcher,onChange});
  this.dir=path.join(home,'cloudflare-bootstrap');
  this.file=path.join(this.dir,'credentials.json');
  this.phase='idle';this.error='';this.busy=false;
  this.accountChoices=[];this.kvChoices=[];this.discoveredAccountId='';this.discoveredSubdomain='';
  this.selectedKvId='';
  this.record=this.read();if(this.record?.complete)this.phase='ready';
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
 status(){return {phase:this.phase,error:this.error,busy:this.busy,
  subdomain:this.record?.subdomain||this.discoveredSubdomain,
  accountId:this.record?.accountId||this.discoveredAccountId,
  accountOptions:this.accountChoices,kvOptions:this.kvChoices,
  kvId:this.selectedKvId||this.record?.kvId,
  mcp_url:this.record?urls(this.record.subdomain).mcp:'',
  hasOwnerKey:Boolean(this.record?.encryptedKey),ready:this.phase==='ready'};}
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
 async cli(args,input,timeoutMs){
  const script=path.join(this.sourceDir,'node_modules/wrangler/bin/wrangler.js');
  if(!fs.existsSync(script)||!fs.existsSync(this.nodePath))throw Error('CLOUD_RUNTIME_NOT_BUNDLED');
  const res=await this.runner(this.nodePath,script,args,{cwd:this.sourceDir,input,timeoutMs});
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
 async findOptions(input={},allowLogin=false){
   this.phaseSet('discovering');
   let token;
   try{token=await this.cli(['auth','token','--json']);}
   catch{
     if(!allowLogin)throw Error('CLOUD_LOGIN_REQUIRED');
     this.phaseSet('authorize_browser');
     await this.cli(['login','--device','--use-keyring'],undefined,360000);
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
   this.phaseSet(found.needs==='account'?'choose_account':
     found.needs==='kv'?'choose_kv':this.record?.complete?'ready':'selection_ready');
   return found;
 }
 async preview(input={}){
   if(this.busy)return this.status();
   this.busy=true;this.onChange();
   try{await this.findOptions(input,false);}
   catch(e){this.phaseSet('failed',String(e?.message||'CLOUD_DISCOVERY_FAILED').split(':')[0]);}
   finally{this.busy=false;this.onChange();}
   return this.status();
 }
 async init(input){
  if(this.busy)throw Error('CLOUD_SETUP_BUSY');
  this.busy=true;this.error='';this.onChange();
  try{
   if(!this.safeStorage?.isEncryptionAvailable?.())throw Error('CLOUD_SECURE_STORAGE_REQUIRED');
   const found=await this.findOptions(input,true);
   if(found.needs){
     this.phaseSet(found.needs==='account'?'choose_account':'choose_kv');
     return this.status();
   }
   const s=subdomain(found.subdomain),accountId=found.accountId;
   if(this.record&&this.record.subdomain!==s)throw Error('CLOUD_EXISTING_ACCOUNT_MISMATCH');
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
   const u=urls(s);
   const [metadata,protectedMcp]=await Promise.all([
    this.fetcher(u.auth+'/.well-known/oauth-authorization-server',{signal:AbortSignal.timeout(12000)}),
    this.fetcher(u.mcp,{method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(12000)})
   ]);
   if(metadata.status!==200||protectedMcp.status!==401)throw Error('CLOUD_REMOTE_VERIFICATION_FAILED');
   this.record.complete=true;this.save();this.phaseSet('ready');
  }catch(e){this.phaseSet('failed',String(e?.message||'CLOUD_SETUP_FAILED').split(':')[0].slice(0,100));}
  finally{this.busy=false;this.onChange();}
  return this.status();
 }
}
module.exports={CloudBootstrap,subdomain,urls,config,run};
