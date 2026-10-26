'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {inspectCompatibility, verifyMacHelper} = require('../scripts/mac-helper-compatibility.cjs');
const {nativeHelperError} = require('../app/native-helper-error.cjs');
const {ComputerUsePermissions} = require('../app/computer-use-permissions.cjs');
const {NativeConnection} = require('../app/base-computer-use.cjs');
const build = 'helper (architecture arm64):\n    minos 14.0\nhelper (architecture x86_64):\n    minos 14.0\n';
const dependencies = 'helper:\n\t/usr/lib/swift/libswiftCore.dylib (compatibility version 1.0.0)\n';
test('Mac packaging rejects a newer, missing or incomplete deployment target and unavailable dependencies', () => {
  assert.deepEqual(inspectCompatibility(build, dependencies, ['arm64','x86_64']).minimums, ['14.0','14.0']);
  for (const bad of [build.replace('14.0','15.0'), '', build.replace('x86_64','other'), build.replace(/    minos 14.0\n$/, '')])
    assert.throws(() => inspectCompatibility(bad, dependencies, ['arm64','x86_64']));
  for (const bad of ['', dependencies.replace('libswiftCore','libswift_stdio'), dependencies.replace('libswiftCore','libswiftFuture'), dependencies.replace('/usr/lib/swift','@rpath')])
    assert.throws(() => inspectCompatibility(build, bad, ['arm64','x86_64']));
});
test('actual universal helper has macOS 14 targets and executes permission_status in available native/translated slices', {skip: process.platform !== 'darwin'}, t => {
  const file = path.resolve(__dirname, '../resources/computer-use/ChatToHarness.MacComputerUse');
  assert.deepEqual(verifyMacHelper(file).minimums, ['14.0','14.0']);
  for (const arch of ['arm64','x86_64']) {
    const result = spawnSync('/usr/bin/arch', ['-'+arch, file, 'permission_status'], {encoding:'utf8',timeout:15000});
    // Rosetta is optional on Apple Silicon; Intel cannot execute arm64.
    // Binary inspection above still requires both slices on every Mac host.
    if (result.status !== 0 && /Bad CPU type/i.test(result.stderr || '') && arch !== (process.arch === 'x64' ? 'x86_64' : process.arch)) {
      t.diagnostic(`${arch} execution unavailable on this host; slice inspection passed`);
      continue;
    }
    assert.equal(result.status,0,result.stderr || result.error?.message);
    const status = JSON.parse(result.stdout);
    assert.equal(typeof status.screen_recording,'boolean');
    assert.equal(typeof status.accessibility,'boolean');
    assert.equal(status.request_attempted,false);
  }
});
test('permission-check startup failures retain diagnostic codes without leaking loader paths', async () => {
  const cases = [
    [{}, 'dyld: Library not loaded: /private/secret/libswift_stdio.dylib', 'CU_HELPER_OS_INCOMPATIBLE'],
    [{code:'ENOENT'}, '', 'CU_HELPER_UNAVAILABLE'],
    [{code:'EACCES'}, '', 'CU_HELPER_NOT_EXECUTABLE'],
    [{code:'EBADARCH'}, '', 'CU_HELPER_ARCH_INCOMPATIBLE'],
    [{killed:true}, '', 'CU_HELPER_TIMEOUT'],
    [{}, '', 'CU_HELPER_START_FAILED']
  ];
  for (const [failure, stderr, code] of cases) {
    assert.equal(nativeHelperError(failure, stderr).code,code);
    const checker = new ComputerUsePermissions({platform:'darwin',helper:__filename,
      execute(_file,_args,_options,callback) {callback(failure,'',stderr);}});
    await assert.rejects(checker.check(), error => error.code === code && error.message === code);
  }
});
test('real native startup exit drains dyld stderr and reports incompatibility; ready sessions retain closed semantics',
  {skip:process.platform==='win32'}, async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(),'cth-loader-'));
    t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
    const file = path.join(directory,'helper');
    fs.writeFileSync(file, '#!/bin/sh\necho "dyld: Library not loaded: /private/secret/libswift_stdio.dylib" >&2\nexit 1\n', {mode:0o755});
    const failed = new NativeConnection(file);
    await assert.rejects(failed.ready, {code:'CU_HELPER_OS_INCOMPATIBLE'});
    assert.equal(failed.closed,true);
    fs.writeFileSync(file, '#!/bin/sh\necho \'{"ready":true}\'\nexit 0\n', {mode:0o755});
    const ready = new NativeConnection(file);
    assert.equal((await ready.ready).ready,true);
    await new Promise(resolve=>ready.child.once('close',resolve));
    assert.equal(ready.closed,true);
});
