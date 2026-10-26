'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {resolve} = require('node:path');
const {pathToFileURL} = require('node:url');
const policy = () => import(pathToFileURL(resolve(__dirname,'../cloud-router/src/oauth-policy.mjs')).href);
test('OAuth resource requires both a matching allowlisted GitHub account and authenticated subject',async()=>{
  const {authorizedIdentity} = await policy();
  const env={GITHUB_ALLOWED_USER_IDS:'1234,5678'};
  const valid={props:{githubUserId:'1234'},auth:{userId:'github:1234',scope:['mcp:read']}};
  assert.equal(authorizedIdentity(valid,env),true);
  assert.equal(authorizedIdentity({...valid,auth:{userId:'github:5678'}},env),false);
  assert.equal(authorizedIdentity({...valid,props:{githubUserId:'1235'}},env),false);
  assert.equal(authorizedIdentity(valid,{GITHUB_ALLOWED_USER_IDS:''}),false);
  assert.equal(authorizedIdentity(valid,{GITHUB_ALLOWED_USER_IDS:'9999'}),false);
  assert.equal(authorizedIdentity({auth:valid.auth},env),false);
});
test('OAuth ID allowlist is exact and fails closed on malformed identity',async()=>{
 const {allowlistedGithubId}=await policy();
 const env={GITHUB_ALLOWED_USER_IDS:'123, 456'};
 for(const x of ['1','12','1234','0123','evil','',null,undefined])assert.equal(allowlistedGithubId(env,x),false);
 assert.equal(allowlistedGithubId(env,'123'),true);
 assert.equal(allowlistedGithubId(env,'456'),true);
});
test('OAuth URL validator rejects non-HTTPS, userinfo, query, fragments and wrong audiences',async()=>{
  const {canonical}=await policy();
  assert.equal(canonical('https://mcp.example.com/mcp','/mcp'),'https://mcp.example.com/mcp');
  assert.equal(canonical('https://auth.example.com/','/'),'https://auth.example.com');
  for(const url of ['http://mcp.example.com/mcp','https://a:b@mcp.example.com/mcp',
    'https://mcp.example.com/mcp?token=x','https://mcp.example.com/mcp#fragment',
    'https://mcp.example.com/other']){
    assert.throws(()=>canonical(url,'/mcp'),/OAUTH_CONFIG_REQUIRED/);
  }
  assert.throws(()=>canonical(undefined,'/mcp'),/OAUTH_CONFIG_REQUIRED/);
});
test('consent page escape utility never interpolates untrusted HTML',async()=>{
 const {htmlEscape}=await policy();
 assert.equal(htmlEscape('<img src=x onerror="a()">'),'&#60;img src=x onerror=&#34;a()&#34;&#62;');
});
