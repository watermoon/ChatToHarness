'use strict';
// Experimental, opt-in Cloudflare Agent. Legacy Secure MCP Tunnel is unaffected.
// No remote command/file write/Computer Use support until production OAuth/approvals.
const {connectAgent} = require('./cloud-router-agent.cjs');
const {osProductVersion}=require('./device-os-version.cjs');
const LOCAL_VERSION=require('../package.json').version;
const LOCAL_OS_VERSION=osProductVersion();
const {redeem,beginDevicePairing,pollDevicePairing}=require('./cloud-router-pairing.cjs');
const SAFE = Object.freeze(['get_harness_status','get_tool_result_page','get_tool_result_file']);
const FORBIDDEN = new Set(['computer_use','start_process','start_task','write_file','edit_block','apply_project_edit']);
class CloudRouterService {
  constructor({manager, identity, pairStore, getOwnerKey = () => '', fetcher = globalThis.fetch, log = () => {}, onChange = () => {}, WebSocketImpl = globalThis.WebSocket,socketFactory,getAccountConnection}) {
    if (!manager || !identity?.id || !identity.platform || !identity.name)
      throw new Error('CLOUD_ROUTER_DEVICE_UNAVAILABLE');
    this.manager = manager;this.getAccountConnection=getAccountConnection;
    this.pairStore=pairStore;
    this.getOwnerKey=getOwnerKey;
    this.fetcher=fetcher;
    this.identity = identity;
    this.localOsVersion=LOCAL_OS_VERSION;
    this.log = log;
    this.onChange = onChange;
    this.WebSocketImpl = WebSocketImpl;this.socketFactory=socketFactory;
    this.agent = null;
    this.phase = 'disabled';
    this.lastError = '';
    this.mcpUrl=null;
    this.devices=[];this.devicesUpdatedAt=null;this.devicesError='';this.devicesRefreshing=false;this.devicesPromise=null;
    this.autoPairPending=null;
    this.paused=false;
  }
  start({url, token, enabled = false} = {}) {
    this.stop();
    if (!enabled) return this.status();
    this.phase = 'connecting';
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'wss:' || parsed.username || parsed.password || parsed.search ||
          parsed.hash || !parsed.hostname || parsed.pathname !== '/agent')
        throw new Error('CLOUD_ROUTER_INVALID_URL');
      this.agent = connectAgent({
        url: parsed.href, token, deviceId: this.identity.id, name: this.identity.name,
        platform: this.identity.platform, harnessVersion:LOCAL_VERSION, osVersion:this.localOsVersion, WebSocketImpl: this.WebSocketImpl,socketFactory:this.socketFactory,
        allowedTools: SAFE,
        execute: (name, args) => this.execute(name, args),
        onStatusChange: () => this.onChange(this.status())
      });
      return this.status();
    } catch (error) {
      this.lastError = error.message?.startsWith('CLOUD_') ? error.message : 'CLOUD_ROUTER_CONNECT_FAILED';
      this.phase = 'failed';
      this.log('cloud-router-start-failed', {code: this.lastError});
      return this.status();
    }
  }
  startStored() {
    const paired=this.pairStore?.read();
    if(!paired)return this.status();
    this.mcpUrl=paired.mcpUrl;
    this.paused=paired.paused===true;
    if(this.paused){
      this.stop();
      this.onChange(this.status());
      return this.status();
    }
    return this.start({enabled:true,url:paired.agentUrl,token:paired.token});
  }
  clearLocalPairing(){
    this.stop();this.pairStore.clearLocalPairing();
    this.mcpUrl='';this.devices=[];this.devicesUpdatedAt=null;
    this.devicesError='';this.paused=false;this.onChange(this.status());
    return this.status();
  }
  disconnect() {
    const paired=this.pairStore?.read();
    if(!paired)throw Error('CLOUD_PAIR_NOT_FOUND');
    this.pairStore.setPaused(true);
    this.mcpUrl=paired.mcpUrl;this.paused=true;
    this.stop();this.onChange(this.status());
    return this.status();
  }
  reconnect() {
    const paired=this.pairStore?.read();
    if(!paired)throw Error('CLOUD_PAIR_NOT_FOUND');
    this.pairStore.setPaused(false);this.paused=false;
    const state=this.startStored();
    this.onChange(state);return state;
  }
  async pair({mcpUrl,pairingCode}={}) {
    if(!this.pairStore)throw Error('CLOUD_PAIR_STORE_UNAVAILABLE');
    const token=await redeem({mcpUrl,code:pairingCode,identity:this.identity,fetcher:this.fetcher});
    this.pairStore.save(mcpUrl,token);
    this.mcpUrl=mcpUrl;
    const saved=this.pairStore.read();
    if(!saved)throw Error('CLOUD_PAIR_SECURE_STORAGE_REQUIRED');
    return this.start({enabled:true,url:saved.agentUrl,token:saved.token});
  }
  async connectAccount(mcpUrl){
    if(this.pairStore.read())return this.startStored();
    if(this.autoPairPending)throw Error('CLOUD_SETUP_BUSY');
    const operation={};this.autoPairPending=operation;
    this.phase='connecting';this.onChange(this.status());
    try{
      const account=await this.getAccountConnection({mcpUrl});
      if(this.autoPairPending!==operation)throw Error('CLOUD_CONNECTION_CANCELLED');
      const crypto=require('node:crypto'),token=crypto.randomBytes(32).toString('base64url');
      const result=await this.fetcher(new URL('/account-enroll',account.mcpUrl).href,{
        method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+account.token},
        body:JSON.stringify({device_id:this.identity.id,name:this.identity.name,platform:this.identity.platform,device_token_hash:crypto.createHash('sha256').update(token).digest('hex')}),signal:AbortSignal.timeout(20000)
      });
      const body=await result.json().catch(()=>({}));
      if(this.autoPairPending!==operation)throw Error('CLOUD_CONNECTION_CANCELLED');
      if(!result.ok)throw Error(result.status===403?'CLOUD_ACCOUNT_PERMISSION_DENIED':result.status===400?'CLOUD_ACCOUNT_DEVICE_INVALID':'CLOUD_ACCOUNT_SERVICE_UNAVAILABLE');
      if(body.enrolled!==true||body.device_id!==this.identity.id)throw Error('CLOUD_ACCOUNT_RESPONSE_INVALID');
      this.pairStore.save(account.mcpUrl,token);const saved=this.pairStore.read();
      if(!saved)throw Error('CLOUD_PAIR_SECURE_STORAGE_REQUIRED');
      this.mcpUrl=account.mcpUrl;this.autoPairPending=null;
      const state=this.start({enabled:true,url:saved.agentUrl,token:saved.token});void this.refreshDevices();return state;
    }catch(e){this.phase='failed';this.lastError=String(e.message||'CLOUD_ACCOUNT_ENROLL_FAILED');throw e;}
    finally{if(this.autoPairPending===operation)this.autoPairPending=null;this.onChange(this.status());}
  }
  async autoPair({mcpUrl,openExternal}={}){
    if(this.getAccountConnection)return this.connectAccount(mcpUrl);
    if(!this.pairStore)throw Error('CLOUD_PAIR_STORE_UNAVAILABLE');
    if(this.pairStore.read())return this.startStored();
    if(this.autoPairPending)throw Error('CLOUD_AUTO_PAIR_ALREADY_RUNNING');
    if(typeof openExternal!=='function')throw Error('CLOUD_PAIR_BROWSER_REQUIRED');
    if(!this.pairStore.safeStorage?.isEncryptionAvailable?.())
      throw Error('CLOUD_PAIR_SECURE_STORAGE_REQUIRED');
    this.phase='requesting_approval';this.lastError='';this.onChange(this.status());
    let session;
    try{
      session=await beginDevicePairing({mcpUrl,identity:this.identity,fetcher:this.fetcher});
      this.autoPairPending=session;
      this.phase='awaiting_approval';this.onChange(this.status());
      const ownerKey=this.getOwnerKey(mcpUrl);
      if(ownerKey){
        // Never send Owner Key to an arbitrary URL. main.cjs supplies it only
        // when the URL exactly matches the verified locally managed cloud service.
        const base=new URL(mcpUrl).origin;
        const res=await this.fetcher(base+'/pair-owner-approve',{
          method:'POST',headers:{'content-type':'application/json'},
          body:JSON.stringify({request_id:session.requestId,poll_secret:session.pollSecret,
            owner_secret:ownerKey}),signal:AbortSignal.timeout(12000)
        });
        const result=await res.json().catch(()=>({}));
        if(!res.ok||result.approved!==true)throw Error(result.error||'CLOUD_AUTO_PAIR_OWNER_FAILED');
      }else await openExternal(session.approvalUrl);
    }catch(e){
      this.autoPairPending=null;this.phase='failed';
      this.lastError=String(e?.message||'CLOUD_AUTO_PAIR_FAILED').slice(0,100);
      this.onChange(this.status());throw e;
    }
    // Poll in the app process; no ChatGPT conversation, clipboard or separate code needed.
    void (async()=>{
      while(this.autoPairPending===session && Date.now()<session.expiresAt){
        await new Promise(resolve=>setTimeout(resolve,2500));
        if(this.autoPairPending!==session)return;
        try{
          const status=await pollDevicePairing({session,fetcher:this.fetcher});
          if(status.status==='pending')continue;
          if(status.device_id!==this.identity.id)throw Error('CLOUD_AUTO_PAIR_IDENTITY_MISMATCH');
          this.pairStore.save(session.mcpUrl,session.token);
          this.autoPairPending=null;
          this.mcpUrl=session.mcpUrl;
          const saved=this.pairStore.read();
          if(!saved)throw Error('CLOUD_PAIR_SECURE_STORAGE_REQUIRED');
          this.start({enabled:true,url:saved.agentUrl,token:saved.token});
          void this.refreshDevices();
          return;
        }catch(e){
          if(['CLOUD_AUTO_PAIR_STATUS_FAILED','CLOUD_PAIR_REQUEST_LIMIT'].includes(e.message))continue;
          this.autoPairPending=null;this.phase='failed';
          this.lastError=String(e.message||'CLOUD_AUTO_PAIR_FAILED').slice(0,100);
          this.onChange(this.status());return;
        }
      }
      if(this.autoPairPending===session){
        this.autoPairPending=null;this.phase='failed';
        this.lastError='CLOUD_AUTO_PAIR_EXPIRED';this.onChange(this.status());
      }
    })();
    return this.status();
  }
  async refreshDevices() {
    if(this.devicesPromise)return this.devicesPromise;
    const paired=this.pairStore?.read();
    if(!paired)return this.status();
    this.devicesRefreshing=true;this.onChange(this.status());
    this.devicesPromise=(async()=>{
      try{
        const base=new URL(paired.mcpUrl).origin;
        const res=await this.fetcher(base+'/paired-devices',{
          method:'GET',headers:{authorization:'Bearer '+paired.token,'x-device-id':this.identity.id},
          signal:AbortSignal.timeout(12000)
        });
        if(!res.ok)throw Error('CLOUD_ROSTER_UNAVAILABLE');
        const items=await res.json();
        if(!Array.isArray(items)||items.length>200)throw Error('CLOUD_ROSTER_RESPONSE_INVALID');
        this.devices=items.map(x=>{
          if(!x||!(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/).test(x.device_id) ||
            typeof x.name!=='string'||x.name.length>80 ||
            !['darwin','win32','linux'].includes(x.platform)||typeof x.online!=='boolean')
            throw Error('CLOUD_ROSTER_RESPONSE_INVALID');
          return {device_id:x.device_id,name:x.name,platform:x.platform,
            online:x.online,current:x.device_id===this.identity.id,
            os_version:typeof x.os_version==='string'&&x.os_version.length<=100&&
              !/[\x00-\x1f]/.test(x.os_version)?x.os_version:'',
            harness_version:typeof x.harness_version==='string'&&
              /^[0-9A-Za-z.+-]{1,32}$/.test(x.harness_version)?x.harness_version:'',
            paired_at:Number.isFinite(x.paired_at)?x.paired_at:null};
        });
        this.devicesUpdatedAt=Date.now();this.devicesError='';
      }catch(e){this.devicesError=e.message?.startsWith('CLOUD_')?e.message:'CLOUD_ROSTER_UNAVAILABLE';}
      finally{this.devicesRefreshing=false;this.devicesPromise=null;this.onChange(this.status());}
      return this.status();
    })();
    return this.devicesPromise;
  }
  async execute(name, args) {
    if (FORBIDDEN.has(name) || !SAFE.includes(name)) throw new Error('CLOUD_ROUTER_TOOL_DENIED');
    if (!args || typeof args !== 'object' || Array.isArray(args))
      throw new Error('CLOUD_ROUTER_INVALID_ARGUMENTS');
    const broker=this.manager.broker;
    if(name==='get_harness_status'){
      if(Object.keys(args).length)throw new Error('CLOUD_ROUTER_INVALID_ARGUMENTS');
      // Keep results in the local MCP result store so large read-only output
      // can be recovered through the same two paging tools.
      return broker?.toolCall ? broker.toolCall(name,args) : this.manager.call(name,args);
    }
    const keys=name==='get_tool_result_page'
      ? ['result_id','offset','length']:['result_id','file_index'];
    if(!Object.keys(args).every(key=>keys.includes(key)) ||
       typeof args.result_id!=='string' || !/^result_[a-f0-9]{32}$/.test(args.result_id) ||
       name==='get_tool_result_page'&&
         (args.offset!==undefined&&(!Number.isSafeInteger(args.offset)||args.offset<0) ||
          args.length!==undefined&&(!Number.isSafeInteger(args.length)||args.length<4||args.length>4096)) ||
       name==='get_tool_result_file'&&(!Number.isSafeInteger(args.file_index)||args.file_index<0))
      throw new Error('CLOUD_ROUTER_INVALID_ARGUMENTS');
    if(!broker?.results?.load||!broker?.toolCall)throw new Error('CLOUD_ROUTER_TOOL_UNAVAILABLE');
    // Never let a cloud result ID read saved local shell, file, or other MCP
    // results. Only the explicitly remote-allowed status tool may be paged.
    let record;
    try{record=await broker.results.load(args.result_id);}
    catch{return broker.toolCall(name,args);}
    if(record.source.tool!=='get_harness_status')
      throw new Error('CLOUD_ROUTER_TOOL_DENIED');
    return broker.toolCall(name,args);
  }
  status() {
    return {paused:this.paused,enabled: this.phase !== 'disabled', phase: this.agent?.connected ? 'ready' : this.phase,
      connected: Boolean(this.agent?.connected), device_id: this.identity.id,
      device_name: this.identity.name, platform: this.identity.platform,
      local_harness_version:LOCAL_VERSION, local_os_version:this.localOsVersion,
      paired:Boolean(this.mcpUrl),...(this.mcpUrl?{mcp_url:this.mcpUrl}:{}),
      devices:this.devices,devicesUpdatedAt:this.devicesUpdatedAt,
      devicesError:this.devicesError,devicesRefreshing:this.devicesRefreshing,
      ...(this.lastError ? {error: this.lastError} : {})};
  }
  stop() { this.autoPairPending=null; this.agent?.close(); this.agent = null; this.phase = 'disabled'; this.lastError = ''; }
}
module.exports = {CloudRouterService};
