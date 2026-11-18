'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{_electron}=require('playwright');
const root=__dirname,report={version:'1.0.12',cases:[],physicalPrinterTested:false};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<200;i++){const x=await fn();if(x)return x;await wait(150);}throw Error('Timed out: '+label);}
async function status(app){return app.evaluate(({app})=>process.getBuiltinModule('module').createRequire(process.getBuiltinModule('path').join(app.getAppPath(),'package.json'))('./out/main/print-compat.cjs').status());}
function observe(app,label){
 const output=path.join(root,`dialog-${label}-windows.json`);
 const watcher=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'native-dialog-probe.ps1'),'-OfficeProcess',String(app.process().pid),'-Output',output],{windowsHide:true});
 let stderr='';watcher.stderr.on('data',d=>stderr+=d);
 const done=new Promise((resolve,reject)=>{watcher.on('error',reject);watcher.on('exit',code=>code===0?resolve():reject(Error('Native watcher '+code+': '+stderr)))});done.catch(()=>{});
 return {output,done};
}
async function verify(app,observed,initial,count,result){
 await observed.done;await until(()=>fs.existsSync(result),'print cancel callback');
 const state=await status(app);
 assert.equal(state.calls,count);assert.equal(state.inside,0);assert.equal(state.restored,count);assert.equal(state.before,state.after);assert.equal(state.current,initial.current);
 const data=JSON.parse(fs.readFileSync(observed.output,'utf8').replace(/^\uFEFF/,'')),dialogs=Array.isArray(data)?data:[data];
 assert(dialogs.length);
 for(const d of dialogs){
  assert.equal(d.awareness,0);assert.equal(d.dpi,96);
  const buttons=d.children.filter(c=>c.kind==='Button'&&/Cancel|취소/i.test(c.title));assert(buttons.length,'Cancel button exists');
  for(const b of buttons)assert(b.rect.L>=d.rect.L&&b.rect.R<=d.rect.R&&b.rect.T>=d.rect.T&&b.rect.B<=d.rect.B,'Cancel fits inside dialog');
 }
 return {state,dialogs,result:JSON.parse(fs.readFileSync(result))};
}
(async()=>{
 for(const scale of ['1','1.25','1.5','2']){
  const app=await _electron.launch({executablePath:path.join(root,'stage/Electimes Office.exe'),args:[`--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(),'electimes-print-'))}`,`--force-device-scale-factor=${scale}`],env:{...process.env,GENOFFICE_NO_SPARE_VIEW:'1'},timeout:60000});
  try {
   app.process().stderr?.on('data',chunk=>{report.stderr=((report.stderr??'')+chunk.toString()).slice(-12000);});
   const home=await app.firstWindow();await home.waitForFunction(()=>window.aiOffice?.openPath,{timeout:45000});
   const initial=await status(app);report.active={scale,initial};assert(initial.installed,JSON.stringify(initial));
   const observed=observe(app,scale),result=path.join(root,`result-${scale}-windows.json`);
   await app.evaluate(async({BrowserWindow},file)=>{
    const win=new BrowserWindow({show:true,width:650,height:450,webPreferences:{sandbox:true}});
    await win.loadURL('data:text/html,<style>@page{size:A4;margin:0}body{margin:0}</style><p>Electimes print compatibility check</p>');
    global.__printTestWindow=win;
    setTimeout(()=>win.webContents.print({silent:false,printBackground:true},(ok,error)=>{process.getBuiltinModule('fs').writeFileSync(file,JSON.stringify({ok,error}));}),200);
   },result);
   const checked=await verify(app,observed,initial,1,result);
   assert.equal(checked.result.ok,false);assert.match(checked.result.error,/cancel/i);
   const pdf=path.join(root,`test-${scale}.pdf`);
   await app.evaluate(async({app},file)=>{const win=global.__printTestWindow;const data=await win.webContents.printToPDF({preferCSSPageSize:true,printBackground:true});process.getBuiltinModule('fs').writeFileSync(file,data);win.destroy();},pdf);
   const bytes=fs.readFileSync(pdf);assert(bytes.subarray(0,5).equals(Buffer.from('%PDF-')));assert(bytes.length>1000);
   const media=bytes.toString('latin1').match(/\/MediaBox\s*\[([^\]]+)\]/)?.[1];assert(media,'PDF page dimensions');
   const entry={scale,initial,state:checked.state,canceled:checked.result,dialogCount:checked.dialogs.length,mediaBox:media};report.cases.push(entry);
   if(report.cases.length>1)assert.equal(media,report.cases[0].mediaBox,'App display scaling must not change PDF paper size');
   if(scale==='1'){
    // Reopen in the same process through the actual HWP IPC handler. This also
    // exercises the visible parented HWP print owner and delayed-import reuse.
    const fixture=path.join(root,'native-print.hwp');fs.writeFileSync(fixture,Buffer.from(fs.readFileSync(path.join(root,'../electimes-111/engine/cell-flow-flat.hwp.b64'),'utf8'),'base64'));
    await home.evaluate(p=>window.aiOffice.openPath(p),fixture);
    const page=await until(()=>app.context().pages().find(p=>p.url().includes('/hwp/')||p.url().includes('://hwp/')),'HWP editor');
    await page.locator('.hwp-app[data-phase="ready"]').waitFor({timeout:60000});
    const hwpResult=path.join(root,'result-hwp-windows.json'),hwpObserved=observe(app,'hwp');
    await app.evaluate(({ipcMain,webContents,BrowserWindow},file)=>{
     const sender=webContents.getAllWebContents().find(w=>w.getURL().includes('/hwp/')||w.getURL().includes('://hwp/'));
     if(!sender)throw Error('HWP view is unavailable');
     const handler=ipcMain._invokeHandlers.get('hwp:print-pages');if(!handler)throw Error('HWP printing is unregistered');
     const owner=BrowserWindow.fromWebContents(sender)??BrowserWindow.getFocusedWindow();owner?.focus();
     const job={mode:'print',pages:[{width:793.7007874,height:1122.519685,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="793.7" height="1122.52"><text x="40" y="50">HWP print path test</text></svg>'}],images:[]};
     setTimeout(async()=>{let r;try{r=await handler({sender},job)}catch(e){r={error:String(e)}}process.getBuiltinModule('fs').writeFileSync(file,JSON.stringify(r));},200);
    },hwpResult);
    const hwp=await verify(app,hwpObserved,initial,2,hwpResult);assert.equal(hwp.result.ok,true,JSON.stringify(hwp.result));
    assert(hwp.dialogs.some(d=>d.owner?.title==='전기신문 Office — 인쇄'&&d.owner.visible),'HWP native dialog has a visible Office print owner');
    entry.hwp={state:hwp.state,canceled:hwp.result,visibleOwner:true};
   }
  }catch(error){report.failure={state:await status(app).catch(()=>null),results:fs.readdirSync(root).filter(f=>/^result-.*-windows.json$/.test(f)).map(f=>({file:f,data:JSON.parse(fs.readFileSync(path.join(root,f)))}))};throw error;}finally{await require('../electimes-111/close-app.cjs')(app);}
 }
 console.log(JSON.stringify(report));
})().catch(e=>{report.error=String(e);console.error(e);process.exitCode=1;}).finally(()=>fs.writeFileSync(path.join(root,'print-windows.json'),JSON.stringify(report,null,2)));
