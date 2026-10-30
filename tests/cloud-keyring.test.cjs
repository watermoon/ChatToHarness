'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {prepareKeyring}=require('../app/cloud-keyring.cjs');
function fixture(){
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'cth-keyring-repeat-'));
 const sourceDir=path.join(home,'cloud-router'),pkg=path.join(sourceDir,'node_modules','@napi-rs');
 for(const name of ['keyring',`keyring-win32-${process.arch}-msvc`]){
  const dir=path.join(pkg,name);fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({name,version:'1.3.0'}));
  fs.writeFileSync(path.join(dir,name==='keyring'?'index.js':'native.node'),'native-fixture-'+name);
 }
 const options={platform:'win32',env:{APPDATA:home},home};
 const installed=path.join(home,'xdg.config','.wrangler','native','keyring','node_modules','@napi-rs');
 return {home,sourceDir,options,installed};
}
test('Windows Keyring install is repeatable and preserves loaded native packages',t=>{
 const x=fixture();t.after(()=>fs.rmSync(x.home,{recursive:true,force:true}));
 prepareKeyring(x.sourceDir,x.options);
 const native=path.join(x.installed,`keyring-win32-${process.arch}-msvc`,'native.node');
 assert.ok(fs.existsSync(native));
 const first=fs.statSync(native).mtimeMs;
 prepareKeyring(x.sourceDir,x.options);
 assert.equal(fs.statSync(native).mtimeMs,first,'second login must not overwrite loaded native DLL');
 assert.equal(fs.readFileSync(native,'utf8'),`native-fixture-keyring-win32-${process.arch}-msvc`);
 assert.equal(fs.readdirSync(x.installed).filter(name=>name.includes('.stage-')||name.includes('.backup-')).length,0);
});
test('Windows Keyring incomplete installation is repaired atomically',t=>{
 const x=fixture();t.after(()=>fs.rmSync(x.home,{recursive:true,force:true}));
 prepareKeyring(x.sourceDir,x.options);
 const native=path.join(x.installed,`keyring-win32-${process.arch}-msvc`,'native.node');
 fs.writeFileSync(native,'corrupt');
 prepareKeyring(x.sourceDir,x.options);
 assert.equal(fs.readFileSync(native,'utf8'),`native-fixture-keyring-win32-${process.arch}-msvc`);
 assert.equal(fs.readdirSync(x.installed).filter(name=>name.includes('.stage-')||name.includes('.backup-')).length,0);
});
test('Windows Keyring missing bundled package fails before installing anything',t=>{
 const x=fixture();t.after(()=>fs.rmSync(x.home,{recursive:true,force:true}));
 fs.rmSync(path.join(x.sourceDir,'node_modules','@napi-rs','keyring'),{recursive:true,force:true});
 assert.throws(()=>prepareKeyring(x.sourceDir,x.options),/CLOUD_KEYRING_RUNTIME_MISSING/);
 assert.equal(fs.existsSync(x.installed),false);
});
