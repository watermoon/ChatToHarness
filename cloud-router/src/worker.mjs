// Experimental multi-device router. Read cloud-router/README.md before deployment.
import {newPairing,redeemPairing,verifyDevice,requestDevicePairing,pairingRequestDetails,approveDevicePairing,devicePairingStatus} from './pairing.mjs';
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
// Only expose documented, diagnostic OpenAI hints from this particular tools/call.
// The request's _meta is untrusted client input, not device identification or authorization.
function inspectClientContext(input) {
  const meta = input && typeof input === 'object' && !Array.isArray(input) ? input : null;
  const has = key => !!meta && Object.hasOwn(meta, key);
  const stringField = (key, max) => {
    const raw = has(key) ? meta[key] : null;
    const valid = typeof raw === 'string' && raw.length > 0;
    return {present: has(key), value: valid ? raw.slice(0, max) : null,
      ...(valid && raw.length > max ? {truncated: true} : {})};
  };
  const rawLocation = has('openai/userLocation') ? meta['openai/userLocation'] : null;
  let location = null;
  if (rawLocation && typeof rawLocation === 'object' && !Array.isArray(rawLocation)) {
    const selected = {};
    for (const key of ['city', 'region', 'country', 'timezone']) {
      if (typeof rawLocation[key] === 'string' && rawLocation[key].length)
        selected[key] = rawLocation[key].slice(0, 128);
    }
    for (const [key, limit] of [['latitude', 90], ['longitude', 180]]) {
      if (typeof rawLocation[key] === 'number' && Number.isFinite(rawLocation[key]) &&
          Math.abs(rawLocation[key]) <= limit) selected[key] = rawLocation[key];
    }
    if (Object.keys(selected).length) location = selected;
  }
  const fields = {
    'openai/session': stringField('openai/session', 256),
    'openai/userAgent': stringField('openai/userAgent', 512),
    'openai/userLocation': {present: has('openai/userLocation'), value: location},
    'openai/locale': stringField('openai/locale', 64),
    'openai/subject': {present: has('openai/subject'), value: null, redacted: true},
    'openai/organization': {present: has('openai/organization'), value: null, redacted: true}
  };
  return {source: 'params._meta', request_meta_present: !!meta, fields,
    note: 'OpenAI client metadata is optional and unverified. It does not reveal the local IP or reliably identify a device.'};
}

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
  const raw = String(env.ALLOWED_TOOLS || 'get_harness_status,get_tool_result_page,get_tool_result_file');
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
    if(pathname==='/account-enroll'&&req.method==='POST'){
      const raw=await req.text();if(raw.length>2048)return json({error:'DEVICE_INVALID'},413);
      let input;try{input=JSON.parse(raw);}catch{return json({error:'DEVICE_INVALID'},400);}
      if(!ID.test(input?.device_id||'')||typeof input.name!=='string'||!input.name.trim()||input.name.length>80||!['win32','darwin','linux'].includes(input.platform)||!/^[a-f0-9]{64}$/.test(input.device_token_hash||''))return json({error:'DEVICE_INVALID'},400);
      await this.ctx.storage.transaction(async tx=>{
        const key='device:'+input.device_id,old=await tx.get(key);
        await tx.put(key,{hash:input.device_token_hash,name:input.name,platform:input.platform,paired_at:old?.paired_at||Date.now()});
      });
      return json({device_id:input.device_id,enrolled:true});
    }
    if(pathname==='/internal-reset-device-hub' && req.method==='POST'){
      for(const ws of this.ctx.getWebSockets()){
        try{ws.close(1001,'Service reset');}catch{}
      }
      await this.ctx.storage.deleteAlarm?.();
      await this.ctx.storage.deleteAll();
      return json({cleared:true},200);
    }
    if(['/pair-request','/pair-status','/pair-request-details','/pair-request-approve'].includes(pathname)){
      if(req.method!==(pathname==='/pair-request-details'?'GET':'POST'))
        return new Response('Method not allowed',{status:405});
      let input={};
      if(req.method==='POST'){
        if(Number(req.headers.get('content-length'))>4096)return json(error('PAIR_INVALID','Oversized request'),413);
        const raw=await req.text();
        if(raw.length>4096)return json(error('PAIR_INVALID','Oversized request'),413);
        try{input=JSON.parse(raw);}catch{return json(error('PAIR_INVALID','Malformed JSON'),400);}
      }
      const value=pathname==='/pair-request'?await requestDevicePairing(this.ctx,input):
        pathname==='/pair-status'?await devicePairingStatus(this.ctx,input?.request_id,input?.poll_secret):
        pathname==='/pair-request-approve'?await approveDevicePairing(this.ctx,input?.request_id):
        await pairingRequestDetails(this.ctx,new URL(req.url).searchParams.get('request'));
      return json(value,value.error?(/LIMIT/.test(value.error)?429:403):200);
    }
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
    if (pathname === '/devices' || pathname === '/paired-devices') {
      if (req.method !== 'GET') return new Response('Method not allowed',{status:405});
      if (pathname === '/paired-devices') {
        const deviceId=req.headers.get('x-device-id');
        const header=req.headers.get('authorization')||'';
        const token=header.startsWith('Bearer ')?header.slice(7):'';
        if (!await verifyDevice(this.ctx,deviceId,token))
          return json({error:'UNAUTHORIZED_DEVICE'},401);
      }
      const entries=await this.ctx.storage.list({prefix:'device:',limit:200});
      const online=new Set(this.ctx.getWebSockets().filter(ws=>ws.readyState===1)
        .map(registered).filter(Boolean).map(item=>item.device_id));
      const devices=[];
      for (const [key,item] of entries) {
        if (!item || !ID.test(key.slice(7)) ||
          typeof item.name!=='string' || typeof item.platform!=='string') continue;
        devices.push({device_id:key.slice(7),name:item.name,platform:item.platform,
          online:online.has(key.slice(7)),harness_version:item.harness_version||'',
          os_version:item.os_version||'',paired_at:item.paired_at||null});
      }
      return json(devices.sort((a,b)=>a.device_id.localeCompare(b.device_id)));
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
      if(item.harness_version!==undefined&&
         (typeof item.harness_version!=='string'||!/^[0-9A-Za-z.+-]{1,32}$/.test(item.harness_version))){
        ws.close(1008,'Invalid version');return;
      }
      if(item.os_version!==undefined&&
         (typeof item.os_version!=='string'||item.os_version.length>100||
           /[\x00-\x1f]/.test(item.os_version))){
        ws.close(1008,'Invalid OS version');return;
      }
      if(item.harness_version||item.os_version){
        const original=await this.ctx.storage.get('device:'+item.device_id);
        if(original)await this.ctx.storage.put('device:'+item.device_id,{
          ...original,
          ...(item.harness_version?{harness_version:item.harness_version}:{}),
          ...(item.os_version?{os_version:item.os_version}:{})
        });
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
  {name: 'inspect_client_context', description: 'Read only optional OpenAI metadata from this MCP request. Diagnostic hints are not proof of client OS, device ID or local IP.',
    annotations: {readOnlyHint: true, destructiveHint: false, openWorldHint: false},
    inputSchema: {type: 'object', additionalProperties: false, properties: {}}},
  {name: 'get_tool_result_page', description: 'Read a previously saved result page on an explicitly selected device without repeating the original tool call.',
    annotations: {readOnlyHint:true,destructiveHint:false,idempotentHint:true},
    inputSchema: {type:'object',additionalProperties:false,required:['device_id','result_id'],properties:{device_id:{type:'string'},result_id:{type:'string'},offset:{type:'integer',minimum:0},length:{type:'integer',minimum:4,maximum:4096}}}},
  {name: 'get_tool_result_file', description: 'Read one deferred result file on an explicitly selected device without repeating the original tool call.',
    annotations: {readOnlyHint:true,destructiveHint:false,idempotentHint:true},
    inputSchema: {type:'object',additionalProperties:false,required:['device_id','result_id','file_index'],properties:{device_id:{type:'string'},result_id:{type:'string'},file_index:{type:'integer',minimum:0}}}},
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
    if (message.method === 'tools/list') return json(rpc(id, {tools:env.CF_ACCOUNT_ID?tools.filter(t=>t.name!=='create_pairing_code'):tools}));
    if (message.method !== 'tools/call') return json(rpcError(id, -32601, 'Method not found'));
    const {name, arguments: args = {}} = message.params || {};
    if (name === 'create_pairing_code') {
      if(env.CF_ACCOUNT_ID)return json(rpcError(id,-32601,'Use Cloudflare account connection'));
      const upstream=await getHub(env).fetch(new Request('https://hub.internal/pair-create',{method:'POST'}));
      return json(rpc(id,textResult(await upstream.json())));
    }
    if (name === 'list_devices') {
      const upstream = await getHub(env).fetch('https://hub.internal/devices');
      return json(rpc(id, textResult(await upstream.json())));
    }
    if (name === 'inspect_client_context') {
      if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length)
        return json(rpc(id, {isError: true, ...textResult(error('BAD_REQUEST', 'No arguments accepted'))}));
      const result = inspectClientContext(message.params?._meta);
      return json(rpc(id, {...textResult(result), structuredContent: result}));
    }
    if (!['call_device_tool','get_tool_result_page','get_tool_result_file'].includes(name))
      return json(rpcError(id, -32602, 'Unknown tool'));
    const routed=name==='call_device_tool'?args:{device_id:args?.device_id,tool_name:name,
      arguments:name==='get_tool_result_page'
        ? {result_id:args?.result_id,...(args?.offset===undefined?{}:{offset:args.offset}),...(args?.length===undefined?{}:{length:args.length})}
        : {result_id:args?.result_id,file_index:args?.file_index}};
    if (!routed || !ID.test(routed.device_id || '') || !ID.test(routed.tool_name || '') ||
        !routed.arguments || typeof routed.arguments !== 'object' || Array.isArray(routed.arguments))
      return json(rpc(id, {isError: true, ...textResult(error('BAD_REQUEST', 'Explicit device_id/tool_name/arguments required'))}));
    if (!allowedTools(env).has(routed.tool_name))
      return json(rpc(id, {isError: true, ...textResult(error('TOOL_DENIED', 'Tool not permitted by cloud allowlist'))}));
    const upstream = await getHub(env).fetch(new Request('https://hub.internal/invoke', {method: 'POST',
      body: JSON.stringify(routed),
      headers: {'content-type': 'application/json'}}));
    const answer = await upstream.json();
    return json(rpc(id, {...textResult(answer.ok ? answer.result : answer), ...(!answer.ok ? {isError: true} : {})}));
  }
};
