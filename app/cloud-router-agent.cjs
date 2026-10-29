'use strict';
// Device-side transport. The desktop app must supply an authorized local MCP executor.
// A disconnected call is never replayed; the cloud reports the outcome as unknown.
const VALID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;
function connectAgent({url, deviceId, name, platform, harnessVersion, osVersion, token, execute, allowedTools, WebSocketImpl = globalThis.WebSocket, reconnectMs = 2000, onStatusChange = () => {}}) {
  if (!/^wss:\/\//.test(url) || !VALID.test(deviceId || '') || typeof token !== 'string' ||
      token.length < 24 || typeof execute !== 'function' || typeof WebSocketImpl !== 'function')
    throw new Error('INVALID_AGENT_CONFIGURATION');
  const allow = new Set(allowedTools || ['get_harness_status']);
  let ws, timer, closed = false, authenticated = false, attempt = 0;
  function open() {
    if (closed) return;
    authenticated = false;
    ws = new WebSocketImpl(url);
    const socket = ws;
    socket.addEventListener('open', () => {
      if (closed || socket !== ws) return;
      socket.send(JSON.stringify({type: 'register', device_id: deviceId, name, platform, harness_version:harnessVersion, os_version:osVersion, token}));
    });
    socket.addEventListener('message', async event => {
      if (socket !== ws || closed || typeof event.data !== 'string') return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'registered' && message.device_id === deviceId) {
        authenticated = true; attempt = 0; onStatusChange('ready'); return;
      }
      if (!authenticated || message.type !== 'invoke' || typeof message.request_id !== 'string') return;
      const {tool_name: toolName, arguments: args} = message;
      let reply;
      try {
        if (!allow.has(toolName)) throw new Error('LOCAL_TOOL_DENIED');
        if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('INVALID_ARGUMENTS');
        reply = {type: 'result', request_id: message.request_id, result: await execute(toolName, args)};
      } catch (err) {
        reply = {type: 'result', request_id: message.request_id, error: String(err?.code || err?.message || 'LOCAL_TOOL_FAILED')};
      }
      if (socket === ws && authenticated && socket.readyState === 1) socket.send(JSON.stringify(reply));
    });
    const schedule = () => {
      if (socket !== ws || closed || timer) return;
      authenticated = false;
      onStatusChange('reconnecting');
      const delay = Math.min(30000, reconnectMs * (2 ** Math.min(4, attempt++)));
      timer = setTimeout(() => { timer = undefined; open(); }, delay);
    };
    socket.addEventListener('close', schedule);
    socket.addEventListener('error', schedule);
  }
  open();
  return {
    close() { closed = true; clearTimeout(timer); timer = undefined; ws?.close(); onStatusChange('disabled'); },
    get connected() { return !closed && authenticated && ws?.readyState === 1; }
  };
}
module.exports = {connectAgent};
