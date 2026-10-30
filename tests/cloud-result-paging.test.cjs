'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {CloudRouterService}=require('../app/cloud-router-service.cjs');
const ID='cu-00000000-0000-4000-8000-000000000001',RESULT='result_'+'a'.repeat(32);
test('cloud agent routes only authorized status result pages without leaking other cached local results',async()=>{
 const calls=[];
 let sourceTool='get_harness_status';
 const manager={
  call:async()=>{throw Error('Must use scoped gateway');},
  broker:{
   toolCall:async(name,args)=>{calls.push([name,args]);return {content:[{type:'text',text:'safe'}]};},
   results:{load:async()=>({source:{tool:sourceTool}})}
  }
 };
 const service=new CloudRouterService({manager,identity:{id:ID,name:'Mac',platform:'darwin'}});
 await service.execute('get_harness_status',{});
 await service.execute('get_tool_result_page',{result_id:RESULT,offset:0,length:128});
 await service.execute('get_tool_result_file',{result_id:RESULT,file_index:0});
 assert.deepEqual(calls.map(x=>x[0]),['get_harness_status','get_tool_result_page','get_tool_result_file']);
 sourceTool='read_file';
 await assert.rejects(()=>service.execute('get_tool_result_page',{result_id:RESULT}),/CLOUD_ROUTER_TOOL_DENIED/);
 await assert.rejects(()=>service.execute('get_tool_result_file',{result_id:RESULT,file_index:0}),/CLOUD_ROUTER_TOOL_DENIED/);
 await assert.rejects(()=>service.execute('get_tool_result_page',{result_id:'unsafe'}),/CLOUD_ROUTER_INVALID_ARGUMENTS/);
 await assert.rejects(()=>service.execute('get_tool_result_file',{result_id:RESULT,file_index:-1}),/CLOUD_ROUTER_INVALID_ARGUMENTS/);
 await assert.rejects(()=>service.execute('start_process',{}),/CLOUD_ROUTER_TOOL_DENIED/);
 assert.equal(calls.length,3);
});
test('authenticated Worker publishes two device-scoped paging tools and preserves cloud allowlist',async()=>{
 const {authorizedWorker}=await import('../cloud-router/src/worker.mjs');
 const sent=[];
 const env={
  ALLOWED_TOOLS:'get_harness_status,get_tool_result_page,get_tool_result_file',
  DEVICE_HUB:{idFromName:()=>1,get:()=>({fetch:async req=>{
   sent.push(JSON.parse(await req.text()));
   return Response.json({ok:true,result:{content:[{type:'text',text:'read-only'}]}});
  }})}
 };
 const rpc=async(method,params)=>{
  const res=await authorizedWorker.fetch(new Request('https://router.test/mcp',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:42,method,params})
  }),env);
  assert.equal(res.status,200);
  const obj=await res.json();assert.equal(obj.id,42);return obj.result;
 };
 const listed=await rpc('tools/list',{});
 for(const name of ['get_tool_result_page','get_tool_result_file'])
  assert.ok(listed.tools.some(x=>x.name===name));
 await rpc('tools/call',{name:'get_tool_result_page',arguments:{device_id:ID,result_id:RESULT,offset:64,length:512}});
 await rpc('tools/call',{name:'get_tool_result_file',arguments:{device_id:ID,result_id:RESULT,file_index:0}});
 assert.deepEqual(sent.map(x=>x.tool_name),['get_tool_result_page','get_tool_result_file']);
 assert.deepEqual(sent[0].arguments,{result_id:RESULT,offset:64,length:512});
 assert.deepEqual(sent[1].arguments,{result_id:RESULT,file_index:0});
 const forbidden=await rpc('tools/call',{name:'call_device_tool',arguments:{device_id:ID,tool_name:'start_process',arguments:{}}});
 assert.match(JSON.stringify(forbidden),/TOOL_DENIED/);
 assert.equal(sent.length,2);
});
