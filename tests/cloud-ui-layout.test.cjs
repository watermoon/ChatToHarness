'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const app=p=>fs.readFileSync(path.join(__dirname,'../app',p),'utf8');
test('secure tunnel settings precede multi-instance remote service and multi-device pairing',()=>{
  const html=app('index.html');
  const headings=['id="connection-title"','id="cloud-setup-heading"','id="cloud-pair-heading"'];
  const positions=headings.map(name=>html.indexOf(name));
  assert.ok(positions.every(v=>v>=0), 'all three connection sections exist');
  assert.ok(positions[0]<positions[1]&&positions[1]<positions[2],
    'secure tunnel -> cloud services -> device pairing');
});
test('renderer automatic cloud status refresh is wired through a real preload IPC method',()=>{
  const preload=app('preload.cjs'),main=app('main.cjs'),renderer=app('renderer.js');
  assert.match(renderer,/void discoverCloud\(\{\}\)/);
  assert.match(renderer,/api\.cloudBootstrapDiscover\(/);
  assert.match(preload,/cloudBootstrapDiscover:input=>call\('cloud-bootstrap-discover',input\)/);
  assert.match(main,/bind\('cloud-bootstrap-discover'/);
  assert.match(renderer,/cloud\.remote/);
  assert.match(renderer,/cloudSetupStart\.disabled/);
  assert.match(renderer,/element\.options\[0\]\.textContent=t\(defaultLabel\)/);
});

test('initial current-device placeholder has English and Japanese translations',()=>{
  const html=app('index.html'),messages=require('../app/locales.js');
  const placeholder='当前设备：尚未识别';
  assert.ok(html.includes(placeholder));
  assert.ok(messages[placeholder]);
  assert.deepEqual(messages[placeholder],
    ['Current device: not identified','現在のデバイス：未識別']);
});

test('pair-current-device validates URL and pairing code before IPC; cloud discovery provides a default',()=>{
 const renderer=app('renderer.js'),bootstrap=app('cloud-bootstrap.cjs');
 const messages=require('../app/locales.js');
 assert.match(bootstrap,/this\.remote==='deployed'&&this\.discoveredSubdomain/);
 assert.match(renderer,/cloud\.remote==='deployed'&&cloud\.mcp_url/);
 assert.match(renderer,/!cloudPairUrl\.dataset\.manuallyEdited/);
 assert.match(renderer,/if\(!input\.mcpUrl\)/);
 assert.match(renderer,/const url=new URL\(input\.mcpUrl\)/);
 assert.match(renderer,/if\(!\/\^\[A-Za-z0-9_-\]\{43\}\$\/\.test\(input\.pairingCode\)\)/);
 for(const value of ['请先填写统一 MCP 地址','MCP 地址无效，请填写完整的 https://…/mcp 地址',
  '配对码格式不正确，请使用 43 位一次性配对码'])
  assert.ok(Array.isArray(messages[value])&&messages[value].length===2,
    'missing English/Japanese translation: '+value);
});
