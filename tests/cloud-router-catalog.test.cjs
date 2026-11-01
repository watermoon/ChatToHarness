'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDeviceCatalog,pageDeviceCatalog}=require('../app/cloud-router-catalog.cjs');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {HarnessServices}=require('../app/harness-services.cjs');

const safe=(name,extra={})=>({
  name,description:`Read ${name}`,
  inputSchema:{type:'object',properties:{},additionalProperties:false},
  annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  ...extra
});

test('dynamic catalog publishes all four read-only Windows hardware tools from HarnessServices',t=>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'unify-catalog-hardware-'));
  t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  const services=new HarnessServices({home,hardwareInspector:{call:async()=>({count:0,devices:[]})}});
  t.after(()=>{services.contexts?.dispose();services.inspector?.dispose();});
  const catalog=createDeviceCatalog({visibleTools:()=>services.tools()});
  assert.deepEqual(catalog.tools.filter(tool=>[
    'list_usb_devices','list_pnp_devices','list_serial_ports','get_pnp_device_details'
  ].includes(tool.name)).map(tool=>tool.name).sort(),[
    'get_pnp_device_details','list_pnp_devices','list_serial_ports','list_usb_devices'
  ]);
});

test('catalog derives only explicitly read-only, closed-world tools from live manager definitions',()=>{
  const manager={
    visibleTools:()=>[
      safe('get_harness_status'),
      safe('list_usb_devices'),
      safe('write_file'),
      safe('computer_use'),
      safe('open_world_probe',{annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true}}),
      safe('missing_hints',{annotations:{readOnlyHint:true,destructiveHint:false}})
    ],
    broker:{results:{tools:()=>[safe('get_tool_result_page'),safe('get_tool_result_file')]}}
  };
  const catalog=createDeviceCatalog(manager);
  assert.deepEqual(catalog.tools.map(tool=>tool.name),[
    'get_harness_status','get_tool_result_file','get_tool_result_page','list_usb_devices'
  ]);
  assert.match(catalog.version,/^[a-f0-9]{64}$/);
  assert.ok(catalog.tools.every(tool=>tool.annotations.readOnlyHint===true&&
    tool.annotations.destructiveHint===false&&tool.annotations.openWorldHint===false));
});

test('catalog version is stable across source ordering and changes when a schema changes',()=>{
  const one=createDeviceCatalog({visibleTools:()=>[safe('alpha'),safe('beta')]});
  const reordered=createDeviceCatalog({visibleTools:()=>[safe('beta'),safe('alpha')]});
  const changed=createDeviceCatalog({visibleTools:()=>[
    safe('alpha',{inputSchema:{type:'object',properties:{limit:{type:'integer'}},additionalProperties:false}}),
    safe('beta')
  ]});
  assert.equal(one.version,reordered.version);
  assert.notEqual(one.version,changed.version);
});

test('catalog pages are version-bound and bounded',()=>{
  const catalog=createDeviceCatalog({visibleTools:()=>[
    safe('tool_a'),safe('tool_b'),safe('tool_c')
  ]});
  const first=pageDeviceCatalog(catalog,{limit:2});
  assert.deepEqual(first.tools.map(x=>x.name),['tool_a','tool_b']);
  assert.equal(first.catalog_version,catalog.version);
  assert.ok(first.next_cursor);
  const second=pageDeviceCatalog(catalog,{cursor:first.next_cursor,limit:2});
  assert.deepEqual(second.tools.map(x=>x.name),['tool_c']);
  assert.equal(second.next_cursor,undefined);
  assert.throws(()=>pageDeviceCatalog(catalog,{cursor:'f'.repeat(64)+':2'}),/CLOUD_ROUTER_CATALOG_CURSOR_EXPIRED/);
  assert.throws(()=>pageDeviceCatalog(catalog,{limit:65}),/CLOUD_ROUTER_INVALID_ARGUMENTS/);
});

test('catalog rejects oversized local definitions instead of publishing a partial directory',()=>{
  const many=Array.from({length:129},(_,i)=>safe(`tool_${i}`));
  assert.throws(()=>createDeviceCatalog({visibleTools:()=>many}),/CLOUD_ROUTER_CATALOG_TOO_LARGE/);
});
