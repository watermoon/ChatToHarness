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


// Browser-approved pairing. The device generates its own credential and uploads
// ONLY a SHA-256 digest; the Worker never holds the credential in cleartext.
const HEX_HASH=/^[a-f0-9]{64}$/;
export async function requestDevicePairing(ctx,input) {
  if(!input||!DEVICE_PATTERN.test(input.device_id||'')||
    typeof input.name!=='string'||!input.name.trim()||input.name.length>80||
    !['darwin','win32','linux'].includes(input.platform)||
    !HEX_HASH.test(input.device_token_hash||''))return {error:'PAIR_INVALID'};
  if(await ctx.storage.get('device:'+input.device_id))return {error:'DEVICE_ALREADY_PAIRED'};
  const pending=await ctx.storage.list({prefix:'request:',limit:32});
  let live=0;
  for(const [k,v] of pending){
    if(v.expires_at<=Date.now())await ctx.storage.delete(k);
    else live++;
  }
  if(live>=20)return {error:'PAIR_REQUEST_LIMIT'};
  const request_id=generateSecret(),poll_secret=generateSecret();
  const expires_at=Date.now()+PAIR_TTL_MS;
  await ctx.storage.put('request:'+request_id,{
    device_id:input.device_id,name:input.name,platform:input.platform,
    hash:input.device_token_hash,poll_hash:await sha256(poll_secret),
    expires_at,status:'pending'
  });
  return {request_id,poll_secret,expires_at};
}
export async function pairingRequestDetails(ctx,id){
  if(!PAIR_PATTERN.test(id||''))return {error:'PAIR_INVALID'};
  const v=await ctx.storage.get('request:'+id);
  if(!v||v.expires_at<=Date.now())return {error:'PAIR_EXPIRED_OR_USED'};
  return {name:v.name,platform:v.platform,device_id:v.device_id,expires_at:v.expires_at,status:v.status};
}
export async function approveDevicePairing(ctx,id){
  if(!PAIR_PATTERN.test(id||''))return {error:'PAIR_INVALID'};
  return ctx.storage.transaction(async tx=>{
    const key='request:'+id,v=await tx.get(key);
    if(!v||v.expires_at<=Date.now())return {error:'PAIR_EXPIRED_OR_USED'};
    if(v.status!=='pending')return {error:'PAIR_EXPIRED_OR_USED'};
    if(await tx.get('device:'+v.device_id))return {error:'DEVICE_ALREADY_PAIRED'};
    await tx.put('device:'+v.device_id,{
      hash:v.hash,name:v.name,platform:v.platform,paired_at:Date.now()
    });
    await tx.put(key,{...v,status:'approved'});
    return {approved:true};
  });
}
export async function devicePairingStatus(ctx,id,poll_secret){
  if(!PAIR_PATTERN.test(id||'')||!PAIR_PATTERN.test(poll_secret||''))return {error:'PAIR_INVALID'};
  const v=await ctx.storage.get('request:'+id);
  if(!v||v.expires_at<=Date.now())return {error:'PAIR_EXPIRED_OR_USED'};
  if(v.poll_hash!==await sha256(poll_secret))return {error:'PAIR_UNAUTHORIZED'};
  return {status:v.status,device_id:v.device_id};
}
