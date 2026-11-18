'use strict';
const {WebContentsView, ipcMain, net, shell, clipboard} = require('electron');
const path = require('node:path');
const {PlanAuth} = require('./plan-auth.cjs');
const {PlanChat} = require('./plan-chat.cjs');

function create(deps) {
  const fetch = net.fetch.bind(net);
  let view, timer, visible = false, closed = false, error = '';
  const auth = new PlanAuth({
    vault: deps.vault, initialized: deps.ready, fetch, changed: emit,
    jose: require(path.join(process.resourcesPath, 'ai-runtime/node_modules/jose')),
    openExternal: url => shell.openExternal(url)
  });
  const chat = new PlanChat({auth, vault: deps.vault, fetch, changed: emit});
  const ready = Promise.all([auth.ready, chat.ready]).then(async () => {
    if (auth.state().plan) await auth.models();
  }).catch(e => { error = e.message; emit(); });
  function state() { return {error, auth: auth.state(), chat: chat.state()}; }
  function emit() {
    if (timer || closed) return;
    timer = setTimeout(() => {
      timer = null;
      if (visible && view && !view.webContents.isDestroyed()) view.webContents.send('plan:state', state());
    }, 50);
  }
  const actions = {
    login: value => auth.start(value?.id, {consent: value?.consent === true}),
    'cancel-login': () => auth.cancel(),
    logout: async () => { chat.stop(); await auth.logout(); },
    account: id => auth.select(id),
    acknowledge: () => auth.acknowledge(),
    models: () => auth.models(),
    send: data => { void chat.send(data).catch(e => { error = e.message; emit(); }); },
    stop: () => chat.stop(),
    new: () => chat.newThread(),
    thread: id => chat.select(id),
    'delete-thread': () => chat.remove(),
    usage: () => shell.openExternal('https://chatgpt.com/'),
    source: value => {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password) throw Error('지원하지 않는 링크입니다.');
      return shell.openExternal(url.href);
    },
    copy: value => clipboard.writeText(checkedText(value)),
    'paste-document': value => {
      const doc = deps.document();
      if (!doc) throw Error('문서를 열고 붙여넣을 위치를 선택하세요.');
      clipboard.writeText(checkedText(value));
      doc.focus();
      doc.pasteAndMatchStyle();
    }
  };
  function checkedText(value) {
    if (typeof value !== 'string' || value.length > 500000) throw Error('복사할 내용을 확인하세요.');
    return value;
  }
  ipcMain.handle('plan:action', async (event, request) => {
    if (!view || event.sender !== view.webContents || event.senderFrame !== view.webContents.mainFrame) throw Error('forbidden');
    await ready;
    try {
      const {action, value} = request;
      if (action === 'state') return {ok:true, state:state()};
      if (!visible || !Object.hasOwn(actions, action)) throw Error('패널을 다시 열어 주세요.');
      if (chat.abort && ['login','account'].includes(action)) throw Error('답변을 중지한 뒤 계정을 바꿔 주세요.');
      error = '';
      await actions[action](value);
      emit();
      return {ok:true, state:state()};
    } catch (e) {
      error = e.message; emit();
      return {ok:false, error};
    }
  });
  function show(bounds) {
    if (!view || view.webContents.isDestroyed()) {
      view = new WebContentsView({webPreferences:{
        preload:path.join(__dirname,'plan-preload.cjs'), nodeIntegration:false, sandbox:true, contextIsolation:true,
        partition:'office-subscription-local'
      }});
      const wc = view.webContents;
      wc.setWindowOpenHandler(() => ({action:'deny'}));
      wc.on('will-navigate', event => event.preventDefault());
      wc.on('will-attach-webview', event => event.preventDefault());
      deps.watchEscape(wc);
      wc.on('did-finish-load', emit);
      void wc.loadFile(path.join(__dirname,'plan-panel.html')).catch(e => {error = e.message; emit();});
    }
    deps.window().contentView.addChildView(view);
    view.setBounds(bounds); view.setVisible(true);
    if (!visible) { visible = true; emit(); }
  }
  function hide() { visible = false; if (view && !view.webContents.isDestroyed()) view.setVisible(false); }
  function close() {
    closed = true; clearTimeout(timer); auth.close(); chat.stop();
    if (view && !view.webContents.isDestroyed()) view.webContents.close();
    ipcMain.removeHandler('plan:action');
  }
  return {show, hide, close};
}
module.exports = {create};
