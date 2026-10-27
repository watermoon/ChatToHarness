'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {resolve}=require('node:path');
const {pathToFileURL}=require('node:url');
const policy=()=>import(pathToFileURL(resolve(__dirname,'../cloud-router/src/oauth-policy.mjs')).href);
test('OAuth access is bound to a verified Cloudflare Access subject and email allowlist',async()=>{
 const {authorizedIdentity}=await policy();
 const env={ACCESS_ALLOWED_EMAILS:'owner@example.com,other@example.org'};
 const valid={props:{accessEmail:'owner@example.com'},auth:{userId:'cloudflare-access:owner@example.com',scope:['mcp:read']}};
 assert.equal(authorizedIdentity(valid,env),true);
 assert.equal(authorizedIdentity({...valid,auth:{userId:'cloudflare-access:other@example.org'}},env),false);
 assert.equal(authorizedIdentity({...valid,props:{accessEmail:'bad@example.com'}},env),false);
 assert.equal(authorizedIdentity(valid,{ACCESS_ALLOWED_EMAILS:''}),false);
 assert.equal(authorizedIdentity(valid,{ACCESS_ALLOWED_EMAILS:'other@example.org'}),false);
 assert.equal(authorizedIdentity({auth:valid.auth},env),false);
});
test('email allowlist normalizes case, rejects invalid identity or matching suffix',async()=>{
 const {allowlistedAccessEmail,normalizedAccessEmail}=await policy();
 const env={ACCESS_ALLOWED_EMAILS:'Owner@Example.com, second@example.org'};
 assert.equal(allowlistedAccessEmail(env,'OWNER@example.com'),true);
 assert.equal(allowlistedAccessEmail(env,'second@example.org'),true);
 for(const value of ['owner@example.com.evil','another@example.com',' owner@example.com','bad',null,undefined,''])
  assert.equal(allowlistedAccessEmail(env,value),false,String(value));
 assert.equal(normalizedAccessEmail('Owner@Example.com'),'owner@example.com');
});
test('unauthenticated and forged CF Access headers cannot grant access',async()=>{
 const {authenticatedAccessUser}=await policy();
 const env={ACCESS_ALLOWED_EMAILS:'owner@example.com'};
 assert.equal(await authenticatedAccessUser(undefined,env),null);
 assert.equal(await authenticatedAccessUser({headers:{'cf-access-authenticated-user-email':'owner@example.com'}},env),null);
 assert.equal(await authenticatedAccessUser({getIdentity:async()=>{throw Error('invalid');}},env),null);
 assert.equal(await authenticatedAccessUser({getIdentity:async()=>({email:'attacker@example.com'})},env),null);
 assert.deepEqual(await authenticatedAccessUser({getIdentity:async()=>({email:'OWNER@example.com'})},env),
  {email:'owner@example.com',userId:'cloudflare-access:owner@example.com'});
});
test('OAuth canonical URLs allow loopback testing but refuse public cleartext and audience mismatch',async()=>{
 const {canonical}=await policy();
 assert.equal(canonical('https://mcp.example.com/mcp','/mcp'),'https://mcp.example.com/mcp');
 assert.equal(canonical('https://auth.example.com/','/'),'https://auth.example.com');
 assert.equal(canonical('http://127.0.0.1:8842/mcp','/mcp'),'http://127.0.0.1:8842/mcp');
 for(const u of ['http://mcp.example.com/mcp','https://x:y@mcp.example.com/mcp',
  'https://mcp.example.com/mcp?key=x','https://mcp.example.com/mcp#x','https://mcp.example.com/other'])
  assert.throws(()=>canonical(u,'/mcp'),/OAUTH_CONFIG_REQUIRED/);
});
test('consent page HTML escape prevents injection in untrusted client metadata',async()=>{
 const {htmlEscape}=await policy();
 assert.equal(htmlEscape('<img src=x onerror="a()">'),'&#60;img src=x onerror=&#34;a()&#34;&#62;');
});
