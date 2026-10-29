'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const load=name=>import(pathToFileURL(path.resolve(__dirname,'../cloud-router/src',name)).href);
test('Cloudflare identity requires access to the configured account script',async()=>{
 const {verifyCloudflareAccount}=await load('cloudflare-account.mjs');const env={CF_ACCOUNT_ID:'a'.repeat(32)};let called=0;
 assert.equal(await verifyCloudflareAccount('t'.repeat(40),env,async(url,opts)=>{called++;assert.ok(url.includes('/accounts/'+env.CF_ACCOUNT_ID+'/workers/scripts/chattoharness-cloud-router/settings'));assert.equal(opts.headers.Authorization,'Bearer '+'t'.repeat(40));return {ok:true,json:async()=>({success:true})};}),true);
 assert.equal(called,1);
 assert.equal(await verifyCloudflareAccount('t'.repeat(40),env,async()=>({ok:false})),false);
 assert.equal(await verifyCloudflareAccount('t'.repeat(40),{},async()=>{throw Error('must not call');}),false);
});
test('only validated device hashes enter internal account enrollment storage',async()=>{
 const {DeviceHub}=await load('worker.mjs');const map=new Map();const storage={get:async k=>map.get(k),put:async(k,v)=>map.set(k,v),transaction:async fn=>fn(storage)};
 const hub=new DeviceHub({storage,getWebSockets:()=>[]},{});
 const req=body=>hub.fetch(new Request('https://hub.internal/account-enroll',{method:'POST',body:JSON.stringify(body)}));
 assert.equal((await req({device_id:'a'})).status,400);
 const body={device_id:'device-one',name:'PC',platform:'win32',device_token_hash:'a'.repeat(64)};
 assert.equal((await req(body)).status,200);assert.equal(map.get('device:device-one').hash,body.device_token_hash);
 assert.equal(JSON.stringify([...map.values()]).includes('owner_secret'),false);
});
test('account connection automatically registers a device and never opens approval page',async()=>{
 const {CloudRouterService}=require('../app/cloud-router-service.cjs');let saved;let headers;
 const svc=new CloudRouterService({manager:{call:async()=>({})},identity:{id:'device-one',name:'PC',platform:'win32'},pairStore:{read:()=>saved,save:(mcpUrl,token)=>{saved={mcpUrl,token,agentUrl:'wss://router.example/agent'};}},getAccountConnection:async()=>({mcpUrl:'https://router.example/mcp',token:'cf-token'}),fetcher:async(url,opts)=>{headers=opts.headers;const body=JSON.parse(opts.body);assert.match(body.device_token_hash,/^[a-f0-9]{64}$/);return {ok:true,json:async()=>({enrolled:true,device_id:body.device_id})};}});
 svc.start=()=>({connected:true});svc.refreshDevices=async()=>{};
 const state=await svc.autoPair({openExternal:()=>{throw Error('approval must never open');}});
 assert.equal(state.connected,true);assert.equal(headers.Authorization,'Bearer cf-token');assert.match(saved.token,/^[A-Za-z0-9_-]{43}$/);
});

test('browser OAuth uses Cloudflare login only and completes without Owner Key or consent form',async t=>{
 const {cloudflareAuthorize}=await import(pathToFileURL(path.resolve(__dirname,'../cloud-router/auth-server/cloudflare-login.mjs')).href);
 const map=new Map(),env={CF_ACCOUNT_ID:'a'.repeat(32),OWNER_AUTH_EPOCH:'v1',OAUTH_KV:{get:async k=>{const v=map.get(k);return v?JSON.parse(v):null;},put:async(k,v)=>map.set(k,v),delete:async k=>map.delete(k)}};
 const original=global.fetch;t.after(()=>{global.fetch=original;});
 global.fetch=async url=>url.endsWith('/device/auth')?Response.json({device_code:'device-secret',user_code:'12345678',verification_uri:'https://dash.cloudflare.com/oauth2/device/authorize',expires_in:600}):url.endsWith('/oauth2/token')?Response.json({access_token:'t'.repeat(40)}):Response.json({success:true});
 let approved=false;const oauth={parseAuthRequest:async()=>({scope:['mcp:read']}),beginConsent:async()=>({handle:'bound-handle',headers:new Headers()}),approveConsent:async(req,handle)=>{assert.equal(handle,'bound-handle');approved=true;return {request:{scope:['mcp:read']},headers:new Headers()};},completeAuthorization:async()=>({redirectTo:'https://chatgpt.com/connector/oauth/test'})};
 const page=await cloudflareAuthorize(new Request('https://auth.example/authorize'),env,oauth);
 const text=await page.text();assert.ok(text.includes('登录 Cloudflare'));assert.ok(!text.includes('owner_secret'));assert.ok(!text.includes('device-secret'));
 const cookie=page.headers.get('set-cookie').split(';')[0];
 const denied=await cloudflareAuthorize(new Request('https://auth.example/cloudflare-login',{method:'POST',headers:{cookie,origin:'https://evil.example','x-cth-login':'1'}}),env,oauth);assert.equal(denied.status,403);assert.equal(approved,false);
 const result=await cloudflareAuthorize(new Request('https://auth.example/cloudflare-login',{method:'POST',headers:{cookie,origin:'https://auth.example','x-cth-login':'1'}}),env,oauth);
 assert.equal((await result.json()).redirect,'https://chatgpt.com/connector/oauth/test');assert.equal(approved,true);assert.equal(map.size,0);
});

test('account verification uses edge-supported redirect policy and rejects redirects',async()=>{
 const {verifyCloudflareAccount}=await load('cloudflare-account.mjs');const env={CF_ACCOUNT_ID:'a'.repeat(32)};
 const edge=async(url,options)=>{
  if(options.redirect==='error')throw new TypeError('Workers supports follow or manual only');
  assert.equal(options.redirect,'manual');
  return {ok:true,status:200,json:async()=>({success:true})};
 };
 assert.equal(await verifyCloudflareAccount('t'.repeat(40),env,edge),true);
 assert.equal(await verifyCloudflareAccount('t'.repeat(40),env,async()=>({ok:false,status:302,json:async()=>({})})),false);
});
