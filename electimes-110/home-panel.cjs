'use strict';
// Native Windows regression. Uses synthetic notes and intercepted webmail only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{_electron}=require('playwright');
const root=__dirname,report={version:'1.0.10',nativePackaged:true,liveAccountsTested:false};let app,home,panel;
const deadline=setTimeout(()=>{console.error('Home panel test exceeded 240 seconds');process.exit(1);},240000);deadline.unref();
async function until(fn,label,ms=45000){const end=Date.now()+ms;while(Date.now()<end){const result=await fn();if(result)return result;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+label);}
async function launch(){
 app=await _electron.launch({executablePath:path.join(root,'stage/Electimes Office.exe'),env:{...process.env,GENOFFICE_NO_SPARE_VIEW:'1',GENOFFICE_LANG:'ko'},timeout:60000});
 home=await app.firstWindow();await home.waitForFunction(()=>window.aiOffice?.setAiPanelPrefs&&window.aiOfficeTabs,{timeout:45000});
 const welcome=home.locator('.onb-overlay');await welcome.waitFor({state:'visible',timeout:5000}).catch(()=>{});if(await welcome.isVisible())await welcome.getByRole('button',{name:/^Skip$|건너뛰기/}).click();
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1300,900));
 await home.locator('.wp-toolbar').waitFor();
}
async function choose(page,menu){await page.locator('.wp-toolbar [data-menu='+menu+']').click();await until(()=>page.locator('.wp-dock').getAttribute('data-wp-menu').then(m=>m===menu),'menu '+menu);}
async function positioned(page,side){return page.evaluate(side=>{const d=document.querySelector('.wp-dock');if(!d||d.classList.contains('wp-expanded'))return false;const r=d.getBoundingClientRect();return document.documentElement.dataset.aiPanelSide===side&&(side==='right'?Math.abs(r.right-innerWidth)<3:r.left<3);},side);}
async function expanded(page,expected){await until(()=>page.locator('.wp-dock').evaluate((d,expected)=>d.classList.contains('wp-expanded')===expected,expected),'expanded='+expected);}
async function width(page){return page.locator('.wp-dock').evaluate(d=>d.getBoundingClientRect().width);}
// CDP Input.dispatchKeyEvent bypasses Electron's before-input-event. Send through
// the native WebContents keyboard path used by physical Windows keyboard input.
async function escape(page){await app.evaluate(({webContents},url)=>{const wc=webContents.getAllWebContents().find(w=>w.getURL()===url);if(!wc)throw Error('Missing keyboard target');wc.focus();wc.sendInputEvent({type:'keyDown',keyCode:'Escape'});wc.sendInputEvent({type:'keyUp',keyCode:'Escape'});},page.url());}
async function getPanel(){panel=await until(()=>app.context().pages().find(p=>p.url().includes('/work-panel/index.html')),'work panel contents');await panel.waitForFunction(()=>window.workPanel);return panel;}
async function assertBack(page,homeMode){
 const box=await page.locator('.wp-restore').evaluate(b=>{const r=b.getBoundingClientRect(),d=b.closest('.wp-dock').getBoundingClientRect();return {visible:!b.hidden,x:r.x,y:r.y,right:r.right,bottom:r.bottom,dockTop:d.top,dockBottom:d.bottom,tabBottom:document.querySelector('.tab-bar')?.getBoundingClientRect().bottom||0,width:innerWidth,height:innerHeight,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b};});
 assert(box.visible&&box.hit&&box.x>=0&&box.right<=box.width,JSON.stringify(box));
 assert(box.bottom<=box.height&&box.dockBottom<=box.height+1,JSON.stringify(box));
 if(homeMode)assert(box.tabBottom>0&&box.y>=box.tabBottom&&box.dockTop>=box.tabBottom,JSON.stringify(box));
 return box;
}
(async()=>{
 await launch();
 await home.evaluate(()=>window.aiOffice.setAiPanelPrefs({side:'right'}));await until(()=>positioned(home,'right'),'home right');
 await choose(home,'notes');await getPanel();await panel.getByRole('button',{name:'+ 새 메모',exact:true}).click();
 const body=panel.locator('.note-body textarea'),draft='확대와 복원 후에도 유지할 테스트 메모';await body.fill(draft);await panel.locator('.notes-saved').filter({hasText:'저장됨'}).waitFor();
 const originalWidth=await width(home);report.homeSides=[];
 for(const side of ['left','right']){
  await home.evaluate(side=>window.aiOffice.setAiPanelPrefs({side}),side);await until(()=>positioned(home,side),'live home side '+side);
  await home.locator('.wp-expand').click();await expanded(home,true);const bounds=await assertBack(home,true);
  await home.locator('.wp-restore').click();await expanded(home,false);await until(()=>positioned(home,side),'restored home '+side);
  assert.equal(await width(home),originalWidth);assert.equal(await body.inputValue(),draft);
  await home.locator('.wp-expand').click();await expanded(home,true);await body.click();await escape(panel);await expanded(home,false);
  assert.equal(await width(home),originalWidth);assert.equal(await body.inputValue(),draft);
  report.homeSides.push({side,buttonRestore:true,noteFocusedEscape:true,captionClearance:bounds.y-bounds.tabBottom});
 }
 report.homeMenuReturn=[];
 for(const menu of ['ai','mail','calendar','notes']){
  await choose(home,menu);await home.locator('.wp-expand').click();await expanded(home,true);await assertBack(home,true);
  await home.locator('.wp-restore').click();await expanded(home,false);assert.equal(await width(home),originalWidth);report.homeMenuReturn.push(menu);
 }
 // Exercise keyboard events from the separate remote WebContentsView, without a login.
 await app.context().route('https://mail.worksmobile.com/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Synthetic webmail</title><input id="fixture" aria-label="Synthetic mail input">'}));
 await panel.evaluate(()=>workPanel.action('settings',{mailDisplay:'web',mailEnabled:true}));await choose(home,'mail');
 const remote=await until(()=>app.context().pages().find(p=>p.url().startsWith('https://mail.worksmobile.com/')),'synthetic webmail');await remote.locator('#fixture').waitFor();
 await home.locator('.wp-expand').click();await expanded(home,true);await remote.locator('#fixture').click();await escape(remote);await expanded(home,false);report.webmailEscape=true;
 await home.locator('.wp-expand').click();await expanded(home,true);await panel.getByRole('button',{name:/^다운로드 \d+개$/}).click();await panel.locator('#detail[open]').waitFor();
 await escape(panel);await panel.locator('#detail[open]').waitFor({state:'hidden'});await expanded(home,true);report.dialogEscapeKeepsPanelExpanded=true;
 await home.locator('.wp-restore').click();await expanded(home,false);
 await panel.evaluate(()=>workPanel.action('settings',{mailDisplay:'reader'}));await choose(home,'notes');assert.equal(await body.inputValue(),draft);
 // Editor and home share the same setting, including a change made while an editor is active.
 await home.evaluate(()=>window.aiOffice.newHwp());
 const editor=await until(()=>app.context().pages().find(p=>p.url().includes('/hwp/renderer/index.html')||p.url().includes('hwp/index.html')),'HWP editor');await editor.locator('.hwp-app[data-phase="ready"]').waitFor({timeout:60000});
 await choose(editor,'notes');await until(()=>positioned(editor,'right'),'editor right');
 await editor.locator('.wp-expand').click();await expanded(editor,true);await assertBack(editor,false);await body.click();await escape(panel);await expanded(editor,false);assert.equal(await body.inputValue(),draft);
 await choose(editor,'ai');await editor.locator('.ai-panel-side-button').click();await until(()=>positioned(editor,'left'),'editor changes preference');
 await home.evaluate(async()=>{const list=await window.aiOfficeTabs.list();await window.aiOfficeTabs.activate(list.find(t=>t.kind==='home').id);});
 await until(()=>positioned(home,'left'),'home reflects editor setting');report.editorAndHomeSynced=true;
 await home.evaluate(()=>window.aiOffice.setAiPanelPrefs({side:'right'}));await until(()=>positioned(home,'right'),'right before restart');await choose(home,'notes');
 await require('./close-app.cjs')(app);app=null;await launch();await until(()=>positioned(home,'right'),'saved right on startup');await choose(home,'notes');await getPanel();
 assert.equal(await panel.locator('.note-body textarea').inputValue(),draft);assert.equal(await width(home),originalWidth);
 report.restartRestoresRight=true;report.commonWidthPreserved=true;report.noteDraftPreserved=true;report.pass=true;console.log(JSON.stringify(report));
})().catch(e=>{report.error=String(e);console.error(e);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(path.join(root,'home-panel-windows.json'),JSON.stringify(report,null,2));try{await require('./close-app.cjs')(app);}catch(e){console.error(e);process.exitCode=1;}process.exit(process.exitCode||0);});
