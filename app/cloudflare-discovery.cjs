'use strict';
// Cloudflare API discovery. No MCP/Computer Use and no user-entered IDs required.
// The short-lived credential from 'wrangler auth token --json' never reaches IPC/state/logs.
const ACCOUNT_ID=/^[a-f0-9]{32}$/i;
const KV_ID=/^[a-f0-9]{32}$/i;
const SUBDOMAIN=/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
const ROOT='https://api.cloudflare.com/client/v4/';

function headersFromWrangler(stdout) {
  if(typeof stdout!=='string')throw Error('CLOUD_AUTH_TOKEN_INVALID');
  let auth;
  try{auth=JSON.parse(stdout.trim());}catch{throw Error('CLOUD_AUTH_TOKEN_INVALID');}
  if((auth.type==='oauth'||auth.type==='api_token')&&
    typeof auth.token==='string'&&auth.token.length>20&&!/[\r\n]/.test(auth.token))
    return {Authorization:'Bearer '+auth.token};
  if(auth.type==='api_key'&&typeof auth.key==='string'&&auth.key.length>15&&
    typeof auth.email==='string'&&auth.email.includes('@')&&
    !/[\r\n]/.test(auth.key+auth.email))
    return {'X-Auth-Key':auth.key,'X-Auth-Email':auth.email};
  throw Error('CLOUD_AUTH_TOKEN_INVALID');
}

async function getCloudflare(fetcher,headers,relative) {
  const response=await fetcher(ROOT+relative,{headers,signal:AbortSignal.timeout(15000)});
  if(!response||response.status!==200)throw Error('CLOUD_API_UNAVAILABLE');
  let body;
  try{body=await response.json();}catch{throw Error('CLOUD_API_RESPONSE_INVALID');}
  if(body?.success!==true)throw Error('CLOUD_API_RESPONSE_INVALID');
  return body;
}

