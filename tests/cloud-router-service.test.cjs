'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {CloudRouterService} = require('../app/cloud-router-service.cjs');
const TOKEN = 'token-for-moon-12345678901234567890';
class Socket {
  static instances = [];
  constructor(url) { this.url=url; this.readyState=0;this.handlers={};this.sent=[];Socket.instances.push(this); }
  addEventListener(n,fn){(this.handlers[n] ||= []).push(fn);}
  emit(n,v){for(const fn of this.handlers[n] || [])fn(v);}
  send(s){this.sent.push(JSON.parse(s));}
  close(){this.readyState=3;this.emit('close');}
  open(){this.readyState=1;this.emit('open');}
  message(m){this.emit('message',{data:JSON.stringify(m)});}
}
function safeTool(name,annotations={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}) {
  return {name,description:name,inputSchema:{type:'object',properties:{},additionalProperties:false},annotations};
}
function fixture() {
  const calls=[],listeners=new Map();
  const definitions=[safeTool('get_harness_status'),safeTool('read_inventory'),
    safeTool('write_file',{readOnlyHint:false,destructiveHint:true,openWorldHint:false})];
  const manager={
    call:async(name,args)=>{calls.push([name,args]);return {content:[{type:'text',text:'ready'}]};},
    visibleTools:()=>definitions,
    on(event,listener){const list=listeners.get(event)||[];list.push(listener);listeners.set(event,list);return this;},
    emit(event){for(const listener of listeners.get(event)||[])listener();},
    broker:{results:{tools:()=>[safeTool('get_tool_result_page'),safeTool('get_tool_result_file')]}}
  };
  const service=new CloudRouterService({manager,identity:{id:'cu-00000000-0000-4000-8000-000000000001',name:'Mac',platform:'darwin'},WebSocketImpl:Socket});
  return {service,calls,manager,definitions};
}
test('Cloudflare retains its full local tool catalog after Secure Tunnel disconnect',async()=>{
  const {McpManager}=require('../app/mcp-manager.cjs');
  const {RuntimeManager}=require('../app/runtime.cjs');
  const os=require('node:os');
  const native=[safeTool('get_harness_status'),safeTool('read_inventory'),safeTool('start_task',{
    readOnlyHint:false,destructiveHint:true,openWorldHint:false})];
  let calls=0;
  const manager=new McpManager({
    settings:{list:()=>[],getAllowAllTools:()=>false},
    services:{configure(){},tools:()=>native,has:name=>native.some(tool=>tool.name===name),
      async call(){calls++;return {ok:true};},
      stopComputerUse(){},dispose(){}}
  });
  manager.broker={async start(){},async stop(){},async close(){},results:{
    tools:()=>[safeTool('get_tool_result_page'),safeTool('get_tool_result_file')]
  }};
  await manager.start({directories:[]});
  const cloud=new CloudRouterService({manager,identity:{
    id:'cu-00000000-0000-4000-8000-000000000099',name:'Rocket',platform:'win32'
  },WebSocketImpl:Socket});
  const before=cloud.catalog();
  assert.equal(before.tools.length,5,'native tools and paging tools must be present');
  const runtime=new RuntimeManager({home:os.tmpdir(),
    gateway:manager,independentLocalTools:true,
    paths:{node:process.execPath,tunnel:process.execPath}});
  await runtime.disconnect();
  assert.equal(manager.running,true,'tunnel shutdown cannot stop local MCP manager');
  const after=cloud.catalog();
  assert.equal(after.version,before.version,'Cloudflare catalog remains stable after Tunnel stops');
  assert.deepEqual(after.tools,before.tools);
  await cloud.execute('read_inventory',{});
  assert.equal(calls,1,'local tool remains callable via Cloudflare after Tunnel stops');
  await runtime.close();
  assert.equal(manager.running,false,'desktop shutdown still stops local MCP manager');
});
test('cloud router is disabled by default and never replaces the Tunnel',()=>{
  const {service}=fixture();
  assert.deepEqual(service.status().connected,false);
  assert.equal(service.start().enabled,false);
  assert.equal(Socket.instances.length,0);
});
test('only fully specified wss /agent URL and high-entropy token accepted',()=>{
  const {service}=fixture();
  assert.equal(service.start({enabled:true,url:'ws://bad.example/agent',token:TOKEN}).phase,'failed');
  assert.equal(service.start({enabled:true,url:'wss://router.example/agent?key=x',token:TOKEN}).phase,'failed');
  assert.equal(service.start({enabled:true,url:'wss://router.example/agent',token:'weak'}).phase,'failed');
});
test('CloudRouterService propagates test mode and reports it explicitly',()=>{
 const {manager}=fixture();
 Socket.instances.length=0;
 const service=new CloudRouterService({manager,testMode:true,
   identity:{id:'moon',name:'MOON',platform:'win32'},WebSocketImpl:Socket});
 assert.equal(service.status().test_mode,true);
 service.start({enabled:true,url:'wss://router.example/agent',token:TOKEN});
 const socket=Socket.instances.at(-1);
 socket.open();
 assert.equal(socket.sent[0].test_mode,true);
 socket.message({type:'registered',device_id:'moon',test_mode:true,
   catalog_version:socket.sent[0].catalog_version});
 assert.equal(service.status().connected,true);
 service.stop();
});
test('the device registers its stable local identity and calls existing manager for read-only status',async()=>{
  const {service,calls}=fixture();
  Socket.instances.length=0;
  assert.equal(service.start({enabled:true,url:'wss://router.example/agent',token:TOKEN}).phase,'connecting');
  const socket=Socket.instances.at(-1);
  socket.open();
  assert.equal(socket.sent[0].device_id,'cu-00000000-0000-4000-8000-000000000001');
  assert.equal(socket.sent[0].harness_version,require('../package.json').version);
  assert.equal(typeof socket.sent[0].os_version,'string');
  assert.ok(socket.sent[0].os_version.length>0);
  socket.message({type:'registered',device_id:socket.sent[0].device_id,catalog_version:socket.sent[0].catalog_version});
  assert.equal(service.status().connected,true);
  socket.message({type:'invoke',request_id:'1',tool_name:'get_harness_status',catalog_version:socket.sent[0].catalog_version,arguments:{}});
  await new Promise(r=>setImmediate(r));
  assert.deepEqual(calls,[['get_harness_status',{}]]);
  assert.equal(socket.sent.at(-1).result.content[0].text,'ready');
  service.stop();
  assert.equal(service.status().enabled,false);
});
test('device publishes, refreshes and locally enforces its read-only tool catalog',async()=>{
  const {service,calls,manager,definitions}=fixture();
  Socket.instances.length=0;
  service.start({enabled:true,url:'wss://router.example/agent',token:TOKEN});
  const socket=Socket.instances.at(-1);socket.open();
  const initial=service.catalog();
  assert.equal(socket.sent[0].catalog_version,initial.version);
  assert.equal(Object.hasOwn(socket.sent[0],'catalog'),false);
  const names=initial.tools.map(tool=>tool.name);
  assert.ok(names.includes('read_inventory'));
  assert.ok(names.includes('get_harness_status'));
  assert.equal(names.includes('write_file'),true,'mutating tools must also be discoverable');
  socket.message({type:'registered',device_id:socket.sent[0].device_id,catalog_version:initial.version});
  socket.message({type:'invoke',request_id:'read-1',tool_name:'read_inventory',
    catalog_version:initial.version,arguments:{}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls,[['read_inventory',{}]]);
  definitions.push(safeTool('read_inventory_extra'));
  manager.emit('state');
  const update=socket.sent.at(-1);
  assert.equal(update.type,'catalog_update');
  assert.notEqual(update.catalog.version,initial.version);
  socket.message({type:'invoke',request_id:'stale-1',tool_name:'read_inventory',
    catalog_version:initial.version,arguments:{}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(socket.sent.at(-1).error,'CATALOG_VERSION_STALE');
  service.stop();
});
test('remote status forwards declared pagination arguments and rejects unsupported fields',async()=>{
 const {service,calls}=fixture(),seen=[];
 service.manager.broker={results:{tools:()=>[]},toolCall:async(name,args)=>{
   seen.push([name,args]);return {structuredContent:{ok:true}};
 }};
 assert.deepEqual((await service.execute('get_harness_status',{limit:5})).structuredContent,{ok:true});
 assert.deepEqual((await service.execute('get_harness_status',{cursor:'abc',limit:2})).structuredContent,{ok:true});
 assert.deepEqual(seen,[['get_harness_status',{limit:5}],['get_harness_status',{cursor:'abc',limit:2}]]);
 assert.deepEqual(calls,[]);
 for(const args of [{limit:0},{limit:201},{limit:1.2},{cursor:123},{project_path:'C:\\secret'}])
   await assert.rejects(()=>service.execute('get_harness_status',args),/CLOUD_ROUTER_INVALID_ARGUMENTS/);
});
test('unified cloud routes saved-result pages and files through the live MCP gateway, not manager.call',async()=>{
  const {service,calls}=fixture(),seen=[];
  service.manager.broker={
    results:{tools:()=>[safeTool('get_tool_result_page'),safeTool('get_tool_result_file')],load:async()=>({source:{tool:'get_harness_status'}})},
    toolCall:async(name,args)=>{
      seen.push([name,args]);
      return {structuredContent:{kind:name==='get_tool_result_page'?'harness_result_page':'harness_result_file'}};
    }
  };
  const result_id='result_'+'a'.repeat(32);
  assert.equal((await service.execute('get_tool_result_page',{result_id,offset:64})).structuredContent.kind,'harness_result_page');
  assert.equal((await service.execute('get_tool_result_file',{result_id,file_index:1})).structuredContent.kind,'harness_result_file');
  assert.deepEqual(seen,[
    ['get_tool_result_page',{result_id,offset:64}],
    ['get_tool_result_file',{result_id,file_index:1}]
  ]);
  assert.deepEqual(calls,[],'reading a saved result must never re-execute the source tool');
  await assert.rejects(()=>service.execute('get_tool_result_file',null),/CLOUD_ROUTER_INVALID_ARGUMENTS/);
  delete service.manager.broker.results.load;
  await assert.rejects(()=>service.execute('get_tool_result_page',{result_id}),/CLOUD_ROUTER_TOOL_UNAVAILABLE/);
});

test('only registered tools route to the local manager; local grant controls execution',async()=>{
  const {service,calls}=fixture();
  for(const name of ['start_process','computer_use','git_status','get_harness_status__anything']){
    await assert.rejects(()=>service.execute(name,{}),/CLOUD_ROUTER_TOOL_DENIED/);
  }
  await service.execute('write_file',{});
  assert.deepEqual(calls,[['write_file',{}]]);
  await assert.rejects(()=>service.execute('get_harness_status',{project_path:'/private'}),/CLOUD_ROUTER_INVALID_ARGUMENTS/);
});


test('desktop paired roster uses stored device token, masks secrets, marks current device and keeps offline records',async()=>{
  const calls=[];
  const pairStore={read(){return {mcpUrl:'https://router.example/mcp',
    agentUrl:'wss://router.example/agent',token:TOKEN};}};
  const fetcher=async(url,opts)=>{
    calls.push({url,headers:opts.headers});
    return {ok:true,json:async()=>[
      {device_id:'moon',name:'MOON',platform:'win32',online:false,paired_at:1000},
      {device_id:'cu-00000000-0000-4000-8000-000000000001',name:'Mac',platform:'darwin',
       online:true,os_version:'macOS 14.6.1',harness_version:'0.8.1',paired_at:1001}
    ]};
  };
  const service=new CloudRouterService({manager:{call:async()=>{}},
    identity:{id:'cu-00000000-0000-4000-8000-000000000001',name:'Mac',platform:'darwin'},
    pairStore,fetcher,WebSocketImpl:Socket});
  const state=await service.refreshDevices();
  assert.equal(state.devices.length,2);
  assert.equal(state.devices.find(x=>x.current)?.os_version,'macOS 14.6.1');
  assert.equal(state.devices.find(x=>x.current)?.harness_version,'0.8.1');
  assert.equal(state.devices.find(x=>!x.current)?.harness_version,'');
  assert.equal(state.local_harness_version,require('../package.json').version);
  assert.deepEqual(state.devices.map(x=>[x.name,x.online,x.current]),[
    ['MOON',false,false],['Mac',true,true]]);
  assert.match(calls[0].url,/\/paired-devices$/);
  assert.equal(calls[0].headers.authorization,'Bearer '+TOKEN);
  assert.equal(calls[0].headers['x-device-id'],state.device_id);
  assert.equal(JSON.stringify(state).includes(TOKEN),false);
});
test('paired roster network errors are surfaced while previous snapshot stays visible',async()=>{
  let fail=false;
  const service=new CloudRouterService({
    manager:{call:async()=>{}},identity:{id:'mac',name:'Mac',platform:'darwin'},
    pairStore:{read:()=>({mcpUrl:'https://router.example/mcp',token:TOKEN})},
    fetcher:async()=>fail?Promise.reject(Error('offline')):{
      ok:true,json:async()=>[{device_id:'mac',name:'Mac',platform:'darwin',online:true}]
    },WebSocketImpl:Socket});
  await service.refreshDevices();fail=true;
  const status=await service.refreshDevices();
  assert.equal(status.devices.length,1);
  assert.equal(status.devicesError,'CLOUD_ROSTER_UNAVAILABLE');
});

test('disconnect closes agent, retains pairing and remains disconnected after restart until reconnect',()=>{
 let paused=false;
 const pairStore={
  read:()=>({mcpUrl:'https://test.example/mcp',agentUrl:'wss://test.example/agent',
    token:TOKEN,paused}),
  setPaused(value){paused=value;}
 };
 Socket.instances.length=0;
 const options={manager:{call:async()=>{}},identity:{id:'cu-00000000-0000-4000-8000-000000000001',
   name:'Mac',platform:'darwin'},pairStore,WebSocketImpl:Socket};
 const first=new CloudRouterService(options);
 assert.equal(first.startStored().phase,'connecting');
 const before=Socket.instances.length;
 const state=first.disconnect();
 assert.equal(state.paused,true);
 assert.equal(state.paired,true);
 assert.equal(state.connected,false);
 assert.equal(state.enabled,false);
 const second=new CloudRouterService(options);
 assert.equal(second.startStored().paused,true);
 assert.equal(second.status().paired,true);
 assert.equal(Socket.instances.length,before);
 assert.equal(second.reconnect().phase,'connecting');
 assert.equal(second.status().paused,false);
 assert.equal(Socket.instances.length,before+1);
 second.stop();
});
