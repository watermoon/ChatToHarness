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
const MAX_CATALOG_TOOLS = 128;
const MAX_CATALOG_BYTES = 192 * 1024;
const MAX_TOOL_BYTES = 16 * 1024;
const DENIED_REMOTE_TOOLS = new Set([
  'computer_use','start_process','start_task','interact_with_process','write_file','write_pdf',
  'edit_block','apply_project_edit','undo_project_edit','move_file','create_directory',
  'force_terminate','kill_process','set_config_value','cancel_task','stop_search',
  'give_feedback_to_desktop_commander','get_config','get_recent_tool_calls','read_process_output'
]);
const SAFE_ANNOTATIONS = {readOnlyHint:true,destructiveHint:false,openWorldHint:false};
const LEGACY_CATALOG = Object.freeze({
  schema_version:1,
  version:'0000000000000000000000000000000000000000000000000000000000000000',
  tools:[
    {name:'get_harness_status',description:'Read Harness status and bounded tool inventory.',
      inputSchema:{type:'object',properties:{cursor:{type:'string'},limit:{type:'integer',minimum:1,maximum:200}},additionalProperties:false},
      annotations:{...SAFE_ANNOTATIONS,idempotentHint:true}},
    {name:'get_tool_result_page',description:'Read a saved page from get_harness_status.',
      inputSchema:{type:'object',properties:{result_id:{type:'string'},offset:{type:'integer',minimum:0},length:{type:'integer',minimum:4,maximum:4096}},required:['result_id'],additionalProperties:false},
      annotations:{...SAFE_ANNOTATIONS,idempotentHint:true}},
    {name:'get_tool_result_file',description:'Read a saved result file from get_harness_status.',
      inputSchema:{type:'object',properties:{result_id:{type:'string'},file_index:{type:'integer',minimum:0}},required:['result_id','file_index'],additionalProperties:false},
      annotations:{...SAFE_ANNOTATIONS,idempotentHint:true}}
  ]
});
function deniedRemoteName(name) {
  const bare=String(name||'').split('__').pop();
  return DENIED_REMOTE_TOOLS.has(bare);
}
async function validateCatalog(value) {
  // Keep the exact pre-catalog protocol snapshot available for older paired agents.
  if (value?.version===LEGACY_CATALOG.version &&
      JSON.stringify(value)===JSON.stringify(LEGACY_CATALOG)) return LEGACY_CATALOG;
  if (!value || value.schema_version!==1 || !/^[a-f0-9]{64}$/.test(value.version||'') ||
      !Array.isArray(value.tools) || value.tools.length>MAX_CATALOG_TOOLS) return null;
  const names=new Set(), tools=[];
  for (const item of value.tools) {
    if (!item || typeof item!=='object' || !ID.test(item.name||'') || names.has(item.name) ||
        (deniedRemoteName(item.name)&&!item.remoteGrant)) return null;
    const hints=item.annotations;
    const schema=item.inputSchema;
    const name=String(item.name).split('__').pop();
    const expectedMode=name==='computer_use'?'session':
      ['kill_process','force_terminate','move_file','undo_project_edit',
       'start_process','start_task','interact_with_process','set_config_value'].includes(name)?'per_call':'persistent';
    const grant=item.remoteGrant;
    if(grant!==undefined && (!grant || typeof grant!=='object'||Array.isArray(grant) ||
        Object.keys(grant).length!==1 || grant.mode!==expectedMode))return null;
    if((!grant && (hints?.readOnlyHint!==true || hints?.destructiveHint!==false || hints?.openWorldHint!==false)) ||
        (grant && (!hints || typeof hints.readOnlyHint!=='boolean' ||
          typeof hints.destructiveHint!=='boolean' || typeof hints.openWorldHint!=='boolean')) ||
        !schema || typeof schema!=='object' || Array.isArray(schema) || schema.type!=='object' ||
        !schema.properties || typeof schema.properties!=='object' || Array.isArray(schema.properties) ||
        typeof item.description!=='string' || item.description.length>2048) return null;
    const tool={name:item.name,description:item.description,inputSchema:schema,
      annotations:{readOnlyHint:hints.readOnlyHint===true,destructiveHint:hints.destructiveHint===true,
        idempotentHint:hints.idempotentHint===true,openWorldHint:hints.openWorldHint===true},
      ...(grant?{remoteGrant:{mode:expectedMode}}:{})};
    if (new TextEncoder().encode(JSON.stringify(tool)).length>MAX_TOOL_BYTES) return null;
    names.add(item.name);tools.push(tool);
  }
  const serialized=JSON.stringify({schema_version:1,tools});
  if (new TextEncoder().encode(serialized).length>MAX_CATALOG_BYTES) return null;
  const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(serialized));
  const version=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  if (version!==value.version) return null;
  return {schema_version:1,version,tools};
}
function pageCatalog(catalog,cursor,limit) {
  const count=limit===undefined?32:Number(limit);
  if (!Number.isSafeInteger(count)||count<1||count>64) return null;
  let offset=0;
  if(cursor!==undefined){
    const match=/^(?<version>[a-f0-9]{64}):(?<offset>\d+)$/.exec(String(cursor));
    if(!match||match.groups.version!==catalog.version||Number(match.groups.offset)>=catalog.tools.length)return null;
    offset=Number(match.groups.offset);
  }
  const tools=catalog.tools.slice(offset,offset+count),next=offset+tools.length;
  return {schema_version:1,catalog_version:catalog.version,tools,
    ...(next<catalog.tools.length?{next_cursor:`${catalog.version}:${next}`}:{})};
}
function allowedTools(env) {
  const raw = String(env.ALLOWED_TOOLS || '').trim();
  return raw ? new Set(raw.split(',').map(x => x.trim()).filter(Boolean)) : null;
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
          os_version:item.os_version||'',paired_at:item.paired_at||null,
          catalog_version:item.catalog_version||'',catalog_count:Number.isSafeInteger(item.catalog_count)?item.catalog_count:0});
      }
      return json(devices.sort((a,b)=>a.device_id.localeCompare(b.device_id)));
    }
    if (pathname === '/catalog') {
      if (req.method !== 'POST') return new Response('Method not allowed',{status:405});
      const input=await req.json().catch(()=>null);
      if(!input||!ID.test(input.device_id||'')||
         input.cursor!==undefined&&typeof input.cursor!=='string')
        return json(error('BAD_REQUEST','Explicit device_id and optional catalog cursor required'),400);
      const stored=await this.ctx.storage.get('catalog:'+input.device_id);
      const catalog=stored===undefined?LEGACY_CATALOG:await validateCatalog(stored);
      if(!catalog)return json(error('DEVICE_CATALOG_UNAVAILABLE','The device has not published a valid catalog'),503);
      const page=pageCatalog(catalog,input.cursor,input.limit);
      if(!page)return json(error('CATALOG_CURSOR_EXPIRED','Catalog cursor or page size is invalid'),409);
      return json({ok:true,device_id:input.device_id,online:Boolean(currentSocket(this.ctx,input.device_id)),...page});
    }
    if (pathname === '/invoke') {
      const input = await req.json().catch(() => null);
      if (!input || !ID.test(input.device_id || '') || !ID.test(input.tool_name || '') ||
          !input.arguments || typeof input.arguments !== 'object' || Array.isArray(input.arguments) ||
          input.catalog_version!==undefined&&!/^[a-f0-9]{64}$/.test(input.catalog_version))
        return json(error('BAD_REQUEST', 'Explicit device_id, tool_name and object arguments required'), 400);
      const stored=await this.ctx.storage.get('catalog:'+input.device_id);
      const catalog=stored===undefined?LEGACY_CATALOG:await validateCatalog(stored);
      if(!catalog)return json(error('DEVICE_CATALOG_UNAVAILABLE','The device has not published a valid catalog'),503);
      if(input.catalog_version&&input.catalog_version!==catalog.version)
        return json(error('CATALOG_VERSION_STALE','Refresh list_device_tools before invoking this tool'),409);
      if(!catalog.tools.some(tool=>tool.name===input.tool_name))
        return json(error('TOOL_DENIED','Tool is not present in the selected device catalog'),403);
      const cap=allowedTools(this.env);
      if(cap&&!cap.has(input.tool_name))
        return json(error('TOOL_DENIED','Tool is not permitted by the cloud policy'),403);
      const ws = currentSocket(this.ctx, input.device_id);
      if (!ws) return json(error('DEVICE_OFFLINE', 'Selected device is not connected'), 503);
      const requestId = crypto.randomUUID();
      const grantedTool=catalog.tools.find(tool=>tool.name===input.tool_name);
      const needsLocalConfirmation=['session','per_call'].includes(grantedTool?.remoteGrant?.mode);
      const ms = Math.max(1000, Math.min(30000, Number(input.timeout_ms) || (needsLocalConfirmation?30000:15000)));
      return new Promise(resolve => {
        const timeout = setTimeout(() => {
          this.pending.delete(requestId);
          resolve(json(error('EXECUTION_UNKNOWN', 'Device response timed out; do not automatically retry'), 504));
        }, ms);
        this.pending.set(requestId, {ws, resolve, timeout});
        try { ws.send(JSON.stringify({type: 'invoke', request_id: requestId, tool_name: input.tool_name,
          catalog_version:catalog.version, arguments: input.arguments,expires_at:Date.now()+ms})); }
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
      const catalog=item.catalog===undefined?LEGACY_CATALOG:await validateCatalog(item.catalog);
      if(!catalog){ws.close(1008,'Invalid tool catalog');return;}
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
      await this.ctx.storage.put('catalog:'+item.device_id,catalog);
      const original=await this.ctx.storage.get('device:'+item.device_id);
      if(original)await this.ctx.storage.put('device:'+item.device_id,{
        ...original,
        ...(item.harness_version?{harness_version:item.harness_version}:{}),
        ...(item.os_version?{os_version:item.os_version}:{}),
        catalog_version:catalog.version,catalog_count:catalog.tools.length
      });
      ws.serializeAttachment({authenticated:true,device_id:item.device_id,
        name:item.name,platform:item.platform,catalog_version:catalog.version});
      ws.send(JSON.stringify({type:'registered',device_id:item.device_id,catalog_version:catalog.version}));
      return;
    }
    if(item?.type==='catalog_update'){
      if(currentSocket(this.ctx,reg.device_id)!==ws)return;
      const catalog=await validateCatalog(item.catalog);
      if(!catalog){
        ws.send(JSON.stringify({type:'catalog_rejected',code:'CATALOG_INVALID'}));
        return;
      }
      await this.ctx.storage.put('catalog:'+reg.device_id,catalog);
      const original=await this.ctx.storage.get('device:'+reg.device_id);
      if(original)await this.ctx.storage.put('device:'+reg.device_id,{
        ...original,catalog_version:catalog.version,catalog_count:catalog.tools.length
      });
      ws.serializeAttachment({...reg,catalog_version:catalog.version});
      ws.send(JSON.stringify({type:'catalog_ack',catalog_version:catalog.version}));
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
  {name:'list_device_tools',description:'List the current remote-safe MCP tool catalog for one explicitly selected device. Returns catalog version and pagination cursor.',
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
    inputSchema:{type:'object',additionalProperties:false,required:['device_id'],
      properties:{device_id:{type:'string',description:'Device ID returned by list_devices'},
        cursor:{type:'string',description:'Opaque next_cursor from the previous page'},
        limit:{type:'integer',minimum:1,maximum:64,default:32}}}},
  {name: 'call_device_tool', description: 'Invoke a tool present in the selected device current remote-safe catalog. Never silently substitute a different device.',
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:true},
    inputSchema: {type: 'object', additionalProperties: false, required: ['device_id','tool_name','catalog_version','arguments'],
      properties: {device_id: {type: 'string', description: 'Device ID returned by list_devices'},
        tool_name: {type: 'string', description: 'Tool name from list_device_tools'},
        catalog_version: {type:'string',pattern:'^[a-f0-9]{64}$',description:'Catalog version returned by list_device_tools; refresh the catalog if stale'},
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
    if (name === 'list_device_tools') {
      const allowedKeys=['device_id','cursor','limit'];
      if(!args||typeof args!=='object'||Array.isArray(args)||
         !Object.keys(args).every(key=>allowedKeys.includes(key))||
         !ID.test(args.device_id||'')||
         args.cursor!==undefined&&typeof args.cursor!=='string'||
         args.limit!==undefined&&(!Number.isSafeInteger(args.limit)||args.limit<1||args.limit>64))
        return json(rpc(id,{isError:true,...textResult(error('BAD_REQUEST','Explicit device_id and valid catalog page options required'))}));
      const upstream=await getHub(env).fetch(new Request('https://hub.internal/catalog',{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(args)
      }));
      const answer=await upstream.json();
      return json(rpc(id,{...textResult(answer),structuredContent:answer,...(answer.ok===true?{}:{isError:true})}));
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
        !routed.arguments || typeof routed.arguments !== 'object' || Array.isArray(routed.arguments) ||
        name==='call_device_tool'&&!/^[a-f0-9]{64}$/.test(routed.catalog_version||''))
      return json(rpc(id, {isError: true, ...textResult(error('BAD_REQUEST', 'Explicit device_id/tool_name/catalog_version/arguments required'))}));
    const cloudCap=allowedTools(env);
    if (cloudCap && !cloudCap.has(routed.tool_name))
      return json(rpc(id, {isError: true, ...textResult(error('TOOL_DENIED', 'Tool not permitted by cloud policy'))}));
    const upstream = await getHub(env).fetch(new Request('https://hub.internal/invoke', {method: 'POST',
      body: JSON.stringify(routed),
      headers: {'content-type': 'application/json'}}));
    const answer = await upstream.json();
    return json(rpc(id, {...textResult(answer.ok ? answer.result : answer), ...(!answer.ok ? {isError: true} : {})}));
  }
};
