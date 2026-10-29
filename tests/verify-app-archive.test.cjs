'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),asar=require('@electron/asar');
const {verifyAppArchive}=require('../scripts/verify-app-archive.cjs');
test('packaged app verification rejects corrupted contents and Electron welcome fallback',async t=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'cth-archive-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const src=path.join(home,'src'),resources=path.join(home,'resources');fs.mkdirSync(path.join(src,'app'),{recursive:true});fs.mkdirSync(resources);
 fs.writeFileSync(path.join(src,'package.json'),JSON.stringify({name:'chat-to-harness',main:'app/main.cjs'}));fs.writeFileSync(path.join(src,'app/main.cjs'),'console.log("archive-marker");');
 const archive=path.join(resources,'app.asar');await asar.createPackage(src,archive);verifyAppArchive(resources);
 fs.writeFileSync(path.join(resources,'default_app.asar'),'fixture');assert.throws(()=>verifyAppArchive(resources),/welcome/);fs.unlinkSync(path.join(resources,'default_app.asar'));
 const bytes=fs.readFileSync(archive);const index=bytes.indexOf(Buffer.from('archive-marker'));assert.ok(index>0);bytes[index]=120;fs.writeFileSync(archive,bytes);assert.throws(()=>verifyAppArchive(resources),/integrity mismatch/);
});
