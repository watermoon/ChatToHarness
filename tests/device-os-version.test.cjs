'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {osProductVersion}=require('../app/device-os-version.cjs');
test('macOS uses sw_vers product version, not Darwin kernel',()=>{
 const called=[];
 const value=osProductVersion({platform:'darwin',release:'23.6.0',
   run:(file,args)=>{called.push({file,args});return '14.6.1\n';}});
 assert.equal(value,'macOS 14.6.1');
 assert.deepEqual(called,[{file:'/usr/bin/sw_vers',args:['-productVersion']}]);
});
test('macOS does not present Darwin kernel number as macOS version',()=>{
 assert.equal(osProductVersion({platform:'darwin',release:'23.6.0',run:()=>{throw Error('not available');}}),'macOS');
});
test('Windows builds determine Windows 10/11, not Darwin version labels',()=>{
 assert.equal(osProductVersion({platform:'win32',release:'10.0.22631',version:'Windows 11 Pro'}),
  'Windows 11 (Build 22631)');
 assert.equal(osProductVersion({platform:'win32',release:'10.0.19045',version:'Windows 10 Pro'}),
  'Windows 10 (Build 19045)');
 assert.equal(osProductVersion({platform:'win32',release:'10.0.20348',version:'Windows Server 2022'}),
  'Windows Server 2022 (Build 20348)');
});
test('Linux shows distribution PRETTY_NAME, not an assumed Linux version',()=>{
 assert.equal(osProductVersion({platform:'linux',release:'6.8.0-55-generic',
   read:()=> 'NAME=Ubuntu\nPRETTY_NAME="Ubuntu 24.04.2 LTS"\n'}),
  'Ubuntu 24.04.2 LTS');
 assert.equal(osProductVersion({platform:'linux',release:'6.8.0',read:()=>''}),
  'Linux kernel 6.8.0');
});
