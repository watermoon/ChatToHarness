'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {connectAgent} = require('../cloud-router/src/agent.cjs');
const TOKEN = 'device-token-abcdefghijklmnopqrstuvwxyz012345';
class FakeWS {
  static instances = [];
  constructor(url) { this.url = url; this.readyState = 0; this.events = {}; this.sent = []; FakeWS.instances.push(this); }
  addEventListener(event, fn) { (this.events[event] ||= []).push(fn); }
  emit(event, data) { for (const fn of this.events[event] || []) fn(data); }
  send(msg) { this.sent.push(JSON.parse(msg)); }
  close() { this.readyState = 3; this.emit('close'); }
  opened() { this.readyState = 1; this.emit('open'); }
  message(data) { this.emit('message', {data: JSON.stringify(data)}); }
}
function options(extra = {}) {
  return {url: 'wss://router.example/agent', deviceId: 'moon', name: 'MOON',
    platform: 'win32', token: TOKEN, execute: async () => ({ok: true}),
    WebSocketImpl: FakeWS, allowedTools: ['get_harness_status'], reconnectMs: 5, ...extra};
}
test('agent rejects untrusted and insecure connection configuration', () => {
  assert.throws(() => connectAgent(options({url: 'ws://localhost/agent'})), /INVALID_AGENT_CONFIGURATION/);
  assert.throws(() => connectAgent(options({token: '123'})), /INVALID_AGENT_CONFIGURATION/);
});
test('agent registers device, executes allowed tool and denies non-allowlisted operations', async () => {
  FakeWS.instances.length = 0;
  const observed = [];
  const agent = connectAgent(options({execute: async (name, args) => {
    observed.push({name,args}); return {device: 'moon'};
  }}));
  const ws = FakeWS.instances.at(-1);
  ws.opened();
  assert.equal(ws.sent[0].device_id, 'moon');
  assert.equal(agent.connected, false);
  ws.message({type: 'registered', device_id: 'moon'});
  assert.equal(agent.connected, true);
  ws.message({type: 'invoke', request_id: 't1', tool_name: 'get_harness_status', arguments: {}});
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(observed, [{name: 'get_harness_status', args: {}}]);
  assert.deepEqual(ws.sent[1].result, {device: 'moon'});
  ws.message({type: 'invoke', request_id: 't2', tool_name: 'start_process', arguments: {}});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ws.sent[2].error, 'LOCAL_TOOL_DENIED');
  agent.close();
});
test('agent publishes catalog, syncs changes and rejects stale catalog versions',async()=>{
  FakeWS.instances.length=0;
  const catalog={schema_version:1,version:'a'.repeat(64),tools:[{name:'read_inventory'}]};
  const observed=[];
  const agent=connectAgent(options({catalogProvider:()=>catalog,allowedTools:[],execute:async(name,args)=>{
    observed.push({name,args});return {device:'moon'};
  }}));
  const ws=FakeWS.instances.at(-1);ws.opened();
  assert.equal(ws.sent[0].type,'register');
  assert.equal(ws.sent[0].catalog.version,catalog.version);
  ws.message({type:'registered',device_id:'moon',catalog_version:catalog.version});
  ws.message({type:'invoke',request_id:'catalog-1',tool_name:'read_inventory',
    catalog_version:catalog.version,arguments:{scope:'usb'}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(observed,[{name:'read_inventory',args:{scope:'usb'}}]);
  const oldVersion=catalog.version;
  catalog.version='b'.repeat(64);
  catalog.tools=[{name:'read_inventory'},{name:'list_usb_devices'}];
  assert.equal(agent.syncCatalog(),true);
  assert.equal(ws.sent.at(-1).type,'catalog_update');
  assert.equal(ws.sent.at(-1).catalog.version,catalog.version);
  ws.message({type:'invoke',request_id:'catalog-stale',tool_name:'read_inventory',
    catalog_version:oldVersion,arguments:{}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ws.sent.at(-1).error,'CATALOG_VERSION_STALE');
  agent.close();
});
test('only registered, live socket accepts work and closed agent never reconnects', async () => {
  FakeWS.instances.length = 0;
  let calls = 0;
  const agent = connectAgent(options({execute: async () => { calls++; return {}; }}));
  const ws = FakeWS.instances.at(-1);
  ws.opened();
  ws.message({type: 'invoke', request_id: 'no', tool_name: 'get_harness_status', arguments: {}});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 0);
  agent.close();
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(FakeWS.instances.length, 1);
});

test('asynchronous proxy selection never reconnects after agent stop',async()=>{
 let release;const pending=new Promise(resolve=>{release=resolve;});
 const agent=connectAgent(options({socketFactory:()=>pending}));
 await new Promise(resolve=>setImmediate(resolve));agent.close();
 const socket=new FakeWS('wss://router.example/agent');release(socket);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(socket.readyState,3);assert.equal(socket.sent.length,0);
});
test('agent retries failed proxy resolution and registers with selected socket',async()=>{
 let attempts=0;let selected;
 const agent=connectAgent(options({socketFactory:async url=>{if(++attempts===1)throw Error('proxy unavailable');return selected=new FakeWS(url);}}));
 try{
  for(let i=0;i<50&&!selected;i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.ok(selected);selected.opened();assert.equal(selected.sent[0].type,'register');
 }finally{agent.close();}
});
