// Single-use device pairing capability. Cloud storage holds only token/code digests.
export const PAIR_TTL_MS = 5 * 60_000;
export const PAIR_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const DEVICE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;
export function generateSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g,'');
}
export async function sha256(value) {
  const hash = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
}
export async function newPairing(ctx) {
  const code=generateSecret();
  const expires_at=Date.now()+PAIR_TTL_MS;
  await ctx.storage.put('pair:'+await sha256(code),{expires_at});
  return {pairing_code:code,expires_at};
}
export async function redeemPairing(ctx,input) {
  if(!input || !PAIR_PATTERN.test(input.pairing_code||'') ||
      !DEVICE_PATTERN.test(input.device_id||'') ||
      typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80 ||
      !['win32','darwin','linux'].includes(input.platform))
    return {error:'PAIR_INVALID'};
  const now=Date.now(), codeKey='pair:'+await sha256(input.pairing_code);
  const deviceKey='device:'+input.device_id;
  return ctx.storage.transaction(async tx=>{
    const code=await tx.get(codeKey),registered=await tx.get(deviceKey);
    if(!code||code.expires_at<=now) return {error:'PAIR_EXPIRED_OR_USED'};
    if(registered) return {error:'DEVICE_ALREADY_PAIRED'};
    await tx.delete(codeKey);
    const token=generateSecret();
    await tx.put(deviceKey,{hash:await sha256(token),name:input.name,platform:input.platform,paired_at:now});
    return {device_id:input.device_id,device_token:token};
  });
}
export async function verifyDevice(ctx,id,token) {
  if(!DEVICE_PATTERN.test(id||'')||typeof token!=='string'||!PAIR_PATTERN.test(token))return false;
  const stored=await ctx.storage.get('device:'+id);
  return Boolean(stored && stored.hash===await sha256(token));
}
