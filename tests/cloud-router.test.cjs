'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {resolve} = require('node:path');
const {pathToFileURL} = require('node:url');
const workerUrl = pathToFileURL(resolve(__dirname, '../cloud-router/src/worker.mjs')).href;
const TOKEN = 'abcdefghij1234567890abcdefghijklmnop';
const DEVICE_TOKEN = 'device-abcdefghij1234567890abcdefghij';
class Socket {
  constructor() { this.readyState = 1; this.messages = []; }
  serializeAttachment(v) { this.attachment = v; }
  deserializeAttachment() { return this.attachment; }
  send(s) { this.messages.push(JSON.parse(s)); }
  close(code) { this.readyState = 3; this.closeCode = code; }
}
async function fixture() {
  const {DeviceHub, default: worker} = await import(workerUrl);
  const sockets = [];
  const env = {DEVICE_TOKENS: JSON.stringify({moon: DEVICE_TOKEN, mac: DEVICE_TOKEN}),
    MCP_BEARER_TOKEN: TOKEN, ALLOWED_TOOLS: 'get_harness_status,git_status'};
  const hub = new DeviceHub({getWebSockets: () => sockets, acceptWebSocket: ws => sockets.push(ws)}, env);
  env.DEVICE_HUB = {idFromName: n => n, get: () => ({fetch: req => hub.fetch(typeof req === 'string' ? new Request(req) : req)})};
  const register = async (device_id, name = device_id, token = DEVICE_TOKEN) => {
    const ws = new Socket(); sockets.push(ws);
    await hub.webSocketMessage(ws, JSON.stringify({type: 'register', device_id, name, platform: 'darwin', token}));
    return ws;
  };
  const mcp = async (method, params, bearer = TOKEN) => {
    const req = new Request('https://example.test/mcp', {method: 'POST',
      headers: {'authorization': 'Bearer ' + bearer, 'content-type': 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})});
    const res = await worker.fetch(req, env);
    return {status: res.status, body: await res.json()};
  };
  return {hub, env, worker, register, mcp};
}
test('MCP refuses unauthenticated requests and exposes only router tools', async () => {
  const f = await fixture();
  assert.equal((await f.mcp('tools/list', {}, 'incorrect')).status, 401);
  const init = await f.mcp('initialize', {});
  assert.equal(init.body.result.serverInfo.name, 'chattoharness-cloud-router');
  assert.deepEqual((await f.mcp('tools/list', {})).body.result.tools.map(x => x.name),
    ['list_devices','call_device_tool']);
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
  await new Promise(resolve => setTimeout(resolve, 0));
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
  await new Promise(resolve => setTimeout(resolve, 0));
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
