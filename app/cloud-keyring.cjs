'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
// A Windows .node binary already loaded by another process must not be
// overwritten on every login. Verify the installed package before copying.
function samePackage(from,to){
 try{
  if(!fs.statSync(to).isDirectory())return false;
  for(const item of fs.readdirSync(from,{withFileTypes:true})){
   const a=path.join(from,item.name),b=path.join(to,item.name);
   if(item.isDirectory()){if(!samePackage(a,b))return false;}
   else if(item.isFile()){
    if(fs.statSync(a).size!==fs.statSync(b).size)return false;
    const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
    if(hash(a)!==hash(b))return false;
   }else return false;
  }
  return true;
 }catch{return false;}
}
function installPackage(from,to){
 if(samePackage(from,to))return;
 const suffix=process.pid+'-'+crypto.randomBytes(6).toString('hex');
 const stage=to+'.stage-'+suffix,backup=to+'.backup-'+suffix;
 let backedUp=false;
 try{
  fs.cpSync(from,stage,{recursive:true});
  if(!samePackage(from,stage))throw Error('CLOUD_KEYRING_INSTALL_VERIFY_FAILED');
  // An overlapping login may have installed the same version already.
  if(samePackage(from,to))return;
  if(fs.existsSync(to)){fs.renameSync(to,backup);backedUp=true;}
  try{fs.renameSync(stage,to);}
  catch(e){if(backedUp){fs.renameSync(backup,to);backedUp=false;}throw e;}
  if(backedUp){try{fs.rmSync(backup,{recursive:true,force:true});}catch{}}
  if(!samePackage(from,to))throw Error('CLOUD_KEYRING_INSTALL_VERIFY_FAILED');
 }catch(e){
  if(String(e.message).startsWith('CLOUD_KEYRING_INSTALL_'))throw e;
  throw Error(['EBUSY','EPERM','EACCES','EPIPE'].includes(e.code)?
    'CLOUD_KEYRING_INSTALL_BUSY':'CLOUD_KEYRING_INSTALL_FAILED');
 }finally{try{fs.rmSync(stage,{recursive:true,force:true});}catch{}}
}
// Wrangler 4.152 resolves its Windows native backend here, before OAuth starts.
// Ship the pinned backend with the app: never install globally or store tokens in plaintext.
function prepareKeyring(sourceDir,{platform=process.platform,env=process.env,home=os.homedir()}={}){
 if(platform!=='win32')return;
 const legacy=path.join(home,'.wrangler');
 const config=fs.existsSync(legacy)&&fs.statSync(legacy).isDirectory()?legacy:
  path.join(env.XDG_CONFIG_HOME||path.join(env.APPDATA||path.join(home,'AppData','Roaming'),'xdg.config'),'.wrangler');
 const source=path.join(sourceDir,'node_modules','@napi-rs');
 const target=path.join(config,'native','keyring','node_modules','@napi-rs');
 const packages=['keyring','keyring-win32-'+process.arch+'-msvc'];
 for(const name of packages){
  const from=path.join(source,name);
  if(!fs.existsSync(path.join(from,'package.json')))throw Error('CLOUD_KEYRING_RUNTIME_MISSING');
 }
 fs.mkdirSync(target,{recursive:true});
 for(const name of packages)installPackage(path.join(source,name),path.join(target,name));
}
module.exports={prepareKeyring};
