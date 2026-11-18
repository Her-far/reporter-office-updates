// Added only to the trusted Office shell preload, never to the remote Works view.
(() => {
  const { contextBridge, ipcRenderer } = require('electron');
  contextBridge.exposeInMainWorld('electimesWorks', { open: () => ipcRenderer.invoke('works-tab:open') });
})();
