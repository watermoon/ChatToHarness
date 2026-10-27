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
  if(!accountId&&accounts.length>1)
    return {needs:'account',accounts,kvOptions:[]};
  const selected=accountId||accounts[0].id;
  const dom=await getCloudflare(fetcher,headers,'accounts/'+selected+'/workers/subdomain');
  const sub=dom.result?.subdomain;
  if(typeof sub!=='string'||!SUBDOMAIN.test(sub))throw Error('CLOUD_SUBDOMAIN_NOT_CONFIGURED');
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
  if(!kvId&&options.length>1)
    return {needs:'kv',accounts,accountId:selected,subdomain:sub,kvOptions:options};
  return {needs:null,accounts,accountId:selected,subdomain:sub,
    kvId:kvId||options[0]?.id||'',kvOptions:options};
}
module.exports={headersFromWrangler,oauthNamespaces,discoverCloudflare};
