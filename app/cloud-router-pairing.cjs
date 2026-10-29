'use strict';
// Credentials for a paired device stay on that device, encrypted with OS safeStorage.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const CODE=/^[A-Za-z0-9_-]{43}$/;
function origin(mcpUrl) {
  // A missing/malformed URL is a user input error, not an uncaught TypeError.
  if(typeof mcpUrl!=='string'||!mcpUrl.trim())throw Error('CLOUD_PAIR_URL_INVALID');
  let u;
  try{u=new URL(mcpUrl);}catch{throw Error('CLOUD_PAIR_URL_INVALID');}
  if(u.protocol!=='https:'||!u.hostname||u.pathname!=='/mcp'||u.search||u.hash||
      u.username||u.password)throw Error('CLOUD_PAIR_URL_INVALID');
  return u.origin;
}
class CloudPairingStore {
  constructor(directory, safeStorage) {
    this.file=path.join(directory,'cloud-router-pairing.json');
    this.safeStorage=safeStorage;
  }
  read() {
    try{
      const stat=fs.lstatSync(this.file);
      if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8192||stat.nlink!==1)return null;
      const value=JSON.parse(fs.readFileSync(this.file,'utf8'));
      if(!value||value.schema!==1||typeof value.encryptedToken!=='string')return null;
      const endpoint=origin(value.mcpUrl);
      if(!this.safeStorage?.isEncryptionAvailable?.())return null;
      const token=this.safeStorage.decryptString(Buffer.from(value.encryptedToken,'base64'));
      if(!CODE.test(token))return null;
      return {mcpUrl:value.mcpUrl,agentUrl:endpoint.replace(/^https:/,'wss:')+'/agent',token,...(value.paused===true?{paused:true}:{})};
    }catch{return null;}
  }
  save(mcpUrl,token) {
    origin(mcpUrl);
    if(!CODE.test(token)||!this.safeStorage?.isEncryptionAvailable?.())
      throw Error('CLOUD_PAIR_SECURE_STORAGE_REQUIRED');
    const encryptedToken=this.safeStorage.encryptString(token).toString('base64');
    const value=JSON.stringify({schema:1,mcpUrl,encryptedToken,paused:false});
    const temporary=this.file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
    try{
      fs.writeFileSync(temporary,value,{mode:0o600,flag:'wx'});
      fs.renameSync(temporary,this.file);
      if(process.platform!=='win32')fs.chmodSync(this.file,0o600);
    }catch(e){try{fs.rmSync(temporary,{force:true});}catch{}throw e;}
  }
  clearLocalPairing(){
    try{
      const stat=fs.lstatSync(this.file);
      if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>8192)
        throw Error('CLOUD_PAIR_INVALID_STORAGE');
      fs.unlinkSync(this.file);
    }catch(error){if(error.code!=='ENOENT')throw error;}
  }
  // Persist only the local connection preference, keeping encrypted credentials unchanged.
  setPaused(paused) {
    const saved=this.read();
    if(!saved)throw Error('CLOUD_PAIR_NOT_FOUND');
    const stat=fs.lstatSync(this.file);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>8192)
      throw Error('CLOUD_PAIR_INVALID_STORAGE');
    const original=JSON.parse(fs.readFileSync(this.file,'utf8'));
    const value=JSON.stringify({...original,paused:paused===true});
    const temp=this.file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
    try{
      fs.writeFileSync(temp,value,{flag:'wx',mode:0o600});
      fs.renameSync(temp,this.file);
      if(process.platform!=='win32')fs.chmodSync(this.file,0o600);
    }catch(e){try{fs.rmSync(temp,{force:true});}catch{}throw e;}
    return this.read();
  }
}
async function redeem({mcpUrl,code,identity,fetcher=globalThis.fetch}) {
  const base=origin(mcpUrl);
  if(!CODE.test(code)||!identity||typeof fetcher!=='function')throw Error('CLOUD_PAIR_INVALID');
  const body=JSON.stringify({pairing_code:code,device_id:identity.id,name:identity.name,platform:identity.platform});
  const res=await fetcher(base+'/pair-redeem',{method:'POST',headers:{'content-type':'application/json'},
    body,signal:AbortSignal.timeout(10000)});
  const result=await res.json();
  if(!res.ok||result.device_id!==identity.id||!CODE.test(result.device_token||''))
    throw Error(result.error||'CLOUD_PAIR_FAILED');
  return result.device_token;
}

async function beginDevicePairing({mcpUrl,identity,fetcher=globalThis.fetch}){
  const base=origin(mcpUrl);
  if(!identity||!identity.id||!identity.name||!identity.platform)
    throw Error('CLOUD_ROUTER_DEVICE_UNAVAILABLE');
  // This credential never leaves the device; the Worker receives a SHA-256 digest.
  const token=crypto.randomBytes(32).toString('base64url');
  const hash=crypto.createHash('sha256').update(token).digest('hex');
  const res=await fetcher(base+'/pair-request',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({device_id:identity.id,name:identity.name,platform:identity.platform,
      device_token_hash:hash}),signal:AbortSignal.timeout(12000)
  });
  const result=await res.json().catch(()=>({}));
  if(!res.ok||!CODE.test(result.request_id||'')||!CODE.test(result.poll_secret||'')||
      !Number.isFinite(result.expires_at))
    throw Error(result.error||'CLOUD_AUTO_PAIR_REQUEST_FAILED');
  // Never accept an arbitrary URL from the network; construct an origin-bound link.
  const approvalUrl=new URL('/device-approve?request='+result.request_id,base);
  return {mcpUrl,token,requestId:result.request_id,pollSecret:result.poll_secret,
    expiresAt:result.expires_at,approvalUrl:approvalUrl.href};
}
async function pollDevicePairing({session,fetcher=globalThis.fetch}){
  const base=origin(session.mcpUrl);
  const res=await fetcher(base+'/pair-status',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({request_id:session.requestId,poll_secret:session.pollSecret}),
    signal:AbortSignal.timeout(12000)
  });
  const result=await res.json().catch(()=>({}));
  if(!res.ok||!['approved','pending'].includes(result.status)||
    (result.device_id&&typeof result.device_id!=='string'))
    throw Error(result.error||'CLOUD_AUTO_PAIR_STATUS_FAILED');
  return result;
}

module.exports={CloudPairingStore,redeem,origin,beginDevicePairing,pollDevicePairing};
