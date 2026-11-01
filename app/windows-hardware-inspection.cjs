'use strict';

const path=require('node:path');
const {execFile}=require('node:child_process');

const MAX_OUTPUT_BYTES=512*1024;
const MAX_FIELD_LENGTH=512;
const HARDWARE_TOOLS=new Set(['list_usb_devices','list_pnp_devices','list_serial_ports','get_pnp_device_details']);

const LIST_USB_SCRIPT=`
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$limit=[Math]::Min(201,([Math]::Max(1,[int]$env:CHATTOHARNESS_HW_LIMIT)+1))
$items=@(Get-CimInstance -ClassName Win32_PnPEntity -Filter "PNPDeviceID LIKE 'USB%'" |
  Select-Object -First $limit | ForEach-Object {
    $id=[string]$_.PNPDeviceID
    $vendorId=$null;$productId=$null
    if($id -match 'VID_([0-9A-Fa-f]{4})'){$vendorId=$Matches[1].ToUpperInvariant()}
    if($id -match 'PID_([0-9A-Fa-f]{4})'){$productId=$Matches[1].ToUpperInvariant()}
    [pscustomobject]@{name=[string]$_.Name;instance_id=$id;vendor_id=$vendorId;product_id=$productId;manufacturer=[string]$_.Manufacturer;status=[string]$_.Status;class=[string]$_.PNPClass}
  })
@{devices=$items;count=$items.Count} | ConvertTo-Json -Depth 5 -Compress
`;

const LIST_PNP_SCRIPT=`
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$limit=[Math]::Min(201,([Math]::Max(1,[int]$env:CHATTOHARNESS_HW_LIMIT)+1))
$items=@(Get-CimInstance -ClassName Win32_PnPEntity |
  Where-Object {$_.PNPClass -in @('USB','Ports','HIDClass','HID') -or ([string]$_.PNPDeviceID -like 'USB*') -or ([string]$_.PNPDeviceID -like 'USBSTOR*') -or ([string]$_.PNPDeviceID -like 'FTDIBUS*') -or ([string]$_.PNPDeviceID -like 'FTDI*')} |
  Select-Object -First $limit | ForEach-Object {
    $id=[string]$_.PNPDeviceID
    $vendorId=$null;$productId=$null
    if($id -match 'VID_([0-9A-Fa-f]{4})'){$vendorId=$Matches[1].ToUpperInvariant()}
    if($id -match 'PID_([0-9A-Fa-f]{4})'){$productId=$Matches[1].ToUpperInvariant()}
    [pscustomobject]@{name=[string]$_.Name;instance_id=$id;vendor_id=$vendorId;product_id=$productId;manufacturer=[string]$_.Manufacturer;status=[string]$_.Status;class=[string]$_.PNPClass;problem_code=[int]$_.ConfigManagerErrorCode}
  })
@{devices=$items;count=$items.Count} | ConvertTo-Json -Depth 5 -Compress
`;

const LIST_SERIAL_SCRIPT=`
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$limit=[Math]::Min(129,([Math]::Max(1,[int]$env:CHATTOHARNESS_HW_LIMIT)+1))
$items=@(Get-CimInstance -ClassName Win32_PnPEntity |
  Where-Object {$_.PNPClass -eq 'Ports' -or ([string]$_.Name) -match '\\(COM[0-9]+\\)'} |
  Select-Object -First $limit | ForEach-Object {
    $id=[string]$_.PNPDeviceID
    $port=''
    if([string]$_.Name -match '\\((COM[0-9]+)\\)'){$port=$Matches[1]}
    $vendorId=$null;$productId=$null
    if($id -match 'VID_([0-9A-Fa-f]{4})'){$vendorId=$Matches[1].ToUpperInvariant()}
    if($id -match 'PID_([0-9A-Fa-f]{4})'){$productId=$Matches[1].ToUpperInvariant()}
    [pscustomobject]@{port=$port;name=[string]$_.Name;instance_id=$id;vendor_id=$vendorId;product_id=$productId;manufacturer=[string]$_.Manufacturer;status=[string]$_.Status}
  })
@{ports=$items;count=$items.Count} | ConvertTo-Json -Depth 5 -Compress
`;

