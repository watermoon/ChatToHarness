'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {CloudPairingStore,redeem,origin} = require('../app/cloud-router-pairing.cjs');
const {CloudRouterService}=require('../app/cloud-router-service.cjs');
const pairing = () => import(pathToFileURL(path.resolve(__dirname,'../cloud-router/src/pairing.mjs')).href);
const id='cu-11111111-1111-4111-8111-111111111111';
class Storage {
 constructor(){this.map=new Map();}
 async get(k){return this.map.get(k);}
 async put(k,v){this.map.set(k,v);}
 async delete(k){this.map.delete(k);}
 async list({prefix='',limit=200}={}){return new Map([...this.map].filter(([k])=>k.startsWith(prefix)).slice(0,limit));}
 async transaction(fn){return fn(this);}
}
const identity={id,name:'MacBook',platform:'darwin'};
const safeStorage={
 isEncryptionAvailable:()=>true,
 encryptString:v=>Buffer.from('sealed::'+v),
 decryptString:b=>{const v=b.toString();if(!v.startsWith('sealed::'))throw Error('bad');return v.slice(8);}
};
test('pairing codes have 256 bits of entropy and expire after five minutes',async()=>{
 const {newPairing,sha256,PAIR_TTL_MS}=await pairing();
 const store=new Storage(), first=await newPairing({storage:store});
 assert.match(first.pairing_code,/^[A-Za-z0-9_-]{43}$/);
 assert.ok(first.expires_at>Date.now());
 assert.ok(first.expires_at<=Date.now()+PAIR_TTL_MS);
 assert.deepEqual(Object.keys(await store.get('pair:'+await sha256(first.pairing_code))),['expires_at']);
 assert.notEqual((await newPairing({storage:store})).pairing_code,first.pairing_code);
});
test('single use redeem issues a device-bound secret; replay and impersonation fail',async()=>{
 const {newPairing,redeemPairing,verifyDevice,sha256}=await pairing();
 const store=new Storage(),ctx={storage:store};
 const {pairing_code}=await newPairing(ctx);
 const input={pairing_code,device_id:id,name:'MacBook',platform:'darwin'};
 const valid=await redeemPairing(ctx,input);
 assert.equal(valid.device_id,id);
 assert.match(valid.device_token,/^[A-Za-z0-9_-]{43}$/);
 assert.equal(await verifyDevice(ctx,id,valid.device_token),true);
 assert.equal(await verifyDevice(ctx,'cu-22222222-2222-4222-8222-222222222222',valid.device_token),false);
 assert.equal(await verifyDevice(ctx,id,'another-secret-not-a-valid-token'),false);
 assert.equal((await redeemPairing(ctx,input)).error,'PAIR_EXPIRED_OR_USED');
 assert.equal((await store.get('device:'+id)).hash,await sha256(valid.device_token));
 assert.ok(!JSON.stringify([...store.map.values()]).includes(valid.device_token));
});
test('pairing rejects expired codes, invalid platform and already paired device',async()=>{
 const {newPairing,redeemPairing,sha256}=await pairing();
 const ctx={storage:new Storage()},a=await newPairing(ctx),b=await newPairing(ctx);
 await ctx.storage.put('pair:'+await sha256(a.pairing_code),{expires_at:Date.now()-1});
 assert.equal((await redeemPairing(ctx,{...identity,device_id:id,pairing_code:a.pairing_code})).error,'PAIR_EXPIRED_OR_USED');
 assert.equal((await redeemPairing(ctx,{...identity,device_id:id,pairing_code:'abc'})).error,'PAIR_INVALID');
 assert.equal((await redeemPairing(ctx,{...identity,device_id:id,pairing_code:b.pairing_code,platform:'unknown'})).error,'PAIR_INVALID');
 assert.ok(!(await redeemPairing(ctx,{...identity,device_id:id,pairing_code:b.pairing_code})).error);
 const c=await newPairing(ctx);
 assert.equal((await redeemPairing(ctx,{...identity,device_id:id,pairing_code:c.pairing_code})).error,'DEVICE_ALREADY_PAIRED');
});
test('desktop saves only encrypted token and recovers automatic reconnection configuration',async()=>{
 const {newPairing,redeemPairing}=await pairing();
 const ctx={storage:new Storage()};
 const {pairing_code}=await newPairing(ctx);
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cth-pair-'));
 try{
  const token=await redeem({mcpUrl:'https://test.example/mcp',code:pairing_code,identity,
   fetcher:async (_url,options)=>({ok:true,json:()=>redeemPairing(ctx,JSON.parse(options.body))})});
  const pairStore=new CloudPairingStore(directory,safeStorage);
  pairStore.save('https://test.example/mcp',token);
  const disk=fs.readFileSync(path.join(directory,'cloud-router-pairing.json'),'utf8');
  assert.ok(!disk.includes(token));
  const saved=new CloudPairingStore(directory,safeStorage).read();
  assert.deepEqual(saved,{mcpUrl:'https://test.example/mcp',agentUrl:'wss://test.example/agent',token});
  assert.throws(()=>pairStore.save('http://test.example/mcp',token),/CLOUD_PAIR_URL_INVALID/);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('unavailable OS encryption never leaves a plaintext pairing credential',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cth-pair-no-enc-'));
 try{
  const store=new CloudPairingStore(directory,{isEncryptionAvailable:()=>false});
  assert.throws(()=>store.save('https://test.example/mcp','x'.repeat(43)),/CLOUD_PAIR_SECURE_STORAGE_REQUIRED/);
  assert.equal(store.read(),null);
  assert.equal(fs.existsSync(store.file),false);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('service pairs once then reconnects using stored secure credentials',async()=>{
 const {newPairing,redeemPairing}=await pairing();
 const ctx={storage:new Storage()}, {pairing_code}=await newPairing(ctx);
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cth-pair-service-'));
 const pairStore=new CloudPairingStore(directory,safeStorage);
 class FakeWs {
  constructor(){this.readyState=0;this.listeners={};}
  addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}
  close(){this.readyState=3;}
 }
 const make=()=>new CloudRouterService({manager:{call:async()=>{}},identity,pairStore,WebSocketImpl:FakeWs,
  fetcher:async (_url,options)=>({ok:true,json:()=>redeemPairing(ctx,JSON.parse(options.body))})});
 try{
  const first=make();
  assert.equal(first.status().enabled,false);
  assert.equal((await first.pair({mcpUrl:'https://test.example/mcp',pairingCode:pairing_code})).enabled,true);
  first.stop();
  const second=make();
  assert.equal(second.startStored().enabled,true);
  second.stop();
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('current device pairing rejects missing or malformed MCP URL before network access',async()=>{
 let attempted=0;
 const fetcher=async()=>{attempted++;throw Error('unexpected network');};
 for(const bad of [undefined,null,'','   ','not-a-url','chattoharness-cloud-router.example.com/mcp',
   'http://router.example/mcp','https://router.example',
   'https://router.example/mcp/','https://router.example/mcp?code=x',
   'https://user:password@router.example/mcp']){
   assert.throws(()=>origin(bad),{message:'CLOUD_PAIR_URL_INVALID'});
   await assert.rejects(()=>redeem({
     mcpUrl:bad,code:'x'.repeat(43),identity,fetcher
   }),{message:'CLOUD_PAIR_URL_INVALID'});
 }
 assert.equal(attempted,0);
 assert.equal(origin('https://router.example/mcp'),'https://router.example');
});

test('disconnect preference is encrypted on disk and survives app restart',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cth-pair-pause-'));
 try{
  const store=new CloudPairingStore(dir,safeStorage);
  const deviceToken='a'.repeat(43);
  store.save('https://test.example/mcp',deviceToken);
  const before=JSON.parse(fs.readFileSync(store.file,'utf8'));
  assert.equal(store.setPaused(true).paused,true);
  const after=JSON.parse(fs.readFileSync(store.file,'utf8'));
  assert.equal(after.encryptedToken,before.encryptedToken);
  assert.equal(new CloudPairingStore(dir,safeStorage).read().paused,true);
  assert.notEqual(store.setPaused(false).paused,true);
  assert.notEqual(new CloudPairingStore(dir,safeStorage).read().paused,true);
  assert.ok(!fs.readFileSync(store.file,'utf8').includes(deviceToken));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('cloud reset deletes only local pairing credential, not unrelated local files',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cth-local-reset-'));
 try{
  const store=new CloudPairingStore(dir,safeStorage);
  store.save('https://test.example/mcp','a'.repeat(43));
  const sentinel=path.join(dir,'keep-tunnel-settings.json');
  fs.writeFileSync(sentinel,'{"preserved":true}');
  assert.equal(store.read()!=null,true);
  store.clearLocalPairing();
  assert.equal(store.read(),null);
  store.clearLocalPairing();
  assert.equal(fs.readFileSync(sentinel,'utf8'),'{"preserved":true}');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
