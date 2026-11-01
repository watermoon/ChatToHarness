'use strict';
// Device-side transport. The desktop app must supply an authorized local MCP executor.
// A disconnected call is never replayed; the cloud reports the outcome as unknown.
const VALID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;

function connectAgent({
  url, deviceId, name, platform, harnessVersion, osVersion, token, execute,
  catalogProvider, allowedTools, WebSocketImpl = globalThis.WebSocket,
  socketFactory, reconnectMs = 2000, onStatusChange = () => {}
}) {
  if (!/^wss:\/\//.test(url) || !VALID.test(deviceId || '') || typeof token !== 'string' ||
      token.length < 24 || typeof execute !== 'function' || typeof WebSocketImpl !== 'function')
    throw new Error('INVALID_AGENT_CONFIGURATION');

  const legacyAllow = new Set(allowedTools || []);
  let ws, timer, closed = false, authenticated = false, attempt = 0, generation = 0;
  let lastSentCatalogVersion = '';

  function currentCatalog() {
    if (typeof catalogProvider !== 'function') return null;
    try {
      const catalog = catalogProvider();
      if (!catalog || catalog.schema_version !== 1 ||
          typeof catalog.version !== 'string' || !/^[a-f0-9]{64}$/.test(catalog.version) ||
          !Array.isArray(catalog.tools)) return null;
      return catalog;
    } catch { return null; }
  }

  function catalogPayload() {
    const catalog = currentCatalog();
    return catalog ? {
      schema_version: catalog.schema_version,
      version: catalog.version,
      tools: catalog.tools
    } : null;
  }

  function sendCatalog(socket = ws, type = 'catalog_update') {
    if (closed || !authenticated || socket !== ws || socket?.readyState !== 1) return false;
    const catalog = catalogPayload();
    if (!catalog) return false;
    if (type === 'catalog_update' && catalog.version === lastSentCatalogVersion) return true;
    socket.send(JSON.stringify({type, catalog}));
    lastSentCatalogVersion = catalog.version;
    return true;
  }

  function allowedTool(name, catalog = currentCatalog()) {
    if (catalog) return catalog.tools.some(item => item?.name === name);
    return legacyAllow.has(name);
  }

  function open() {
    if (closed) return;
    authenticated = false;
    lastSentCatalogVersion = '';
    const current = ++generation;
    if (socketFactory) {
      Promise.resolve().then(() => socketFactory(url)).then(socket => {
        if (closed || current !== generation) { socket.close(); return; }
        attach(socket);
      }).catch(() => {
        if (closed || current !== generation) return;
        onStatusChange('reconnecting');
        timer = setTimeout(() => { timer = undefined; open(); },
          Math.min(30000, reconnectMs * (2 ** Math.min(4, attempt++))));
      });
    } else attach(new WebSocketImpl(url));
  }

  function attach(socket) {
    ws = socket;
    socket.addEventListener('open', () => {
      if (closed || socket !== ws) return;
      const catalog = catalogPayload();
      socket.send(JSON.stringify({
        type: 'register', device_id: deviceId, name, platform,
        harness_version: harnessVersion, os_version: osVersion, token,
        ...(catalog ? {catalog} : {})
      }));
      if (catalog) lastSentCatalogVersion = catalog.version;
    });
    socket.addEventListener('message', async event => {
      if (socket !== ws || closed || typeof event.data !== 'string') return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'registered' && message.device_id === deviceId) {
        authenticated = true;
        attempt = 0;
        const catalog = currentCatalog();
        if (catalog && message.catalog_version !== catalog.version) {
          lastSentCatalogVersion = '';
          sendCatalog(socket);
        }
        onStatusChange('ready');
        return;
      }
      if (message.type === 'catalog_ack' || message.type === 'catalog_rejected') return;
      if (!authenticated || message.type !== 'invoke' || typeof message.request_id !== 'string') return;
      const {tool_name: toolName, arguments: args} = message;
      let reply;
      try {
        const catalog = currentCatalog();
        if (message.catalog_version && catalog?.version !== message.catalog_version)
          throw new Error('CATALOG_VERSION_STALE');
        if (!allowedTool(toolName, catalog)) throw new Error('LOCAL_TOOL_DENIED');
        if (!args || typeof args !== 'object' || Array.isArray(args))
          throw new Error('INVALID_ARGUMENTS');
        reply = {type: 'result', request_id: message.request_id, result: await execute(toolName, args, {expiresAt:message.expires_at})};
      } catch (err) {
        reply = {type: 'result', request_id: message.request_id,
          error: String(err?.code || err?.message || 'LOCAL_TOOL_FAILED')};
      }
      if (socket === ws && authenticated && socket.readyState === 1)
        socket.send(JSON.stringify(reply));
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
    close() {
      closed = true;
      clearTimeout(timer);
      timer = undefined;
      ws?.close();
      onStatusChange('disabled');
    },
    syncCatalog() { return sendCatalog(); },
    get connected() { return !closed && authenticated && ws?.readyState === 1; }
  };
}

module.exports = {connectAgent};
