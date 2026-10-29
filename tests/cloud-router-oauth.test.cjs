'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {resolve}=require('node:path');
const {pathToFileURL}=require('node:url');
const policy=()=>import(pathToFileURL(resolve(__dirname,'../cloud-router/src/oauth-policy.mjs')).href);
const SECRET='0123456789abcdef'.repeat(4);
const env={OWNER_AUTH_EPOCH:'v1'};
test('resource requires the verified owner subject, consent properties and current authorization epoch',async()=>{
 const {authorizedIdentity,ownerSubject}=await policy();
 const valid={props:{ownerAuthorized:true,ownerEpoch:'v1'},auth:{userId:ownerSubject(env),scope:['mcp:read']}};
 assert.equal(ownerSubject(env),'cth-owner-v1');
 assert.doesNotMatch(ownerSubject(env),/:/);
 assert.equal(authorizedIdentity(valid,env),true);
 assert.equal(authorizedIdentity({...valid,auth:{userId:'github:123'}},env),false);
 assert.equal(authorizedIdentity({...valid,auth:{userId:'cloudflare-access:owner@example.com'}},env),false);
 assert.equal(authorizedIdentity({...valid,props:{ownerAuthorized:'true',ownerEpoch:'v1'}},env),false);
 assert.equal(authorizedIdentity({...valid,props:{ownerAuthorized:true}},env),false);
 assert.equal(authorizedIdentity(valid,{OWNER_AUTH_EPOCH:'v2'}),false,'rotated epoch revokes old user');
 assert.equal(authorizedIdentity(valid,{}),false);
 assert.equal(authorizedIdentity({},env),false);
 assert.equal(ownerSubject({OWNER_AUTH_EPOCH:'../x'}),null);
});
test('owner secret must be a 256-bit random hexadecimal value set in the auth Worker Secret',async()=>{
 const {ownerSecretConfigured,verifyOwnerSecret}=await policy();
 assert.equal(ownerSecretConfigured({}),false);
 assert.equal(ownerSecretConfigured({OWNER_AUTH_KEY:'password'}),false);
 assert.equal(ownerSecretConfigured({OWNER_AUTH_KEY:'f'.repeat(63)}),false);
 assert.equal(ownerSecretConfigured({OWNER_AUTH_KEY:SECRET}),true);
 for(const bad of ['','password',null,undefined,'f'.repeat(64),'X'+SECRET.slice(1),'0'.repeat(63),SECRET+'0'])
   assert.equal(await verifyOwnerSecret(bad,{OWNER_AUTH_KEY:SECRET}),false);
 assert.equal(await verifyOwnerSecret(SECRET,{}),false);
 assert.equal(await verifyOwnerSecret(SECRET,{OWNER_AUTH_KEY:SECRET}),true);
});
test('forged Cloudflare Access identity, headers or guessed subject cannot grant access',async()=>{
 const {authorizedIdentity}=await policy();
 for(const forged of [
   {headers:{'cf-access-authenticated-user-email':'owner@example.com'}},
   {props:{accessEmail:'owner@example.com'},auth:{userId:'cloudflare-access:owner@example.com'}},
   {props:{ownerAuthorized:true},auth:{userId:'cth-owner-v1'}},
   {props:{ownerAuthorized:true,ownerEpoch:'v1'},auth:{userId:'cth-owner-v2'}},
 ])assert.equal(authorizedIdentity(forged,env),false);
});
test('OAuth canonical URLs allow loopback tests but refuse public cleartext and wrong audiences',async()=>{
 const {canonical}=await policy();
 assert.equal(canonical('https://mcp.example.com/mcp','/mcp'),'https://mcp.example.com/mcp');
 assert.equal(canonical('https://auth.example.com/','/'),'https://auth.example.com');
 assert.equal(canonical('http://127.0.0.1:8842/mcp','/mcp'),'http://127.0.0.1:8842/mcp');
 for(const u of ['http://mcp.example.com/mcp','https://x:y@mcp.example.com/mcp',
  'https://mcp.example.com/mcp?key=x','https://mcp.example.com/mcp#x','https://mcp.example.com/other'])
   assert.throws(()=>canonical(u,'/mcp'),/OAUTH_CONFIG_REQUIRED/);
});
test('consent HTML escaping prevents untrusted client metadata injection',async()=>{
 const {htmlEscape}=await policy();
 assert.equal(htmlEscape('<img src=x onerror="a()">'),'&#60;img src=x onerror=&#34;a()&#34;&#62;');
});

test('OAuth consent CSP permits Chrome to follow POST 302 to ChatGPT without opening arbitrary form targets',async()=>{
 const {CONSENT_CSP}=await policy();
 assert.match(CONSENT_CSP,/form-action 'self' https:\/\/chatgpt\.com(?:;|$)/);
 assert.match(CONSENT_CSP,/default-src 'none'/);
 assert.match(CONSENT_CSP,/base-uri 'none'/);
 assert.match(CONSENT_CSP,/frame-ancestors 'none'/);
 assert.doesNotMatch(CONSENT_CSP,/form-action[^;]*\*/);
 assert.doesNotMatch(CONSENT_CSP,/unsafe-inline|https:\/\/\*|http:\/\//);
 const authSource=require('node:fs').readFileSync(resolve(__dirname,'../cloud-router/auth-server/index.mjs'),'utf8');
 assert.match(authSource,/consent\.headers\.set\('Content-Security-Policy',CONSENT_CSP\)/);
});