function oauthNamespaces(items) {
  if(!Array.isArray(items))throw Error('CLOUD_KV_LIST_INVALID');
  return items.filter(x=>x&&KV_ID.test(x.id)&&
    (x.title==='OAUTH_KV'||x.title==='chattoharness-auth-OAUTH_KV'))
    .map(x=>({id:x.id,title:x.title}));
}
async function discoverCloudflare({fetcher,tokenOutput,accountId='',kvId=''}) {
  const headers=headersFromWrangler(tokenOutput);
  const accountResponse=await getCloudflare(fetcher,headers,'accounts?per_page=100');
  const accounts=(Array.isArray(accountResponse.result)?accountResponse.result:[])
    .filter(a=>a&&ACCOUNT_ID.test(a.id))
    .map(a=>({id:a.id,name:typeof a.name==='string'?a.name.slice(0,128):a.id}));
  if(!accounts.length)throw Error('CLOUD_ACCOUNT_NOT_FOUND');
  if(accountResponse.result_info?.total_pages>1)throw Error('CLOUD_TOO_MANY_ACCOUNTS');
  if(accountId&&!accounts.some(a=>a.id===accountId))throw Error('CLOUD_ACCOUNT_NOT_FOUND');
  let inferredAccountId='';
  if(!accountId&&accounts.length>1&&accounts.length<=8){
    // Only auto-select when exactly one account contains BOTH known ChatToHarness
    // Workers, verified from authenticated script inventory. Never guess by name.
    const matches=[];
    for(const account of accounts){
      try{
        const inventory=await inspectWorkerScripts({
          fetcher,tokenOutput,accountId:account.id
        });
        if(inventory.auth&&inventory.router)matches.push(account.id);
      }catch{/* Cannot verify this account: require explicit selection. */}
    }
    if(matches.length===1)inferredAccountId=matches[0];
  }
  if(!accountId&&!inferredAccountId&&accounts.length>1)
    return {needs:'account',accounts,kvOptions:[]};
  const selected=accountId||inferredAccountId||accounts[0].id;
  const domResponse=await fetcher(ROOT+'accounts/'+selected+'/workers/subdomain',
    {headers,signal:AbortSignal.timeout(15000)});
  if(!domResponse||![200,404].includes(domResponse.status))throw Error('CLOUD_API_UNAVAILABLE');
  let sub='';
  if(domResponse.status===200){
    const dom=await domResponse.json().catch(()=>null);
    if(dom?.success!==true)throw Error('CLOUD_API_RESPONSE_INVALID');
    sub=dom.result?.subdomain||'';
  }
  if(sub&&!SUBDOMAIN.test(sub))throw Error('CLOUD_SUBDOMAIN_INVALID');
  if(!sub)return {needs:'subdomain',accounts,accountId:selected,
    suggestedSubdomain:'cth-'+selected.slice(0,8),subdomain:'',kvOptions:[]};
  let ns=[],page=1,total=1;
  do{
    const response=await getCloudflare(fetcher,headers,
      'accounts/'+selected+'/storage/kv/namespaces?per_page=100&page='+page);
    if(!Array.isArray(response.result))throw Error('CLOUD_KV_LIST_INVALID');
    ns.push(...response.result);
    total=response.result_info?.total_pages||1;
    if(total>25)throw Error('CLOUD_KV_TOO_MANY_PAGES');
    page++;
  }while(page<=total);
  const options=oauthNamespaces(ns);
  if(kvId&&!options.some(x=>x.id===kvId))throw Error('CLOUD_KV_ID_NOT_IN_ACCOUNT');
  let inferredKvId='';
  if(!kvId&&options.length>1){
    try{
      // The deployed auth Worker's actual OAuth KV binding is authoritative.
      const info=await getCloudflare(fetcher,headers,
        'accounts/'+selected+'/workers/scripts/chattoharness-auth/settings');
      const bindings=Array.isArray(info.result?.bindings)?info.result.bindings:[];
      const matches=bindings.filter(b=>b.type==='kv_namespace'&&b.name==='OAUTH_KV'&&
        options.some(o=>o.id===(b.namespace_id||b.id))).map(b=>b.namespace_id||b.id);
      if(matches.length===1)inferredKvId=matches[0];
    }catch{/* Missing permission/settings: ask user to choose, never guess. */}
  }
  if(!kvId&&!inferredKvId&&options.length>1)
    return {needs:'kv',accounts,accountId:selected,subdomain:sub,kvOptions:options};
  return {needs:null,accounts,accountId:selected,subdomain:sub,
    kvId:kvId||inferredKvId||options[0]?.id||'',kvOptions:options};
}
// Create a missing workers.dev account subdomain exactly once, only on an explicit
// setup click. Never rename an existing subdomain or redirect other Workers.
async function createWorkersSubdomain({fetcher,tokenOutput,accountId,subdomain}){
  if(!ACCOUNT_ID.test(accountId)||!SUBDOMAIN.test(subdomain||''))
    throw Error('CLOUD_SUBDOMAIN_INVALID');
  const headers=headersFromWrangler(tokenOutput);
  const url=ROOT+'accounts/'+accountId+'/workers/subdomain';
  const before=await fetcher(url,{headers,signal:AbortSignal.timeout(15000)});
  if(![200,404].includes(before?.status))throw Error('CLOUD_SUBDOMAIN_PREFLIGHT_FAILED');
  if(before.status===200){
    const result=await before.json().catch(()=>null);
    if(result?.success!==true)throw Error('CLOUD_SUBDOMAIN_PREFLIGHT_FAILED');
    const existing=result.result?.subdomain||'';
    if(existing)throw Error('CLOUD_SUBDOMAIN_ALREADY_EXISTS');
  }
  const result=await fetcher(url,{
    method:'PUT',headers:{...headers,'Content-Type':'application/json'},
    body:JSON.stringify({subdomain}),signal:AbortSignal.timeout(15000)
  });
  if(result?.status!==200)throw Error('CLOUD_SUBDOMAIN_CREATE_FAILED');
  const body=await result.json().catch(()=>null);
  if(body?.success!==true||body.result?.subdomain!==subdomain)
    throw Error('CLOUD_SUBDOMAIN_CREATE_UNVERIFIED');
  return {subdomain};
}
// An authenticated list is the only basis for declaring Workers definitely absent.
// An HTTP 404 at a public workers.dev URL is NOT proof of non-initialization.
async function inspectWorkerScripts({fetcher,tokenOutput,accountId}) {
  if(!ACCOUNT_ID.test(accountId))throw Error('CLOUD_ACCOUNT_NOT_FOUND');
  const body=await getCloudflare(fetcher,headersFromWrangler(tokenOutput),
    'accounts/'+accountId+'/workers/scripts');
  if(!Array.isArray(body.result)||Number(body.result_info?.total_pages||1)>1)
    throw Error('CLOUD_WORKER_LIST_INCOMPLETE');
  const ids=new Set(body.result.map(x=>x?.id).filter(x=>typeof x==='string'));
  return {auth:ids.has('chattoharness-auth'),router:ids.has('chattoharness-cloud-router')};
}
module.exports={headersFromWrangler,oauthNamespaces,discoverCloudflare,inspectWorkerScripts,createWorkersSubdomain};
