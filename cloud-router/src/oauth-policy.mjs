// Allow only the known ChatGPT OAuth callback origin in form-action redirect chains.
// Chromium enforces form-action on POST 302 redirects, not just the form target.
export const CONSENT_CSP="default-src 'none'; form-action 'self' https://chatgpt.com; base-uri 'none'; frame-ancestors 'none'";
// Shared rules for our single-owner OAuth authorization and MCP resource Workers.
// No Cloudflare Access, GitHub account, or user-controlled authentication headers.
export const htmlEscape = value => String(value).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
export function ownerSubject(env) {
  const epoch=env?.OWNER_AUTH_EPOCH;
  // OAuth Provider 1.2.x rejects ':' in userId; keep this subject colon-free.
  return typeof epoch==='string' && /^[A-Za-z0-9_-]{1,32}$/.test(epoch) ? 'cth-owner-'+epoch : null;
}
const HEX_SECRET = /^[a-f0-9]{64}$/;

export function ownerSecretConfigured(env) {
  return typeof env?.OWNER_AUTH_KEY === 'string' && HEX_SECRET.test(env.OWNER_AUTH_KEY);
}

export async function verifyOwnerSecret(candidate,env) {
  // Only a randomly-generated 256-bit credential is acceptable, never a weak password.
  if (!ownerSecretConfigured(env) || typeof candidate !== 'string' || !HEX_SECRET.test(candidate)) return false;
  const encode = new TextEncoder();
  const [actual, expected] = await Promise.all([candidate,env.OWNER_AUTH_KEY]
    .map(s=>crypto.subtle.digest('SHA-256',encode.encode(s))));
  const a=new Uint8Array(actual), b=new Uint8Array(expected);
  let diff=0;
  for(let i=0;i<a.length;i++) diff|=a[i]^b[i];
  return diff===0;
}

export function authorizedIdentity(ctx,env) {
  const subject=ownerSubject(env);
  return Boolean(subject && ctx?.auth?.userId === subject &&
    ctx?.props?.ownerAuthorized === true && ctx?.props?.ownerEpoch === env.OWNER_AUTH_EPOCH);
}

export function canonical(value, expectedPath) {
  if (typeof value !== 'string') throw new Error('OAUTH_CONFIG_REQUIRED');
  const u = new URL(value);
  const loopback = u.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname);
  if ((!loopback && u.protocol !== 'https:') || u.username || u.password || u.search || u.hash ||
      !u.hostname || (expectedPath && u.pathname !== expectedPath))
    throw new Error('OAUTH_CONFIG_REQUIRED');
  return u.href.replace(/\/$/, '');
}
