'use strict';
let registered = false;
let openSettings = () => {};
function registerReporterUpdates(getWindow, _restart, options = {}) {
  if (registered) return;
  registered = true;
  const { ipcMain } = require('electron');
  openSettings = () => { options.openHome?.(); getWindow()?.webContents.send('home:open-settings', { section: 'about' }); };
  const state = { currentVersion: '1.0.12-works-test.1', currentBuild: 112, source: '', phase: 'unconfigured', percent: 0, message: 'Works 연동 테스트판입니다. 이 테스트판은 자동 업데이트를 사용하지 않습니다.' };
  for (const name of ['state', 'source', 'notifications', 'check', 'download', 'cancel', 'install']) {
    ipcMain.handle(`reporter-update:${name}`, event => {
      if (event.sender !== getWindow()?.webContents || event.senderFrame !== event.sender.mainFrame) throw Error('Not allowed');
      return { ...state };
    });
  }
}
module.exports = { registerReporterUpdates, openReporterUpdateSettings: () => openSettings() };
