// OAuth 2.1 authorization server: self-hosted single-owner consent.
// No Cloudflare Access or GitHub; the operator enters a 256-bit secret once
// during browser authorization. The secret is never included in issued tokens.
import {WorkerEntrypoint} from 'cloudflare:workers';
import {OAuthAuthorizationServer, AuthorizationError} from '@cloudflare/workers-oauth-provider';
import {htmlEscape as escape,verifyOwnerSecret,ownerSecretConfigured,ownerSubject,canonical as canonicalUrl} from '../src/oauth-policy.mjs';

const SCOPES=['mcp:read'];
function provider(env) {
  return new OAuthAuthorizationServer({
    issuer:canonicalUrl(env.OAUTH_ISSUER,'/'),
    resources:[canonicalUrl(env.MCP_RESOURCE_URL,'/mcp')],
    scopesSupported:SCOPES,
    clientIdMetadataDocumentEnabled:true,
    clientRegistrationEndpoint:'/oauth/register'
  });
}
function consentPage(details,handle) {
  const publisher=details.clientDomain
    ? 'Published by <strong>'+escape(details.clientDomain)+'</strong>.'
    : 'The client name is self-reported and is not verified.';
  return ['<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="referrer" content="no-referrer"><title>ChatToHarness authorization</title></head><body>',
    '<h1>Authorize ',escape(details.clientName),' to access ChatToHarness?</h1><p>',publisher,'</p>',
    '<p>Authorization results will be delivered to <strong>',escape(details.redirectHost),'</strong>.</p>',
    details.redirectIsLoopback ? '<p><strong>Warning: the callback is on this computer.</strong></p>' : '',
    '<p>Permission: device discovery and status (mcp:read). No shell, file editing or Computer Use.</p>',
    '<form method="post" action="/authorize">',
    '<input name="handle" type="hidden" value="',escape(handle),'">',
    '<label for="owner_secret">Private owner authorization key</label>',
    '<input id="owner_secret" type="password" name="owner_secret" required',
    ' autocomplete="off" spellcheck="false" minlength="64" maxlength="64">',
    '<button type="submit" name="decision" value="approve">Allow</button>',
    '<button type="submit" name="decision" value="deny" formnovalidate>Deny</button>',
    '</form><p>This key is stored as a Cloudflare Worker secret. It is never saved in the browser by this page.</p>',
    '</body></html>'
  ].join('');
}
const plainError=(message,status=400)=>new Response(message,{
  status,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}
});
async function authorize(request,env,oauth) {
  // Fail closed even when a direct Worker URL is accessible on the public Internet.
  if (!ownerSecretConfigured(env) || !ownerSubject(env)) return plainError('Owner authorization not configured',503);
  try {
    if(request.method==='GET') {
      const authRequest=await oauth.parseAuthRequest(request);
      if(!authRequest.scope.includes('mcp:read'))return plainError('mcp:read scope required');
      const details=await oauth.describeConsent(authRequest);
      const consent=await oauth.beginConsent(authRequest);
      consent.headers.set('Content-Type','text/html; charset=utf-8');
      consent.headers.set('Cache-Control','no-store');
      consent.headers.set('Referrer-Policy','no-referrer');
      consent.headers.set('X-Content-Type-Options','nosniff');
      consent.headers.set('X-Frame-Options','DENY');
      consent.headers.set('Content-Security-Policy',"default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
      return new Response(consentPage(details,consent.handle),{headers:consent.headers});
    }
    if(request.method==='POST') {
      if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/x-www-form-urlencoded' ||
        Number(request.headers.get('content-length')||0)>4096)return plainError('Invalid authorization form',400);
      const form=await request.formData();
      const handle=String(form.get('handle')||'');
      if(form.get('decision')!=='approve') {
        const denied=await oauth.denyConsent(request,handle);
        return new Response(null,{status:302,headers:denied.headers});
      }
      // Authenticate BEFORE approving the consent handle, issuing grants or redirecting.
      if(!await verifyOwnerSecret(form.get('owner_secret'),env))
        return plainError('Authorization key invalid',403);
      const approved=await oauth.approveConsent(request,handle,{scope:SCOPES});
      if(!approved.request.scope.includes('mcp:read'))return plainError('Scope rejected',403);
      const {redirectTo}=await oauth.completeAuthorization({
        request:approved.request,userId:ownerSubject(env),metadata:{},
        scope:SCOPES,props:{ownerAuthorized:true,ownerEpoch:env.OWNER_AUTH_EPOCH}
      });
      approved.headers.set('Location',redirectTo);
      return new Response(null,{status:302,headers:approved.headers});
    }
    return plainError('Method not allowed',405);
  } catch(e) {
    if(!(e instanceof AuthorizationError)) throw e;
    return e.redirectTo ? Response.redirect(e.redirectTo,302) : plainError(e.description);
  }
}
export default class ChatToHarnessAuth extends WorkerEntrypoint {
  fetch(request) {
    const oauth=provider(this.env);
    if(new URL(request.url).pathname==='/authorize')
      return authorize(request,this.env,oauth.getOAuthApi(this.env));
    // Discovery, token exchange, DCR and revocation are public OAuth protocol
    // endpoints; they do NOT grant owner identity without the owner secret.
    return oauth.fetch(request,this.env,this.ctx);
  }
  validateToken(resource,token) {
    return provider(this.env).validateToken(resource,token,this.env);
  }
}
export {consentPage,authorize};
