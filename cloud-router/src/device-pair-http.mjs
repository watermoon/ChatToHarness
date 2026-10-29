// Browser confirmation of a device-originated pairing request.
// Public endpoints cannot pair a device without owner secret verification
// through the private authorization Worker service binding.
import {htmlEscape as escape} from './oauth-policy.mjs';
const CODE=/^[A-Za-z0-9_-]{43}$/;
const CSRF_NAME='__Host-cth-device-consent';
const MAX_REQUEST=2048;
const security={
  'Content-Type':'text/html; charset=utf-8',
  'Cache-Control':'no-store',
  'Referrer-Policy':'no-referrer',
  'X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'DENY',
  'Content-Security-Policy':"default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
};
const html=(body,status=200,extra={})=>new Response('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>ChatToHarness 设备授权</title></head><body>'+body+'</body></html>',{status,headers:{...security,...extra}});
const error=(code,status)=>Response.json({error:code},{status,headers:{'cache-control':'no-store'}});
function hub(env){return env.DEVICE_HUB.get(env.DEVICE_HUB.idFromName('default'));}
function secret(){const b=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');}
function timingSafeEqual(a,b){
 if(!CODE.test(a||'')||!CODE.test(b||''))return false;
 let diff=0;for(let i=0;i<43;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
 return diff===0;
}
async function internalJson(env,path,data){
 const req=new Request('https://hub.internal'+path,{method:data?'POST':'GET',...(data?{body:JSON.stringify(data),headers:{'content-type':'application/json'}}:{})});
 const res=await hub(env).fetch(req);
 return res.json();
}
function requestId(req){return new URL(req.url).searchParams.get('request')||'';}
export async function devicePairHttp(request,env){
 const path=new URL(request.url).pathname;
 if(path==='/pair-owner-approve'){
   // Headless approval is allowed only when the SAME device possesses both its
   // unguessable polling proof and a valid owner key already saved locally.
   if(request.method!=='POST')return error('METHOD_NOT_ALLOWED',405);
   if(Number(request.headers.get('content-length'))>MAX_REQUEST)return error('PAIR_INVALID',413);
   const raw=await request.text();
   if(raw.length>MAX_REQUEST)return error('PAIR_INVALID',413);
   let payload;try{payload=JSON.parse(raw);}catch{return error('PAIR_INVALID',400);}
   if(!CODE.test(payload?.request_id||'')||!CODE.test(payload?.poll_secret||'')||
      !/^[a-f0-9]{64}$/.test(payload?.owner_secret||''))return error('PAIR_INVALID',403);
   const requestState=await internalJson(env,'/pair-status',payload);
   if(requestState.error||requestState.status!=='pending')return error('PAIR_UNAUTHORIZED',403);
   if(!env.AUTH_SERVER||typeof env.AUTH_SERVER.verifyPairingOwnerKey!=='function')
     return error('CLOUD_AUTH_UNAVAILABLE',503);
   if(!await env.AUTH_SERVER.verifyPairingOwnerKey(payload.owner_secret))return error('PAIR_UNAUTHORIZED',403);
   const approved=await internalJson(env,'/pair-request-approve',{request_id:payload.request_id});
   return approved.error?error(approved.error,409):Response.json({approved:true},{headers:{'cache-control':'no-store'}});
 }
 if(path==='/pair-request'||path==='/pair-status'){
   if(request.method!=='POST')return error('METHOD_NOT_ALLOWED',405);
   if(Number(request.headers.get('content-length'))>MAX_REQUEST)return error('PAIR_INVALID',413);
   const raw=await request.text();
   if(raw.length>MAX_REQUEST)return error('PAIR_INVALID',413);
   let data;try{data=JSON.parse(raw);}catch{return error('PAIR_INVALID',400);}
   const result=await internalJson(env,path,data);
   if(result.error)return error(result.error,result.error==='PAIR_REQUEST_LIMIT'?429:403);
   if(path==='/pair-request'){
     // Explicitly bind approval to this service's origin; never accept user-supplied callback URLs.
     result.approval_url=new URL('/device-approve?request='+encodeURIComponent(result.request_id),request.url).href;
   }
   return Response.json(result,{headers:{'cache-control':'no-store'}});
 }
 if(path!=='/device-approve')return error('NOT_FOUND',404);
 if(request.method==='GET'){
   const id=requestId(request);
   if(!CODE.test(id))return html('<p>设备授权请求无效，请从客户端重新发起。</p>',400);
   const details=await internalJson(env,'/pair-request-details?request='+encodeURIComponent(id));
   if(details.error||details.status!=='pending')return html('<p>配对请求已失效或已经处理，请从客户端重新发起。</p>',410);
   const csrf=secret();
   return html('<h1>确认绑定 ChatToHarness 设备</h1>'+
     '<p>设备名称：<strong>'+escape(details.name)+'</strong></p>'+
     '<p>系统：'+escape(details.platform)+'</p>'+
     '<p>设备 ID：'+escape(details.device_id)+'</p>'+
     '<p>请确认这是你刚刚发起的设备绑定申请。未经你授权的设备不应加入。</p>'+
     '<form method="post" action="/device-approve">'+
     '<input type="hidden" name="request" value="'+escape(id)+'">'+
     '<input type="hidden" name="csrf" value="'+escape(csrf)+'">'+
     '<label>Owner Key <input type="password" name="owner_secret" required autocomplete="off" minlength="64" maxlength="64"></label>'+
     '<button type="submit" name="decision" value="approve">批准绑定</button></form>',
     200,{'Set-Cookie':CSRF_NAME+'='+csrf+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=300'});
 }
 if(request.method!=='POST')return error('METHOD_NOT_ALLOWED',405);
 if(Number(request.headers.get('content-length'))>MAX_REQUEST)return html('<p>请求过大。</p>',413);
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/x-www-form-urlencoded')
   return html('<p>请求格式不正确。</p>',400);
 const raw=await request.text();
 if(raw.length>MAX_REQUEST)return html('<p>请求过大。</p>',413);
 const data=new URLSearchParams(raw);
 const id=data.get('request'),csrf=data.get('csrf');
 const cookie=(request.headers.get('cookie')||'').split(';').map(x=>x.trim())
   .find(x=>x.startsWith(CSRF_NAME+'='))?.slice(CSRF_NAME.length+1);
 if(!CODE.test(id||'')||!timingSafeEqual(csrf,cookie)||
   data.get('decision')!=='approve')return html('<p>浏览器验证失败，请在本设备上重新发起配对。</p>',403);
 const details=await internalJson(env,'/pair-request-details?request='+encodeURIComponent(id));
 if(details.error||details.status!=='pending')return html('<p>配对申请过期或已经处理。</p>',410);
 if(typeof data.get('owner_secret')!=='string'||!/^[a-f0-9]{64}$/.test(data.get('owner_secret')||''))
   return html('<p>Owner Key 无效。</p>',403);
 if(!env.AUTH_SERVER||typeof env.AUTH_SERVER.verifyPairingOwnerKey!=='function')
   return html('<p>云端身份校验服务未就绪。</p>',503);
 const authorized=await env.AUTH_SERVER.verifyPairingOwnerKey(data.get('owner_secret'));
 if(!authorized)return html('<p>Owner Key 无效。</p>',403);
 const approved=await internalJson(env,'/pair-request-approve',{request_id:id});
 if(approved.error)return html('<p>绑定失败，请从客户端重新发起。</p>',409);
 return html('<h1>已批准设备绑定</h1><p>设备已通过验证，可返回 ChatToHarness 客户端。无需复制配对码。</p>',
   200,{'Set-Cookie':CSRF_NAME+'=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0'});
}
