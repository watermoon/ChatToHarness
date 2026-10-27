// OAuth 2.1 authorization Worker. Cloudflare Access, NOT GitHub, authenticates
// the user on the Access-protected /authorize hostname/path.
import {WorkerEntrypoint} from 'cloudflare:workers';
import {OAuthAuthorizationServer, AuthorizationError} from '@cloudflare/workers-oauth-provider';
import {htmlEscape as escape, authenticatedAccessUser, canonical as canonicalUrl} from '../src/oauth-policy.mjs';

const SCOPES = ['mcp:read'];
function provider(env) {
  return new OAuthAuthorizationServer({
    issuer: canonicalUrl(env.OAUTH_ISSUER, '/'),
    resources: [canonicalUrl(env.MCP_RESOURCE_URL, '/mcp')],
    scopesSupported: SCOPES,
    clientIdMetadataDocumentEnabled: true,
    clientRegistrationEndpoint: '/oauth/register'
  });
}

function consentPage(details, handle, email) {
  const publisher = details.clientDomain
    ? 'Published by <strong>' + escape(details.clientDomain) + '</strong>.'
    : 'The client name is self-reported and is not verified.';
  return ['<!doctype html><html><head><meta charset="utf-8"><title>ChatToHarness authorization</title></head><body>',
    '<h1>Allow ', escape(details.clientName), ' to access ChatToHarness?</h1><p>', publisher,
    '</p><p>Signed in through Cloudflare Access as <strong>',escape(email),'</strong>.</p>',
    '<p>Credentials will be delivered to <strong>', escape(details.redirectHost), '</strong>.</p>',
    details.redirectIsLoopback ? '<p><strong>Warning: the destination is on this computer.</strong></p>' : '',
    '<p>Permission: device discovery and status (mcp:read). No shell, file editing, or Computer Use.</p>',
    '<form method="post"><input name="handle" type="hidden" value="',escape(handle),'">',
    '<button type="submit" name="decision" value="approve">Allow</button>',
    '<button type="submit" name="decision" value="deny">Deny</button></form></body></html>'
  ].join('');
}
const plainError = (message,status=400) => new Response(message,{
  status,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}
});

async function authorize(request,env,oauth,accessContext) {
  // Even a direct Worker invocation or a misconfigured Access path must fail
  // closed. Do not trust cf-access-... headers or unverified JWT claims.
  const user = await authenticatedAccessUser(accessContext,env);
  if (!user) return plainError('Cloudflare Access authentication required',403);
  try {
    if (request.method === 'GET') {
      const authRequest = await oauth.parseAuthRequest(request);
      if (!authRequest.scope.includes('mcp:read')) return plainError('mcp:read scope required');
      const details = await oauth.describeConsent(authRequest);
      const consent = await oauth.beginConsent(authRequest);
      consent.headers.set('Content-Type','text/html; charset=utf-8');
      return new Response(consentPage(details,consent.handle,user.email),{headers:consent.headers});
    }
    if (request.method === 'POST') {
      const form = await request.formData();
      const handle = String(form.get('handle')||'');
      if (form.get('decision') !== 'approve') {
        const denied = await oauth.denyConsent(request,handle);
        return new Response(null,{status:302,headers:denied.headers});
      }
      const approved = await oauth.approveConsent(request,handle,{scope:SCOPES});
      if (!approved.request.scope.includes('mcp:read')) return plainError('Scope rejected',403);
      const {redirectTo} = await oauth.completeAuthorization({
        request:approved.request,userId:user.userId,metadata:{},
        scope:SCOPES,props:{accessEmail:user.email}
      });
      approved.headers.set('Location',redirectTo);
      return new Response(null,{status:302,headers:approved.headers});
    }
    return plainError('Method not allowed',405);
  } catch(e) {
    if (!(e instanceof AuthorizationError)) throw e;
    return e.redirectTo ? Response.redirect(e.redirectTo,302) : plainError(e.description);
  }
}

export default class ChatToHarnessAuth extends WorkerEntrypoint {
  fetch(request) {
    const oauth = provider(this.env);
    const pathname = new URL(request.url).pathname;
    if (pathname === '/authorize')
      return authorize(request,this.env,oauth.getOAuthApi(this.env),this.ctx?.access);
    // /oauth/token, revocation, DCR and discovery MUST remain available to
    // OAuth clients. Cloudflare Access should protect only /authorize.
    return oauth.fetch(request,this.env,this.ctx);
  }
  validateToken(resource,token) {
    return provider(this.env).validateToken(resource,token,this.env);
  }
}
export {consentPage,authorize};
