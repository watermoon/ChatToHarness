// Dependency-free security predicates shared by OAuth auth/resource Workers.
export const htmlEscape = value => String(value).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
export function allowlistedGithubId(env, value) {
  const id = String(value ?? '');
  if (!/^[1-9][0-9]{0,18}$/.test(id)) return false;
  return String(env.GITHUB_ALLOWED_USER_IDS || '').split(',').map(x=>x.trim()).filter(Boolean).includes(id);
}
export function authorizedIdentity(ctx, env) {
  const id = ctx?.props?.githubUserId;
  return allowlistedGithubId(env,id) && ctx.auth?.userId === 'github:' + id;
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
