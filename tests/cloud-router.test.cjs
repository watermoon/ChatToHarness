'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {resolve} = require('node:path');
const {pathToFileURL} = require('node:url');
const workerUrl = pathToFileURL(resolve(__dirname, '../cloud-router/src/worker.mjs')).href;
const TOKEN = 'abcdefghij1234567890abcdefghijklmnop';
function catalog(names) {
  const tools=names.map(name=>({
    name,description:`Read ${name}`,
    inputSchema:{type:'object',properties:{},additionalProperties:false},
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}
  }));
  const version=createHash('sha256').update(JSON.stringify({schema_version:1,tools})).digest('hex');
  return {schema_version:1,version,tools};
}
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
  const env = {MCP_BEARER_TOKEN: TOKEN, ALLOWED_TOOLS: 'get_harness_status,get_tool_result_page,get_tool_result_file,list_usb_devices,list_pnp_devices,list_serial_ports,get_pnp_device_details'};
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
    ['create_pairing_code','list_devices','inspect_client_context','get_tool_result_page','get_tool_result_file','list_device_tools','get_operation_status','call_device_tool']);
});
test('reconnect uses catalog version without rewriting durable catalog, and requests mismatched snapshot',async()=>{
 const f=await fixture(),firstCatalog=catalog(['read_inventory']);
 const first=await f.register('rocket','Rocket',null,{catalog:firstCatalog});
 assert.equal(first.messages[0].type,'registered');
 const original=await f.hub.ctx.storage.get('catalog:rocket');
 const second=await f.register('rocket','Rocket',null,{catalog_version:firstCatalog.version});
 assert.equal(second.messages[0].type,'registered');
 assert.equal(first.readyState,3);
 assert.equal(await f.hub.ctx.storage.get('catalog:rocket'),original,'reuse snapshot object');
 const third=await f.register('rocket','Rocket',null,{catalog_version:'b'.repeat(64)});
 assert.deepEqual(third.messages[0],{type:'catalog_required',catalog_version:firstCatalog.version});
 assert.equal(second.readyState,1,'failed hash must not replace production');
 assert.equal(third.deserializeAttachment(),undefined);
 const updated=catalog(['read_inventory','second_tool']);
 await f.hub.webSocketMessage(third,JSON.stringify({type:'register',device_id:'rocket',
   name:'Rocket',platform:'darwin',token:f.tokens.get('rocket'),catalog:updated}));
 assert.equal(third.messages.at(-1).catalog_version,updated.version);
 assert.equal(second.readyState,3);
 const stored=await f.hub.ctx.storage.get('catalog:rocket');
 assert.equal(stored.version,updated.version);
});
test('offline read-only invocation waits briefly for reconnect but mutations fail immediately',async()=>{
 const f=await fixture(),c=catalog(['read_inventory']);
 const first=await f.register('rocket','Rocket',null,{catalog:c});
 f.hub.offlineWaitMs=80;
 first.close();
 const pending=f.mcp('tools/call',{name:'call_device_tool',arguments:{
   device_id:'rocket',tool_name:'read_inventory',catalog_version:c.version,arguments:{}
 }});
 for(let n=0;n<80&&!f.hub.onlineWaiters.get('rocket')?.size;n++)
   await new Promise(r=>setTimeout(r,2));
 assert.equal(f.hub.onlineWaiters.get('rocket')?.size,1);
 const second=await f.register('rocket','Rocket',null,{catalog_version:c.version});
 for(let n=0;n<50&&!second.messages.some(x=>x.type==='invoke');n++)
   await new Promise(r=>setTimeout(r,2));
 const call=second.messages.find(x=>x.type==='invoke');
 assert.ok(call,'offline request sent once after authentication');
 await f.hub.webSocketMessage(second,JSON.stringify({type:'result',request_id:call.request_id,result:{ok:1}}));
 assert.deepEqual(JSON.parse((await pending).body.result.content[0].text),{ok:1});
 second.close();
 const timeout=await f.mcp('tools/call',{name:'call_device_tool',arguments:{
   device_id:'rocket',tool_name:'read_inventory',catalog_version:c.version,arguments:{}
 }});
 assert.equal(JSON.parse(timeout.body.result.content[0].text).code,'DEVICE_OFFLINE');
 assert.equal(f.hub.onlineWaiters.size,0,'offline waiter fully released');
});
test('queued read-only request rejects changed catalog after device returns online',async()=>{
 const f=await fixture(),oldCatalog=catalog(['read_inventory']);
 const first=await f.register('rocket','Rocket',null,{catalog:oldCatalog});
 first.close();
 const call=f.mcp('tools/call',{name:'call_device_tool',arguments:{
   device_id:'rocket',tool_name:'read_inventory',catalog_version:oldCatalog.version,arguments:{}
 }});
 for(let i=0;i<60&&!f.hub.onlineWaiters.get('rocket')?.size;i++)
   await new Promise(r=>setTimeout(r,2));
 const newCatalog=catalog(['read_inventory','new_tool']);
 const replacement=await f.register('rocket','Rocket',null,{catalog:newCatalog});
 const result=await call;
 assert.equal(JSON.parse(result.body.result.content[0].text).code,'CATALOG_VERSION_STALE');
 assert.equal(replacement.messages.filter(x=>x.type==='invoke').length,0);
});
test('operation ID is durable, deduplicated and queryable without recording command arguments',async()=>{
 const f=await fixture();
 const c=catalog(['write_file']);
 c.tools[0].annotations={readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:false};
 c.tools[0].remoteGrant={mode:'persistent'};
 c.version=createHash('sha256').update(JSON.stringify({schema_version:1,tools:c.tools})).digest('hex');
 const ws=await f.register('rocket','Rocket',null,{catalog:c});
 const operationId='123e4567-e89b-42d3-a456-426614174001';
 const request={device_id:'rocket',tool_name:'write_file',catalog_version:c.version,
   operation_id:operationId,arguments:{path:'a.txt',content:'secret'}};
 const first=f.mcp('tools/call',{name:'call_device_tool',arguments:request});
 for(let i=0;i<70&&!ws.messages.some(x=>x.type==='invoke');i++)
   await new Promise(r=>setTimeout(r,2));
 const invoke=ws.messages.find(x=>x.type==='invoke');
 assert.ok(invoke);
 assert.equal(invoke.operation_id,operationId);
 const duplicate=await f.mcp('tools/call',{name:'call_device_tool',arguments:request});
 const rejected=JSON.parse(duplicate.body.result.content[0].text);
 assert.equal(rejected.code,'OPERATION_ALREADY_SUBMITTED');
 assert.equal(rejected.operation_id,operationId);
 assert.equal(ws.messages.filter(x=>x.type==='invoke').length,1);
 const mismatch=await f.mcp('tools/call',{name:'call_device_tool',arguments:{
   ...request,arguments:{path:'b.txt',content:'different'}}});
 assert.equal(JSON.parse(mismatch.body.result.content[0].text).code,'OPERATION_ID_CONFLICT');
 const receipt=await f.mcp('tools/call',{name:'get_operation_status',
   arguments:{device_id:'rocket',operation_id:operationId}});
 assert.equal(receipt.body.result.structuredContent.status,'submitted');
 const stored=await f.hub.ctx.storage.get('operation:rocket:'+operationId);
 assert.equal(stored.args,undefined,'durable journal stores only digest and status');
 assert.equal(stored.hash.length,64);
 await f.hub.webSocketMessage(ws,JSON.stringify({type:'result',request_id:invoke.request_id,
   result:{success:true}}));
 const finished=await first;
 assert.equal(finished.body.result.structuredContent.operation_id,operationId);
 assert.deepEqual(JSON.parse(finished.body.result.content[0].text),{success:true});
 const status=await f.mcp('tools/call',{name:'get_operation_status',
   arguments:{device_id:'rocket',operation_id:operationId}});
 assert.equal(status.body.result.structuredContent.status,'succeeded');
 assert.equal(ws.messages.filter(x=>x.type==='invoke').length,1);
});
test('long-running task receipt retains only an opaque task ID',async()=>{
 const f=await fixture(),c=catalog(['start_task']);
 c.tools[0].annotations={readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:false};
 c.tools[0].remoteGrant={mode:'scoped'};
 c.version=createHash('sha256').update(JSON.stringify({schema_version:1,tools:c.tools})).digest('hex');
 const ws=await f.register('rocket','Rocket',null,{catalog:c});
 const operationId='123e4567-e89b-42d3-a456-426614174004';
 const call=f.mcp('tools/call',{name:'call_device_tool',arguments:{
   device_id:'rocket',tool_name:'start_task',catalog_version:c.version,
   operation_id:operationId,arguments:{command:'diagnostic'}}});
 for(let i=0;i<60&&!ws.messages.some(x=>x.type==='invoke');i++)
   await new Promise(r=>setTimeout(r,2));
 const message=ws.messages.find(x=>x.type==='invoke');
 assert.ok(message);
 const taskId='task_'+('a'.repeat(64));
 await f.hub.webSocketMessage(ws,JSON.stringify({type:'result',request_id:message.request_id,
   result:{structuredContent:{task_id:taskId},content:[{type:'text',text:'some output'}]}}));
 await call;
 const receipt=await f.mcp('tools/call',{name:'get_operation_status',
   arguments:{device_id:'rocket',operation_id:operationId}});
 assert.equal(receipt.body.result.structuredContent.task_id,taskId);
 const persisted=await f.hub.ctx.storage.get('operation:rocket:'+operationId);
 assert.equal(persisted.args,undefined);
 assert.equal(persisted.content,undefined);
});
test('mutation is never queued while offline, and uncertain operation cannot be replayed',async()=>{
 const f=await fixture(),c=catalog(['write_file']);
 c.tools[0].annotations={readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:false};
 c.tools[0].remoteGrant={mode:'persistent'};
 c.version=createHash('sha256').update(JSON.stringify({schema_version:1,tools:c.tools})).digest('hex');
 const ws=await f.register('rocket','Rocket',null,{catalog:c});
 const operationId='123e4567-e89b-42d3-a456-426614174002';
 const request={device_id:'rocket',tool_name:'write_file',catalog_version:c.version,
   operation_id:operationId,arguments:{path:'note.txt'}};
 const call=f.mcp('tools/call',{name:'call_device_tool',arguments:request});
 for(let i=0;i<70&&!ws.messages.some(x=>x.type==='invoke');i++)
   await new Promise(r=>setTimeout(r,2));
 assert.ok(ws.messages.some(x=>x.type==='invoke'));
 ws.close();
 await f.hub.webSocketClose(ws,1006,'network-lost');
 const response=await call;
 assert.equal(JSON.parse(response.body.result.content[0].text).code,'EXECUTION_UNKNOWN');
 const status=await f.mcp('tools/call',{name:'get_operation_status',
   arguments:{device_id:'rocket',operation_id:operationId}});
 assert.equal(status.body.result.structuredContent.status,'unknown');
 const offline=await f.mcp('tools/call',{name:'call_device_tool',arguments:{
   ...request,operation_id:'123e4567-e89b-42d3-a456-426614174003'}});
 assert.equal(JSON.parse(offline.body.result.content[0].text).code,'DEVICE_OFFLINE');
 assert.equal(f.hub.onlineWaiters.size,0,'write operation must not enter read-only waiting queue');
 const replacement=await f.register('rocket','Rocket',null,{catalog_version:c.version});
 const again=await f.mcp('tools/call',{name:'call_device_tool',arguments:request});
 assert.equal(JSON.parse(again.body.result.content[0].text).code,'OPERATION_ALREADY_SUBMITTED');
 assert.equal(replacement.messages.filter(x=>x.type==='invoke').length,0);
});
test('Cloudflare heartbeat is acknowledged without affecting production socket or catalog',async()=>{
  const f=await fixture();
  const socket=await f.register('rocket');
  const before=(await f.mcp('tools/call',{name:'list_device_tools',arguments:{device_id:'rocket',limit:20}}))
    .body.result.structuredContent.catalog_version;
  await f.hub.webSocketMessage(socket,JSON.stringify({type:'heartbeat',nonce:'hb-1'}));
  assert.deepEqual(socket.messages.at(-1),{type:'heartbeat_ack',nonce:'hb-1'});
  const after=(await f.mcp('tools/call',{name:'list_device_tools',arguments:{device_id:'rocket',limit:20}}))
    .body.result.structuredContent.catalog_version;
  assert.equal(after,before);
});
test('test-mode agents coexist with production device identity without takeover or catalog writes',async()=>{
  const f=await fixture(),live=await f.register('rocket');
  const original=(await f.mcp('tools/call',{name:'list_device_tools',arguments:{device_id:'rocket',limit:32}}))
    .body.result.structuredContent;
  const ongoing=f.mcp('tools/call',{name:'call_device_tool',arguments:{
    device_id:'rocket',tool_name:'get_harness_status',catalog_version:original.catalog_version,arguments:{}
  }});
  for(let i=0;i<100&&live.messages.length<2;i++)await new Promise(r=>setTimeout(r,5));
  const invoke=live.messages.find(x=>x.type==='invoke');
  assert.ok(invoke,'production invocation remains on production socket');
  const testCatalog=catalog(['test_only_tool']);
  const testAgent=await f.register('rocket','rocket',null,{test_mode:true,catalog:testCatalog});
  assert.equal(testAgent.messages[0].type,'registered');
  assert.equal(testAgent.messages[0].test_mode,true);
  assert.equal(live.readyState,1,'production socket must remain open');
  assert.equal(live.closeCode,undefined);
  assert.equal(testAgent.messages.some(x=>x.type==='invoke'),false);
  const anotherTest=await f.register('rocket','rocket',null,{test_mode:true,catalog:testCatalog});
  assert.equal(anotherTest.messages[0].test_mode,true);
  assert.equal(testAgent.readyState,1,'parallel test sockets do not replace one another');
  await f.hub.webSocketMessage(testAgent,JSON.stringify({
    type:'catalog_update',catalog:catalog(['updated_test_only'])
  }));
  assert.equal(testAgent.messages.at(-1).type,'catalog_ack');
  const current=(await f.mcp('tools/call',{name:'list_device_tools',arguments:{device_id:'rocket',limit:32}}))
    .body.result.structuredContent;
  assert.equal(current.catalog_version,original.catalog_version);
  assert.deepEqual(current.tools,original.tools);
  const devices=JSON.parse((await f.mcp('tools/call',{name:'list_devices'})).body.result.content[0].text);
  assert.equal(devices.find(x=>x.device_id==='rocket').online,true);
  const bad=await f.register('rocket','rocket','bad-token',{test_mode:true});
  assert.equal(bad.closeCode,1008);
  assert.equal(live.readyState,1);
  await f.hub.webSocketMessage(live,JSON.stringify({
    type:'result',request_id:invoke.request_id,result:{source:'production'}
  }));
  const done=await ongoing;
  assert.equal(done.status,200);
  assert.deepEqual(JSON.parse(done.body.result.content[0].text),{source:'production'});
  assert.equal(testAgent.messages.some(x=>x.type==='invoke'),false);
});
test('test connection quota is isolated and cannot consume production socket capacity',async()=>{
 const f=await fixture();
 const testConnections=[];
 for(let i=0;i<8;i++){
   const ws=await f.register('rocket','rocket',null,{test_mode:true});
   assert.equal(ws.messages[0].test_mode,true);
   testConnections.push(ws);
 }
 const overflow=await f.register('rocket','rocket',null,{test_mode:true});
 assert.equal(overflow.closeCode,1013,'ninth test connection rejected without replacing others');
 assert.ok(testConnections.every(ws=>ws.readyState===1));
 const production=await f.register('rocket');
 assert.equal(production.messages[0].type,'registered');
 assert.equal(production.readyState,1,'production still registers at test quota');
 assert.ok(testConnections.every(ws=>ws.readyState===1));
});
test('test-only connections do not appear online when production is disconnected',async()=>{
  const f=await fixture();
  const testAgent=await f.register('rocket','rocket',null,{test_mode:true});
  assert.equal(testAgent.messages[0].test_mode,true);
  const devices=JSON.parse((await f.mcp('tools/call',{name:'list_devices'})).body.result.content[0].text);
  assert.equal(devices.find(x=>x.device_id==='rocket').online,false);
  const tools=await f.mcp('tools/call',{name:'list_device_tools',arguments:{device_id:'rocket',limit:10}});
  assert.equal(tools.body.result.structuredContent.online,false);
  const called=await f.mcp('tools/call',{name:'call_device_tool',arguments:{
    device_id:'rocket',tool_name:'get_harness_status',catalog_version:'0'.repeat(64),arguments:{}
  }});
  assert.equal(JSON.parse(called.body.result.content[0].text).code,'DEVICE_OFFLINE');
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
  const legacyCatalog=await f.mcp('tools/call',{name:'list_device_tools',arguments:{device_id:'moon',limit:10}});
  assert.deepEqual(legacyCatalog.body.result.structuredContent.tools.map(x=>x.name),[
    'get_harness_status','get_tool_result_page','get_tool_result_file'
  ]);
});
test('device catalogs are isolated and generic calls require catalog membership',async()=>{
  const f=await fixture();
  const moonCatalog=catalog(['list_usb_devices']);
  const macCatalog=catalog(['list_serial_ports']);
  const moon=await f.register('moon','MOON',null,{catalog:moonCatalog});
  const mac=await f.register('mac','MacBook',null,{catalog:macCatalog});
  const moonPage=await f.mcp('tools/call',{name:'list_device_tools',arguments:{device_id:'moon',limit:10}});
  const macPage=await f.mcp('tools/call',{name:'list_device_tools',arguments:{device_id:'mac',limit:10}});
  assert.equal(moonPage.body.result.structuredContent.catalog_version,moonCatalog.version);
  assert.deepEqual(moonPage.body.result.structuredContent.tools.map(x=>x.name),['list_usb_devices']);
  assert.deepEqual(macPage.body.result.structuredContent.tools.map(x=>x.name),['list_serial_ports']);
  const denied=await f.mcp('tools/call',{name:'call_device_tool',arguments:{
    device_id:'moon',tool_name:'list_serial_ports',catalog_version:moonCatalog.version,arguments:{}}});
  assert.equal(JSON.parse(denied.body.result.content[0].text).code,'TOOL_DENIED');
  assert.equal(moon.messages.length,1);
  const call=f.mcp('tools/call',{name:'call_device_tool',arguments:{
    device_id:'moon',tool_name:'list_usb_devices',catalog_version:moonCatalog.version,arguments:{}}});
  for(let i=0;i<200&&moon.messages.length<2;i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(moon.messages.length,2);
  assert.equal(mac.messages.length,1);
  assert.equal(moon.messages[1].catalog_version,moonCatalog.version);
  const id=moon.messages[1].request_id;
  await f.hub.webSocketMessage(moon,JSON.stringify({type:'result',request_id:id,result:{device:'moon'}}));
  assert.deepEqual(JSON.parse((await call).body.result.content[0].text),{device:'moon'});
});
test('catalog updates replace the snapshot atomically and reject stale calls',async()=>{
  const f=await fixture();
  const first=catalog(['list_usb_devices']);
  const ws=await f.register('moon','MOON',null,{catalog:first});
  const next=catalog(['list_serial_ports','list_pnp_devices']);
  await f.hub.webSocketMessage(ws,JSON.stringify({type:'catalog_update',catalog:next}));
  assert.deepEqual(ws.messages.at(-1),{type:'catalog_ack',catalog_version:next.version});
  const page=await f.mcp('tools/call',{name:'list_device_tools',arguments:{device_id:'moon',limit:1}});
  assert.equal(page.body.result.structuredContent.catalog_version,next.version);
  assert.ok(page.body.result.structuredContent.next_cursor);
  const second=await f.mcp('tools/call',{name:'list_device_tools',arguments:{
    device_id:'moon',limit:1,cursor:page.body.result.structuredContent.next_cursor}});
  assert.deepEqual(second.body.result.structuredContent?.tools?.map(x=>x.name),['list_pnp_devices'],JSON.stringify(second.body));
  const stale=await f.mcp('tools/call',{name:'call_device_tool',arguments:{
    device_id:'moon',tool_name:'list_usb_devices',catalog_version:first.version,arguments:{}}});
  assert.equal(JSON.parse(stale.body.result.content[0].text).code,'CATALOG_VERSION_STALE');
  assert.equal(ws.messages.length,2);
  const invalid=catalog(['write_file']);
  invalid.tools[0].annotations={readOnlyHint:false,destructiveHint:true,openWorldHint:false};
  await f.hub.webSocketMessage(ws,JSON.stringify({type:'catalog_update',catalog:invalid}));
  assert.equal(ws.messages.at(-1).code,'CATALOG_INVALID');
  const wrongHash=catalog(['list_usb_devices']);
  wrongHash.version='f'.repeat(64);
  await f.hub.webSocketMessage(ws,JSON.stringify({type:'catalog_update',catalog:wrongHash}));
  assert.equal(ws.messages.at(-1).code,'CATALOG_INVALID');
  const stillNext=await f.mcp('tools/call',{name:'list_device_tools',arguments:{device_id:'moon',limit:10}});
  assert.equal(stillNext.body.result.structuredContent.catalog_version,next.version);
});
test('one MCP endpoint dispatches to the explicitly requested device only', async () => {
  const f = await fixture();
  const moon = await f.register('moon');
  const mac = await f.register('mac');
  const call = f.mcp('tools/call', {name: 'call_device_tool', arguments: {
    device_id: 'mac', tool_name: 'get_harness_status', catalog_version:'0'.repeat(64), arguments: {}}});
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
      arguments: {device_id, tool_name, catalog_version:'0'.repeat(64), arguments: {}}});
    return JSON.parse(v.body.result.content[0].text).code;
  }
  assert.equal(await call('mac', 'get_harness_status'), 'DEVICE_OFFLINE');
  assert.equal(await call('moon', 'start_process'), 'TOOL_DENIED');
  assert.equal(await call('', 'get_harness_status'), 'BAD_REQUEST');
});
test('invalid stored catalog triggers bounded same-device reconnect and auto-republication',async()=>{
 const f=await fixture(),old=await f.register('rocket');
 await f.hub.ctx.storage.put('catalog:rocket',{schema_version:1,version:'a'.repeat(64),tools:[]});
 const failed=await f.mcp('tools/call',{name:'list_device_tools',arguments:{device_id:'rocket',limit:10}});
 assert.equal(JSON.parse(failed.body.result.content[0].text).code,'DEVICE_CATALOG_UNAVAILABLE');
 assert.equal(old.closeCode,4009);
 const newer=await f.register('rocket');
 assert.equal(newer.messages[0].type,'registered');
 const restored=await f.mcp('tools/call',{name:'list_device_tools',arguments:{device_id:'rocket',limit:10}});
 assert.equal(restored.body.result.structuredContent.tools.length,3);
});
test('socket takeover transparently resends safe read-only status once on the same device',async()=>{
  const f=await fixture();
  const old=await f.register('rocket');
  const call=f.mcp('tools/call',{name:'call_device_tool',arguments:{
    device_id:'rocket',tool_name:'get_harness_status',catalog_version:'0'.repeat(64),arguments:{limit:1}
  }});
  for(let i=0;i<100&&old.messages.length<2;i++)await new Promise(r=>setTimeout(r,5));
  assert.equal(old.messages[1].type,'invoke');
  const newer=await f.register('rocket');
  assert.equal(old.closeCode,1000);
  assert.equal(newer.messages[0].type,'registered');
  assert.match(newer.messages[0].connection_id,/^[0-9a-f-]{36}$/);
  assert.equal(newer.messages[1].type,'invoke');
  assert.equal(newer.messages[1].request_id,old.messages[1].request_id);
  await f.hub.webSocketMessage(newer,JSON.stringify({type:'result',
    request_id:newer.messages[1].request_id,result:{status:'ready'}}));
  const answer=await call;
  assert.equal(answer.status,200);
  assert.deepEqual(JSON.parse(answer.body.result.content[0].text),{status:'ready'});
});
test('rolling upgrade accepts legacy per_call catalog and preserves its hash',async()=>{
  const f=await fixture();
  f.env.ALLOWED_TOOLS+=',start_task';
  const oldTool={name:'start_task',description:'Legacy shell tool',
    inputSchema:{type:'object',properties:{command:{type:'string'}}},
    annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:false},
    remoteGrant:{mode:'per_call'}};
  const tools=[oldTool],version=createHash('sha256').update(JSON.stringify({schema_version:1,tools})).digest('hex');
  const ws=await f.register('legacy','legacy',null,{catalog:{schema_version:1,version,tools}});
  assert.equal(ws.messages[0].type,'registered');
  const listing=await f.mcp('tools/call',{name:'list_device_tools',arguments:{device_id:'legacy',limit:10}});
  assert.equal(listing.body.result.structuredContent.catalog_version,version);
  assert.equal(listing.body.result.structuredContent.tools[0].remoteGrant.mode,'per_call');
});
test('socket takeover never replays executing commands even if new socket is online',async()=>{
  const f=await fixture();
  f.env.ALLOWED_TOOLS+=',start_task';
  const mutable={name:'start_task',description:'run command',inputSchema:{type:'object',
    properties:{command:{type:'string'}}},annotations:{
    readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:false},
    remoteGrant:{mode:'scoped'}};
  const tools=[mutable],version=createHash('sha256').update(JSON.stringify({schema_version:1,tools})).digest('hex');
  const grant={schema_version:1,version,tools};
  const old=await f.register('rocket','rocket',null,{catalog:grant});
  const call=f.mcp('tools/call',{name:'call_device_tool',arguments:{
    device_id:'rocket',tool_name:'start_task',catalog_version:version,arguments:{command:'echo hi'}
  }});
  for(let i=0;i<100&&old.messages.length<2;i++)await new Promise(r=>setTimeout(r,5));
  const newer=await f.register('rocket','rocket',null,{catalog:grant});
  assert.equal(newer.messages.length,1,'new socket must not re-execute mutable operation');
  const result=await call;
  assert.equal(JSON.parse(result.body.result.content[0].text).code,'DEVICE_DISCONNECTED');
});
test('disconnect reports unknown execution, never replays on other device', async () => {
  const f = await fixture();
  const moon = await f.register('moon');
  const mac = await f.register('mac');
  const call = f.mcp('tools/call', {name: 'call_device_tool', arguments: {
    device_id: 'moon', tool_name: 'get_harness_status', catalog_version:'0'.repeat(64), arguments: {}}});
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

test('inspect_client_context reads only this request params._meta and is explicitly read-only', async () => {
  const f = await fixture();
  const descriptor = (await f.mcp('tools/list', {})).body.result.tools.find(x => x.name === 'inspect_client_context');
  assert.deepEqual(descriptor.annotations, {readOnlyHint: true, destructiveHint: false, openWorldHint: false});
  assert.deepEqual(descriptor.inputSchema.properties, {});
  const meta = {
    'openai/session': 'anonymized-conversation',
    'openai/userAgent': 'ChatGPT Desktop/26.10 Mac',
    'openai/userLocation': {city: 'Singapore', country: 'SG', timezone: 'Asia/Singapore',
      latitude: 1.3, longitude: 103.8, secretLocationField: 'private-data'},
    'openai/locale': 'zh-CN',
    'openai/subject': 'anonymized-user',
    'openai/organization': 'anonymized-org',
    'openai/unknown': 'do-not-return',
    authorization: 'Bearer should-not-leak'
  };
  const response = (await f.mcp('tools/call', {name: 'inspect_client_context', arguments: {}, _meta: meta})).body.result;
  const result = response.structuredContent;
  assert.deepEqual(JSON.parse(response.content[0].text), result);
  assert.equal(result.source, 'params._meta');
  assert.equal(result.request_meta_present, true);
  assert.deepEqual(result.fields['openai/session'], {present: true, value: 'anonymized-conversation'});
  assert.deepEqual(result.fields['openai/userAgent'], {present: true, value: 'ChatGPT Desktop/26.10 Mac'});
  assert.deepEqual(result.fields['openai/userLocation'], {present: true,
    value: {city: 'Singapore', country: 'SG', timezone: 'Asia/Singapore', latitude: 1.3, longitude: 103.8}});
  assert.deepEqual(result.fields['openai/locale'], {present: true, value: 'zh-CN'});
  assert.deepEqual(result.fields['openai/subject'], {present: true, value: null, redacted: true});
  assert.deepEqual(result.fields['openai/organization'], {present: true, value: null, redacted: true});
  assert.equal(JSON.stringify(response).includes('should-not-leak'), false);
  assert.equal(JSON.stringify(response).includes('private-data'), false);
  assert.equal(JSON.stringify(response).includes('do-not-return'), false);
  assert.equal(JSON.stringify(response).includes('anonymized-user'), false);
  assert.equal(JSON.stringify(response).includes('anonymized-org'), false);
});

test('inspect_client_context reports absent or invalid hints without guessing, and rejects arguments', async () => {
  const f = await fixture();
  const absent = (await f.mcp('tools/call', {name: 'inspect_client_context', arguments: {}})).body.result.structuredContent;
  assert.equal(absent.request_meta_present, false);
  for (const field of Object.values(absent.fields)) assert.equal(field.present, false);
  assert.equal(absent.fields['openai/session'].value, null);
  assert.equal(absent.fields['openai/userLocation'].value, null);
  const invalid = (await f.mcp('tools/call', {name: 'inspect_client_context', arguments: {},
    _meta: {'openai/session': 123, 'openai/userLocation': {latitude: 250, longitude: -999}}})).body.result.structuredContent;
  assert.deepEqual(invalid.fields['openai/session'], {present: true, value: null});
  assert.deepEqual(invalid.fields['openai/userLocation'], {present: true, value: null});
  const badArgs = (await f.mcp('tools/call',
    {name: 'inspect_client_context', arguments: {device_id: 'moon'}})).body.result;
  assert.equal(badArgs.isError, true);
  assert.equal(JSON.parse(badArgs.content[0].text).code, 'BAD_REQUEST');
});


test('explicitly granted configuration reader is admitted without widening the default catalog',async()=>{
  const f=await fixture();
  const ws=await f.register('rocket','Rocket');
  const create=granted=>{
    const tools=[{name:'get_config',description:'Read local settings',
      inputSchema:{type:'object',properties:{},additionalProperties:false},
      annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
      ...(granted?{remoteGrant:{mode:'persistent'}}:{})}];
    const version=createHash('sha256').update(JSON.stringify({schema_version:1,tools})).digest('hex');
    return {schema_version:1,version,tools};
  };
  await f.hub.webSocketMessage(ws,JSON.stringify({type:'catalog_update',catalog:create(false)}));
  assert.equal(ws.messages.at(-1).code,'CATALOG_INVALID');
  const allowed=create(true);
  await f.hub.webSocketMessage(ws,JSON.stringify({type:'catalog_update',catalog:allowed}));
  assert.equal(ws.messages.at(-1).type,'catalog_ack');
  const page=await f.mcp('tools/call',{name:'list_device_tools',arguments:{device_id:'rocket'}});
  assert.deepEqual(page.body.result.structuredContent.tools[0].remoteGrant,{mode:'persistent'});
  assert.equal(page.body.result.structuredContent.catalog_version,allowed.version);
});
