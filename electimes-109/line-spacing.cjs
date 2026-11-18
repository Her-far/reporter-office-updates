'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{_electron}=require('playwright');
const root=__dirname,report={version:'1.0.9',nativePackaged:true,cases:[]};const restore=require('./editor-probe.cjs')();let app,context;
async function until(fn,label,ms=45000){const end=Date.now()+ms;while(Date.now()<end){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,100))}throw Error('Timed out: '+label)}
(async()=>{
 app=await _electron.launch({executablePath:path.join(root,'stage/Electimes Office.exe'),args:[`--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(),'electimes-lines-'))}`],env:{...process.env,GENOFFICE_NO_SPARE_VIEW:'1',GENOFFICE_LANG:'en'},timeout:60000});
 let home=await app.firstWindow();await home.waitForFunction(()=>window.aiOffice?.newHwp,{timeout:45000});
 const welcome=home.locator('.onb-overlay');await welcome.waitFor({state:'visible',timeout:10000}).catch(()=>{});if(await welcome.isVisible())await welcome.getByRole('button',{name:/^Skip$|건너뛰기/}).click();
 await app.evaluate(({dialog})=>{dialog.showMessageBox=async(...args)=>{const opts=args.at(-1),discard=opts.buttons?.findIndex(b=>/don't save|저장 안|저장하지/i.test(b));if(discard>=0)return{response:discard,checkboxChecked:false};throw Error('Unexpected dialog: '+opts.message)}});
 for(const kind of ['hwp','docs'])for(const mode of ['plain','html','triple'])for(const blank of ['upper','lower']){
  const entry={kind,mode,blank};report.cases.push(entry);const previousPages=new Set(app.context().pages());
  await home.evaluate(kind=>window.aiOffice[kind==='hwp'?'newHwp':'newDoc'](),kind);
  const page=await until(()=>app.context().pages().find(p=>!previousPages.has(p)&&(p.url().includes('/'+kind+'/')||p.url().includes('://'+kind+'/'))),'editor '+kind);
  context=page;if(kind==='hwp'){await page.locator('.hwp-app[data-phase="ready"]').waitFor({timeout:60000});context=await until(()=>page.frames().find(f=>f.url().includes('/studio/')),'HWP studio')}
  const input=context.locator(kind==='hwp'?'[aria-label="문서 편집 입력"]':'.ProseMirror[contenteditable="true"]').first();await input.waitFor({state:'attached'});await input.evaluate(e=>e.focus());
  const keys=page.keyboard;
  async function snapshot(){await new Promise(r=>setTimeout(r,180));return kind==='hwp'?context.evaluate(()=>window.__electimesInspect()):input.evaluate(e=>({position:e.editor.state.selection.from,paragraphs:[...e.querySelectorAll('p')].map(p=>({text:p.innerText,top:p.getBoundingClientRect().top,height:p.getBoundingClientRect().height})),doc:e.editor.getJSON()}))}
  await keys.type('ALPHA');await keys.press('Enter');await keys.press('Enter');await keys.type('OMEGA');await keys.press('Home');entry.before=await snapshot();
  if(mode==='triple')await keys.type('///');else{await app.evaluate(({clipboard},html)=>clipboard.write(html?{text:'▲',html:'<span>▲</span>'}:{text:'▲'}),mode==='html');await keys.press('Control+v')}
  entry.pasted=await snapshot();await keys.press('Home');await keys.press('Enter');entry.entered=await snapshot();
  await keys.press('ArrowUp');if(blank==='upper')await keys.press('ArrowUp');await keys.press('Home');await keys.press('Backspace');entry.deleted=await snapshot();
  const count=entry.deleted.paragraphs.length;assert.equal(count,3,JSON.stringify({kind,mode,blank,count}));
  await home.locator('.tab-close').last().click();await page.waitForEvent('close',{timeout:5000}).catch(()=>{});
 }
 for(const kind of ['hwp','docs'])for(const mode of ['plain','html','triple']){
  const pair=report.cases.filter(x=>x.kind===kind&&x.mode===mode);const ys=pair.map(x=>kind==='hwp'?x.deleted.paragraphs[2].rect.y:x.deleted.paragraphs[2].top);assert(Math.abs(ys[0]-ys[1])<1,JSON.stringify({kind,mode,upper:ys[0],lower:ys[1]}));
 }
 console.log(JSON.stringify({cases:report.cases.length,upperLowerSameSpacing:true}));
})().catch(async e=>{report.error=String(e);console.error(e);process.exitCode=1}).finally(async()=>{fs.writeFileSync(path.join(root,'line-spacing-windows.json'),JSON.stringify(report,null,2));try{await require('./close-app.cjs')(app)}finally{restore()}});
