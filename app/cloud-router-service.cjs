'use strict';
// Experimental, opt-in Cloudflare Agent. Legacy Secure MCP Tunnel is unaffected.
// No remote command/file write/Computer Use support until production OAuth/approvals.
const {connectAgent} = require('./cloud-router-agent.cjs');
const SAFE = Object.freeze(['get_harness_status']);
const FORBIDDEN = new Set(['computer_use','start_process','start_task','write_file','edit_block','apply_project_edit']);
class CloudRouterService {
  constructor({manager, identity, log = () => {}, onChange = () => {}, WebSocketImpl = globalThis.WebSocket}) {
    if (!manager || !identity?.id || !identity.platform || !identity.name)
      throw new Error('CLOUD_ROUTER_DEVICE_UNAVAILABLE');
    this.manager = manager;
    this.identity = identity;
    this.log = log;
    this.onChange = onChange;
    this.WebSocketImpl = WebSocketImpl;
    this.agent = null;
    this.phase = 'disabled';
    this.lastError = '';
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
      ...(this.lastError ? {error: this.lastError} : {})};
  }
  stop() { this.agent?.close(); this.agent = null; this.phase = 'disabled'; this.lastError = ''; }
}
module.exports = {CloudRouterService};
