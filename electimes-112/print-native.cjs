'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{_electron}=require('playwright');
const root=__dirname,report={version:'1.0.12',cases:[],physicalPrinterTested:false};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<100;i++){const x=await fn();if(x)return x;await wait(150);}throw Error('Timed out: '+label);}
(async()=>{
 for(const scale of ['1','1.25','1.5','2']){
  const app=await _electron.launch({executablePath:path.join(root,'stage/Electimes Office.exe'),args:[`--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(),'electimes-print-'))}`,`--force-device-scale-factor=${scale}`],env:{...process.env,GENOFFICE_NO_SPARE_VIEW:'1'},timeout:60000});
  try {
   const home=await app.firstWindow();await home.waitForFunction(()=>window.aiOffice?.openPath,{timeout:45000});
   const initial=await app.evaluate(({app})=>require(require('node:path').join(app.getAppPath(),'out/main/print-compat.cjs')).status());assert(initial.installed,JSON.stringify(initial));
   const pid=app.process().pid,output=path.join(root,`dialog-${scale}-windows.json`);
   const watcher=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'native-dialog-probe.ps1'),'-OfficeProcess',String(pid),'-Output',output],{windowsHide:true});
   let stderr='';watcher.stderr.on('data',d=>stderr+=d);const watched=new Promise((r,j)=>{watcher.on('error',j);watcher.on('exit',code=>code===0?r():j(Error('Native watcher '+code+': '+stderr)))});watched.catch(()=>{});
   const result=path.join(root,`result-${scale}-windows.json`);
   await app.evaluate(async({BrowserWindow},file)=>{
    const win=new BrowserWindow({show:true,width:650,height:450,webPreferences:{sandbox:true}});
    await win.loadURL('data:text/html,<style>@page{size:A4;margin:0}body{margin:0}</style><p>Electimes print compatibility check</p>');
    global.__printTestWindow=win;
    setTimeout(()=>win.webContents.print({silent:false,printBackground:true},(ok,error)=>{require('node:fs').writeFileSync(file,JSON.stringify({ok,error}));}),200);
   },result);
   await watched;await until(()=>fs.existsSync(result),'print cancel callback');
   const state=await app.evaluate(({app})=>require(require('node:path').join(app.getAppPath(),'out/main/print-compat.cjs')).status());
   assert.equal(state.calls,1);assert.equal(state.inside,0);assert.equal(state.restored,1);assert.equal(state.before,state.after);assert.equal(state.current,initial.current);
   const dialog=JSON.parse(fs.readFileSync(output,'utf8').replace(/^\uFEFF/,''));const dialogs=Array.isArray(dialog)?dialog:[dialog];
   assert(dialogs.length);for(const d of dialogs){assert.equal(d.awareness,0);assert.equal(d.dpi,96);const buttons=d.children.filter(c=>c.kind==='Button'&&/Cancel|취소/i.test(c.title));assert(buttons.length,'Cancel button exists');for(const b of buttons){assert(b.rect.L>=d.rect.L&&b.rect.R<=d.rect.R&&b.rect.T>=d.rect.T&&b.rect.B<=d.rect.B,'Cancel fits inside dialog');}}
   const pdf=path.join(root,`test-${scale}.pdf`);
   await app.evaluate(async({app},file)=>{const win=global.__printTestWindow;const data=await win.webContents.printToPDF({preferCSSPageSize:true,printBackground:true});require('node:fs').writeFileSync(file,data);win.destroy();},pdf);
   const bytes=fs.readFileSync(pdf);assert(bytes.subarray(0,5).equals(Buffer.from('%PDF-')));assert(bytes.length>1000);
   const media=bytes.toString('latin1').match(/\/MediaBox\s*\[([^\]]+)\]/)?.[1];assert(media,'PDF page dimensions');
   const entry={scale,initial,state,canceled:JSON.parse(fs.readFileSync(result)),dialogCount:dialogs.length,mediaBox:media};report.cases.push(entry);
   if(report.cases.length>1)assert.equal(media,report.cases[0].mediaBox,'App display scaling must not change PDF paper size');
  }finally{await require('../electimes-111/close-app.cjs')(app);}
 }
 console.log(JSON.stringify(report));
})().catch(e=>{report.error=String(e);console.error(e);process.exitCode=1;}).finally(()=>fs.writeFileSync(path.join(root,'print-windows.json'),JSON.stringify(report,null,2)));
