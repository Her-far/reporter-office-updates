'use strict';
// Real keyboard input after dismissing Find; never click the document to recover.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{_electron}=require('playwright');
const root=__dirname,profile=fs.mkdtempSync(path.join(os.tmpdir(),'electimes-find-focus-'));
const report={version:'1.0.9',nativePackaged:true,cases:[]};let app,current;
async function until(fn,label,ms=45000){const end=Date.now()+ms;while(Date.now()<end){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,100))}throw Error('Timed out: '+label)}
(async()=>{
 app=await _electron.launch({executablePath:path.join(root,'stage/Electimes Office.exe'),args:[`--user-data-dir=${profile}`],env:{...process.env,GENOFFICE_NO_SPARE_VIEW:'1',GENOFFICE_LANG:'en'},timeout:60000});
 const home=await app.firstWindow();await home.waitForFunction(()=>window.aiOffice?.newHwp,{timeout:45000});
 const welcome=home.locator('.onb-overlay');await welcome.waitFor({state:'visible',timeout:10000}).catch(()=>{});if(await welcome.isVisible())await welcome.getByRole('button',{name:/^Skip$|건너뛰기/}).click();
 await app.evaluate(({dialog})=>{dialog.showMessageBox=async(...args)=>{const opts=args.at(-1),discard=opts.buttons?.findIndex(b=>/don't save|저장 안|저장하지/i.test(b));if(discard>=0)return{response:discard,checkboxChecked:false};throw Error('Unexpected dialog: '+opts.message)}});
 for(const kind of ['hwp','docs']){
  await home.evaluate(kind=>window.aiOffice[kind==='hwp'?'newHwp':'newDoc'](),kind);
  const page=await until(()=>app.context().pages().find(p=>p.url().includes('/'+kind+'/')||p.url().includes('://'+kind+'/')),'editor '+kind);
  let context=page;
  if(kind==='hwp'){
   await page.locator('.hwp-app[data-phase="ready"]').waitFor({timeout:60000});
   context=await until(()=>page.frames().find(f=>f.url().includes('/studio/')),'HWP studio');
  }
  current=context;
  const input=context.locator(kind==='hwp'?'[aria-label="문서 편집 입력"]':'.ProseMirror[contenteditable="true"]').first();
  await input.waitFor({state:'attached',timeout:60000});await input.evaluate(e=>e.focus());
  const keys=page.keyboard;
  async function text(){
   await app.evaluate(({clipboard})=>clipboard.writeText(''));
   await keys.press('Control+a');await keys.press('Control+c');
   return until(()=>app.evaluate(({clipboard})=>clipboard.readText().replace(/\r/g,'').trim()),'copied document');
  }
  async function find(query,close){
   await keys.press('Control+f');
   const dialog=context.locator(kind==='hwp'?'.find-dialog':'.find-panel');await dialog.waitFor({state:'visible'});
   const search=dialog.locator(kind==='hwp'?'.find-dialog-input':'.find-input').first();await search.fill(query);await search.press('Enter');
   if(kind==='docs'&&query==='target')await until(()=>dialog.locator('.find-count').innerText().then(t=>t==='1/1'),'DOCX match');
   if(close==='escape')await keys.press('Escape');else await dialog.locator(kind==='hwp'?'.dialog-close':'.find-close').click();
   await dialog.waitFor({state:'detached'});
   await until(()=>input.evaluate(e=>document.activeElement===e),'editor keyboard focus after '+close);
  }
  await keys.type('alpha target omega');assert.equal(await text(),'alpha target omega');
  await find('target','button');await keys.press('ArrowRight');await keys.type('Z');assert.equal(await text(),kind==='hwp'?'alpha target Zomega':'alpha targetZ omega');
  report.cases.push({editor:kind,close:'button',arrowThenTyping:true});
  await find('target','escape');await keys.type('X');assert.equal(await text(),kind==='hwp'?'alpha X Zomega':'alpha XZ omega');
  report.cases.push({editor:kind,close:'escape',replaceFoundText:true});
  await keys.press('ArrowRight');await find('not-present','escape');await keys.type('!');assert.equal(await text(),kind==='hwp'?'alpha X Zomega!':'alpha XZ omega!');
  report.cases.push({editor:kind,noMatchPreservesCaret:true});
  await home.locator('.tab-close').last().click();
 }
 console.log(JSON.stringify(report));
})().catch(async e=>{report.error=String(e);console.error(e);if(current)try{report.focus=await current.evaluate(()=>({active:document.activeElement?.outerHTML,body:document.body.innerText.slice(-3000)}))}catch{}process.exitCode=1}).finally(async()=>{
 fs.writeFileSync(path.join(root,'find-focus-windows.json'),JSON.stringify(report,null,2));
 try{await require('./close-app.cjs')(app)}catch(e){console.error(e);process.exitCode=1}
});
