// Only public MCP entrypoint. The underlying router has no network-facing default export.
import {OAuthResourceServer, insufficientScope} from '@cloudflare/workers-oauth-provider';
import {authorizedWorker, DeviceHub} from './worker.mjs';
import {authorizedIdentity, canonical} from './oauth-policy.mjs';
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
  fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path === '/health' && request.method === 'GET')
      return Response.json({ok:true,component:'chattoharness-cloud-router'});
    // Agent registration has separate per-device authentication; not an MCP endpoint.
    if (path === '/agent') return authorizedWorker.fetch(request,env);
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
