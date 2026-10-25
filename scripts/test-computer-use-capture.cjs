'use strict';
// Real helper activation/capture of our own isolated Electron fixture only.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const {_electron} = require('playwright-core');
const sharp = require('sharp');
const {WindowsComputerUse} = require('../app/windows-computer-use.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.cache/acceptance/capture-20261025');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cth-capture-fixture-'));
const service = new WindowsComputerUse();
let fixture;
const report = {cases: []};
async function main() {
  fs.mkdirSync(output, {recursive: true});
  const env = {...process.env, CTH_CAPTURE_FIXTURE_HOME: home}; delete env.ELECTRON_RUN_AS_NODE;
  fixture = await _electron.launch({executablePath: require('electron'), args: [path.join(root, 'tests/fixtures/computer-use-capture.cjs')], env});
  const page = await fixture.firstWindow(); await page.waitForSelector('#br');
  const windowId = await fixture.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].getNativeWindowHandle().readBigUInt64LE().toString());
  const opened = await service.call({action: 'open_session', window_id: windowId, session_title: '验证独立测试窗口截图完整性'});
  const id = opened.structuredContent.session_id; assert.ok(id);
  for (let i=0; i<100; i++) {
    const status = await service.call({action: 'get_session', session_id: id});
    if (status.structuredContent.state === 'ready') break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  for (const mode of ['normal', 'maximized', 'restored', 'partly-offscreen']) {
    await fixture.evaluate(({BrowserWindow, screen}, mode) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (mode === 'maximized') window.maximize();
      if (mode === 'restored') {window.minimize();}
      if (mode === 'partly-offscreen') {window.unmaximize();const work=screen.getPrimaryDisplay().workArea;window.setBounds({x:work.x+work.width-500,y:work.y+work.height-350,width:1100,height:820});}
    }, mode);
    assert.equal((await service.call({action: 'activate', session_id: id})).structuredContent.foreground, true);
    await page.waitForTimeout(500);
    const capture = await service.call({action: 'observe', session_id: id, format: 'png'});
    assert.ok(!capture.isError, JSON.stringify(capture.structuredContent));
    const image = capture.content.find(item => item.type === 'image'); assert.ok(image);
    const bytes = Buffer.from(image.data, 'base64');
    fs.writeFileSync(path.join(output, mode+'.png'), bytes);
    const {data, info} = await sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject: true});
    const colors = [0,0,0,0];
    for (let offset=0; offset<data.length; offset+=info.channels) {
      const [r,g,b] = data.subarray(offset,offset+3);
      if (r>245 && g<10 && b<10) colors[0]++;
      if (r<10 && g>245 && b<10) colors[1]++;
      if (r<10 && g<10 && b>245) colors[2]++;
      if (r>245 && g<10 && b>245) colors[3]++;
    }
    report.cases.push({mode, width: info.width, height: info.height, corners: colors, complete: colors.every(count => count>1000)});
    assert.ok(colors.every(count => count>1000), 'Missing screenshot corner: '+JSON.stringify(report.cases.at(-1)));
  }
}
main().catch(error => {report.error = error.stack;process.exitCode=1;}).finally(async () => {
  const closed = await service.call({action: 'close_session'});
  report.closed = closed.structuredContent.closed === true;
  if (!report.closed) process.exitCode=1;
  await fixture?.close();
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
  fs.rmSync(home,{recursive:true,force:true,maxRetries:10,retryDelay:100});
});
