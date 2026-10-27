// Security policies shared by the OAuth authorization and MCP resource Workers.
// Never infer Cloudflare Access identity from unverified HTTP headers or cookies.
export const htmlEscape = value => String(value).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');

export function normalizedAccessEmail(email) {
  if (typeof email !== 'string' || email.length < 3 || email.length > 254 ||
      email !== email.trim() || /[\s\x00-\x1f\x7f]/.test(email) ||
      !/^[^@]+@[^@]+\.[^@]+$/.test(email)) return null;
  return email.toLowerCase();
}

export function allowlistedAccessEmail(env, email) {
  const normalized = normalizedAccessEmail(email);
  if (!normalized) return false;
  const allowed = String(env?.ACCESS_ALLOWED_EMAILS || '').split(',')
    .map(value => normalizedAccessEmail(value.trim())).filter(Boolean);
  // An empty allowlist always denies. Cloudflare account membership must ALSO be
  // enforced by the Access policy protecting the /authorize hostname/path.
  return allowed.includes(normalized);
}

export function authorizedIdentity(ctx, env) {
  const email = normalizedAccessEmail(ctx?.props?.accessEmail);
  return Boolean(email && allowlistedAccessEmail(env,email) &&
    ctx?.auth?.userId === 'cloudflare-access:' + email);
}

export async function authenticatedAccessUser(accessContext, env) {
  if (!accessContext || typeof accessContext.getIdentity !== 'function') return null;
  let identity;
  try { identity = await accessContext.getIdentity(); }
  catch { return null; }
  const email = normalizedAccessEmail(identity?.email);
  if (!email || !allowlistedAccessEmail(env,email)) return null;
  // Cloudflare Access is the only identity authority. No request-provided user
  // ID, CF-Access header, JWT payload or GitHub identifier is trusted here.
  return {email, userId: 'cloudflare-access:' + email};
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
