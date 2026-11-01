'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {WindowsHardwareInspector}=require('../app/windows-hardware-inspection.cjs');
const {HarnessServices}=require('../app/harness-services.cjs');

function fakeExec(stdout,error=null,calls=[]) {
  return (file,args,options,callback)=>{calls.push({file,args,options});callback(error,stdout,'');};
}

test('non-Windows devices reject hardware inspection without starting a process',async()=>{
  let called=false;
  const inspector=new WindowsHardwareInspector({platform:'darwin',execFileImpl:()=>{called=true;}});
  await assert.rejects(inspector.call('list_usb_devices',{}),e=>e.code==='UNSUPPORTED_PLATFORM');
  assert.equal(called,false);
});

test('USB enumeration uses a fixed non-elevated PowerShell query and bounds output',async()=>{
  const calls=[];
  const stdout=JSON.stringify({count:2,devices:[
    {name:'SF32 USB bridge',instance_id:'USB\\VID_1234&PID_5678\\ABC',vendor_id:'1234',product_id:'5678',manufacturer:'Vendor',status:'OK',class:'USB'},
    {name:'extra',instance_id:'USB\\VID_ABCD&PID_EF01\\DEF',vendor_id:'ABCD',product_id:'EF01',manufacturer:'Maker',status:'OK',class:'USB'}
  ]});
  const inspector=new WindowsHardwareInspector({platform:'win32',execFileImpl:fakeExec(stdout,null,calls)});
  const result=await inspector.call('list_usb_devices',{limit:1});
  assert.equal(result.devices.length,1);
  assert.equal(result.devices[0].name,'SF32 USB bridge');
  assert.equal(result.truncated,true);
  assert.equal(calls.length,1);
  assert.ok(calls[0].args.includes('-NoProfile'));
  assert.ok(calls[0].args.includes('-NonInteractive'));
  assert.equal(calls[0].options.windowsHide,true);
  assert.equal(calls[0].options.env.CHATTOHARNESS_HW_LIMIT,'1');
  assert.match(calls[0].args.at(-1),/Get-CimInstance -ClassName Win32_PnPEntity/);
  assert.doesNotMatch(calls[0].args.at(-1),/SerialPort\.Open|WriteFile|Set-PnpDevice|Remove-PnpDevice/);
});

test('invalid limits, extra keys and control characters are rejected before execution',async()=>{
  const calls=[];
  const inspector=new WindowsHardwareInspector({platform:'win32',execFileImpl:fakeExec('{}',null,calls)});
  await assert.rejects(inspector.call('list_usb_devices',{limit:201}),e=>e.code==='INVALID_ARGUMENT');
  await assert.rejects(inspector.call('list_serial_ports',{command:'Get-Process'}),e=>e.code==='INVALID_ARGUMENT');
  await assert.rejects(inspector.call('get_pnp_device_details',{instance_id:'USB\\A\nB'}),e=>e.code==='INVALID_ARGUMENT');
  assert.equal(calls.length,0);
});

test('PnP instance ID is passed through environment, never interpolated into PowerShell source',async()=>{
  const calls=[];
  const instanceId="USB\\VID_1234&PID_5678\\A'; Remove-Item C:\\ -Recurse";
  const stdout=JSON.stringify({found:true,name:'SF32 bridge',instance_id:instanceId,class:'Ports',status:'OK',
    manufacturer:'Vendor',hardware_ids:['USB\\VID_1234&PID_5678'],problem_code:0,parent:'USB\\ROOT',
    service:'usbser',driver_provider:'Microsoft',driver_version:'10.0',driver_date:'2026-01-01',location_paths:['PCIROOT(0)#USBROOT(0)']});
  const inspector=new WindowsHardwareInspector({platform:'win32',execFileImpl:fakeExec(stdout,null,calls)});
  const result=await inspector.call('get_pnp_device_details',{instance_id:instanceId});
  assert.equal(result.found,true);
  assert.equal(result.instance_id,instanceId);
  assert.equal(calls[0].options.env.CHATTOHARNESS_INSTANCE_ID,instanceId);
  assert.equal(calls[0].args.at(-1).includes(instanceId),false);
  assert.deepEqual(result.hardware_ids,['USB\\VID_1234&PID_5678']);
});

test('HarnessServices registers all four tools and dispatches without a project folder',async t=>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'harness-hardware-'));
  t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  const calls=[];
  const hardwareInspector={call:async(name,args)=>{calls.push({name,args});return {count:0,devices:[]};}};
  const services=new HarnessServices({home,hardwareInspector});
  const names=services.tools().map(tool=>tool.name);
  for(const name of ['list_usb_devices','list_pnp_devices','list_serial_ports','get_pnp_device_details'])assert.ok(names.includes(name));
  const result=await services.call('list_usb_devices',{limit:5});
  assert.deepEqual(calls,[{name:'list_usb_devices',args:{limit:5}}]);
  assert.equal(result.structuredContent.count,0);
  services.contexts?.dispose();
  services.inspector?.dispose();
});
