const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('planPanel', {
  action: (action, value) => ipcRenderer.invoke('plan:action', {action, value}),
  onState: callback => ipcRenderer.on('plan:state', (_, state) => callback(state))
});
