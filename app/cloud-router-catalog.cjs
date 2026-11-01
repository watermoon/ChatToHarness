'use strict';

const crypto = require('node:crypto');

const MAX_CATALOG_TOOLS = 128;
const MAX_CATALOG_BYTES = 192 * 1024;
const MAX_TOOL_BYTES = 16 * 1024;
const SAFE_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false
});

// Read-only does not mean harmless. Keep sensitive diagnostics and all mutation/
// execution entry points out of the remote surface even if a provider mislabels them.
const DENIED_TOOL_NAMES = new Set([
  'computer_use',
  'start_process',
  'start_task',
  'interact_with_process',
  'write_file',
  'write_pdf',
  'edit_block',
  'apply_project_edit',
  'undo_project_edit',
  'move_file',
  'create_directory',
  'force_terminate',
  'kill_process',
  'set_config_value',
  'cancel_task',
  'stop_search',
  'give_feedback_to_desktop_commander',
  'get_config',
  'get_recent_tool_calls',
  'read_process_output'
]);

function bareName(name) {
  const parts = String(name || '').split('__');
  return parts[parts.length - 1];
}

function isRemoteEligible(tool) {
  if (!tool || typeof tool !== 'object' || Array.isArray(tool)) return false;
  if (typeof tool.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(tool.name)) return false;
  if (DENIED_TOOL_NAMES.has(bareName(tool.name))) return false;
  const hints = tool.annotations;
  return hints?.readOnlyHint === true &&
    hints?.destructiveHint === false &&
    hints?.openWorldHint === false;
}

function copyDefinition(tool, access) {
  const safe = isRemoteEligible(tool);
  if (access && !access.enabled(tool)) return null;
  const granted = !safe && access?.enabled(tool) === true;
  if (!safe && !granted) return null;
  if (!tool.inputSchema || typeof tool.inputSchema !== 'object' ||
      Array.isArray(tool.inputSchema) || tool.inputSchema.type !== 'object' ||
      !tool.inputSchema.properties || typeof tool.inputSchema.properties !== 'object' ||
      Array.isArray(tool.inputSchema.properties)) return null;

  const definition = {
    name: tool.name,
    description: typeof tool.description === 'string' ? tool.description.slice(0, 2048) : '',
    inputSchema: JSON.parse(JSON.stringify(tool.inputSchema)),
    annotations: {
      readOnlyHint: granted ? tool.annotations?.readOnlyHint === true : SAFE_ANNOTATIONS.readOnlyHint,
      destructiveHint: granted ? tool.annotations?.destructiveHint === true : SAFE_ANNOTATIONS.destructiveHint,
      idempotentHint: tool.annotations?.idempotentHint === true,
      openWorldHint: granted ? tool.annotations?.openWorldHint === true : SAFE_ANNOTATIONS.openWorldHint
    },
    ...(granted ? {remoteGrant:{mode:access.mode(tool.name)}} : {})
  };
  if (Buffer.byteLength(JSON.stringify(definition), 'utf8') > MAX_TOOL_BYTES) return null;
  return definition;
}

function createDeviceCatalog(manager, access) {
  const source = [
    ...(manager?.broker?.results?.tools?.() || []),
    ...(manager?.visibleTools?.() || [])
  ];
  const byName = new Map();
  for (const item of source) {
    const definition = copyDefinition(item, access);
    if (definition && !byName.has(definition.name)) byName.set(definition.name, definition);
  }
  const tools = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (tools.length > MAX_CATALOG_TOOLS) throw new Error('CLOUD_ROUTER_CATALOG_TOO_LARGE');
  const serialized = JSON.stringify({schema_version: 1, tools});
  if (Buffer.byteLength(serialized, 'utf8') > MAX_CATALOG_BYTES)
    throw new Error('CLOUD_ROUTER_CATALOG_TOO_LARGE');
  const version = crypto.createHash('sha256').update(serialized).digest('hex');
  return {schema_version: 1, version, tools};
}

function pageDeviceCatalog(catalog, {cursor, limit = 32} = {}) {
  if (!catalog || catalog.schema_version !== 1 || !/^[a-f0-9]{64}$/.test(catalog.version || '') ||
      !Array.isArray(catalog.tools)) throw new Error('CLOUD_ROUTER_CATALOG_UNAVAILABLE');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 64)
    throw new Error('CLOUD_ROUTER_INVALID_ARGUMENTS');
  let offset = 0;
  if (cursor !== undefined) {
    const match = /^(?<version>[a-f0-9]{64}):(?<offset>\d+)$/.exec(String(cursor));
    if (!match || match.groups.version !== catalog.version ||
        Number(match.groups.offset) >= catalog.tools.length)
      throw new Error('CLOUD_ROUTER_CATALOG_CURSOR_EXPIRED');
    offset = Number(match.groups.offset);
  }
  const tools = catalog.tools.slice(offset, offset + limit);
  const next = offset + tools.length;
  return {
    schema_version: catalog.schema_version,
    catalog_version: catalog.version,
    tools,
    ...(next < catalog.tools.length ? {next_cursor: `${catalog.version}:${next}`} : {})
  };
}

module.exports = {
  MAX_CATALOG_TOOLS,
  MAX_CATALOG_BYTES,
  MAX_TOOL_BYTES,
  DENIED_TOOL_NAMES,
  isRemoteEligible,
  createDeviceCatalog,
  pageDeviceCatalog
};
