'use strict';
// Exercise the real UI, detached Windows installer, on-disk upgrade and relaunch.
// The immutable 1.0.8 release is the installation target; staged 1.0.9 stays intact.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{_electron}=require('playwright');
const root=__dirname,fixture=JSON.parse(fs.readFileSync(path.join(root,'download-fixture.json'),'utf8'));
const report={version:'1.0.9',realInstaller:true,realRestart:true,cases:[]};
const powershell=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
const quote=s=>"'"+s.replaceAll("'","''")+"'";
function ps(script){script="$ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); "+script+'; exit 0';return execFileSync(powershell,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,timeout:30000}).replace(/^\uFEFF/,'').trim()}
async function until(fn,label,ms=90000){const end=Date.now()+ms;while(Date.now()<end){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,250))}throw Error('Timed out: '+label)}
async function runCase(legacy){
 const target=fs.mkdtempSync(path.join(os.tmpdir(),legacy?'Electimes legacy update ':'전기신문 업데이트 '));
 fs.cpSync(path.join(root,legacy?'base-installer':'stage'),target,{recursive:true});
 const metadata=path.join(target,'resources/electimes-version.json');
 if(!legacy)fs.writeFileSync(metadata,JSON.stringify({version:'1.0.6',build:106}));
 const exe=path.join(target,'Electimes Office.exe'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'electimes-install-profile-'));
 let app,child,logsDir;const entry={client:legacy?'released-1.0.6':'fixed-1.0.9',simulatedBuild:106,targetBuild:108};report.cases.push(entry);
 try{
  app=await _electron.launch({executablePath:exe,args:[`--user-data-dir=${profile}`],env:{...process.env,GENOFFICE_NO_SPARE_VIEW:'1',GENOFFICE_LANG:'en'},timeout:60000});
  child=app.process();
  const page=await app.firstWindow();await page.waitForFunction(()=>window.aiOffice?.reporterUpdates,{timeout:45000});
  const welcome=page.locator('.onb-overlay');await welcome.waitFor({state:'visible',timeout:10000}).catch(()=>{});
  if(await welcome.isVisible())await welcome.getByRole('button',{name:/^Skip$|건너뛰기/}).click();
  const data=await app.evaluate(({app})=>app.getPath('userData')),cache=path.join(data,'electimes-updates');
  logsDir=cache;const resultFile=path.join(cache,'install-result.json');
  const trace=path.join(cache,'update-process-trace.jsonl');
  await app.evaluate(({app},file)=>{
   const fs=process.getBuiltinModule('fs'),cp=process.getBuiltinModule('child_process');const log=data=>fs.appendFileSync(file,JSON.stringify({at:Date.now(),...data})+'\n');
   for(const event of ['before-quit','will-quit','quit'])app.on(event,()=>log({event}));
   const original=cp.spawn;cp.spawn=(command,args,options)=>{const child=original(command,args,options);if(/powershell/i.test(command))log({event:'spawn-helper',pid:child.pid});return child};
  },trace);
  fs.copyFileSync(fixture.installer,path.join(cache,path.basename(fixture.installer)));
  fs.writeFileSync(path.join(data,'update-preservation-fixture.json'),JSON.stringify({note:'사용자 파일 보존'}));
  await page.evaluate(url=>window.aiOffice.reporterUpdates.source(url),fixture.source);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('home:open-settings',{section:'about'}));
  await page.getByRole('button',{name:'업데이트 확인',exact:true}).click();
  const download=page.getByRole('button',{name:legacy?/^다운로드 및 업데이트 \(/:/^업데이트 다운로드 \(/});
  const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
  await download.click();
  if(!legacy){
   const restart=page.getByRole('button',{name:'재시작하여 업데이트',exact:true});await restart.waitFor({state:'visible'});
   await new Promise(r=>setTimeout(r,5000));assert.equal(child.exitCode,null);
   entry.waitedWithoutQuitting=true;
   await restart.click();entry.explicitRestartClicked=true;
  }
  const quit=await until(async()=>child.exitCode!==null?await exited:false,'client quit');assert.equal(quit.code,0);entry.quit=quit;
  let result;try{result=await until(()=>{
   if(!fs.existsSync(resultFile))return false;
   try{return JSON.parse(fs.readFileSync(resultFile,'utf8').replace(/^\uFEFF/,''))}catch{return false}
  },'installer result',legacy?30000:120000)}catch(e){
   if(!legacy)throw e;
   entry.legacyInstallDidNotComplete=true;entry.observed=String(e);
   entry.trace=fs.existsSync(trace)?fs.readFileSync(trace,'utf8'):'';
   console.log(JSON.stringify(entry));return;
  }
  entry.installResult=result;assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.build,108);
  assert.equal(JSON.parse(fs.readFileSync(metadata,'utf8')).build,108);
  assert.equal(JSON.parse(fs.readFileSync(path.join(data,'update-preservation-fixture.json'),'utf8')).note,'사용자 파일 보존');
  const window=await until(()=>{
   const result=ps(`Get-Process -Name 'Electimes Office' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq ${quote(exe)} -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1 Id,MainWindowTitle | ConvertTo-Json -Compress`);
   return result?JSON.parse(result):false;
  },'restarted app window',60000);
  assert.match(window.MainWindowTitle,/전기신문|Electimes/);entry.restartedWindow=window.MainWindowTitle;entry.profilePreserved=true;
  console.log(JSON.stringify(entry));
 }catch(e){entry.error=String(e);throw e}
 finally{
  if(app&&child?.exitCode===null)await require('./close-app.cjs')(app).catch(()=>{});
  const dataLogs=logsDir||path.join(profile,'electimes-updates');
  for(const name of ['install-handoff.log','update-process-trace.jsonl'])if(fs.existsSync(path.join(dataLogs,name)))entry[name]=fs.readFileSync(path.join(dataLogs,name),'utf8').slice(-12000);
  try{ps(`$p = Get-Process -Name 'Electimes Office' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq ${quote(exe)} }; $p | ForEach-Object { [void]$_.CloseMainWindow() }; Start-Sleep -Seconds 2; Get-Process -Name 'Electimes Office' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq ${quote(exe)} } | Stop-Process -Force`)}catch(e){entry.cleanupError=String(e)}
 }
}
(async()=>{await runCase(true);await runCase(false)})().catch(e=>{report.error=String(e);console.error(e);process.exitCode=1}).finally(()=>fs.writeFileSync(path.join(root,'update-install-windows.json'),JSON.stringify(report,null,2)));
