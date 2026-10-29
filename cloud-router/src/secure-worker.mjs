import {cloudflareEnroll,verifyCloudflareAccount} from './cloudflare-account.mjs';
// Only public MCP entrypoint. The underlying router has no network-facing default export.
import {OAuthResourceServer, insufficientScope} from '@cloudflare/workers-oauth-provider';
import {authorizedWorker, DeviceHub} from './worker.mjs';
import {authorizedIdentity, canonical} from './oauth-policy.mjs';
import {devicePairHttp} from './device-pair-http.mjs';
export {DeviceHub};

function resourceServer(env) {
  const resource = canonical(env.MCP_RESOURCE_URL, '/mcp');
  const issuer = canonical(env.OAUTH_ISSUER, '/');
  if (!env.AUTH_SERVER || typeof env.AUTH_SERVER.validateToken !== 'function')
    throw new Error('OAUTH_SERVICE_BINDING_REQUIRED');
  return new OAuthResourceServer({
    resourceMetadata: {resource, authorization_servers:[issuer], resource_name:'ChatToHarness'},
    requiredScopes:['mcp:read'],
    validateToken: () => env.AUTH_SERVER.validateToken,
    handler: {
      fetch(request, environment, context) {
        if (!context.auth.scope.includes('mcp:read'))
          return insufficientScope(context.auth,['mcp:read']);
        if (!authorizedIdentity(context, environment))
          return new Response('Forbidden',{status:403,headers:{'cache-control':'no-store'}});
        if (new URL(request.url).pathname !== '/mcp')
          return new Response('Not found',{status:404});
        return authorizedWorker.fetch(request,environment);
      }
    }
  });
}
export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if(path==='/account-enroll')return cloudflareEnroll(request,env);
    if(env.CF_ACCOUNT_ID&&['/pair-request','/pair-status','/pair-owner-approve','/device-approve','/pair-redeem'].includes(path))return new Response('Use Cloudflare account sign-in',{status:410});
    if (path === '/health' && request.method === 'GET')
      return Response.json({ok:true,component:'chattoharness-cloud-router',identity_mode:env.CF_ACCOUNT_ID?'cloudflare':'legacy'});
    // New-device enrollment is a separate owner-confirmed browser flow.
    // These are not MCP endpoints; the approval route verifies Owner Key
    // privately through AUTH_SERVER, never through anonymous metadata.
    if(path==='/owner-reset-device-hub'){
      if(request.method!=='POST')return new Response('Method not allowed',{status:405});
      const raw=await request.text();
      if(raw.length>512)return Response.json({error:'RESET_INVALID'},{status:413});
      let body;try{body=JSON.parse(raw);}catch{return Response.json({error:'RESET_INVALID'},{status:400});}
      const accountToken=/^Bearer (\S+)$/.exec(request.headers.get('authorization')||'')?.[1];
      if(env.CF_ACCOUNT_ID?!await verifyCloudflareAccount(accountToken,env):(!/^[a-f0-9]{64}$/.test(body?.owner_secret||'')||
         !env.AUTH_SERVER||typeof env.AUTH_SERVER.verifyPairingOwnerKey!=='function'||
         !await env.AUTH_SERVER.verifyPairingOwnerKey(body.owner_secret)))
        return Response.json({error:'RESET_UNAUTHORIZED'},{status:403});
      // Only this protected endpoint can reach this internal DO operation.
      const response=await env.DEVICE_HUB.get(env.DEVICE_HUB.idFromName('default'))
        .fetch(new Request('https://hub.internal/internal-reset-device-hub',{method:'POST'}));
      if(!response.ok)return Response.json({error:'RESET_DEVICE_HUB_FAILED'},{status:502});
      return Response.json({cleared:(await response.json()).cleared===true},
        {headers:{'cache-control':'no-store'}});
    }
    if(['/pair-request','/pair-status','/pair-owner-approve','/device-approve'].includes(path))
      return devicePairHttp(request,env);
    // Agent registration has separate per-device authentication; not an MCP endpoint.
    if (path === '/agent') return authorizedWorker.fetch(request,env);
    // Device-bound read-only roster: verified again by the Durable Object.
    // Never expose this endpoint through anonymous requests or owner OAuth bypass.
    if (path === '/paired-devices') {
      if (request.method !== 'GET') return new Response('Method not allowed',{status:405});
      return env.DEVICE_HUB.get(env.DEVICE_HUB.idFromName('default')).fetch(
        new Request('https://hub.internal/paired-devices',request));
    }
    // Pair redemption is a high-entropy single-use capability. The only public
    // anonymous operation, routed to the private Durable Object.
    if(path === '/pair-redeem') {
      if(request.method!=='POST')return new Response('Method not allowed',{status:405});
      return env.DEVICE_HUB.get(env.DEVICE_HUB.idFromName('default')).fetch(
        new Request('https://hub.internal/pair-redeem',request));
    }
    // OAuthResourceServer handles the MCP endpoint and RFC 9728 discovery,
    // including the 401 WWW-Authenticate challenge, audience, expiry and revocation checks.
    return resourceServer(env).fetch(request,env,ctx);
  }
};
