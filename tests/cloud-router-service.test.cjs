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
function fixture() {
  const calls=[];
  const manager={call:async(name,args)=>{calls.push([name,args]);return {content:[{type:'text',text:'ready'}]};}};
  const service=new CloudRouterService({manager,identity:{id:'cu-00000000-0000-4000-8000-000000000001',name:'Mac',platform:'darwin'},WebSocketImpl:Socket});
  return {service,calls};
}
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
  socket.message({type:'registered',device_id:socket.sent[0].device_id});
  assert.equal(service.status().connected,true);
  socket.message({type:'invoke',request_id:'1',tool_name:'get_harness_status',arguments:{}});
  await new Promise(r=>setImmediate(r));
  assert.deepEqual(calls,[['get_harness_status',{}]]);
  assert.equal(socket.sent.at(-1).result.content[0].text,'ready');
  service.stop();
  assert.equal(service.status().enabled,false);
});
test('terminal, filesystem and Computer Use are always denied before existing manager',async()=>{
  const {service,calls}=fixture();
  for(const name of ['start_process','computer_use','write_file','git_status','get_harness_status__anything']){
    await assert.rejects(()=>service.execute(name,{}),/CLOUD_ROUTER_TOOL_DENIED/);
  }
  await assert.rejects(()=>service.execute('get_harness_status',{project_path:'/private'}),/CLOUD_ROUTER_INVALID_ARGUMENTS/);
  assert.equal(calls.length,0);
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
