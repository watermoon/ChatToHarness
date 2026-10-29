'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
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
 for(const name of packages){
  fs.mkdirSync(target,{recursive:true});
  fs.cpSync(path.join(source,name),path.join(target,name),{recursive:true});
 }
}
module.exports={prepareKeyring};
