'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{_electron}=require('playwright');
const root=__dirname,report={version:'1.0.12-aiweb.1',checks:[],liveAccountLoginVerified:false};let app,home;
const timeout=setTimeout(()=>{console.error('AI panel verification exceeded 6 minutes');process.exit(1);},360000);timeout.unref();
const ok=(name,value=true)=>{assert(value,name);report.checks.push(name);console.log('PASS',name);};
async function until(fn,label,ms=45000){const end=Date.now()+ms;while(Date.now()<end){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+label);}
const hosts={chatgpt:'chatgpt.com',claude:'claude.ai',gemini:'gemini.google.com'};
const fixture=id=>`<!doctype html><html lang="ko"><meta charset="utf-8"><title>${id} · synthetic test</title><style>body{font:16px system-ui;padding:20px;color:#203559}textarea{box-sizing:border-box;width:100%;height:130px;padding:12px;border:1px solid #bbb;border-radius:12px}a{display:block;margin:20px 0}</style><h2>${id} 웹 화면 테스트</h2><p>자동 검증용 가상 화면입니다.</p><textarea id="prompt" placeholder="질문을 입력하세요"></textarea><a id="next" href="/fixture-next">대화 예시</a><a id="google" href="https://accounts.google.com/signin">Google 로그인</a><a id="unsafe" href="file:///C:/Windows/win.ini">차단 검증</a><script>localStorage.setItem('fixture-provider','${id}');document.cookie='fixture_session=${id};path=/;SameSite=Lax;Secure';</script></html>`;
async function launch(){
 app=await _electron.launch({executablePath:path.join(root,'stage/ElectimesOffice-AIWeb-Test.exe'),env:{...process.env,GENOFFICE_NO_SPARE_VIEW:'1',GENOFFICE_LANG:'ko'},timeout:60000});
 await app.context().route(/^https:\/\/(chatgpt\.com|claude\.ai|gemini\.google\.com)\//,route=>route.fulfill({contentType:'text/html; charset=utf-8',body:fixture(Object.keys(hosts).find(id=>new URL(route.request().url()).hostname===hosts[id]))}));
 home=await app.firstWindow();await home.locator('.wp-toolbar').waitFor({timeout:45000});
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1370,950));
}
async function choose(page,menu){await page.locator('[data-menu='+menu+']').click();await until(()=>page.locator('.wp-dock').getAttribute('data-wp-menu').then(x=>x===menu),'menu '+menu);}
async function mode(page,value){await page.locator('[data-ai-mode='+value+']').click();await until(()=>page.locator('.wp-dock').getAttribute('data-wp-ai-mode').then(x=>x===value),'mode '+value);}
async function remote(id){const p=await until(()=>app.context().pages().find(p=>p.url().startsWith('https://'+hosts[id]+'/')),'remote '+id);return p;}
async function wcState(){return app.evaluate(({BrowserWindow,webContents,session,app})=>({profile:app.getPath('userData'),name:app.getName(),title:BrowserWindow.getAllWindows()[0].getTitle(),views:BrowserWindow.getAllWindows()[0].contentView.children.filter(v=>v.webContents?.getURL().startsWith('https://')).map(v=>{const w=v.webContents,p=w.getLastWebPreferences();return {id:w.id,url:w.getURL(),visible:v.getVisible(),bounds:v.getBounds(),node:p.nodeIntegration,isolation:p.contextIsolation,sandbox:p.sandbox,preload:p.preload,webSecurity:p.webSecurity};}),count:webContents.getAllWebContents().length}));}
async function expanded(page,value){await until(()=>page.locator('.wp-dock').evaluate((n,value)=>n.classList.contains('wp-expanded')===value,value),'expanded='+value);}
async function nativeEscape(page){await app.evaluate(({webContents},url)=>{const w=webContents.getAllWebContents().find(w=>w.getURL()===url);w.focus();w.sendInputEvent({type:'keyDown',keyCode:'Escape'});w.sendInputEvent({type:'keyUp',keyCode:'Escape'});},page.url());}
async function activateHome(){await home.evaluate(async()=>{const tabs=await window.aiOfficeTabs.list();await window.aiOfficeTabs.activate(tabs.find(t=>t.kind==='home').id);});}
async function snapshot(name){await home.screenshot({path:path.join(root,name+'.png')});}
(async()=>{
 await launch();await mode(home,'web');await home.locator('[data-ai-command=reload]').click();
 const chat=await remote('chatgpt');await chat.locator('#prompt').waitFor();
 let state=await wcState();ok('Independent test name, window title and user profile',state.profile.endsWith('ElectimesOffice-AIWeb-Test')&&state.name==='Electimes Office AI Web Test'&&state.title.includes('AI 웹 테스트'));
 ok('Visible AI view uses a separate sandbox without Office preload',state.views.length===1&&state.views[0].visible&&!state.views[0].node&&state.views[0].isolation&&state.views[0].sandbox&&!state.views[0].preload&&state.views[0].webSecurity);
 ok('Remote page cannot access Office APIs or Node',await chat.evaluate(()=>typeof require==='undefined'&&!window.aiOffice&&!window.workPanel&&!window.electron));
 const bounds=await home.locator('.wp-slot').boundingBox();ok('Native web view fits below all AI controls',Math.abs(state.views[0].bounds.y-bounds.y)<3&&state.views[0].bounds.height>200);
 await chat.locator('#prompt').fill('유지할 질문 초안');await mode(home,'document');ok('Document helper switch hides web view',(await wcState()).views.every(v=>!v.visible));
 await mode(home,'web');ok('Switching back preserves draft',await chat.locator('#prompt').inputValue()==='유지할 질문 초안');
 await home.locator('.wp-ai-provider').selectOption('claude');const claude=await remote('claude');await claude.locator('#prompt').waitFor();await claude.locator('#prompt').fill('Claude 독립 초안');
 await home.locator('.wp-ai-provider').selectOption('gemini');const gemini=await remote('gemini');await gemini.locator('#prompt').waitFor();
 await home.locator('.wp-ai-provider').selectOption('chatgpt');ok('Provider switch preserves each draft',await chat.locator('#prompt').inputValue()==='유지할 질문 초안'&&await claude.locator('#prompt').inputValue()==='Claude 독립 초안');
 ok('Exactly one remote view is visible',(await wcState()).views.filter(v=>v.visible).length===1);
 const partitions=await app.evaluate(async({session})=>{const out={};for(const id of ['chatgpt','claude','gemini'])out[id]=(await session.fromPartition('persist:electimes-ai-web-test-'+id).cookies.get({})).filter(c=>c.name==='fixture_session').map(c=>c.value);return out;});
 ok('Provider cookies are isolated',Object.entries(partitions).every(([id,values])=>values.length===1&&values[0]===id));
 await chat.locator('#next').click();await chat.waitForURL('**/fixture-next');await home.locator('[data-ai-command=back]').click();await chat.waitForURL('https://chatgpt.com/');
 await home.locator('[data-ai-command=forward]').click();await chat.waitForURL('**/fixture-next');ok('Provider navigation and history work');
 await chat.locator('#google').click();await until(()=>home.locator('.wp-ai-status').innerText().then(x=>x.includes('Google 로그인')),'Google fallback notice');ok('Google embedded login is blocked with an external browser fallback',chat.url().startsWith('https://chatgpt.com/'));
 await home.locator('[data-ai-command=new]').click();await chat.waitForURL('https://chatgpt.com/');
 await chat.locator('#unsafe').click();ok('Local-file navigation cannot leave provider',chat.url().startsWith('https://chatgpt.com/'));
 await chat.locator('#prompt').fill('');await chat.locator('#prompt').click();await app.evaluate(({clipboard})=>clipboard.writeText('사용자가 복사한 질문'));
 await home.locator('[data-ai-command=paste-ai]').click();await until(()=>chat.locator('#prompt').inputValue().then(x=>x==='사용자가 복사한 질문'),'paste into AI');ok('Explicit paste button sends only user clipboard text');
 const originalWidth=await home.locator('.wp-dock').evaluate(n=>n.getBoundingClientRect().width);
 for(const side of ['left','right']){
  await home.evaluate(side=>window.aiOffice.setAiPanelPrefs({side}),side);
  await until(()=>home.evaluate(side=>{const r=document.querySelector('.wp-dock').getBoundingClientRect();return document.documentElement.dataset.aiPanelSide===side&&(side==='left'?r.left<3:Math.abs(r.right-innerWidth)<3);},side),'home side '+side);
  await home.locator('.wp-expand').click();await expanded(home,true);await home.locator('.wp-restore').click();await expanded(home,false);
  await home.locator('.wp-expand').click();await expanded(home,true);await chat.locator('#prompt').click();await nativeEscape(chat);await expanded(home,false);
  ok('Home '+side+': return button and native Escape restore width',await home.locator('.wp-dock').evaluate(n=>n.getBoundingClientRect().width)===originalWidth);
 }
 await snapshot('ai-web-home');
 for(const menu of ['notes','calendar','ai']){await choose(home,menu);ok('Common width after '+menu,await home.locator('.wp-dock').evaluate(n=>n.getBoundingClientRect().width)===originalWidth);}
 ok('Remote draft survives other work panels',await chat.locator('#prompt').inputValue()==='사용자가 복사한 질문');
 await home.getByRole('button',{name:'닫기',exact:true}).click();await home.locator('#wp-launch').waitFor();await until(async()=>(await wcState()).views.every(v=>!v.visible),'hidden AI');await home.locator('#wp-launch').click();ok('Closing and reopening preserves remote draft',await chat.locator('#prompt').inputValue()==='사용자가 복사한 질문');
 await home.evaluate(()=>window.aiOffice.newHwp());
 const editor=await until(()=>app.context().pages().find(p=>p.url().includes('/hwp/renderer/index.html')||p.url().includes('hwp/index.html')),'HWP');await editor.locator('.hwp-app[data-phase="ready"]').waitFor({timeout:60000});await choose(editor,'ai');await mode(editor,'web');
 ok('Same AI web session moves from home to editor',await chat.locator('#prompt').inputValue()==='사용자가 복사한 질문');
 const frame=await until(()=>editor.frames().find(f=>f.url().includes('/studio/')),'HWP frame');const input=frame.locator('textarea').first();await input.waitFor({state:'attached'});
 await input.focus();await input.pressSequentially('Document fixture text');await input.press('ControlOrMeta+A');await input.press('ControlOrMeta+C');
 await until(()=>app.evaluate(({clipboard})=>clipboard.readText()).then(x=>x.includes('Document fixture text')),'HWP typed content');
 ok('Typing document does not send its contents into AI',await chat.locator('#prompt').inputValue()==='사용자가 복사한 질문');
 await input.press('End');await app.evaluate(({clipboard})=>clipboard.writeText(' USER APPROVED ANSWER'));await editor.locator('[data-ai-command=paste-document]').click();
 await input.focus();await input.press('ControlOrMeta+A');await input.press('ControlOrMeta+C');await until(()=>app.evaluate(({clipboard})=>clipboard.readText()).then(x=>x.includes('USER APPROVED ANSWER')),'paste answer into HWP');ok('Explicit paste back into HWP works');
 await mode(editor,'document');const draft=editor.locator('textarea');await draft.fill('기존 문서 도우미의 미전송 초안');await mode(editor,'web');await mode(editor,'document');ok('Existing document AI draft remains intact',await draft.inputValue()==='기존 문서 도우미의 미전송 초안');await mode(editor,'web');
 await editor.locator('.wp-expand').click();await expanded(editor,true);await nativeEscape(chat);await expanded(editor,false);ok('Editor web expansion restores with native Escape');
 // Save only this synthetic fixture so ordinary Quit can run without a save prompt.
 const blankFile=path.join(root,'synthetic-test.hwpx');
 await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},blankFile);
 await editor.evaluate(()=>window.hwpApi.requestFileCommand('save'));
 await until(()=>fs.existsSync(blankFile),'save synthetic document');
 await activateHome();await home.locator('.wp-ai-provider').selectOption('claude');
 report.restartCookieBefore=(await app.evaluate(async({session})=>(await session.fromPartition('persist:electimes-ai-web-test-claude').cookies.get({name:'fixture_session'})).map(c=>c.value)));
 await require('../electimes-110/close-app.cjs')(app);app=null;await launch();
 await until(()=>home.locator('.wp-ai-provider').inputValue().then(x=>x==='claude'),'saved provider');
 const restored=await remote('claude');await home.locator('[data-ai-command=reload]').click();await restored.locator('#prompt').waitFor();
 const cookies=await app.evaluate(async({session})=>(await session.fromPartition('persist:electimes-ai-web-test-claude').cookies.get({name:'fixture_session'})).map(c=>c.value));ok('Provider preference and synthetic login cookie survive restart',cookies.includes('claude'));
 // Live unauthenticated probes are informational, never treated as real-account login validation.
 await app.context().unrouteAll();report.livePages=[];
 for(const id of ['chatgpt','claude','gemini']){
  await home.locator('.wp-ai-provider').selectOption(id);const p=await remote(id);await home.locator('[data-ai-command=reload]').click();
  await p.waitForLoadState('domcontentloaded',{timeout:18000}).catch(()=>{});await new Promise(r=>setTimeout(r,1500));
  report.livePages.push({provider:id,url:new URL(p.url()).origin,title:await p.title().catch(()=>''),notice:await home.locator('.wp-ai-status').innerText()});
 }
 await home.locator('.wp-ai-provider').selectOption('chatgpt');await snapshot('ai-web-live');report.pass=true;console.log(JSON.stringify(report));
})().catch(async e=>{report.error=String(e);console.error(e);process.exitCode=1;await snapshot('ai-web-failure').catch(()=>{});}).finally(async()=>{fs.writeFileSync(path.join(root,'ui-windows.json'),JSON.stringify(report,null,2));try{await require('../electimes-110/close-app.cjs')(app);}catch(e){console.error(e);process.exitCode=1;}process.exit(process.exitCode||0);});
