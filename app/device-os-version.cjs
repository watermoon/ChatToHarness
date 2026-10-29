'use strict';
const os=require('node:os');
const fs=require('node:fs');
const cp=require('node:child_process');

function osProductVersion({platform=process.platform,release=os.release(),
  version=os.version(),run=cp.execFileSync,read=fs.readFileSync}={}){
  try{
    if(platform==='darwin'){
      const mac=String(run('/usr/bin/sw_vers',['-productVersion'],{
        encoding:'utf8',timeout:2500,stdio:['ignore','pipe','ignore']
      })).trim();
      return /^\d{1,2}\.\d{1,2}(?:\.\d{1,3})?$/.test(mac)?'macOS '+mac:'macOS';
    }
    if(platform==='win32'){
      const build=String(release).match(/^(?:\d+\.){2}(\d{4,6})$/);
      const number=build?Number(build[1]):0;
      const server=/Windows Server\s*(?:\d{4})?/i.exec(version||'');
      const label=server?server[0]:number>=22000?'Windows 11':'Windows 10';
      return label+(number?' (Build '+number+')':'');
    }
    if(platform==='linux'){
      const source=String(read('/etc/os-release','utf8'));
      const line=source.split(/\r?\n/).find(l=>l.startsWith('PRETTY_NAME='));
      const raw=line?.slice('PRETTY_NAME='.length).trim()||'';
      const name=raw.replace(/^["']|["']$/g,'').replace(/\\(["\\])/g,'$1').trim();
      if(name&&name.length<=96&&!/[\r\n\x00-\x1f]/.test(name))return name;
      return 'Linux kernel '+String(release).slice(0,60);
    }
  }catch{
    // Absence of a product-version source must never be reported as a guessed version.
  }
  return platform==='darwin'?'macOS':platform==='win32'?'Windows':'Linux';
}
module.exports={osProductVersion};
