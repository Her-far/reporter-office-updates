// Real Chromium network and renderer/preload/controller flow; no fetch mocks.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {_electron}=require('playwright');
const root=__dirname,stage=path.join(root,'stage'),metadata=path.join(stage,'resources/electimes-version.json');
const originalMetadata=fs.readFileSync(metadata);
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'electimes-download-'));
const source='https://github.com/Her-far/reporter-office-updates/raw/ec86cddd816f8dbe41b73a73f3d009eda5f5e177/electimes-latest.json';
let app;
const report={version:'1.0.7',platform:process.platform,realNetwork:true,versionMetadataSimulated:104,productionUpdaterUnmodified:true};
async function until(fn,what,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,100))}throw Error('Timed out: '+what)}
(async()=>{
  // Simulate a client eligible for the immutable, publicly released 1.0.5 asset.
  // Only version metadata is changed; both app code and network are real.
  fs.writeFileSync(metadata,JSON.stringify({version:'1.0.4',build:104}));
  app=await _electron.launch({executablePath:path.join(stage,'Electimes Office.exe'),args:[`--user-data-dir=${profile}`],env:{...process.env,GENOFFICE_NO_SPARE_VIEW:'1',GENOFFICE_LANG:'en'},timeout:60000});
  const page=await app.firstWindow();
  await page.waitForFunction(()=>window.aiOffice?.reporterUpdates,{timeout:45000});
  const welcome=page.locator('.onb-overlay');
  await welcome.waitFor({state:'visible',timeout:10000}).catch(()=>{});
  if(await welcome.isVisible())await welcome.getByRole('button',{name:/^Skip$|건너뛰기/}).click();
  await page.evaluate(()=>window.aiOffice.reporterUpdates.notifications(false));
  const cache=path.join(await app.evaluate(({app})=>app.getPath('userData')),'electimes-updates');
  for(const name of fs.readdirSync(cache))if(/\.(exe|partial)$/.test(name))fs.unlinkSync(path.join(cache,name));
  await app.evaluate(({session})=>{
    globalThis.__updateRedirects=[];globalThis.__updateRequests=0;
    const filter={urls:['https://github.com/Her-far/reporter-office-updates/*','https://raw.githubusercontent.com/Her-far/reporter-office-updates/*','https://release-assets.githubusercontent.com/*']};
    session.defaultSession.webRequest.onBeforeRequest(filter,(_details,callback)=>{globalThis.__updateRequests++;callback({})});
    session.defaultSession.webRequest.onBeforeRedirect(filter,details=>globalThis.__updateRedirects.push({from:new URL(details.url).hostname,to:new URL(details.redirectURL).hostname,status:details.statusCode}));
  });
  await page.evaluate(url=>window.aiOffice.reporterUpdates.source(url),source);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('home:open-settings',{section:'about'}));
  const check=page.getByRole('button',{name:'업데이트 확인',exact:true});
  await check.click();
  const available=await until(async()=>{const s=await page.evaluate(()=>window.aiOffice.reporterUpdates.state());return s.phase==='available'?s:s.phase==='error'?Promise.reject(Error(s.message)):false},'release available');
  assert.equal(available.release.build,105);report.releaseFeedRedirectPassed=true;
  const oldError=await app.evaluate(async({net},url)=>{try{const r=await net.fetch(url,{redirect:'manual',credentials:'omit',signal:AbortSignal.timeout(30000)});await r.body?.cancel();return 'Unexpected success'}catch(e){return e.message}},available.release.installer.url);
  assert.match(oldError,/Redirect was cancelled/);report.previousTransportFailure=oldError;
  const cancelled=await page.evaluate(async()=>{
    const api=window.aiOffice.reporterUpdates;let requested=false;
    const off=api.onChanged(s=>{if(!requested&&s.phase==='downloading'&&s.percent>=1){requested=true;void api.cancel()}});
    try{const state=await api.download();return {state,cancelRequested:requested}}finally{off()}
  });
  assert.equal(cancelled.cancelRequested,true);assert.equal(cancelled.state.phase,'error');assert.match(cancelled.state.message,/취소|초과/);
  assert.deepEqual(fs.readdirSync(cache).filter(n=>/\.(exe|partial)$/.test(n)),[]);report.cancellationCleanedPartial=true;
  const start=Date.now();
  const ready=await page.evaluate(async()=>{const api=window.aiOffice.reporterUpdates;window.__updatePercents=[];const off=api.onChanged(s=>{if(s.phase==='downloading')window.__updatePercents.push(s.percent)});try{return await api.download()}finally{off()}});
  assert.equal(ready.phase,'ready',ready.message);assert.equal(ready.percent,100);
  await page.getByRole('button',{name:'재시작하여 업데이트',exact:true}).waitFor({state:'visible'});
  const files=fs.readdirSync(cache).filter(n=>n.endsWith('.exe'));assert.equal(files.length,1);
  const bytes=fs.readFileSync(path.join(cache,files[0]));
  assert.equal(bytes.length,available.release.installer.size);
  assert.equal(bytes.subarray(0,2).toString(),'MZ');
  const sha=crypto.createHash('sha256').update(bytes).digest('hex');assert.equal(sha,available.release.installer.sha256);
  report.download={bytes:bytes.length,sha256:sha,seconds:(Date.now()-start)/1000,readyVisible:true,retryPassed:true};
  const before=await app.evaluate(()=>globalThis.__updateRequests);
  assert.equal((await page.evaluate(()=>window.aiOffice.reporterUpdates.download())).phase,'ready');
  assert.equal(await app.evaluate(()=>globalThis.__updateRequests),before);report.verifiedCacheReusedWithoutNetwork=true;
  report.redirects=await app.evaluate(()=>globalThis.__updateRedirects);
  assert(report.redirects.some(x=>x.to==='release-assets.githubusercontent.com'));
  console.log(JSON.stringify(report));
})().catch(async error=>{report.error=String(error);console.error(error);process.exitCode=1;if(app)try{console.error(await(await app.firstWindow()).locator('body').innerText())}catch{}}).finally(async()=>{
  try{await require('./close-app.cjs')(app);}finally{
  fs.writeFileSync(metadata,originalMetadata);
  fs.writeFileSync(path.join(root,'update-download-windows.json'),JSON.stringify(report,null,2));
  }
});
