'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {createHash} = require('node:crypto');
const {HarnessServices} = require('../app/harness-services.cjs');
const {McpManager} = require('../app/mcp-manager.cjs');
const {createDeviceCatalog} = require('../app/cloud-router-catalog.cjs');
const {connectAgent} = require('../app/cloud-router-agent.cjs');

const workerUrl = pathToFileURL(path.resolve(__dirname, '../cloud-router/src/worker.mjs')).href;
const BEARER = 'integration-test-bearer-0123456789abcdef';
const DEVICE_ID = 'rocket';

async function waitUntil(predicate, timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('LOOPBACK_AGENT_TIMEOUT');
}

test('local Worker -> device Agent -> MCP manager invokes a catalogued hardware tool end-to-end', async t => {
  const {DeviceHub, authorizedWorker: worker} = await import(workerUrl);
  const sockets = [];
  const storage = {
    items: new Map(),
    get(key) { return Promise.resolve(this.items.get(key)); },
    put(key, value) { this.items.set(key, value); return Promise.resolve(); },
    delete(key) { this.items.delete(key); return Promise.resolve(); },
    list({prefix, limit}) {
      return Promise.resolve(new Map([...this.items].filter(([key]) => key.startsWith(prefix)).slice(0, limit)));
    },
    transaction(fn) { return fn(this); }
  };
  const ctx = {
    storage,
    getWebSockets: () => sockets,
    acceptWebSocket: socket => { if (!sockets.includes(socket)) sockets.push(socket); }
  };
  const env = {
    MCP_BEARER_TOKEN: BEARER,
    ALLOWED_TOOLS: 'list_usb_devices,list_pnp_devices,list_serial_ports,get_pnp_device_details'
  };
  const hub = new DeviceHub(ctx, env);
  env.DEVICE_HUB = {
    idFromName: name => name,
    get: () => ({fetch: request => hub.fetch(typeof request === 'string' ? new Request(request) : request)})
  };

  const pairingResponse = await hub.fetch(new Request('https://hub.internal/pair-create', {method: 'POST'}));
  const {pairing_code: pairingCode} = await pairingResponse.json();
  const redeemResponse = await hub.fetch(new Request('https://hub.internal/pair-redeem', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({pairing_code: pairingCode, device_id: DEVICE_ID, name: 'Rocket', platform: 'win32'})
  }));
  const {device_token: deviceToken} = await redeemResponse.json();

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'unifyharness-loopback-'));
  const calls = [];
  const hardwareInspector = {
    async call(name, args) {
      calls.push({name, args});
      if (name !== 'list_usb_devices') throw new Error('UNEXPECTED_HARDWARE_TOOL');
      return {
        count: 1,
        truncated: false,
        devices: [{
          name: 'SF32 Mock USB Bridge',
          instance_id: 'USB\\VID_1234&PID_ABCD\\MOCK',
          vendor_id: '1234',
          product_id: 'ABCD',
          manufacturer: 'Integration Fixture',
          status: 'OK'
        }]
      };
    }
  };
  const services = new HarnessServices({home, hardwareInspector});
  const manager = new McpManager({services});
  manager.running = true;
  let catalogOverride = null;
  const localCatalog = () => catalogOverride || createDeviceCatalog(manager);
  const socketErrors = [];

  class LoopbackWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 1;
      this.listeners = new Map();
      const client = this;
      this.serverSocket = {
        readyState: 1,
        serializeAttachment(value) { this.attachment = value; },
        deserializeAttachment() { return this.attachment; },
        send(data) { client.dispatch('message', {data}); },
        close(code) { this.readyState = 3; client.readyState = 3; client.dispatch('close', {code}); }
      };
      sockets.push(this.serverSocket);
      this.send = data => {
        Promise.resolve(hub.webSocketMessage(this.serverSocket, data)).catch(error => socketErrors.push(error));
      };
      queueMicrotask(() => this.dispatch('open', {}));
    }
    addEventListener(name, callback) {
      const handlers = this.listeners.get(name) || [];
      handlers.push(callback);
      this.listeners.set(name, handlers);
    }
    dispatch(name, event) {
      for (const callback of this.listeners.get(name) || []) callback(event);
    }
    close() {
      this.readyState = 3;
      this.serverSocket.readyState = 3;
      this.dispatch('close', {});
    }
  }

  const agent = connectAgent({
    url: 'wss://loopback.invalid/agent',
    deviceId: DEVICE_ID,
    name: 'Rocket',
    platform: 'win32',
    token: deviceToken,
    execute: (name, args) => manager.call(name, args),
    catalogProvider: localCatalog,
    WebSocketImpl: LoopbackWebSocket,
    reconnectMs: 10000
  });
  t.after(() => {
    agent.close();
    manager.running = false;
    services.contexts?.dispose();
    services.inspector?.dispose();
    fs.rmSync(home, {recursive: true, force: true});
  });

  await waitUntil(() => agent.connected);
  const catalog = localCatalog();
  assert.ok(catalog.tools.some(tool => tool.name === 'list_usb_devices'));
  assert.equal((await storage.get('catalog:' + DEVICE_ID)).version, catalog.version);

  async function callRouterTool(name, args) {
    const response = await worker.fetch(new Request('https://router.test/mcp', {
      method: 'POST',
      headers: {'authorization': 'Bearer ' + BEARER, 'content-type': 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name, arguments: args}})
    }), env);
    return {status: response.status, body: await response.json()};
  }

  const listed = await callRouterTool('list_device_tools', {device_id: DEVICE_ID, limit: 50});
  assert.equal(listed.status, 200);
  assert.ok(listed.body.result.structuredContent.tools.some(tool => tool.name === 'list_usb_devices'));

  const invoked = await callRouterTool('call_device_tool', {
    device_id: DEVICE_ID,
    tool_name: 'list_usb_devices',
    catalog_version: catalog.version,
    arguments: {limit: 1}
  });
  assert.equal(invoked.status, 200);
  const envelope = invoked.body.result.structuredContent || JSON.parse(invoked.body.result.content[0].text);
  const localResult = envelope.result || envelope;
  const returned = localResult.structuredContent || localResult;
  assert.equal(returned.count, 1);
  assert.equal(returned.devices[0].name, 'SF32 Mock USB Bridge');
  assert.deepEqual(calls, [{name: 'list_usb_devices', args: {limit: 1}}]);

  const stale = await callRouterTool('call_device_tool', {
    device_id: DEVICE_ID,
    tool_name: 'list_usb_devices',
    catalog_version: '0'.repeat(64),
    arguments: {limit: 1}
  });
  assert.equal(JSON.parse(stale.body.result.content[0].text).code, 'CATALOG_VERSION_STALE');
  assert.equal(calls.length, 1);
  // Change an unrelated tool while the Worker still advertises the old version.
  const mockTool = catalog.tools.find(x => x.name === 'list_usb_devices');
  assert.ok(mockTool);
  const newerTools = [...catalog.tools, {...mockTool,name:'zz_safe_mock'}].sort((a,b)=>a.name.localeCompare(b.name));
  catalogOverride = {schema_version:1,tools:newerTools,
    version:createHash('sha256').update(JSON.stringify({schema_version:1,tools:newerTools})).digest('hex')};
  const recovered=await callRouterTool('call_device_tool',{
    device_id:DEVICE_ID,tool_name:'list_usb_devices',catalog_version:catalog.version,arguments:{limit:1}
  });
  assert.equal(recovered.status,200);
  const recoveryEnvelope=recovered.body.result.structuredContent||JSON.parse(recovered.body.result.content[0].text);
  assert.equal((recoveryEnvelope.result||recoveryEnvelope).structuredContent?.count,1);
  assert.equal(calls.length,2);
  const refreshed=await callRouterTool('list_device_tools',{device_id:DEVICE_ID,limit:50});
  assert.equal(refreshed.body.result.structuredContent.catalog_version,catalogOverride.version);
  // A changed tool definition is not eligible for automatic retry.
  const beforeChange=catalogOverride.version;
  const changedTools=catalogOverride.tools.map(x=>x.name==='list_usb_devices'
    ? {...x,description:'Changed USB inventory contract'} : x);
  catalogOverride={schema_version:1,tools:changedTools,
    version:createHash('sha256').update(JSON.stringify({schema_version:1,tools:changedTools})).digest('hex')};
  const refused=await callRouterTool('call_device_tool',{
    device_id:DEVICE_ID,tool_name:'list_usb_devices',catalog_version:beforeChange,arguments:{limit:1}
  });
  assert.equal(JSON.parse(refused.body.result.content[0].text).code,'CATALOG_VERSION_STALE');
  assert.equal(calls.length,2,'changed tool definition was not retried');
  const latest=await callRouterTool('list_device_tools',{device_id:DEVICE_ID,limit:50});
  assert.equal(latest.body.result.structuredContent.catalog_version,catalogOverride.version);
  assert.deepEqual(socketErrors, []);
});
