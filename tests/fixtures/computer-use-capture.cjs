'use strict';
const {app, BrowserWindow} = require('electron');
app.setPath('userData', process.env.CTH_CAPTURE_FIXTURE_HOME);
app.whenReady().then(async () => {
  const window = new BrowserWindow({width: 1100, height: 820, title: 'Computer Use screenshot fixture', backgroundColor: '#ffffff'});
  await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(`<!doctype html><style>
    html,body {margin:0;width:100%;height:100%;background:#fff}i{position:fixed;width:60px;height:60px}
    #tl{top:0;left:0;background:#ff0000}#tr{top:0;right:0;background:#00ff00}
    #bl{bottom:0;left:0;background:#0000ff}#br{bottom:0;right:0;background:#ff00ff}
    </style><i id=tl></i><i id=tr></i><i id=bl></i><i id=br></i><p style="padding:90px">截图四角完整性测试</p>`));
});
app.on('window-all-closed', () => app.quit());
