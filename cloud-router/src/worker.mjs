// Experimental multi-device router. Read cloud-router/README.md before deployment.
import {newPairing,redeemPairing,verifyDevice} from './pairing.mjs';
// No local desktop commands are executed inside this Worker.
const MAX_BODY = 128 * 1024;
const MAX_FRAME = 512 * 1024;
const PROTOCOL_VERSION = '2025-06-18';
const ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'}
});
const rpc = (id, result) => ({jsonrpc: '2.0', id, result});
const rpcError = (id, code, message) => ({jsonrpc: '2.0', id, error: {code, message}});
const error = (code, message) => ({ok: false, code, message});
const textResult = value => ({content: [{type: 'text', text: JSON.stringify(value)}]});

async function equalSecret(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string' || expected.length < 24) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([actual, expected].map(s => crypto.subtle.digest('SHA-256', encoder.encode(s))));
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
function getHub(env) { return env.DEVICE_HUB.get(env.DEVICE_HUB.idFromName('default')); }
function allowedTools(env) {
  const raw = String(env.ALLOWED_TOOLS || 'get_harness_status');
  return new Set(raw.split(',').map(x => x.trim()).filter(Boolean));
}
const registered = ws => {
  const x = ws.deserializeAttachment?.();
  return x?.authenticated && typeof x.device_id === 'string' ? x : null;
};
function currentSocket(ctx, deviceId) {
  return ctx.getWebSockets().find(ws => ws.readyState === 1 && registered(ws)?.device_id === deviceId);
}
export class DeviceHub {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.pending = new Map();
  }
  async fetch(req) {
    const pathname = new URL(req.url).pathname;
    if (pathname === '/pair-create') {
      if (req.method !== 'POST') return new Response('Method not allowed',{status:405});
      return json(await newPairing(this.ctx));
    }
    if (pathname === '/pair-redeem') {
      if(req.method!=='POST') return new Response('Method not allowed',{status:405});
      if(Number(req.headers.get('content-length'))>4096) return json(error('PAIR_INVALID','Invalid pairing request'),413);
      const raw=await req.text();
      if(raw.length>4096)return json(error('PAIR_INVALID','Invalid pairing request'),413);
      let input;try{input=JSON.parse(raw||'null');}catch{return json(error('PAIR_INVALID','Malformed pairing request'),400);}
      const value=await redeemPairing(this.ctx,input);
      return json(value,value.error?403:200);
    }
    if (pathname === '/agent') {
      if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', {status: 426});
      if (this.ctx.getWebSockets().length >= 32) return json(error('DEVICE_LIMIT', 'Too many agent connections'), 429);
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      return new Response(null, {status: 101, webSocket: client});
    }
    if (pathname === '/devices') {
      return json(this.ctx.getWebSockets().filter(ws => ws.readyState === 1).map(registered)
        .filter(Boolean).map(({device_id, name, platform}) => ({device_id, name, platform, online: true}))
        .sort((a,b) => a.device_id.localeCompare(b.device_id)));
    }
    if (pathname === '/invoke') {
      const input = await req.json().catch(() => null);
      if (!input || !ID.test(input.device_id || '') || !ID.test(input.tool_name || '') ||
          !input.arguments || typeof input.arguments !== 'object' || Array.isArray(input.arguments))
        return json(error('BAD_REQUEST', 'Explicit device_id, tool_name and object arguments required'), 400);
      const ws = currentSocket(this.ctx, input.device_id);
      if (!ws) return json(error('DEVICE_OFFLINE', 'Selected device is not connected'), 503);
      const requestId = crypto.randomUUID();
      const ms = Math.max(1000, Math.min(30000, Number(input.timeout_ms) || 15000));
      return new Promise(resolve => {
        const timeout = setTimeout(() => {
          this.pending.delete(requestId);
          resolve(json(error('EXECUTION_UNKNOWN', 'Device response timed out; do not automatically retry'), 504));
        }, ms);
        this.pending.set(requestId, {ws, resolve, timeout});
        try { ws.send(JSON.stringify({type: 'invoke', request_id: requestId, tool_name: input.tool_name, arguments: input.arguments})); }
        catch {
          clearTimeout(timeout); this.pending.delete(requestId);
          resolve(json(error('EXECUTION_UNKNOWN', 'Transport failed; execution state unknown'), 502));
        }
      });
    }
    return new Response('Not found', {status: 404});
  }
  async webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > MAX_FRAME) { ws.close(1009, 'Invalid frame'); return; }
    let item;
    try { item = JSON.parse(message); } catch { ws.close(1003, 'Invalid JSON'); return; }
    const reg = registered(ws);
    if (!reg) {
      if (item?.type !== 'register' || !ID.test(item.device_id || '') ||
          typeof item.name !== 'string' || item.name.length > 80 ||
          !['darwin','win32','linux'].includes(item.platform)) {
        ws.close(1008, 'Invalid registration'); return;
      }
      // Only cloud-issued, device-bound credentials are accepted.
      if (!await verifyDevice(this.ctx,item.device_id,item.token)) { ws.close(1008, 'Unauthorized device'); return; }
      const old = currentSocket(this.ctx, item.device_id);
      if (old && old !== ws) {
        this.failPending(old, 'DEVICE_DISCONNECTED');
        old.close(1000, 'Replaced by newer connection');
      }
      ws.serializeAttachment({authenticated: true, device_id: item.device_id,
        name: item.name, platform: item.platform});
      ws.send(JSON.stringify({type: 'registered', device_id: item.device_id}));
      return;
    }
    if (item?.type !== 'result' || typeof item.request_id !== 'string') return;
    const pending = this.pending.get(item.request_id);
    if (!pending || pending.ws !== ws) return;
    this.pending.delete(item.request_id);
    clearTimeout(pending.timeout);
    pending.resolve(json(item.error ? error('DEVICE_TOOL_ERROR', String(item.error).slice(0,1000))
      : {ok: true, result: item.result}));
  }
  failPending(ws, code) {
    for (const [id, pending] of this.pending) {
      if (pending.ws !== ws) continue;
      clearTimeout(pending.timeout); this.pending.delete(id);
      pending.resolve(json(error(code, 'Connection dropped; operation may have executed'), 502));
    }
  }
  webSocketClose(ws) { this.failPending(ws, 'EXECUTION_UNKNOWN'); }
  webSocketError(ws) { this.failPending(ws, 'EXECUTION_UNKNOWN'); }
}
const tools = [
  {name:'create_pairing_code',description:'Create one short-lived (5 minutes), one-use secret to pair one personal device in its ChatToHarness desktop app. Treat the code as confidential; never paste it publicly.',
    inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name: 'list_devices', description: 'List currently connected and authenticated ChatToHarness devices.',
    inputSchema: {type: 'object', additionalProperties: false, properties: {}}},
  {name: 'call_device_tool', description: 'Invoke a configured read-only tool on one explicitly selected device. Never silently substitute a different device.',
    inputSchema: {type: 'object', additionalProperties: false, required: ['device_id','tool_name','arguments'],
      properties: {device_id: {type: 'string', description: 'Device ID returned by list_devices'},
        tool_name: {type: 'string', description: 'Name of allowed local tool'},
        arguments: {type: 'object', additionalProperties: true}}}}
];
// This dispatcher is never a public Worker entrypoint. OAuthResourceServer must authenticate it.
export const authorizedWorker = {
  async fetch(req, env) {
    const path = new URL(req.url).pathname;
    if (path === '/health' && req.method === 'GET') return json({ok: true, component: 'chattoharness-cloud-router'});
    if (path === '/agent') {
      if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('Upgrade required', {status: 426});
      return getHub(env).fetch(new Request('https://hub.internal/agent', req));
    }
    if (path !== '/mcp') return new Response('Not found', {status: 404});
    if (req.method !== 'POST') return new Response('Use POST', {status: 405, headers: {Allow: 'POST'}});
    if (Number(req.headers.get('content-length')) > MAX_BODY) return json({error: 'request too large'}, 413);
    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({error: 'request too large'}, 413);
    let message;
    try { message = JSON.parse(raw); } catch { return json(rpcError(null, -32700, 'Parse error')); }
    if (!message || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string')
      return json(rpcError(message?.id ?? null, -32600, 'Invalid Request'));
    if (!Object.hasOwn(message, 'id')) return new Response(null, {status: 202});
    const id = message.id;
    if (message.method === 'initialize') return json(rpc(id, {protocolVersion: PROTOCOL_VERSION,
      capabilities: {tools: {}}, serverInfo: {name: 'chattoharness-cloud-router', version: '0.1.0'}}));
    if (message.method === 'ping') return json(rpc(id, {}));
    if (message.method === 'tools/list') return json(rpc(id, {tools}));
    if (message.method !== 'tools/call') return json(rpcError(id, -32601, 'Method not found'));
    const {name, arguments: args = {}} = message.params || {};
    if (name === 'create_pairing_code') {
      const upstream=await getHub(env).fetch(new Request('https://hub.internal/pair-create',{method:'POST'}));
      return json(rpc(id,textResult(await upstream.json())));
    }
    if (name === 'list_devices') {
      const upstream = await getHub(env).fetch('https://hub.internal/devices');
      return json(rpc(id, textResult(await upstream.json())));
    }
    if (name !== 'call_device_tool') return json(rpcError(id, -32602, 'Unknown tool'));
    if (!args || !ID.test(args.device_id || '') || !ID.test(args.tool_name || '') ||
        !args.arguments || typeof args.arguments !== 'object' || Array.isArray(args.arguments))
      return json(rpc(id, {isError: true, ...textResult(error('BAD_REQUEST', 'Explicit device_id/tool_name/arguments required'))}));
    if (!allowedTools(env).has(args.tool_name))
      return json(rpc(id, {isError: true, ...textResult(error('TOOL_DENIED', 'Tool not permitted by cloud allowlist'))}));
    const upstream = await getHub(env).fetch(new Request('https://hub.internal/invoke', {method: 'POST',
      body: JSON.stringify({device_id: args.device_id, tool_name: args.tool_name, arguments: args.arguments}),
      headers: {'content-type': 'application/json'}}));
    const answer = await upstream.json();
    return json(rpc(id, {...textResult(answer.ok ? answer.result : answer), ...(!answer.ok ? {isError: true} : {})}));
  }
};
