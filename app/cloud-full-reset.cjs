'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {headersFromWrangler}=require('./cloudflare-discovery.cjs');
const HEX32=/^[a-f0-9]{32}$/i;
const ROOT='https://api.cloudflare.com/client/v4/';
const WORKERS=['chattoharness-cloud-router','chattoharness-auth'];
async function api(b,headers,relative,method='GET',statuses=[200]){
 const response=await b.fetcher(ROOT+relative,{method,headers,signal:AbortSignal.timeout(20000)});
 if(!statuses.includes(response.status))throw Error('CLOUD_RESET_API_'+method+'_'+response.status);
 if([204,404].includes(response.status))return {status:response.status};
 const json=await response.json().catch(()=>null);
 if(json?.success!==true)throw Error('CLOUD_RESET_API_RESPONSE_INVALID');
 return {status:response.status,result:json.result,info:json.result_info};
}
async function verify(b,r,headers){
 const found=await b.findOptions({accountId:r.accountId,kvId:r.kvId},false);
 if(found.needs||b.remote!=='deployed'||b.workerInventory?.auth!==true||
   b.workerInventory?.router!==true||found.accountId!==r.accountId||
   found.kvId!==r.kvId||found.subdomain!==r.subdomain)
   throw Error('CLOUD_RESET_TARGET_UNVERIFIED');
 const ns=await api(b,headers,'accounts/'+r.accountId+'/storage/kv/namespaces?per_page=100');
 if(!Array.isArray(ns.result)||Number(ns.info?.total_pages||1)!==1||
   !ns.result.some(x=>x.id===r.kvId&&['OAUTH_KV','chattoharness-auth-OAUTH_KV'].includes(x.title)))
   throw Error('CLOUD_RESET_KV_UNVERIFIED');
 const scripts=await api(b,headers,'accounts/'+r.accountId+'/workers/scripts?per_page=100');
 if(!Array.isArray(scripts.result)||Number(scripts.info?.total_pages||1)!==1||
    !WORKERS.every(name=>scripts.result.some(x=>x.id===name)))
   throw Error('CLOUD_RESET_SCRIPT_INVENTORY_UNVERIFIED');
 let boundToAuth=false;
 for(const script of scripts.result){
   if(!/^[a-zA-Z0-9_-]+$/.test(script.id||''))throw Error('CLOUD_RESET_SCRIPT_INVENTORY_UNVERIFIED');
   const settings=await api(b,headers,'accounts/'+r.accountId+'/workers/scripts/'+script.id+'/settings');
   const bindings=settings.result?.bindings;
   if(!Array.isArray(bindings))throw Error('CLOUD_RESET_BINDING_UNVERIFIED');
   const uses=bindings.some(x=>x.type==='kv_namespace'&&x.namespace_id===r.kvId);
   if(uses&&script.id!=='chattoharness-auth')throw Error('CLOUD_RESET_KV_SHARED');
   if(uses)boundToAuth=true;
 }
 if(!boundToAuth)throw Error('CLOUD_RESET_KV_BINDING_UNVERIFIED');
}
function deleteLocal(file){
 try{
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw Error('CLOUD_RESET_LOCAL_UNSAFE_FILE');
  fs.unlinkSync(file);
 }catch(error){if(error.code!=='ENOENT')throw error;}
}
function proof(b,r){
 return crypto.createHmac('sha256',Buffer.from(b.ownerKey(),'hex'))
   .update(['ChatToHarness reset v1',r.accountId,r.kvId,r.subdomain].join('|')).digest('hex');
}
async function resetManagedCloud(b,{confirmation,clearLocal}={}){
 if(confirmation!=='RESET CHATTOHARNESS')throw Error('CLOUD_RESET_CONFIRMATION_REQUIRED');
 if(b.busy)throw Error('CLOUD_SETUP_BUSY');
 const r=b.record;
 if(!r?.complete||!HEX32.test(r.accountId||'')||!HEX32.test(r.kvId||'')||
    !r.encryptedKey||!/^[a-z0-9-]+$/.test(r.subdomain||''))
   throw Error('CLOUD_RESET_MANAGED_RECORD_REQUIRED');
 b.busy=true;b.error='';b.onChange();
 try{
  if(r.resetStage && (!/^[a-f0-9]{64}$/.test(r.resetProof||'')||
      !crypto.timingSafeEqual(Buffer.from(r.resetProof,'hex'),Buffer.from(proof(b,r),'hex'))))
    throw Error('CLOUD_RESET_JOURNAL_SCOPE_UNVERIFIED');
  const headers=r.resetStage==='local_cleanup'?null:
    headersFromWrangler(await b.cli(['auth','token','--json']));
  const mark=next=>{r.resetStage=next;b.save();b.phaseSet('reset_'+next);};
  if(!r.resetStage){
    b.phaseSet('reset_verifying');await verify(b,r,headers);
    r.resetProof=proof(b,r);
    mark('purge_hub');
  }
  const advance=async(current,next,action)=>{
   if(r.resetStage!==current)return;
   await action();mark(next);
  };
  const base='accounts/'+r.accountId+'/';
  await advance('purge_hub','delete_router',async()=>{
   const files=b.configs(r.subdomain,r.kvId,r.accountId);
   await b.cli(['deploy','--keep-vars','--config',files.router]);
   const {urls}=require('./cloud-bootstrap.cjs');
   const response=await b.fetcher(new URL('/owner-reset-device-hub',urls(r.subdomain).mcp).href,{
     method:'POST',headers:{'content-type':'application/json','user-agent':'ChatToHarness/0.8.1'},
     body:JSON.stringify({owner_secret:b.ownerKey()}),signal:AbortSignal.timeout(20000)
   });
   const json=await response.json().catch(()=>null);
   if(response.status!==200||json?.cleared!==true)throw Error('CLOUD_RESET_HUB_UNVERIFIED');
  });
  for(const [current,next,name] of [
   ['delete_router','delete_auth','chattoharness-cloud-router'],
   ['delete_auth','delete_kv','chattoharness-auth']]){
   await advance(current,next,async()=>{
    const target=base+'workers/scripts/'+name;
    await api(b,headers,target,'DELETE',[200,202,204,404]);
    if((await api(b,headers,target,'GET',[200,404])).status!==404)
      throw Error('CLOUD_RESET_SCRIPT_REMAINS');
   });
  }
  await advance('delete_kv','local_cleanup',async()=>{
   const target=base+'storage/kv/namespaces/'+r.kvId;
   await api(b,headers,target,'DELETE',[200,202,204,404]);
   if((await api(b,headers,target,'GET',[200,404])).status!==404)
     throw Error('CLOUD_RESET_KV_REMAINS');
  });
  if(r.resetStage!=='local_cleanup')throw Error('CLOUD_RESET_STAGE_INVALID');
  if(typeof clearLocal!=='function')throw Error('CLOUD_RESET_LOCAL_CLEANUP_REQUIRED');
  b.phaseSet('reset_local_cleanup');
  await clearLocal();
  for(const file of ['auth.jsonc','router.jsonc'])deleteLocal(path.join(b.dir,file));
  deleteLocal(b.file);b.record=null;
  b.remote='unchecked';b.workerInventory=null;
  b.accountChoices=[];b.kvChoices=[];b.discoveredAccountId='';
  b.discoveredSubdomain='';b.selectedKvId='';b.suggestedSubdomain='';
  b.phaseSet('not_initialized');
 }catch(error){
  b.phaseSet('failed',String(error?.message||'CLOUD_RESET_FAILED').split(':')[0].slice(0,100));
 }finally{b.busy=false;b.onChange();}
 return b.status();
}
module.exports={resetManagedCloud,verify};
