'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {cloudNetwork}=require('../app/cloud-network.cjs');
const {normalizeProxy}=require('../app/proxy-config.cjs');
for(const mode of ['direct','system','manual'])test('cloud authorization and API follow Harness '+mode+' configuration',async()=>{
 let config=normalizeProxy({mode,host:'127.0.0.1',port:8001});let systemCalls=0;const routed=[];
 const network=cloudNetwork({getConfig:()=>config,getPassword:()=>'',resolveSystemProxy:async()=>{systemCalls++;return 'http://127.0.0.1:9001';},transport:{
  Agent:class {constructor(){this.proxy=null;}async close(){}},ProxyAgent:class{constructor(proxy){this.proxy=proxy;}async close(){}},fetch:async(url,opts)=>{routed.push(opts.dispatcher.proxy);return {status:200};}
 }});
 const expected=mode==='direct'?'':mode==='system'?'http://127.0.0.1:9001':'http://127.0.0.1:8001';
 assert.equal((await network.cliEnv()).HTTPS_PROXY,expected);
 await network.fetcher('https://api.cloudflare.com/client/v4/accounts');assert.equal(routed[0],expected||null);
 assert.equal(systemCalls,mode==='system'?2:0);
 config=normalizeProxy({...config,mode:'direct'});assert.equal((await network.cliEnv()).HTTP_PROXY,'');
 assert.equal((await network.cliEnv()).ALL_PROXY,'');
});
test('cloud API honors manual proxy bypass rules',async()=>{
 const network=cloudNetwork({getConfig:()=>normalizeProxy({mode:'manual',bypass:['cloudflare.com']}),getPassword:()=>'',resolveSystemProxy:async()=>{throw Error('unexpected');}});
 assert.equal((await network.cliEnv()).HTTPS_PROXY,'');
});

test('real HTTP requests honor selected proxy and subsequent direct configuration',async t=>{
 const http=require('node:http'),net=require('node:net'),path=require('node:path');let hits=0;
 const target=http.createServer((req,res)=>res.end('routed'));
 const proxy=http.createServer();proxy.on('connect',(req,client,head)=>{
  hits++;const [host,port]=req.url.split(':');const upstream=net.connect(Number(port),host,()=>{client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);client.pipe(upstream);upstream.pipe(client);});
  upstream.on('error',()=>client.destroy());client.on('error',()=>upstream.destroy());client.on('close',()=>upstream.destroy());
 });
 await new Promise(r=>target.listen(0,'127.0.0.1',r));await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
 t.after(()=>{target.closeAllConnections();target.close();proxy.closeAllConnections();proxy.close();});
 let config=normalizeProxy({mode:'manual',host:'127.0.0.1',port:proxy.address().port,bypass:[],bypassLocal:false,bypassLan:false});
 const network=cloudNetwork({sourceDir:path.resolve(__dirname,'../cloud-router'),getConfig:()=>config,getPassword:()=>'',resolveSystemProxy:async()=>{throw Error('system proxy must not be queried');}});
 const url='http://127.0.0.1:'+target.address().port;
 assert.equal(await (await network.fetcher(url)).text(),'routed');assert.equal(hits,1);
 config={...config,mode:'direct'};
 assert.equal(await (await network.fetcher(url)).text(),'routed');assert.equal(hits,1);
});

test('WebSocket uses same per-target proxy selection as HTTP',async()=>{
 for(const mode of ['direct','system','manual']){
  let selected;let config=normalizeProxy({mode,host:'127.0.0.1',port:8001});
  const network=cloudNetwork({getConfig:()=>config,getPassword:()=>'',resolveSystemProxy:async target=>{assert.equal(target,'https://router.example/agent');return 'http://127.0.0.1:9001';},transport:{
   Agent:class{async close(){}},ProxyAgent:class{constructor(url){this.url=url;}async close(){}},WebSocket:class{constructor(url,opts){selected=opts.dispatcher.url||null;}addEventListener(){}}
  }});
  await network.createWebSocket('wss://router.example/agent');assert.equal(selected,mode==='direct'?null:mode==='system'?'http://127.0.0.1:9001':'http://127.0.0.1:8001');
 }
});
