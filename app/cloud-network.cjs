'use strict';
const path=require('node:path');
const {selectProxy,effectiveBypass}=require('./proxy-config.cjs');
function cloudNetwork({sourceDir,getConfig,getPassword,resolveSystemProxy,transport}){
 const client=()=>transport||require(path.join(sourceDir,'node_modules','undici'));
 const selected=async target=>{const config=getConfig();return selectProxy(config,resolveSystemProxy,target,config.mode==='manual'&&config.authEnabled?getPassword():undefined);};
 return {
  createWebSocket:async url=>{
   const proxy=await selected(url.replace(/^ws:/,'http:').replace(/^wss:/,'https:')),u=client();
   const dispatcher=proxy?new u.ProxyAgent(proxy):new u.Agent();
   try{const socket=new u.WebSocket(url,{dispatcher});
    socket.addEventListener('close',()=>{void dispatcher.close().catch(()=>{});},{once:true});
    return socket;
   }catch(e){void dispatcher.close().catch(()=>{});throw e;}
  },
  cliEnv:async()=>{
   const proxy=await selected('https://dash.cloudflare.com');
   // Explicitly clear inherited proxies in direct mode.
   const bypass=effectiveBypass(getConfig()).join(',');
   return {HTTP_PROXY:proxy||'',HTTPS_PROXY:proxy||'',ALL_PROXY:'',http_proxy:proxy||'',https_proxy:proxy||'',all_proxy:'',NO_PROXY:bypass,no_proxy:bypass};
  },
  fetcher:async(url,options)=>{
   const proxy=await selected(String(url)),u=client();
   const dispatcher=proxy?new u.ProxyAgent(proxy):new u.Agent();
   try{return await u.fetch(url,{...options,dispatcher});}
   finally{void dispatcher.close().catch(()=>{});}
  }
 };
}
module.exports={cloudNetwork};