const DEVICE_DETAILS_SCRIPT=`
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$id=[string]$env:CHATTOHARNESS_INSTANCE_ID
if([string]::IsNullOrWhiteSpace($id) -or $id.Length -gt 512){throw 'Invalid device instance ID'}
$device=Get-CimInstance -ClassName Win32_PnPEntity | Where-Object {[string]$_.PNPDeviceID -ceq $id} | Select-Object -First 1
if($null -eq $device){@{found=$false;instance_id=$id}|ConvertTo-Json -Depth 5 -Compress;exit 0}
$driver=Get-CimInstance -ClassName Win32_PnPSignedDriver | Where-Object {[string]$_.DeviceID -ceq $id} | Select-Object -First 1
$parent=$null;$service=$null;$location=$null
try{$parent=(Get-PnpDeviceProperty -InstanceId $id -KeyName 'DEVPKEY_Device_Parent' -ErrorAction Stop | Select-Object -First 1).Data}catch{}
try{$service=(Get-PnpDeviceProperty -InstanceId $id -KeyName 'DEVPKEY_Device_Service' -ErrorAction Stop | Select-Object -First 1).Data}catch{}
try{$location=(Get-PnpDeviceProperty -InstanceId $id -KeyName 'DEVPKEY_Device_LocationPaths' -ErrorAction Stop | Select-Object -First 1).Data}catch{}
$hardwareIds=@($device.HardwareID | Select-Object -First 16)
$locationPaths=@($location | Select-Object -First 16)
@{found=$true;name=[string]$device.Name;instance_id=$id;class=[string]$device.PNPClass;status=[string]$device.Status;manufacturer=[string]$device.Manufacturer;hardware_ids=$hardwareIds;problem_code=[int]$device.ConfigManagerErrorCode;parent=[string]$parent;service=[string]$service;driver_provider=[string]$driver.DriverProviderName;driver_version=[string]$driver.DriverVersion;driver_date=[string]$driver.DriverDate;location_paths=$locationPaths} | ConvertTo-Json -Depth 5 -Compress
`;

function failure(code,message) { const error=new Error(message);error.code=code;return error; }
function text(value) { return typeof value==='string'?value.slice(0,MAX_FIELD_LENGTH):''; }
function listLimit(args,maximum,defaultValue) {
  if(args.limit===undefined)return defaultValue;
  if(!Number.isSafeInteger(args.limit)||args.limit<1||args.limit>maximum)throw failure('INVALID_ARGUMENT','limit must be an integer within the documented range.');
  return args.limit;
}
function onlyKeys(args,allowed) {
  if(Object.keys(args).some(key=>!allowed.includes(key)))throw failure('INVALID_ARGUMENT','Only documented hardware inspection arguments are accepted.');
}
function normalizeRows(value,key,limit) {
  const rows=Array.isArray(value?.[key])?value[key].slice(0,limit):[];
  return {[key]:rows.map(row=>({
    ...(key==='ports'?{port:text(row?.port)}:{}),name:text(row?.name),instance_id:text(row?.instance_id),
    vendor_id:text(row?.vendor_id),product_id:text(row?.product_id),manufacturer:text(row?.manufacturer),
    status:text(row?.status),...(row?.class!==undefined?{class:text(row.class)}:{}),
    ...(row?.problem_code!==undefined&&Number.isSafeInteger(Number(row.problem_code))?{problem_code:Number(row.problem_code)}:{})
  })),count:rows.length,truncated:Number.isSafeInteger(value?.count)&&value.count>rows.length};
}
function normalizeDetails(value,instanceId) {
  if(!value||value.found!==true)return {found:false,instance_id:instanceId};
  const keys=['name','class','status','manufacturer','parent','service','driver_provider','driver_version','driver_date'];
  const result={found:true,instance_id:instanceId};
  for(const key of keys)result[key]=text(value[key]);
  result.hardware_ids=Array.isArray(value.hardware_ids)?value.hardware_ids.slice(0,16).map(text):[];
  result.location_paths=Array.isArray(value.location_paths)?value.location_paths.slice(0,16).map(text):[];
  if(Number.isSafeInteger(Number(value.problem_code)))result.problem_code=Number(value.problem_code);
  return result;
}

