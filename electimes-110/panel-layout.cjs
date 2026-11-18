'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{_electron}=require('playwright');
const root=__dirname,profile=fs.mkdtempSync(path.join(os.tmpdir(),'electimes-panel-layout-'));
const report={version:'1.0.10',nativePackaged:true};let app;
async function until(fn,label,ms=60000){const end=Date.now()+ms;while(Date.now()<end){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,100))}throw Error('Timed out: '+label)}
(async()=>{
 app=await _electron.launch({executablePath:path.join(root,'stage/Electimes Office.exe'),args:[`--user-data-dir=${profile}`],env:{...process.env,GENOFFICE_NO_SPARE_VIEW:'1',GENOFFICE_LANG:'en'},timeout:60000});
 const home=await app.firstWindow();await home.waitForFunction(()=>window.aiOffice?.newHwp,{timeout:45000});
 const welcome=home.locator('.onb-overlay');await welcome.waitFor({state:'visible',timeout:10000}).catch(()=>{});if(await welcome.isVisible())await welcome.getByRole('button',{name:/^Skip$|건너뛰기/}).click();
 await home.evaluate(()=>window.aiOffice.newHwp());
 const editor=await until(()=>app.context().pages().find(p=>p.url().includes('/hwp/renderer/index.html')||p.url().includes('hwp/index.html')),'HWP page');
 await editor.locator('.hwp-app[data-phase="ready"]').waitFor({timeout:60000});
 await editor.locator('.wp-toolbar [data-menu=ai]').click();
 const draft=editor.locator('.copilot textarea').first();await draft.fill('패널을 접어도 유지할 AI 입력');
 async function aligned(){return editor.evaluate(()=>{
   const d=document.querySelector('.wp-dock'),bar=d?.querySelector('.wp-toolbar');if(!d||!bar)return false;
   const a=d.getBoundingClientRect(),b=bar.getBoundingClientRect();
   return getComputedStyle(d).flexDirection==='column'&&Math.abs(a.top-b.top)<=2&&b.right<=a.right+1&&a.left>=-1&&a.right<=innerWidth+1;
 })}
 for(let i=0;i<3;i++){
  await editor.locator('.ai-panel-collapse').click();
  await editor.locator('#wp-launch').waitFor({state:'visible'});
  assert.equal(await editor.locator('.wp-dock').isVisible(),false);
  await editor.locator('#wp-launch').click();await draft.waitFor({state:'visible'});
  await until(aligned,'toolbar restored at panel top');
  assert.equal(await draft.inputValue(),'패널을 접어도 유지할 AI 입력');
 }
 report.collapseReopenCycles=3;report.aiDraftPreserved=true;
 // A React className replacement used to remove the integration class permanently.
 await editor.locator('.wp-dock').evaluate(d=>d.classList.remove('wp-dock'));
 await until(aligned,'recover original dock className rewrite');report.classRewriteRecovers=true;
 report.sides=[];
 for(let i=0;i<2;i++){
  const before=await editor.evaluate(()=>document.documentElement.dataset.aiPanelSide==='right'?'right':'left');
  await editor.locator('.ai-panel-side-button').click();
  const side=before==='left'?'right':'left';
  await until(()=>editor.evaluate(side=>(document.documentElement.dataset.aiPanelSide==='right'?'right':'left')===side,side),'side preference '+side);
  await until(aligned,'layout on '+side);
  const initial=await editor.locator('.wp-dock').evaluate(d=>{const r=d.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,total:innerWidth}});
  if(side==='left')assert(initial.left<3,JSON.stringify(initial));else assert(Math.abs(initial.right-initial.total)<3,JSON.stringify(initial));
  for(const menu of ['mail','calendar','notes','ai']){
   await editor.locator('.wp-toolbar [data-menu='+menu+']').click();
   await until(()=>editor.locator('.wp-dock').getAttribute('data-wp-menu').then(m=>m===menu),'tab '+menu);
   const width=await editor.locator('.wp-dock').evaluate(d=>d.getBoundingClientRect().width);assert.equal(width,initial.width);
   await until(aligned,'toolbar position '+menu);
  }
  report.sides.push(side);
 }
 assert.equal(await draft.inputValue(),'패널을 접어도 유지할 AI 입력');
 // A narrow window must retain accessible controls; restoring its width restores the dock.
 for(const width of [700,1200]){
  await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setContentSize(width,850),width);
  await until(aligned,'responsive toolbar '+width);
 }
 report.commonWidthAcrossMenus=true;report.resizeRecovery=true;
 console.log(JSON.stringify(report));
})().catch(e=>{report.error=String(e);console.error(e);process.exitCode=1}).finally(async()=>{fs.writeFileSync(path.join(root,'panel-layout-windows.json'),JSON.stringify(report,null,2));await require('./close-app.cjs')(app)});
