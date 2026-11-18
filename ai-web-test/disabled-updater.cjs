'use strict';
const {ipcMain,dialog}=require('electron');
let registered=false;
const state=()=>({phase:'unconfigured',currentVersion:'1.0.12-aiweb.1',currentBuild:112,source:'',percent:0,notificationsEnabled:false,message:'AI 웹 채팅 테스트판입니다. 정식판 자동 업데이트와 분리되어 있습니다.'});
function registerReporterUpdates(){if(registered)return;registered=true;for(const key of ['state','source','notifications','check','download','cancel','install'])ipcMain.handle('reporter-update:'+key,()=>state());}
function openReporterUpdateSettings(){void dialog.showMessageBox({type:'info',message:'AI 웹 채팅 테스트판',detail:'이 테스트판은 자동 업데이트를 사용하지 않습니다. 정식판은 기존 자동 업데이트를 계속 사용합니다.'});}
module.exports={registerReporterUpdates,openReporterUpdateSettings};
