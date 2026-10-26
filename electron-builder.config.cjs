'use strict';
const config=JSON.parse(JSON.stringify(require('./package.json').build));
const {filterForPlatform}=require('./scripts/packaging-platform.cjs');
// electron-builder filters immediate node_modules inside extraResources.
// Do not include the opposite OS JS adapter or native helper in a release.
const platform=filterForPlatform(process.platform);
config.files.push(...platform.files);
if(process.platform==='win32')config.extraResources.push({from:'resources/node/node_modules',to:'node/node_modules',filter:['**/*']});
if(platform.resources.length) {
  config.extraResources.push({from:'resources/computer-use',to:'computer-use',filter:platform.resources});
  config.extraResources.push({from:'resources/computer-use/node_modules',to:'computer-use/node_modules',filter:['**/*']});
}
config.extraResources.push({from:'resources/build-info.json',to:'build-info.json'});
// Also guard direct electron-builder invocations, before packaging and after
// copying/signing resources (build.cjs independently verifies the final app).
if(process.platform==='darwin') {
  const path=require('node:path');
  const {verifyMacHelper}=require('./scripts/mac-helper-compatibility.cjs');
  config.beforePack=async()=>verifyMacHelper(path.join(__dirname,'resources/computer-use/ChatToHarness.MacComputerUse'));
  config.afterPack=async context=>verifyMacHelper(path.join(context.appOutDir,'ChatToHarness.app/Contents/Resources/computer-use/ChatToHarness.MacComputerUse'));
}
module.exports=config;
