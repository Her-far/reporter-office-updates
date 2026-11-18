'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('planPanel',{
 action:(action,value)=>ipcRenderer.invoke('plan:action',{action,value}),
 input:(provider,data)=>ipcRenderer.send('plan:input',{provider,data}),
 resize:(provider,cols,rows)=>ipcRenderer.send('plan:resize',{provider,cols,rows}),
 onState:callback=>ipcRenderer.on('plan:state',(_e,s)=>callback(s)),
 onTerminal:callback=>ipcRenderer.on('plan:terminal',(_e,p)=>callback(p))
});
