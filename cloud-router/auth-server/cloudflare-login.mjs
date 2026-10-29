import {verifyCloudflareAccount} from '../src/cloudflare-account.mjs';
import {ownerSubject,htmlEscape} from '../src/oauth-policy.mjs';
const CLIENT='54d11594-84e4-41aa-b438-e81b8fa78ee7'; // Cloudflare's public Wrangler device client.
const COOKIE='__Host-cth-cf-login';
const json=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store'}});
export async function cloudflareAuthorize(request,env,oauth){
 const url=new URL(request.url);
 if(url.pathname==='/cloudflare-login'){
  if(request.method!=='POST'||request.headers.get('origin')!==url.origin||request.headers.get('x-cth-login')!=='1')return json({error:'INVALID_LOGIN'},403);
  const id=request.headers.get('cookie')?.match(/(?:^|;\s*)__Host-cth-cf-login=([a-f0-9]{64})(?:;|$)/)?.[1];
  if(!id)return json({error:'LOGIN_EXPIRED'},403);
  const key='cf-login:'+id,record=await env.OAUTH_KV.get(key,'json');
  if(!record||record.expires<Date.now())return json({error:'LOGIN_EXPIRED'},403);
  if(Date.now()<record.next)return json({pending:true});
  record.next=Date.now()+record.interval*1000;
  await env.OAUTH_KV.put(key,JSON.stringify(record),{expirationTtl:600});
  const response=await fetch('https://dash.cloudflare.com/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CLIENT,grant_type:'urn:ietf:params:oauth:grant-type:device_code',device_code:record.code}),signal:AbortSignal.timeout(15000)});
  const token=await response.json();
  if(['authorization_pending','slow_down'].includes(token.error)){if(token.error==='slow_down'){record.interval+=5;await env.OAUTH_KV.put(key,JSON.stringify(record),{expirationTtl:600});}return json({pending:true});}
  if(!response.ok||!await verifyCloudflareAccount(token.access_token,env)){await env.OAUTH_KV.delete(key);return json({error:'CLOUDFLARE_ACCOUNT_REQUIRED'},403);}
  // The provider's browser-bound consent handle is completed automatically;
  // Cloudflare authentication is the only user action.
  const approved=await oauth.approveConsent(request,record.handle,{scope:['mcp:read']});
  const {redirectTo}=await oauth.completeAuthorization({request:approved.request,userId:ownerSubject(env),metadata:{},scope:['mcp:read'],props:{ownerAuthorized:true,ownerEpoch:env.OWNER_AUTH_EPOCH}});
  await env.OAUTH_KV.delete(key);
  const result=json({redirect:redirectTo});
  for(const [name,value] of approved.headers)if(name.toLowerCase()==='set-cookie')result.headers.append(name,value);
  result.headers.append('set-cookie',COOKIE+'=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return result;
 }
 if(request.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405);
 const auth=await oauth.parseAuthRequest(request);
 if(!auth.scope.includes('mcp:read'))return json({error:'SCOPE_REQUIRED'},400);
 const consent=await oauth.beginConsent(auth);
 const response=await fetch('https://dash.cloudflare.com/oauth2/device/auth',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CLIENT,scope:'account:read workers_scripts:write'}),signal:AbortSignal.timeout(15000)});
 const device=await response.json();
 if(!response.ok||!device.device_code||!device.user_code)return json({error:'CLOUDFLARE_LOGIN_UNAVAILABLE'},502);
 const target=new URL(device.verification_uri_complete||device.verification_uri);
 if(target.origin!=='https://dash.cloudflare.com'||target.username||target.password)return json({error:'CLOUDFLARE_LOGIN_INVALID'},502);
 target.searchParams.set('user_code',device.user_code);
 const id=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 await env.OAUTH_KV.put('cf-login:'+id,JSON.stringify({handle:consent.handle,code:device.device_code,expires:Date.now()+Math.min(device.expires_in||600,600)*1000,interval:Math.max(5,device.interval||5),next:0}),{expirationTtl:600});
 const nonce=crypto.randomUUID();
 consent.headers.set('content-type','text/html; charset=utf-8');consent.headers.set('cache-control','no-store');consent.headers.set('referrer-policy','no-referrer');
 consent.headers.append('set-cookie',COOKIE+'='+id+'; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=600');
 consent.headers.set('content-security-policy',"default-src 'none'; script-src 'nonce-"+nonce+"'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
 return new Response('<!doctype html><meta charset="utf-8"><title>Cloudflare 登录</title><h1>使用 Cloudflare 账户连接 Harness</h1><p>完成 Cloudflare 授权后，本页将自动继续。</p><a target="_blank" rel="noopener noreferrer" href="'+htmlEscape(target.href)+'">登录 Cloudflare</a><p id="status"></p><script nonce="'+nonce+'">let done=false,busy=false;const timer=setInterval(async()=>{if(done||busy)return;busy=true;try{const r=await fetch("/cloudflare-login",{method:"POST",headers:{"x-cth-login":"1"}});const b=await r.json();if(b.redirect){done=true;clearInterval(timer);location.assign(b.redirect);}else if(b.error){done=true;clearInterval(timer);document.getElementById("status").textContent="Cloudflare 账户验证失败，请重新连接。";}}catch{}finally{busy=false;}},5000);</script>',{headers:consent.headers});
}
