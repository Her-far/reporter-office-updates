const {_electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http');
const path=require('node:path');
const base=path.resolve(process.env.WORKPANEL_QA_DIR||'workpanel-qa');fs.mkdirSync(base+'/tooling',{recursive:true});
if(!process.env.ELECTRON_BINARY||!process.env.WORKPANEL_PAYLOAD)throw Error('Set ELECTRON_BINARY and WORKPANEL_PAYLOAD');
const harness=path.join(base,'harness');fs.mkdirSync(harness,{recursive:true});fs.writeFileSync(path.join(harness,'package.json'),JSON.stringify({name:'workpanel-test-harness',version:'1.0.4',main:'bootstrap.cjs'}));fs.copyFileSync(path.join(__dirname,'electron-bootstrap.cjs'),path.join(harness,'bootstrap.cjs'));
(async()=>{
 const app=await _electron.launch({executablePath:process.env.ELECTRON_BINARY,args:[...(process.platform==='linux'?['--no-sandbox','--ozone-platform=headless','--disable-gpu']:[]),harness],timeout:30000});
 const results=[];let server;
 const ok=(name,value)=>{assert(value,name);results.push({name,passed:true});console.log('PASS',name);};
 try {
  const root=await app.firstWindow();await root.waitForSelector('.wp-toolbar');
  for(const width of [1330,1024,1918]){
   await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setContentSize(width,1000),width);await root.waitForTimeout(150);
   const g=await root.evaluate(()=>{const h=document.querySelector('.home').getBoundingClientRect(),p=document.querySelector('#wp-home').getBoundingClientRect();return {right:h.right,panel:p.x,panelRight:p.right,width:innerWidth,homeWidth:h.width};});
   ok('Home split without overlap at '+width,g.right<=g.panel+1&&g.panelRight<=g.width+1&&g.homeWidth>300);
   ok('Home file filters fit available width at '+width,await root.locator('.filter-pills').first().evaluate(n=>n.getBoundingClientRect().right<=n.closest('.content').getBoundingClientRect().right));
  }
  await root.screenshot({path:base+'/tooling/home-split.png'});
  const full=await root.evaluate(()=>innerWidth);await root.getByRole('button',{name:'닫기',exact:true}).click();await root.waitForTimeout(150);ok('Closing panel restores full home width',await root.locator('.home').evaluate(n=>Math.round(n.getBoundingClientRect().width))===full);await root.locator('#wp-launch').click();
  await root.getByRole('button',{name:'확장 / 복원'}).click();await root.waitForTimeout(150);ok('Home expanded mode fits viewport',await root.locator('#wp-home').evaluate(n=>Math.round(n.getBoundingClientRect().width))===full);await root.getByRole('button',{name:'확장 / 복원'}).click();
  await root.getByText('AI 한글',{exact:true}).click();
  let editor;for(let i=0;i<50;i++){editor=app.context().pages().find(p=>p.url().includes('hwp/index.html'));if(editor&&await editor.locator('textarea').count())break;await root.waitForTimeout(200);}
  await editor.waitForSelector('.wp-toolbar');await editor.locator('[data-menu=ai]').click();const frame=editor.frames().find(f=>f.url().includes('/studio/'));
  await frame.waitForSelector('textarea',{state:'attached'});console.log('EDITABLE',await frame.locator('textarea').evaluateAll(ns=>ns.map(n=>({id:n.id,cls:n.className}))));
  const input=frame.locator('textarea').first();await input.focus();await input.pressSequentially('WorkPanel document preservation 123');
  await input.press('ControlOrMeta+A');await input.press('ControlOrMeta+C');await root.waitForTimeout(250);
  const before=await app.evaluate(({clipboard})=>clipboard.readText());ok('HWP actual text input',before.includes('WorkPanel document preservation 123'));
  await editor.locator('textarea').fill('AI unsent draft - must remain');
  await editor.locator('[data-menu=calendar]').click();
  let panel;for(let i=0;i<50;i++){panel=app.context().pages().find(p=>p.url().includes('work-panel/index.html'));if(panel)break;await root.waitForTimeout(100);}
  await panel.getByRole('heading',{name:'구글 캘린더 연결'}).waitFor();await panel.evaluate(()=>window.workPanel.action('settings',{width:400}));ok('Calendar connection screen',true);
  const docFrameUrl=frame.url();await editor.locator('[data-menu=mail]').click();await root.waitForTimeout(1600);
  const security=await app.evaluate(({webContents,session})=>{const w=webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://mail.worksmobile.com'));const p=w.getLastWebPreferences();return {node:p.nodeIntegration,isolation:p.contextIsolation,sandbox:p.sandbox,preload:p.preload,partition:w.session===session.fromPartition('persist:electimes-workpanel-test-mail'),throttle:w.getBackgroundThrottling()};});
  ok('Mail login and inbox controls visible',await panel.getByRole('button',{name:'네이버웍스 로그인',exact:true}).isVisible()&&await panel.getByRole('button',{name:'메일함',exact:true}).isVisible());
  ok('Remote mail sandbox and isolated session',!security.node&&security.isolation&&security.sandbox&&!security.preload&&security.partition&&security.throttle);
  await editor.locator('[data-menu=ai]').click();ok('AI draft retained',await editor.locator('textarea').inputValue()==='AI unsent draft - must remain');ok('HWP frame identity retained',frame.url()===docFrameUrl);
  await input.focus();await input.press('ControlOrMeta+C');await root.waitForTimeout(100);ok('HWP selection retained after panels',await app.evaluate(({clipboard})=>clipboard.readText())===before);
  await input.press('End');await input.pressSequentially(' END');await input.press('ControlOrMeta+A');await input.press('ControlOrMeta+C');await root.waitForTimeout(100);ok('Editing continues after network failure',(await app.evaluate(({clipboard})=>clipboard.readText())).includes(' END'));
  await editor.locator('.wp-resize').focus();await editor.locator('.wp-resize').press('ArrowLeft');await root.waitForTimeout(200);let w=await editor.locator('.wp-dock').evaluate(n=>n.getBoundingClientRect().width);ok('Panel resize changes width',w>=420);
  await editor.getByRole('button',{name:'확장 / 복원'}).click();await root.waitForTimeout(200);w=await editor.locator('.wp-dock').evaluate(n=>n.getBoundingClientRect().width);ok('Expanded panel fits viewport',w===await editor.evaluate(()=>innerWidth));await editor.getByRole('button',{name:'확장 / 복원'}).click();
  await editor.getByRole('button',{name:'닫기',exact:true}).click();await editor.locator('#wp-launch').waitFor();ok('Panel closes without editor removal',await frame.locator('textarea').count()>0);await editor.locator('#wp-launch').click();
  await editor.locator('[data-menu=mail]').click();await root.waitForTimeout(300);
  server=http.createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':'attachment; filename="WorkPanel-synthetic.txt"'});res.end('Synthetic attachment - original must remain.');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  await panel.evaluate(()=>window.workPanel.action('settings',{offerOpen:false}));
  await app.evaluate(({webContents},url)=>webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://mail.worksmobile.com')).downloadURL(url),'http://127.0.0.1:'+server.address().port+'/fixture');
  await panel.getByRole('button',{name:'다운로드 1개'}).waitFor();await panel.getByRole('button',{name:'다운로드 1개'}).click();await panel.getByText('완료',{exact:true}).waitFor();
  ok('Explicit download completes',await panel.getByText('WorkPanel-synthetic.txt',{exact:true}).count()===1);
  const visible=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].contentView.children.filter(v=>v.webContents?.getURL().startsWith('https://')).some(v=>v.getVisible()));ok('Mail hidden below local download dialog',!visible);
  const pagesBefore=app.context().pages().length;await panel.getByRole('button',{name:'열기',exact:true}).click();await root.waitForTimeout(2500);
  ok('Attachment opens a new editor',app.context().pages().length>pagesBefore);ok('Original article editor survives',!editor.isClosed());
  const s=await panel.evaluate(()=>window.workPanel.action('state'));
  const now=new Date(Date.now()+9*3600000).toISOString().slice(0,10);s.state.menu='calendar';s.state.calendar={configured:true,connected:true,permission:'read',lastSync:new Date().toISOString()};s.state.calendars=[{id:'fixture',summary:'테스트 일정',accessRole:'reader',primary:true}];s.state.prefs.calendarIds=['fixture'];s.state.events=[{id:'fixture-event',calendarId:'fixture',calendarName:'테스트 일정',title:'취재 일정 예시 · 테스트 데이터',location:'회의실',description:'UI 검증용 가상 일정',start:now+'T09:00:00+09:00',end:now+'T10:00:00+09:00',allDay:false,source:'google',writable:false}];
  await app.evaluate(({webContents},s)=>webContents.getAllWebContents().find(w=>w.getURL().includes('work-panel/index.html')).send('wp:state',s),s.state);
  await panel.getByText('취재 일정 예시 · 테스트 데이터',{exact:true}).last().waitFor();ok('Synthetic Calendar month and event list render',await panel.locator('.day').count()===42);await panel.screenshot({path:base+'/tooling/calendar-fixture.png'});
  await panel.locator('.event').click();ok('Calendar details render as text',await panel.locator('dialog').innerText().then(t=>t.includes('UI 검증용 가상 일정')));
  fs.writeFileSync(base+'/tooling/ui-test-results.json',JSON.stringify({environment:'Linux Electron headless; test-only single-instance override; synthetic HTTP attachment/calendar fixtures',results,security,liveOAuth:'unverified',liveMail:'unverified',nativeMailLoginWindow:'unverified: Linux headless native-window creation crashes; needs Windows account test'},null,2));
 } finally {if(server)server.close();await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
