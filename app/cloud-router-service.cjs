'use strict';
// Experimental, opt-in Cloudflare Agent. Legacy Secure MCP Tunnel is unaffected.
// No remote command/file write/Computer Use support until production OAuth/approvals.
const {connectAgent} = require('./cloud-router-agent.cjs');
const {redeem}=require('./cloud-router-pairing.cjs');
const SAFE = Object.freeze(['get_harness_status']);
const FORBIDDEN = new Set(['computer_use','start_process','start_task','write_file','edit_block','apply_project_edit']);
class CloudRouterService {
  constructor({manager, identity, pairStore, fetcher = globalThis.fetch, log = () => {}, onChange = () => {}, WebSocketImpl = globalThis.WebSocket}) {
    if (!manager || !identity?.id || !identity.platform || !identity.name)
      throw new Error('CLOUD_ROUTER_DEVICE_UNAVAILABLE');
    this.manager = manager;
    this.pairStore=pairStore;
    this.fetcher=fetcher;
    this.identity = identity;
    this.log = log;
    this.onChange = onChange;
    this.WebSocketImpl = WebSocketImpl;
    this.agent = null;
    this.phase = 'disabled';
    this.lastError = '';
    this.mcpUrl=null;
    this.devices=[];this.devicesUpdatedAt=null;this.devicesError='';this.devicesRefreshing=false;this.devicesPromise=null;
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
        platform: this.identity.platform, WebSocketImpl: this.WebSocketImpl,
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
    if(!paired) return this.status();
    this.mcpUrl=paired.mcpUrl;
    return this.start({enabled:true,url:paired.agentUrl,token:paired.token});
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
    if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length)
      throw new Error('CLOUD_ROUTER_INVALID_ARGUMENTS');
    // Go through the existing MCP Manager; do not instantiate an unscoped shell or service.
    return this.manager.call(name, args);
  }
  status() {
    return {enabled: this.phase !== 'disabled', phase: this.agent?.connected ? 'ready' : this.phase,
      connected: Boolean(this.agent?.connected), device_id: this.identity.id,
      device_name: this.identity.name, platform: this.identity.platform,
      paired:Boolean(this.mcpUrl),...(this.mcpUrl?{mcp_url:this.mcpUrl}:{}),
      devices:this.devices,devicesUpdatedAt:this.devicesUpdatedAt,
      devicesError:this.devicesError,devicesRefreshing:this.devicesRefreshing,
      ...(this.lastError ? {error: this.lastError} : {})};
  }
  stop() { this.agent?.close(); this.agent = null; this.phase = 'disabled'; this.lastError = ''; }
}
module.exports = {CloudRouterService};