class WindowsHardwareInspector {
  constructor({platform=process.platform,execFileImpl=execFile,timeoutMs=15000}={}) {
    this.platform=platform;this.execFileImpl=execFileImpl;this.timeoutMs=Math.max(1000,Math.min(30000,timeoutMs));
  }
  async run(script,environment={}) {
    if(this.platform!=='win32')throw failure('UNSUPPORTED_PLATFORM','Windows hardware inspection is available only on Windows.');
    const powershell=process.env.SystemRoot?path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'):'powershell.exe';
    return new Promise((resolve,reject)=>{
      this.execFileImpl(powershell,['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{
        env:{...process.env,...environment},windowsHide:true,timeout:this.timeoutMs,maxBuffer:MAX_OUTPUT_BYTES,encoding:'utf8'
      },(error,stdout)=>{
        if(error){reject(failure(error.killed?'HARDWARE_QUERY_TIMEOUT':'HARDWARE_QUERY_FAILED',
          error.killed?'Windows hardware query timed out.':'Windows hardware query failed.'));return;}
        if(typeof stdout!=='string'||!stdout.trim()){reject(failure('HARDWARE_QUERY_EMPTY','Windows hardware query returned no JSON result.'));return;}
        try{
          if(Buffer.byteLength(stdout,'utf8')>MAX_OUTPUT_BYTES)throw new Error('oversized');
          resolve(JSON.parse(stdout.trim()));
        }catch{reject(failure('HARDWARE_QUERY_INVALID_RESULT','Windows hardware query returned invalid or oversized JSON.'));}
      });
    });
  }
  async call(name,args) {
    if(!HARDWARE_TOOLS.has(name))throw failure('UNKNOWN_TOOL','Unknown hardware inspection tool.');
    if(!args||typeof args!=='object'||Array.isArray(args))throw failure('INVALID_ARGUMENT','Tool arguments must be an object.');
    if(name==='list_usb_devices'){
      onlyKeys(args,['limit']);const limit=listLimit(args,200,100);
      return normalizeRows(await this.run(LIST_USB_SCRIPT,{CHATTOHARNESS_HW_LIMIT:String(limit)}),'devices',limit);
    }
    if(name==='list_pnp_devices'){
      onlyKeys(args,['limit']);const limit=listLimit(args,200,100);
      return normalizeRows(await this.run(LIST_PNP_SCRIPT,{CHATTOHARNESS_HW_LIMIT:String(limit)}),'devices',limit);
    }
    if(name==='list_serial_ports'){
      onlyKeys(args,['limit']);const limit=listLimit(args,128,64);
      return normalizeRows(await this.run(LIST_SERIAL_SCRIPT,{CHATTOHARNESS_HW_LIMIT:String(limit)}),'ports',limit);
    }
    onlyKeys(args,['instance_id']);
    const instanceId=args.instance_id;
    if(typeof instanceId!=='string'||!instanceId.trim()||instanceId.length>512||[...instanceId].some(character=>character.charCodeAt(0)<32))
      throw failure('INVALID_ARGUMENT','instance_id must be a non-empty PnP instance ID of at most 512 characters.');
    return normalizeDetails(await this.run(DEVICE_DETAILS_SCRIPT,{CHATTOHARNESS_INSTANCE_ID:instanceId}),instanceId);
  }
}

module.exports={WindowsHardwareInspector,HARDWARE_TOOLS};
