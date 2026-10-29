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
  assert.match(renderer,/element\.options\?\.length/);
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

test('owner card supports explicit copy, reveal and rotation while retaining Cloudflare guidance',()=>{
 const html=app('index.html'),main=app('main.cjs'),preload=app('preload.cjs'),renderer=app('renderer.js');
 assert.match(html,/data-external="cloudflare-workers"/);
 assert.ok(html.includes('id="cloud-owner-key-heading"'));
 assert.ok(html.includes('cloud-help-details'));
 assert.ok(html.indexOf('id="cloud-setup-heading"')<html.indexOf('id="cloud-owner-key-heading"'));
 for(const id of ['cloud-setup-copy-key','cloud-setup-reveal-key','cloud-setup-rotate-owner'])
   assert.ok(html.includes('id="'+id+'"'));
 assert.match(preload,/cloudBootstrapRotateOwner/);
 assert.match(preload,/cloudBootstrapCopyKey/);
 assert.match(preload,/cloudBootstrapRevealKey/);
 assert.match(main,/bind\('cloud-bootstrap-rotate-owner'/);
 assert.match(main,/bind\('cloud-bootstrap-copy-key'/);
 assert.match(main,/bind\('cloud-bootstrap-reveal-key'/);
 assert.match(renderer,/ownerKeyTimer=setTimeout\(hideOwnerKey,30000\)/);
});

test('compact cloud card uses Cloudflare account without owner approval',()=>{
 const html=app('index.html'),css=app('style.css'),main=app('main.cjs'),preload=app('preload.cjs');
 assert.equal((html.match(/id="cloud-setup-heading"/g)||[]).length,1);
 assert.equal((html.match(/id="cloud-owner-key-heading"/g)||[]).length,1);
 assert.match(html,/id="cloud-auto-pair-submit"/);
 assert.match(html,/id="cloud-manual-pairing" hidden/);
 assert.match(html,/<dialog id="cloud-pair-dialog"/);
 assert.match(html,/id="cloud-pair-trigger"/);
 assert.match(html,/id="cloud-manual-mode-toggle"/);
 assert.match(html,/id="cloud-current-device-id"/);
 assert.match(css,/#cloud-pair-trigger\[hidden\]\{display:none!important\}/);
 assert.match(css,/\.cloud-info>summary:focus-visible/);
 for(const message of ['使用同一个 Cloudflare 账户自动发现服务并连接各台设备。',
  '使用同一个 Cloudflare 账户连接设备，后续启动自动连接。',
  '展示已配对的电脑；离线设备也会保留。仅已配对设备可查看列表。'])
   assert.ok(html.includes(message.replace(/\.$/,'。')),'help text should be available on demand');
 assert.match(html,/class="cloud-info"/);
 assert.match(html,/class="cloud-pair-fields"/);
 assert.match(css,/\.cloud-pair-fields\{display:grid;grid-template-columns:minmax\(0,1fr\);width:100%/);
 assert.match(preload,/cloudRouterAutoPair:input=>call\('cloud-router-auto-pair',input\)/);
 assert.match(main,/bind\('cloud-router-auto-pair'/);
});

test('device disconnect controls and safe reinitialization are discoverable without extra explanatory text',()=>{
 const html=app('index.html'),css=app('style.css'),renderer=app('renderer.js'),
   preload=app('preload.cjs'),main=app('main.cjs');
 for(const id of ['cloud-device-disconnect','cloud-device-reconnect','cloud-setup-reinitialize'])
   assert.ok(html.includes('id="'+id+'"'));
 assert.match(css,/\.cloud-current-device-row\{font-size:1[45]px/);
 assert.match(css,/#cloud-device-disconnect\[hidden\]/);
 assert.match(preload,/cloudRouterDisconnect:\(\)=>call\('cloud-router-disconnect'\)/);
 assert.match(preload,/cloudRouterReconnect:\(\)=>call\('cloud-router-reconnect'\)/);
 assert.match(preload,/cloudBootstrapReinitialize:\(\)=>call\('cloud-bootstrap-reinitialize'\)/);
 assert.match(main,/bind\('cloud-router-disconnect'/);
 assert.match(main,/bind\('cloud-router-reconnect'/);
 assert.match(main,/bind\('cloud-bootstrap-reinitialize'/);
 assert.match(renderer,/cloudDeviceReconnect\.hidden/);
});

test('device card orders current device, roster header, and full roster without visible duplicate connection state',()=>{
 const html=app('index.html'),css=app('style.css');
 const current=html.indexOf('class="cloud-current-device-row"'),
   heading=html.indexOf('<h3>已配对设备</h3>'),
   list=html.indexOf('id="cloud-device-list"');
 assert.ok(current>0&&current<heading&&heading<list);
 const row=html.slice(current,heading);
 for(const id of ['cloud-current-device','cloud-device-disconnect','cloud-device-reconnect','cloud-pair-trigger'])
   assert.ok(row.includes('id="'+id+'"'),'current row action: '+id);
 assert.match(html,/id="cloud-pair-status" class="cloud-visually-hidden"/);
 assert.match(css,/\.cloud-device-online\{/);
 assert.match(css,/\.cloud-device-choice\.is-current\{font-weight:750/);
});

test('advanced cloud reset is explicit and inline roster/control placement remains compact',()=>{
 const html=app('index.html'),css=app('style.css'),
   main=app('main.cjs'),preload=app('preload.cjs'),renderer=app('renderer.js');
 for(const id of ['cloud-setup-reset-trigger','cloud-reset-dialog','cloud-reset-confirm',
   'cloud-reset-submit','cloud-reset-progress'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(html,/id="cloud-reset-dialog" class="cloud-pair-dialog"/);
 assert.match(html,/id="cloud-reset-submit"[^>]*disabled/);
 assert.match(html,/id="cloud-reset-confirm"/);
 assert.match(html,/id="cloud-setup-copy-key"/);
 assert.equal((html.match(/id="cloud-setup-copy-key"/g)||[]).length,1);
 assert.match(html,/class="cloud-owner-bar" hidden/);
 const heading=html.indexOf('<h3>已配对设备</h3>');
 const refresh=html.indexOf('id="cloud-devices-refresh"');
 assert.ok(refresh>heading&&refresh-heading<250,'refresh button belongs next to roster heading');
 assert.match(css,/\.cloud-refresh-inline/);
 assert.match(preload,/cloudBootstrapReset:input=>call\('cloud-bootstrap-reset',input\)/);
 assert.match(main,/bind\('cloud-bootstrap-reset'/);
 assert.match(renderer,/cloudResetConfirm\.value!=='RESET CHATTOHARNESS'/);
});
test('roster includes OS, Harness version, online badge and local-only marker',()=>{
 const r=app('renderer.js'),router=app('../cloud-router/src/worker.mjs'),
   svc=app('cloud-router-service.cjs');
 assert.match(r,/className='cloud-device-platform'/);
 assert.match(r,/className='cloud-device-harness-version'/);
 assert.match(r,/className='cloud-device-current-label'/);
 assert.match(r,/if\(isCurrent\)/);
 assert.match(router,/harness_version/);
 assert.match(svc,/harness_version:/);
});

test('local device badge is bold and cloud roster can show real OS product version',()=>{
 const css=app('style.css'),renderer=app('renderer.js');
 assert.match(css,/\.cloud-device-current-label\{font-size:13px;font-weight:800/);
 assert.match(renderer,/cloud\.local_os_version/);
 assert.match(renderer,/cloud\.local_harness_version/);
 assert.match(renderer,/device\.os_version/);
});

test('cloud retry remains available after detection failure without enabling unsafe overwrite',()=>{
 const source=app('renderer.js');
 const assignment=source.match(/cloudSetupStart\.disabled=([\s\S]*?);/)[1];
 const disabled=new Function('cloud','remote','return '+assignment);
 assert.equal(disabled({busy:false},'unreachable'),false);
 assert.equal(disabled({busy:true},'unreachable'),true);
 assert.equal(disabled({busy:false},'deployed'),true);
 assert.equal(disabled({busy:false,hasOwnerKey:false},'partial'),true);
 assert.match(source,/verification_unavailable'.*重试云端初始化/);
});
