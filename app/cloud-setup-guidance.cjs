'use strict';
// Only enum-like guidance is exposed to the renderer. Never include Cloudflare
// tokens, secrets, URLs with OAuth parameters or raw command output.
const running={
  discovering:1,authorize_browser:1,creating_subdomain:2,
  configuring:3,creating_kv:3,deploying_auth:4,setting_secret:5,
  deploying_router:5,redeploying_auth:4,redeploying_router:5,verifying:6,rotating_owner:5
};
const errorCodes={
  CLOUD_SECURE_STORAGE_REQUIRED:'secure_storage',
  CLOUD_NODE_RUNTIME_MISSING:'runtime',
  CLOUD_WRANGLER_RUNTIME_MISSING:'runtime',
  CLOUD_KEYRING_RUNTIME_MISSING:'runtime',
  CLOUD_KEYRING_INSTALL_BUSY:'runtime',
  CLOUD_KEYRING_INSTALL_FAILED:'runtime',
  CLOUD_KEYRING_INSTALL_VERIFY_FAILED:'runtime',
  CLOUD_WRANGLER_START_FAILED:'runtime',
  CLOUD_LOGIN_REQUIRED:'login',
  CLOUD_WRANGLER_FAILED_LOGIN:'login',
  CLOUD_STANDARD_OAUTH_FAILED:'login',
  CLOUD_SUBDOMAIN_CREATE_FAILED:'subdomain_permission',
  CLOUD_SUBDOMAIN_CREATE_UNVERIFIED:'subdomain_permission',
  CLOUD_SUBDOMAIN_ALREADY_EXISTS:'subdomain_conflict',
  CLOUD_WRANGLER_FAILED_DEPLOY:'deploy_failed',
  CLOUD_WRANGLER_FAILED_SECRET:'secret_failed',
  CLOUD_REMOTE_VERIFICATION_FAILED:'verify_failed',
  CLOUD_ACCOUNT_NOT_FOUND:'account_permission',
  CLOUD_API_UNAVAILABLE:'api_permission',
  CLOUD_PARTIAL_DEPLOYMENT_OWNER_KEY_MISSING:'owner_recovery',
  CLOUD_ALREADY_DEPLOYED_OWNER_KEY_MISSING:'owner_recovery',
  CLOUD_DEPLOYED_KEY_NOT_VERIFIED:'owner_recovery',
  CLOUD_EXISTING_ACCOUNT_MISMATCH:'existing_mismatch',
  CLOUD_REMOTE_STATE_UNKNOWN:'network',
  CLOUD_REINITIALIZE_TARGET_UNVERIFIED:'existing_mismatch',
  CLOUD_REINITIALIZE_REQUIRES_MANAGED_SERVICE:'owner_recovery'
};
function cloudSetupGuidance({phase,remote,error,hasOwnerKey}={}){
  let code=errorCodes[error]||'';
  if(!code){
    if(phase==='ready'&&remote==='deployed')code='ready';
    else if(remote==='deployed'&&!hasOwnerKey)code='owner_recovery';
    else if(phase==='authorization_required'||phase==='authorize_browser')code='login';
    else if(phase==='choose_account')code='choose_account';
    else if(phase==='choose_subdomain')code='choose_subdomain';
    else if(phase==='choose_kv')code='choose_kv';
    else if(phase==='recovery_required')code='owner_recovery';
    else if(phase==='verification_unavailable'||remote==='unreachable')code='network';
    else if(remote==='partial')code='partial';
    else if(Object.hasOwn(running,phase))code='progress';
    else code='start';
  }
  const step=running[phase]||0;
  const helpUrl=code==='login'?'https://dash.cloudflare.com/oauth2/device':
    ['choose_subdomain','subdomain_permission','subdomain_conflict'].includes(code)?
      'https://dash.cloudflare.com/':
      ['api_permission','account_permission','deploy_failed','secret_failed','verify_failed','network','partial'].includes(code)?
        'https://dash.cloudflare.com/':null;
  return {code,step,totalSteps:6,helpUrl};
}
module.exports={cloudSetupGuidance};
