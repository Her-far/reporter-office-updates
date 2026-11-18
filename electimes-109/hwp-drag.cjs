'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),{_electron}=require('playwright');
const root=__dirname,studio=path.join(root,'stage/resources/modules/hwp/renderer/studio');
const report={version:'1.0.9',nativePackaged:true};let app;
async function until(fn,label,ms=60000){const end=Date.now()+ms;while(Date.now()<end){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,100))}throw Error('Timed out: '+label)}
(async()=>{
 const core=await import(pathToFileURL(path.join(studio,'rhwp.js')));core.initSync({module:fs.readFileSync(path.join(studio,'assets/rhwp_bg-BmBlhBaD.wasm'))});
 const doc=core.HwpDocument.createEmpty();const html=Array.from({length:160},(_,i)=>`<p>LINE_${String(i).padStart(3,'0')} long selection across pages.</p>`+(i%30===15?`<table><tr><td>TABLE_${i}</td><td>Second cell</td></tr><tr><td>Next row</td><td>End cell</td></tr></table>`:'')).join('');
 assert.equal(JSON.parse(doc.pasteHtml(0,0,0,html)).ok,true);const bytes=doc.exportHwp();const fixture=path.join(root,'long-selection-fixture.hwp');fs.writeFileSync(fixture,bytes);
 const loaded=new core.HwpDocument(bytes);report.pages=loaded.pageCount();assert(report.pages>=4);const first=JSON.parse(loaded.getCursorRect(0,0,0));const info=JSON.parse(loaded.getPageInfo(0));
 app=await _electron.launch({executablePath:path.join(root,'stage/Electimes Office.exe'),args:[`--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(),'hwp-drag-'))}`],env:{...process.env,GENOFFICE_NO_SPARE_VIEW:'1',GENOFFICE_LANG:'en'},timeout:60000});
 const home=await app.firstWindow();await home.waitForFunction(()=>window.aiOffice?.openPath,{timeout:45000});
 const welcome=home.locator('.onb-overlay');await welcome.waitFor({state:'visible',timeout:10000}).catch(()=>{});if(await welcome.isVisible())await welcome.getByRole('button',{name:/^Skip$|건너뛰기/}).click();
 await home.evaluate(p=>window.aiOffice.openPath(p),fixture);
 const page=await until(()=>app.context().pages().find(p=>p.url().includes('/hwp/')||p.url().includes('://hwp/')),'HWP editor');await page.locator('.hwp-app[data-phase="ready"]').waitFor({timeout:60000});
 const frame=await until(()=>page.frames().find(f=>f.url().includes('/studio/')),'studio');
 await frame.locator('.document-page-canvas').first().waitFor();
 const canvas=await frame.locator('.document-page-canvas').first().boundingBox();const scroll=await frame.locator('#scroll-container').boundingBox();const scale=canvas.width/info.width;
 await page.mouse.move(canvas.x+(first.x+1)*scale,canvas.y+(first.y+first.height/2)*scale);await page.mouse.down();
 await page.mouse.move(canvas.x+(first.x+120)*scale,scroll.y+scroll.height-2,{steps:25});
 await until(()=>frame.locator('#scroll-container').evaluate(e=>e.scrollTop>2000),'drag continues past early pages');
 assert(await frame.locator('.selection-highlight:visible').count()>0);
 await until(()=>frame.locator('#scroll-container').evaluate(e=>e.scrollHeight-e.clientHeight-e.scrollTop<2),'drag reaches document end',90000);
 await page.mouse.up();await page.keyboard.press('Control+c');
 const copied=await app.evaluate(({clipboard})=>({text:clipboard.readText(),html:clipboard.readHTML()}));
 assert.match(copied.text,/LINE_000/);assert.match(copied.text,/LINE_159/);for(let i=0;i<160;i++)assert(copied.text.includes('LINE_'+String(i).padStart(3,'0')),'Missing line '+i);
 assert.match(copied.html,/TABLE_15/);report.fullDragAcrossPages=true;report.allParagraphsCopied=true;report.tablesRetainedInClipboard=true;console.log(JSON.stringify(report));
})().catch(e=>{report.error=String(e);console.error(e);process.exitCode=1}).finally(async()=>{fs.writeFileSync(path.join(root,'hwp-drag-windows.json'),JSON.stringify(report,null,2));await require('./close-app.cjs')(app)});
