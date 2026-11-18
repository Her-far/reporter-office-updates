'use strict';
// A real released 1.0.10 client checks and downloads the new public cumulative
// update. No version simulation, feed substitution or network interception.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {_electron}=require('playwright');
const root=__dirname,exe=path.resolve(process.argv[2]);
const feed=JSON.parse(fs.readFileSync(path.resolve(process.argv[3]),'utf8'));
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'electimes-cumulative-client-'));
const report={client:'1.0.10',realNetwork:true,realPublishedClient:true};
let app;
async function until(fn,label,ms=90000){const end=Date.now()+ms;while(Date.now()<end){const result=await fn();if(result)return result;await new Promise(r=>setTimeout(r,200))}throw Error('Timed out: '+label)}
(async()=>{
 app=await _electron.launch({executablePath:exe,args:[`--user-data-dir=${profile}`],env:{...process.env,GENOFFICE_NO_SPARE_VIEW:'1',GENOFFICE_LANG:'en'},timeout:60000});
 const page=await app.firstWindow();await page.waitForFunction(()=>window.aiOffice?.reporterUpdates,{timeout:45000});
 const welcome=page.locator('.onb-overlay');await welcome.waitFor({state:'visible',timeout:8000}).catch(()=>{});
 if(await welcome.isVisible())await welcome.getByRole('button',{name:/^Skip$|건너뛰기/}).click();
 const source='https://raw.githubusercontent.com/Her-far/reporter-office-updates/main/electimes-latest.json?cumulative=112';
 await page.evaluate(url=>window.aiOffice.reporterUpdates.source(url),source);
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('home:open-settings',{section:'about'}));
 await page.getByRole('button',{name:'업데이트 확인',exact:true}).click();
 const available=await until(async()=>{
  const state=await page.evaluate(()=>window.aiOffice.reporterUpdates.state());
  if(state.phase==='error')throw Error(state.message);
  return state.phase==='available'?state:false;
 },'published cumulative feed');
 assert.equal(available.currentBuild,110);
 assert.equal(available.release.downloadType,'patch');
 assert.equal(available.release.installer.url,feed.installer.url);
 assert.equal(available.release.installer.size,feed.installer.size);
 const button=page.getByRole('button',{name:/^업데이트 다운로드 \(/});
 report.button=await button.innerText();
 assert(!report.button.includes('286.3'));assert(report.button.includes((feed.installer.size/1048576).toFixed(1)));
 const cache=path.join(await app.evaluate(({app})=>app.getPath('userData')),'electimes-updates');
 await button.click();
 const restart=page.getByRole('button',{name:'재시작하여 업데이트',exact:true});
 await until(async()=>{
  const s=await page.evaluate(()=>window.aiOffice.reporterUpdates.state());
  if(s.phase==='error')throw Error(s.message);
  return s.phase==='ready';
 },'download complete',150000);
 await restart.waitFor({state:'visible'});
 await new Promise(r=>setTimeout(r,5000));
 assert.equal(app.process().exitCode,null);assert.equal(await restart.isEnabled(),true);
 const installers=fs.readdirSync(cache).filter(n=>n.endsWith('.exe'));assert.equal(installers.length,1);
 const bytes=fs.readFileSync(path.join(cache,installers[0]));
 const sha=crypto.createHash('sha256').update(bytes).digest('hex');
 assert.equal(bytes.length,feed.installer.size);assert.equal(sha,feed.installer.sha256);
 report.download={bytes:bytes.length,sha256:sha};report.waitedForExplicitRestart=true;
 console.log(JSON.stringify(report));
})().catch(error=>{report.error=String(error);console.error(error);process.exitCode=1}).finally(async()=>{
 try{await require('../electimes-109/close-app.cjs')(app)}finally{fs.writeFileSync(path.join(root,'cumulative-published-ui.json'),JSON.stringify(report,null,2));}
});
