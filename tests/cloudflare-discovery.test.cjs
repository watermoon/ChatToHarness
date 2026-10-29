'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {headersFromWrangler,oauthNamespaces,discoverCloudflare,inspectWorkerScripts}=require('../app/cloudflare-discovery.cjs');
const TOKEN='a'.repeat(64);
const output=JSON.stringify({type:'oauth',token:TOKEN});
const ONE='b'.repeat(32),TWO='c'.repeat(32),KV1='d'.repeat(32),KV2='e'.repeat(32);
function apiFixture({accounts=[{id:ONE,name:'Test Account'}],domains={[ONE]:'watermoon3322',[TWO]:'other'},
 namespaces={[ONE]:[{id:KV1,title:'OAUTH_KV'}],[TWO]:[]}}={}) {
 const calls=[];
 const fetcher=async(url,opts)=>{
  assert.match(url,/^https:\/\/api\.cloudflare\.com\/client\/v4\//);
  assert.equal(opts.headers.Authorization,'Bearer '+TOKEN);
  calls.push(url);
  const pathname=new URL(url).pathname,params=new URL(url).searchParams;
  let result;
  if(pathname==='/client/v4/accounts')result=accounts;
  else if(pathname.endsWith('/workers/subdomain'))result={subdomain:domains[pathname.split('/')[4]]};
  else if(pathname.endsWith('/storage/kv/namespaces'))result=namespaces[pathname.split('/')[4]]||[];
  else throw Error('Unexpected API path: '+pathname);
  return {status:200,json:async()=>({success:true,result,
    result_info:{total_pages:1,page:Number(params.get('page'))||1}})};
 };
 return {fetcher,calls};
}
test('Wrangler OAuth credentials remain in memory and invalid credential shapes fail closed',()=>{
 assert.deepEqual(headersFromWrangler(output),{Authorization:'Bearer '+TOKEN});
 assert.deepEqual(headersFromWrangler(JSON.stringify({type:'api_key',key:'k'.repeat(40),email:'owner@example.com'})),
  {'X-Auth-Key':'k'.repeat(40),'X-Auth-Email':'owner@example.com'});
 for(const o of ['','not JSON',JSON.stringify({type:'oauth',token:'short'}),
 JSON.stringify({type:'oauth',token:TOKEN+'\nInjected: bad'})])
  assert.throws(()=>headersFromWrangler(o),/CLOUD_AUTH_TOKEN_INVALID/);
});
test('one Cloudflare account and one OAuth KV are auto-detected without user input',async()=>{
 const fixture=apiFixture();
 const found=await discoverCloudflare({fetcher:fixture.fetcher,tokenOutput:output});
 assert.deepEqual([found.accountId,found.subdomain,found.kvId],[ONE,'watermoon3322',KV1]);
 assert.equal(found.needs,null);
 assert.equal(fixture.calls.length,3);
 assert.equal(JSON.stringify(found).includes(TOKEN),false);
});
test('existing Cloudflare namespace may be named OAuth_KV or prefixed worker namespace',()=>{
 const list=oauthNamespaces([{id:KV1,title:'OAUTH_KV'},
  {id:KV2,title:'chattoharness-auth-OAUTH_KV'},{id:ONE,title:'another-app-OAUTH_KV'},
  {id:'invalid',title:'OAUTH_KV'}]);
 assert.equal(list.length,2);
});
test('multiple accounts require explicit choice, never arbitrary first account',async()=>{
 const fixture=apiFixture({accounts:[{id:ONE,name:'First'},{id:TWO,name:'Second'}]});
 const choice=await discoverCloudflare({fetcher:fixture.fetcher,tokenOutput:output});
 assert.equal(choice.needs,'account');
 assert.equal(choice.accounts.length,2);
 assert.ok(fixture.calls.length>=1); // read-only Worker inventory checks are allowed to identify a unique existing service
 const selected=await discoverCloudflare({fetcher:fixture.fetcher,tokenOutput:output,accountId:TWO});
 assert.equal(selected.accountId,TWO);
 assert.equal(selected.subdomain,'other');
 assert.equal(selected.kvId,'');
 await assert.rejects(()=>discoverCloudflare({fetcher:fixture.fetcher,tokenOutput:output,accountId:KV1}),
  /CLOUD_ACCOUNT_NOT_FOUND/);
});
test('multiple matching KV namespaces require selection and wrong ID is denied',async()=>{
 const fixture=apiFixture({namespaces:{[ONE]:[{id:KV1,title:'OAUTH_KV'},
  {id:KV2,title:'chattoharness-auth-OAUTH_KV'}]}});
 const choice=await discoverCloudflare({fetcher:fixture.fetcher,tokenOutput:output});
 assert.equal(choice.needs,'kv');
 assert.deepEqual(choice.kvOptions.map(x=>x.id),[KV1,KV2]);
 const chosen=await discoverCloudflare({fetcher:fixture.fetcher,tokenOutput:output,kvId:KV2});
 assert.equal(chosen.kvId,KV2);
 await assert.rejects(()=>discoverCloudflare({fetcher:fixture.fetcher,tokenOutput:output,kvId:TWO}),
  /CLOUD_KV_ID_NOT_IN_ACCOUNT/);
});
test('Cloudflare discovery refuses failed responses and never invents a subdomain',async()=>{
 await assert.rejects(()=>discoverCloudflare({tokenOutput:output,
  fetcher:async()=>({status:403})}),/CLOUD_API_UNAVAILABLE/);
 const fixture=apiFixture({domains:{[ONE]:null}});
 const missing=await discoverCloudflare({fetcher:fixture.fetcher,tokenOutput:output});
 assert.equal(missing.needs,'subdomain');
 assert.equal(missing.subdomain,'');
 assert.match(missing.suggestedSubdomain,/^cth-[a-f0-9]{8}$/);
});

test('authenticated Workers inventory distinguishes absence, partial deployment and complete deployment',async()=>{
 const accountId=ONE, tokenOutput=output;
 const present=async(_url,opts)=>{
   assert.equal(opts.headers.Authorization,'Bearer '+TOKEN);
   return {status:200,json:async()=>({success:true,result:
     [{id:'chattoharness-auth'},{id:'chattoharness-cloud-router'}]})};
 };
 assert.deepEqual(await inspectWorkerScripts({fetcher:present,tokenOutput,accountId}),
   {auth:true,router:true});
 const empty=async()=>({status:200,json:async()=>({success:true,result:[]})});
 assert.deepEqual(await inspectWorkerScripts({fetcher:empty,tokenOutput,accountId}),
   {auth:false,router:false});
 const onlyAuth=async()=>({status:200,json:async()=>({
   success:true,result:[{id:'chattoharness-auth'}]})});
 assert.deepEqual(await inspectWorkerScripts({fetcher:onlyAuth,tokenOutput,accountId}),
   {auth:true,router:false});
});
test('incomplete Workers inventory or permission failure can never prove absence',async()=>{
 await assert.rejects(()=>inspectWorkerScripts({accountId:ONE,tokenOutput:output,
   fetcher:async()=>({status:403})}),/CLOUD_API_UNAVAILABLE/);
 await assert.rejects(()=>inspectWorkerScripts({accountId:ONE,tokenOutput:output,
   fetcher:async()=>({status:200,json:async()=>({success:true,result:[],
     result_info:{total_pages:2}})})}),/CLOUD_WORKER_LIST_INCOMPLETE/);
});
