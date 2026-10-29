'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {beginDevicePairing,pollDevicePairing}=require('../app/cloud-router-pairing.cjs');
const load=file=>import(pathToFileURL(path.resolve(__dirname,'../cloud-router/src/'+file)).href);
class Storage{
 constructor(){this.map=new Map();}
 async get(key){return this.map.get(key);}
 async put(key,value){this.map.set(key,value);}
 async delete(key){this.map.delete(key);}
 async list({prefix='',limit=100}={}){return new Map([...this.map].filter(([k])=>k.startsWith(prefix)).slice(0,limit));}
 async transaction(fn){return fn(this);}
}
const id='cu-55555555-5555-4555-8555-555555555555';
const BASE='https://test-router.example';
async function setup(){
 const {DeviceHub}=await load('worker.mjs');
 const {devicePairHttp}=await load('device-pair-http.mjs');
 const pairing=await load('pairing.mjs');
 const storage=new Storage(),ctx={storage,getWebSockets:()=>[]};
 const hub=new DeviceHub(ctx,{});
 const owner='f'.repeat(64);
 const env={
   DEVICE_HUB:{idFromName:()=>null,get:()=>({fetch:r=>hub.fetch(r)})},
   AUTH_SERVER:{verifyPairingOwnerKey:async key=>key===owner}
 };
 const fetcher=(url,options={})=>devicePairHttp(new Request(url,options),env);
 return {ctx,storage,hub,owner,env,fetcher,pairing};
}
test('desktop starts browser approval without sending any plaintext device credential',async()=>{
 const x=await setup(),identity={id,name:'MacBook',platform:'darwin'};
 const req=await beginDevicePairing({mcpUrl:BASE+'/mcp',identity,fetcher:x.fetcher});
 assert.match(req.requestId,/^[A-Za-z0-9_-]{43}$/);
 assert.match(req.pollSecret,/^[A-Za-z0-9_-]{43}$/);
 assert.match(req.token,/^[A-Za-z0-9_-]{43}$/);
 assert.equal(new URL(req.approvalUrl).origin,BASE);
 assert.equal((await pollDevicePairing({session:req,fetcher:x.fetcher})).status,'pending');
 assert.ok(!JSON.stringify([...x.storage.map]).includes(req.token));
 assert.ok(!JSON.stringify([...x.storage.map]).includes(req.pollSecret));
 const wrong=await x.fetcher(BASE+'/pair-status',{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({request_id:req.requestId,poll_secret:'a'.repeat(43)})});
 assert.equal(wrong.status,403);
 assert.equal((await wrong.json()).error,'PAIR_UNAUTHORIZED');
});
test('browser approval requires same-browser csrf and correct Owner Key; issued key stays device-only',async()=>{
 const x=await setup(),identity={id,name:'MacBook <script>',platform:'darwin'};
 const req=await beginDevicePairing({mcpUrl:BASE+'/mcp',identity,fetcher:x.fetcher});
 const get=await x.fetcher(req.approvalUrl);
 assert.equal(get.status,200);
 const page=await get.text();
 assert.match(page,/MacBook &#60;script&#62;/);
 const csrf=page.match(/name="csrf" value="([^"]+)"/)?.[1];
 assert.ok(csrf);
 const cookie=get.headers.get('set-cookie').split(';')[0];
 const form=(key,token=csrf)=>new URLSearchParams({request:req.requestId,csrf:token,decision:'approve',owner_secret:key}).toString();
 const badCsrf=await x.fetcher(BASE+'/device-approve',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form(x.owner)});
 assert.equal(badCsrf.status,403);
 const badKey=await x.fetcher(BASE+'/device-approve',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',cookie},body:form('e'.repeat(64))});
 assert.equal(badKey.status,403);
 assert.equal(await x.storage.get('device:'+id),undefined);
 const good=await x.fetcher(BASE+'/device-approve',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',cookie},body:form(x.owner)});
 assert.equal(good.status,200);
 assert.equal((await pollDevicePairing({session:req,fetcher:x.fetcher})).status,'approved');
 assert.equal(await x.pairing.verifyDevice(x.ctx,id,req.token),true);
 assert.ok(!JSON.stringify([...x.storage.map]).includes(req.token));
 const again=await x.fetcher(BASE+'/device-approve',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',cookie},body:form(x.owner)});
 assert.equal(again.status,410);
 await assert.rejects(beginDevicePairing({mcpUrl:BASE+'/mcp',identity,fetcher:x.fetcher}),/DEVICE_ALREADY_PAIRED/);
});


test('trusted local owner may approve only with both owner key and device-held poll secret',async()=>{
 const x=await setup(),identity={id,name:'MacBook',platform:'darwin'};
 const session=await beginDevicePairing({mcpUrl:BASE+'/mcp',identity,fetcher:x.fetcher});
 const submit=(owner_secret,poll_secret)=>x.fetcher(BASE+'/pair-owner-approve',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({request_id:session.requestId,poll_secret,owner_secret})
 });
 assert.equal((await submit('e'.repeat(64),session.pollSecret)).status,403);
 assert.equal((await submit(x.owner,'b'.repeat(43))).status,403);
 assert.equal(await x.storage.get('device:'+id),undefined);
 const good=await submit(x.owner,session.pollSecret);
 assert.equal(good.status,200);
 assert.deepEqual(await good.json(),{approved:true});
 assert.equal((await pollDevicePairing({session,fetcher:x.fetcher})).status,'approved');
 assert.equal(await x.pairing.verifyDevice(x.ctx,id,session.token),true);
 assert.ok(!JSON.stringify([...x.storage.map]).includes(session.token));
 assert.ok(!JSON.stringify([...x.storage.map]).includes(x.owner));
});
test('desktop trusted-owner path completes without opening a browser',async()=>{
 const x=await setup(),identity={id,name:'MacBook',platform:'darwin'};
 const {CloudRouterService}=require('../app/cloud-router-service.cjs');
 let token=null,url=null,browserOpens=0;
 const store={
   safeStorage:{isEncryptionAvailable:()=>true},
   read(){return token?{mcpUrl:BASE+'/mcp',token,agentUrl:BASE.replace('https:','wss:')+'/agent'}:null;},
   save(mcp,t){url=mcp;token=t;}
 };
 const svc=new CloudRouterService({identity,pairStore:store,manager:{call:async()=>{}},
   fetcher:x.fetcher,getOwnerKey:mcp=>mcp===BASE+'/mcp'?x.owner:''});
 svc.start=function({enabled}){this.phase=enabled?'ready':'disabled';return this.status();};
 const begun=await svc.autoPair({mcpUrl:BASE+'/mcp',openExternal:async()=>{browserOpens++;}});
 assert.equal(begun.phase,'awaiting_approval');
 assert.equal(browserOpens,0);
 await new Promise(resolve=>setTimeout(resolve,2800));
 assert.equal(svc.phase,'ready');
 assert.equal(url,BASE+'/mcp');
 assert.equal(await x.pairing.verifyDevice(x.ctx,id,token),true);
});
