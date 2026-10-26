// OAuth Authorization Server: GitHub is the upstream identity provider.
import {WorkerEntrypoint} from 'cloudflare:workers';
import {OAuthAuthorizationServer, AuthorizationError, authorizationErrorRedirect} from '@cloudflare/workers-oauth-provider';
import {htmlEscape as escape, allowlistedGithubId, canonical as canonicalUrl} from '../src/oauth-policy.mjs';

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
function consentPage(details, handle) {
  const publisher = details.clientDomain
    ? 'Published by <strong>' + escape(details.clientDomain) + '</strong>.'
    : 'The client name is self-reported and is not verified.';
  return ['<!doctype html><html><head><meta charset="utf-8"><title>ChatToHarness authorization</title></head><body>',
    '<h1>Allow ', escape(details.clientName), ' to access ChatToHarness?</h1><p>', publisher,
    '</p><p>Credentials will be delivered to <strong>', escape(details.redirectHost), '</strong>.</p>',
    details.redirectIsLoopback ? '<p><strong>Warning: the destination is on this computer.</strong></p>' : '',
    '<p>Permission: device discovery and status (mcp:read). No shell, file editing, or Computer Use.</p>',
    '<form method="post"><input name="handle" type="hidden" value="',escape(handle),'">',
    '<button type="submit" name="decision" value="approve">Allow</button>',
    '<button type="submit" name="decision" value="deny">Deny</button></form></body></html>'
  ].join('');
}
const limitedError = (message, status = 400) => new Response(message, {
  status, headers: {'content-type':'text/plain; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}
});
async function startGitHubLogin(env, oauth, approved) {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) throw new Error('GITHUB_LOGIN_NOT_CONFIGURED');
  const {state, headers} = await oauth.beginUpstream(approved.request, {headers: approved.headers});
  const callback = canonicalUrl(env.OAUTH_ISSUER, '/') + '/callback';
  const github = new URL('https://github.com/login/oauth/authorize');
  github.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  github.searchParams.set('redirect_uri', callback);
  github.searchParams.set('state', state);
  headers.set('Location', github.href);
  return new Response(null, {status: 302, headers});
}
async function authorize(request, env, oauth) {
  try {
    if (request.method === 'GET') {
      const authRequest = await oauth.parseAuthRequest(request);
      if (!authRequest.scope.includes('mcp:read')) return limitedError('mcp:read is required');
      const details = await oauth.describeConsent(authRequest);
      const consent = await oauth.beginConsent(authRequest);
      consent.headers.set('Content-Type', 'text/html; charset=utf-8');
      return new Response(consentPage(details, consent.handle), {headers: consent.headers});
    }
    if (request.method === 'POST') {
      const form = await request.formData();
      const handle = String(form.get('handle') || '');
      if (form.get('decision') !== 'approve') {
        const denied = await oauth.denyConsent(request, handle);
        return new Response(null, {status: 302, headers: denied.headers});
      }
      const approved = await oauth.approveConsent(request, handle, {scope: SCOPES});
      if (!approved.request.scope.includes('mcp:read')) return limitedError('Scope rejected');
      return startGitHubLogin(env, oauth, approved);
    }
    return limitedError('Method not allowed', 405);
  } catch (e) {
    if (!(e instanceof AuthorizationError)) throw e;
    return e.redirectTo ? Response.redirect(e.redirectTo, 302) : limitedError(e.description);
  }
}
async function exchangeGithubCode(env, code) {
  if (!/^[a-zA-Z0-9_-]{4,256}$/.test(code)) return null;
  const token = await fetch('https://github.com/login/oauth/access_token', {
    method:'POST', headers:{Accept:'application/json','Content-Type':'application/json'},
    body: JSON.stringify({client_id: env.GITHUB_CLIENT_ID,client_secret: env.GITHUB_CLIENT_SECRET,
      code,redirect_uri:canonicalUrl(env.OAUTH_ISSUER, '/')+'/callback'}),
    signal: AbortSignal.timeout(10000)
  });
  if (!token.ok) return null;
  const body = await token.json();
  if (typeof body.access_token !== 'string' || !body.access_token) return null;
  const user = await fetch('https://api.github.com/user', {
    headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+body.access_token,
      'User-Agent':'ChatToHarness-OAuth'},
    signal: AbortSignal.timeout(10000)
  });
  if (!user.ok) return null;
  const identity = await user.json();
  return Number.isSafeInteger(identity.id) && identity.id > 0 ? String(identity.id) : null;
}
async function callback(request, env, oauth) {
  let pending;
  try { pending = await oauth.finishUpstream(request); }
  catch (e) { if (e instanceof AuthorizationError) return limitedError('Login state expired'); throw e; }
  const code = new URL(request.url).searchParams.get('code');
  const userId = code ? await exchangeGithubCode(env, code) : null;
  if (!userId || !allowlistedGithubId(env, userId)) {
    pending.headers.set('Location', authorizationErrorRedirect(pending.request, 'access_denied'));
    return new Response(null,{status:302,headers:pending.headers});
  }
  const {redirectTo} = await oauth.completeAuthorization({
    request: pending.request,userId:'github:'+userId,metadata:{},
    scope:SCOPES,props:{githubUserId:userId}
  });
  pending.headers.set('Location',redirectTo);
  return new Response(null,{status:302,headers:pending.headers});
}
export default class ChatToHarnessAuth extends WorkerEntrypoint {
  fetch(request) {
    const oauth = provider(this.env), api = oauth.getOAuthApi(this.env);
    const pathname = new URL(request.url).pathname;
    if (pathname === '/authorize') return authorize(request,this.env,api);
    if (pathname === '/callback') return callback(request,this.env,api);
    return oauth.fetch(request,this.env,this.ctx);
  }
  validateToken(resource, token) {
    return provider(this.env).validateToken(resource,token,this.env);
  }
}
export {consentPage};
