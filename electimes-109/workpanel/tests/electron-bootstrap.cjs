const {app}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const payload=path.resolve(process.env.WORKPANEL_PAYLOAD);
Object.defineProperty(app,'isPackaged',{get:()=>true});
Object.defineProperty(process,'resourcesPath',{value:path.join(payload,'resources')});
// Test harness only: the managed Linux runner forbids Electron's Unix singleton socket.
if(process.platform==='linux')app.requestSingleInstanceLock=()=>true;
const data=fs.mkdtempSync(path.join(os.tmpdir(),'electimes-workpanel-qa-'));
app.setPath('appData',data);
const profile=path.join(data,'ElectimesOffice-WorkPanel-Test');fs.mkdirSync(profile,{recursive:true});
fs.writeFileSync(path.join(profile,'app-settings.json'),JSON.stringify({language:'ko',onboardingSeen:true,aiPanelSide:'right'}));
fs.writeFileSync(path.join(profile,'ai-settings.json'),JSON.stringify({providers:{},subscriptionNoticeSeen:true}));
require(path.join(payload,'resources/app.asar/out/main/index.js'));
