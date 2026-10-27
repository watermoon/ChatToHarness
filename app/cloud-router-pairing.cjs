'use strict';
// Credentials for a paired device stay on that device, encrypted with OS safeStorage.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const CODE=/^[A-Za-z0-9_-]{43}$/;
function origin(mcpUrl) {
  const u=new URL(mcpUrl);
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
      return {mcpUrl:value.mcpUrl,agentUrl:endpoint.replace(/^https:/,'wss:')+'/agent',token};
    }catch{return null;}
  }
  save(mcpUrl,token) {
    origin(mcpUrl);
    if(!CODE.test(token)||!this.safeStorage?.isEncryptionAvailable?.())
      throw Error('CLOUD_PAIR_SECURE_STORAGE_REQUIRED');
    const encryptedToken=this.safeStorage.encryptString(token).toString('base64');
    const value=JSON.stringify({schema:1,mcpUrl,encryptedToken});
    const temporary=this.file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
    try{
      fs.writeFileSync(temporary,value,{mode:0o600,flag:'wx'});
      fs.renameSync(temporary,this.file);
      if(process.platform!=='win32')fs.chmodSync(this.file,0o600);
    }catch(e){try{fs.rmSync(temporary,{force:true});}catch{}throw e;}
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
module.exports={CloudPairingStore,redeem,origin};
