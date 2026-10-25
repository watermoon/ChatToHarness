'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

test('Windows HUD keeps labels and STOP inside resized DPI clipping regions', {skip: process.platform !== 'win32', timeout: 30000}, t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cth-hud-layout-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true, maxRetries: 10}));
  const compiler = path.join(process.env.SystemRoot || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  const helper = path.join(directory, 'ComputerUse.exe'), fixture = path.join(directory, 'HudLayout.exe');
  const references = ['/nologo', '/target:exe', '/platform:x64', '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll'];
  execFileSync(compiler, [...references, '/r:System.Web.Extensions.dll', '/out:'+helper, path.resolve(__dirname, '../native/ComputerUse.cs')], {windowsHide: true});
  execFileSync(compiler, [...references, '/out:'+fixture, path.join(__dirname, 'fixtures/computer-use-hud-layout.cs')], {windowsHide: true});
  const report = process.env.CTH_HUD_LAYOUT_REPORT_DIR || path.join(directory, 'renders');
  const output = execFileSync(fixture, [helper, report], {windowsHide: true, encoding: 'utf8', timeout: 20000});
  assert.equal(output.match(/HUD_LAYOUT_PASS/g)?.length, 6, output);
});
