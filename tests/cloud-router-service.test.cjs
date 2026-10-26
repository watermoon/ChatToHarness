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
