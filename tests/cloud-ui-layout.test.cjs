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
