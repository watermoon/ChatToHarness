'use strict';
const {execFileSync} = require('node:child_process');
const MINIMUM_MACOS = '14.0';
// Reviewed system libraries used by this helper on macOS 14. New SDK imports
// require an explicit review instead of silently raising runtime requirements.
const FRAMEWORKS = new Set(['AppKit','ApplicationServices','CoreFoundation','CoreGraphics','Foundation','QuartzCore','ScreenCaptureKit']);
const LIBRARIES = new Set(['libSystem.B.dylib','libobjc.A.dylib',
  ...['AVFoundation','Core','CoreAudio','CoreFoundation','CoreImage','CoreMIDI','CoreMedia','Darwin','Dispatch','IOKit','Metal','OSLog','ObjectiveC','QuartzCore','UniformTypeIdentifiers','XPC','_Concurrency','os','simd'].map(name => `libswift${name}.dylib`)]);
// Deliberately require the advertised deployment target in every Mach-O slice.
// A missing/unknown load command must fail closed, rather than pass by default.
function inspectCompatibility(build, dependencies, expectedArchitectures) {
  const minimums = [...build.matchAll(/^\s*minos\s+(\d+(?:\.\d+){1,2})\s*$/gm)].map(match => match[1]);
  if (!minimums.length || minimums.some(version => !/^14\.0(?:\.0)?$/.test(version)))
    throw Error('Mac Computer Use helper must have minos 14.0 in every slice: ' + minimums.join(', '));
  for (const arch of expectedArchitectures) {
    if (!build.includes(`architecture ${arch}`)) throw Error(`Mac helper missing architecture ${arch}`);
  }
  if (minimums.length !== expectedArchitectures.length) throw Error('Mac helper slice count does not match requested architectures');
  const libraries = dependencies.split('\n').filter(line => /^\s+\S/.test(line)).map(line => line.trim().split(' (')[0]);
  if (!libraries.length) throw Error('Mac helper dynamic dependencies could not be read');
  for (const library of libraries) {
    const framework = /^\/System\/Library\/Frameworks\/([^/]+)\.framework\/Versions\/[AC]\/\1$/.exec(library);
    const dylib = /^\/usr\/lib\/(?:swift\/)?([^/]+)$/.exec(library);
    if (!(framework && FRAMEWORKS.has(framework[1])) && !(dylib && LIBRARIES.has(dylib[1])))
      throw Error(`Mac helper dependency is not approved for macOS 14: ${library}`);
  }
  return {minimums, architectures: expectedArchitectures, libraries: [...new Set(libraries)]};
}
function verifyMacHelper(file, expectedArchitectures = ['arm64', 'x86_64'], execute = execFileSync) {
  const options = {encoding: 'utf8'};
  const build = execute('xcrun', ['vtool', '-show-build', file], options);
  const dependencies = execute('/usr/bin/otool', ['-L', file], options);
  return inspectCompatibility(build, dependencies, expectedArchitectures);
}
module.exports = {MINIMUM_MACOS, inspectCompatibility, verifyMacHelper};
