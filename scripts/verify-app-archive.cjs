'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const asar=require('@electron/asar');
function verifyAppArchive(resources){
 const archive=path.join(resources,'app.asar');
 asar.uncache(archive);
 for(let name of asar.listPackage(archive)){
  name=name.replace(/^[\\/]/,'');const entry=asar.statFile(archive,name);
  if(!entry.integrity||entry.unpacked)continue;
  const hash=crypto.createHash('sha256').update(asar.extractFile(archive,name)).digest('hex');
  if(hash!==entry.integrity.hash)throw Error('Packaged file integrity mismatch: '+name);
 }
 const pkg=JSON.parse(asar.extractFile(archive,'package.json').toString('utf8'));
 if(pkg.name!=='chat-to-harness'||pkg.main!=='app/main.cjs')throw Error('Packaged application entry is invalid');
 asar.extractFile(archive,pkg.main);
 if(fs.existsSync(path.join(resources,'default_app.asar')))throw Error('Electron welcome application must not be packaged');
}
module.exports={verifyAppArchive};
