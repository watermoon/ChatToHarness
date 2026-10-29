'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {resolve} = require('node:path');
const {pathToFileURL} = require('node:url');
const workerUrl = pathToFileURL(resolve(__dirname, '../cloud-router/src/worker.mjs')).href;
const TOKEN = 'abcdefghij1234567890abcdefghijklmnop';
class Socket {
  constructor() { this.readyState = 1; this.messages = []; }
  serializeAttachment(v) { this.attachment = v; }
  deserializeAttachment() { return this.attachment; }
  send(s) { this.messages.push(JSON.parse(s)); }
  close(code) { this.readyState = 3; this.closeCode = code; }
}
async function fixture() {
  const {DeviceHub, authorizedWorker: worker} = await import(workerUrl);
  const sockets = [];
  const storage={items:new Map(),get(k){return Promise.resolve(this.items.get(k));},
    put(k,v){this.items.set(k,v);return Promise.resolve();},delete(k){this.items.delete(k);return Promise.resolve();},
    list({prefix,limit}){return Promise.resolve(new Map([...this.items].filter(([k])=>k.startsWith(prefix)).slice(0,limit)));},
    transaction(fn){return fn(this);}};
  const ctx={storage,getWebSockets: () => sockets,acceptWebSocket: ws => sockets.push(ws)};
  const env = {MCP_BEARER_TOKEN: TOKEN, ALLOWED_TOOLS: 'get_harness_status,git_status'};
  const hub = new DeviceHub(ctx,env), tokens=new Map();
  env.DEVICE_HUB = {idFromName: n => n, get: () => ({fetch: req => hub.fetch(typeof req === 'string' ? new Request(req) : req)})};
  const register = async (device_id, name = device_id, invalidToken = null, metadata = {}) => {
    if(!tokens.has(device_id)){
      const code=await hub.fetch(new Request('https://hub.internal/pair-create',{method:'POST'}));
      const {pairing_code}=await code.json();
      const paired=await hub.fetch(new Request('https://hub.internal/pair-redeem',{method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({pairing_code,device_id,name,platform:'darwin'})}));
      tokens.set(device_id,(await paired.json()).device_token);
    }
    const ws = new Socket(); sockets.push(ws);
    await hub.webSocketMessage(ws, JSON.stringify({type: 'register', device_id, name, platform: 'darwin',
      ...metadata,
      token: invalidToken===null?tokens.get(device_id):invalidToken}));
    return ws;
  };
  const mcp = async (method, params, bearer = TOKEN) => {
    const req = new Request('https://example.test/mcp', {method: 'POST',
      headers: {'authorization': 'Bearer ' + bearer, 'content-type': 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})});
    const res = await worker.fetch(req, env);
    return {status: res.status, body: await res.json()};
  };
  return {hub, env, worker, register, mcp, tokens};
}
test('internal MCP dispatcher exposes only router tools (external auth is mandatory)', async () => {
  const f = await fixture();
  const init = await f.mcp('initialize', {});
  assert.equal(init.body.result.serverInfo.name, 'chattoharness-cloud-router');
  assert.deepEqual((await f.mcp('tools/list', {})).body.result.tools.map(x => x.name),
    ['create_pairing_code','list_devices','call_device_tool']);
});
test('devices are independently authenticated and listed', async () => {
  const f = await fixture();
  const bad = await f.register('moon', 'MOON', 'wrong');
  assert.equal(bad.closeCode, 1008);
  const moon = await f.register('moon', 'MOON');
  await f.register('mac', 'MacBook');
  assert.equal(moon.messages[0].type, 'registered');
  const devices = JSON.parse((await f.mcp('tools/call',{name: 'list_devices'})).body.result.content[0].text);
  assert.deepEqual(devices.map(x => x.device_id), ['mac','moon']);
});
test('one MCP endpoint dispatches to the explicitly requested device only', async () => {
  const f = await fixture();
  const moon = await f.register('moon');
  const mac = await f.register('mac');
  const call = f.mcp('tools/call', {name: 'call_device_tool', arguments: {
    device_id: 'mac', tool_name: 'get_harness_status', arguments: {}}});
  for (let i = 0; i < 200 && mac.messages.length < 2; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(moon.messages.length, 1); // registration only
  assert.equal(mac.messages.length, 2);
  const id = mac.messages[1].request_id;
  await f.hub.webSocketMessage(mac, JSON.stringify({type: 'result', request_id: id, result: {device: 'mac'}}));
  const out = await call;
  assert.deepEqual(JSON.parse(out.body.result.content[0].text), {device: 'mac'});
});
test('unknown/offline target cannot fail over, and tools require cloud allowlist', async () => {
  const f = await fixture();
  await f.register('moon');
  async function call(device_id, tool_name) {
    const v = await f.mcp('tools/call', {name: 'call_device_tool',
      arguments: {device_id, tool_name, arguments: {}}});
    return JSON.parse(v.body.result.content[0].text).code;
  }
  assert.equal(await call('mac', 'get_harness_status'), 'DEVICE_OFFLINE');
  assert.equal(await call('moon', 'start_process'), 'TOOL_DENIED');
  assert.equal(await call('', 'get_harness_status'), 'BAD_REQUEST');
});
test('disconnect reports unknown execution, never replays on other device', async () => {
  const f = await fixture();
  const moon = await f.register('moon');
  const mac = await f.register('mac');
  const call = f.mcp('tools/call', {name: 'call_device_tool', arguments: {
    device_id: 'moon', tool_name: 'get_harness_status', arguments: {}}});
  for (let i = 0; i < 200 && moon.messages.length < 2; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(moon.messages.length, 2, 'dispatch was sent before disconnect');
  f.hub.webSocketClose(moon);
  const response = await call;
  assert.equal(JSON.parse(response.body.result.content[0].text).code, 'EXECUTION_UNKNOWN');
  assert.equal(mac.messages.length, 1);
});
test('duplicate registration replaces only matching device connection', async () => {
  const f = await fixture();
  const old = await f.register('moon');
  const replacement = await f.register('moon');
  assert.equal(old.readyState, 3);
  assert.equal(replacement.readyState, 1);
  const listed = JSON.parse((await f.mcp('tools/call', {name: 'list_devices'})).body.result.content[0].text);
  assert.equal(listed.length, 1);
});
test('explicit transport failures and malformed arguments do not execute', async () => {
  const f = await fixture();
  const ws = await f.register('moon');
  const bad = await f.mcp('tools/call', {name: 'call_device_tool',
    arguments: {device_id: 'moon', tool_name: 'get_harness_status', arguments: []}});
  assert.equal(bad.body.result.isError, true);
  assert.equal(ws.messages.length, 1);
});


test('paired device roster includes offline entries but requires this device bearer credential',async()=>{
  const f=await fixture();
  const moon=await f.register('moon','MOON');
  await f.register('mac','MacBook');
  f.hub.webSocketClose(moon);
  moon.close(1000);
  const roster=async(id,token)=>f.hub.fetch(new Request('https://hub.internal/paired-devices',{
    headers:{'x-device-id':id,'authorization':'Bearer '+token}
  }));
  const unauthorized=await roster('moon','wrong');
  assert.equal(unauthorized.status,401);
  assert.equal((await unauthorized.json()).error,'UNAUTHORIZED_DEVICE');
  assert.equal((await roster('unknown',f.tokens.get('mac'))).status,401);
  const ok=await roster('mac',f.tokens.get('mac'));
  assert.equal(ok.status,200);
  const devices=await ok.json();
  assert.deepEqual(devices.map(x=>[x.device_id,x.online]),[['mac',true],['moon',false]]);
  assert.equal(devices.some(x=>'hash' in x||'device_token' in x),false);
  assert.ok(devices.every(x=>Number.isFinite(x.paired_at)));
});

test('registered OS product and Harness versions appear in paired roster; old peers remain compatible',async()=>{
 const f=await fixture();
 await f.register('mac','MacBook',undefined,{harness_version:'0.8.1',os_version:'macOS 14.6.1'});
 await f.register('moon','MOON');
 const res=await f.hub.fetch(new Request('https://hub.internal/paired-devices',{
   headers:{'x-device-id':'mac','authorization':'Bearer '+f.tokens.get('mac')}
 }));
 assert.equal(res.status,200);
 const devices=await res.json();
 const current=devices.find(x=>x.device_id==='mac');
 const older=devices.find(x=>x.device_id==='moon');
 assert.equal(current.harness_version,'0.8.1');
 assert.equal(current.os_version,'macOS 14.6.1');
 assert.equal(older.harness_version,'');
 assert.equal(older.os_version,'');
});
