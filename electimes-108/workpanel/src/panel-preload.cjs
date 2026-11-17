const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('workPanel',{
  action:(action,value)=>ipcRenderer.invoke('wp:action',{action,value}),
  mailBounds:rect=>ipcRenderer.send('wp:mail-layout',rect),
  overlay:open=>ipcRenderer.send('wp:mail-modal',open===true),
  onState:fn=>{const cb=(_e,state)=>fn(state);ipcRenderer.on('wp:state',cb);return ()=>ipcRenderer.removeListener('wp:state',cb);},
});
