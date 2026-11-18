'use strict';
const { app, WebContentsView, ipcMain, session, shell, dialog } = require('electron');
const path = require('node:path');
const { WORKS_URL, isWorksUrl, externalUrl, mainFrameFrom, pageBounds } = require('./policy.cjs');
const remoteContents = new WeakSet();
let installed;
function register(deps) {
  if (installed) return installed;
  let current = null, externalPrompt = false, partition;
  // IPC registration happens before app.ready. Create the session only on first open.
  function worksSession() {
    if (partition) return partition;
    partition = session.fromPartition('persist:electimes-works-test');
    // No Office bridges, devices, or native notifications are exposed to remote pages.
    partition.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    partition.setPermissionCheckHandler(() => false);
    partition.on('will-download', (event, item, wc) => {
      if (!remoteContents.has(wc) || !isWorksUrl(wc.getURL())) { event.preventDefault(); return; }
      item.setSaveDialogOptions({ title: 'Works 파일 저장', defaultPath: path.join(app.getPath('downloads'), path.basename(item.getFilename())) });
    });
    return partition;
  }
  function state(message, failed = false, loading = false) {
    if (!current || current.host.webContents.isDestroyed()) return;
    current.state = { message, failed, loading };
    current.host.webContents.send('works-tab:state', current.state);
  }
  async function openExternal(value) {
    const url = externalUrl(value), win = deps.window();
    if (!url || externalPrompt || !win || win.isDestroyed()) return;
    if (isWorksUrl(url)) { await shell.openExternal(url); return; }
    externalPrompt = true;
    try {
      const result = await dialog.showMessageBox(win, { type: 'question', title: '외부 링크', message: '기본 브라우저에서 열까요?', detail: new URL(url).origin, buttons: ['취소', '브라우저에서 열기'], defaultId: 1, cancelId: 0 });
      if (result.response === 1) await shell.openExternal(url);
    } finally { externalPrompt = false; }
  }
  function layout() {
    if (!current) return;
    const m = deps.manager(), win = deps.window();
    if (!win || win.isDestroyed() || current.remote.webContents.isDestroyed()) return;
    const visible = m?.activeId === current.id && !win.isMinimized();
    current.remote.setVisible(false);
    if (visible && current.loaded) {
      const bounds = pageBounds(current.host.getBounds(), current.host.webContents.getZoomFactor());
      if (bounds.width > 0 && bounds.height > 0) {
        current.remote.setBounds(bounds);
        // Keep the remote surface above the local host, only while this tab is active.
        win.contentView.addChildView(current.remote);
        current.remote.setVisible(true);
      }
    }
  }
  function dispose(record) {
    if (record.disposed) return;
    record.disposed = true;
    if (current === record) current = null;
    const win = deps.window();
    if (win && !win.isDestroyed()) win.contentView.removeChildView(record.remote);
    // Native window teardown can already have destroyed and cleared this view's contents.
    const wc = record.remote.webContents;
    if (wc && !wc.isDestroyed()) wc.close();
  }
  async function load() {
    const record = current;
    if (!record) return;
    record.loaded = false; record.failed = false;
    layout(); state('Works에 연결하고 있습니다.', false, true);
    try { await record.remote.webContents.loadURL(WORKS_URL); }
    catch (error) {
      if (current === record && error.code !== 'ERR_ABORTED') state('Works에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.', true);
    }
  }
  function open() {
    const m = deps.manager(), win = deps.window();
    if (!m || !win || win.isDestroyed()) throw Error('Office is not ready');
    attach();
    if (current && m.tabById(current.id)) { m.activateTab(current.id); return current.id; }
    const host = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
    const remote = new WebContentsView({ webPreferences: { session: worksSession(), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, allowRunningInsecureContent: false, navigateOnDragDrop: false } });
    remoteContents.add(remote.webContents);
    host.setBackgroundColor('#f5f7fb'); remote.setBackgroundColor('#ffffff');
    const record = { id: `t${m.nextId++}`, host, remote, loaded: false, state: { message: 'Works에 연결하고 있습니다.', loading: true, failed: false } };
    current = record;
    const wc = remote.webContents;
    for (const name of ['will-navigate', 'will-redirect', 'will-frame-navigate']) {
      wc.on(name, (event, url) => {
        const target = typeof url === 'string' ? url : event.url;
        if (!isWorksUrl(target)) { event.preventDefault(); state('이 링크는 상단의 ‘브라우저에서 열기’로 이용해 주세요.'); }
      });
    }
    wc.setWindowOpenHandler(({ url }) => {
      if (isWorksUrl(url)) void wc.loadURL(url).catch(() => {});
      else void openExternal(url).catch(() => state('외부 브라우저를 열지 못했습니다.'));
      return { action: 'deny' };
    });
    wc.on('will-attach-webview', event => event.preventDefault());
    wc.on('did-start-loading', () => { if (current === record) state('불러오는 중…', false, true); });
    wc.on('did-finish-load', () => {
      if (current !== record || record.failed) return;
      record.loaded = true;
      state('기존 Works 계정으로 이용 · 저장한 내용은 모바일·웹과 공유됩니다.');
      layout();
      if (m.activeId === record.id && win.isFocused()) wc.focus();
    });
    wc.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
      if (current !== record || !isMainFrame || code === -3) return;
      record.loaded = false; record.failed = true; layout();
      state('Works에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.', true);
    });
    wc.on('render-process-gone', () => {
      if (current !== record) return;
      record.loaded = false; layout(); state('Works 화면이 종료되었습니다. 다시 열기를 눌러 주세요.', true);
    });
    wc.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      if (input.control && input.key === 'Tab') { event.preventDefault(); m.cycleTab(input.shift ? -1 : 1); }
    });
    host.webContents.once('destroyed', () => dispose(record));
    host.webContents.once('did-finish-load', () => {
      if (current === record) { state(record.state.message, record.state.failed, record.state.loading); layout(); }
    });
    win.contentView.addChildView(host); win.contentView.addChildView(remote);
    host.setVisible(false); remote.setVisible(false);
    m.tabs.push({ id: record.id, kind: 'works', view: host, title: '전기신문 Works' });
    void host.webContents.loadFile(path.join(__dirname, 'host.html'));
    m.activateTab(record.id);
    void load();
    return record.id;
  }
  function attach() {
    const m = deps.manager(), win = deps.window();
    if (!m || !win || m.__worksTabAttached) return;
    m.__worksTabAttached = true;
    const baseLayout = m.layout.bind(m), baseFocus = m.focusActiveView.bind(m);
    m.layout = (...args) => { const result = baseLayout(...args); layout(); return result; };
    m.focusActiveView = () => {
      if (current && m.activeId === current.id && current.loaded && win.isFocused()) current.remote.webContents.focus();
      else baseFocus();
    };
    win.on('minimize', layout); win.on('restore', layout);
    win.on('closed', () => { if (current) dispose(current); });
  }
  ipcMain.handle('works-tab:open', event => {
    if (!mainFrameFrom(event, deps.window()?.webContents)) throw Error('Not allowed');
    return open();
  });
  ipcMain.handle('works-tab:action', async (event, action) => {
    if (!mainFrameFrom(event, current?.host.webContents)) throw Error('Not allowed');
    if (action === 'state') return current.state;
    if (action === 'retry') { await load(); return true; }
    if (action === 'reload') {
      const r = await dialog.showMessageBox(deps.window(), { type: 'question', message: 'Works 화면을 새로고침할까요?', detail: '아직 저장하지 않은 입력 내용은 사라집니다.', buttons: ['취소', '새로고침'], defaultId: 0, cancelId: 0 });
      if (r.response === 1) await load();
      return true;
    }
    if (action === 'browser') { await openExternal(WORKS_URL); return true; }
    throw Error('Unknown action');
  });
  installed = { attach };
  return installed;
}
module.exports = { register, attach: () => installed?.attach(), isWorksContents: wc => remoteContents.has(wc) };
