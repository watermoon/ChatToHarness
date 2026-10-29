// The Cloudflare account is the sole interactive identity for this installation.
export async function verifyCloudflareAccount(token,env,fetcher=fetch){
 if(!/^[a-f0-9]{32}$/i.test(env.CF_ACCOUNT_ID||'')||typeof token!=='string'||token.length<20||token.length>4096||/[\r\n]/.test(token))return false;
 try{
  const response=await fetcher('https://api.cloudflare.com/client/v4/accounts/'+env.CF_ACCOUNT_ID+'/workers/scripts/chattoharness-cloud-router/settings',{
   headers:{Authorization:'Bearer '+token},redirect:'manual',signal:AbortSignal.timeout(15000)
  });
  const body=await response.json();
  if(!response.ok||body.success!==true){console.warn('CTH_ACCOUNT_CHECK',JSON.stringify({status:response.status,codes:(body.errors||[]).map(e=>e.code)}));return false;}
  return true;
 }catch(e){console.warn('CTH_ACCOUNT_CHECK',JSON.stringify({transport:e?.name||'Error',message:String(e?.message||'').replace(/[A-Za-z0-9_-]{24,}/g,'[redacted]').slice(0,220)}));return false;}
}
export async function cloudflareEnroll(request,env){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 const token=/^Bearer (\S+)$/.exec(request.headers.get('authorization')||'')?.[1];
 if(!await verifyCloudflareAccount(token,env))return Response.json({error:'CLOUDFLARE_ACCOUNT_REQUIRED'},{status:403});
 const raw=await request.text();if(raw.length>2048)return new Response('Too large',{status:413});
 let body;try{body=JSON.parse(raw);}catch{return new Response('Invalid JSON',{status:400});}
 return env.DEVICE_HUB.get(env.DEVICE_HUB.idFromName('default')).fetch(new Request('https://hub.internal/account-enroll',{
  method:'POST',body:JSON.stringify(body),headers:{'content-type':'application/json'}
 }));
}
