'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('worksTab', {
  action: action => ipcRenderer.invoke('works-tab:action', action),
  onState: callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('works-tab:state', listener); return () => ipcRenderer.removeListener('works-tab:state', listener); }
});
