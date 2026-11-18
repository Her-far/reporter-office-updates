const {app,BrowserWindow,WebContentsView,ipcMain,session,dialog,shell,safeStorage,nativeTheme,net,Menu}=require('electron');
const {spawn}=require('node:child_process');
const aiWeb=require('./ai-web.cjs');
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {DEFAULTS,settingsOf,mailUrl,httpsUrl,safeFilename,fileKind,kstDay}=require('./policy.cjs');
const {Vault}=require('./vault.cjs'),{CalendarService}=require('./calendar.cjs'),{clientOf}=require('./oauth.cjs');
const {reserveDownload,saveAttachment}=require('./downloads.cjs');
let installed=null;
// Main-process membership only. Remote pages cannot mark themselves as trusted mail views.
// The shell's global navigation guard consults this set; web AI views join it with their own, stricter policy.
const mailContents=new WeakSet();
const aiContents=new WeakSet();
function register(deps){
  if(installed)return installed;
  const dir=()=>path.join(app.getPath('userData'),'work-panel'),config=()=>path.join(dir(),'settings.json');
  const notes=new (require('./notes.cjs').NotesStore)(path.join(dir(),'notes.json'));let notesError='',notesQuitReady=false;
  let prefs={...DEFAULTS},owner=null,rect=null,panel=null,mail=null,mailSession=null,panelMode='ai',mailRect=null,mailError='',mailReady=false,mailModal=false,expanded=false,active=false,timer=null,closing=false;
  const mailDiagnostics=require('./mail-diagnostics.cjs').createDiagnostics();
  const popups=new Set(),downloads=new Map(),hostIds=new Set(),escapeHosts=new WeakSet();let revision=0,loginWindow=null,hostBlocked=false;
  // Web AI: one isolated view and persistent session per service, created on first use.
  const aiViews=new Map(),aiSessions=new Map(),aiStatus=new Map(),aiLogins=new Map();let panelBounds=null;
  let range={start:new Date(Date.now()-40*86400000).toISOString(),end:new Date(Date.now()+100*86400000).toISOString()};
  const vault=new Vault(path.join(app.getPath('userData'),'work-panel','secure'),safeStorage);
  let deploymentClient=require('./google-deployment.cjs');
  try{deploymentClient=clientOf(JSON.parse(fs.readFileSync(path.join(__dirname,'google-client.json'),'utf8')));}catch(e){if(e.code!=='ENOENT')console.warn('WorkPanel deployment OAuth configuration invalid');}
  const reader=new (require('./mail-reader.cjs').MailReader)({vault});
  const calendar=new CalendarService({vault,deploymentClient,fetcher:net.fetch.bind(net),openExternal:u=>shell.openExternal(u),onChange:()=>emit()});
  const ready=app.whenReady().then(async()=>{await require('./migrate.cjs').importTestPanel(app.getPath('appData'),app.getPath('userData')).catch(()=>{});try{const raw=JSON.parse(await fsp.readFile(config(),'utf8'));prefs=settingsOf(raw);if(raw.panelWidthVersion!==1&&(prefs.restoreMenu?prefs.menu:prefs.defaultMenu)==='mail'&&Number.isFinite(raw.mailWidth))prefs=settingsOf({width:raw.mailWidth},prefs);if(typeof raw.downloadFolder==='string'&&path.isAbsolute(raw.downloadFolder))prefs.downloadFolder=raw.downloadFolder;}catch{}
    await reader.init();
    try{await notes.init();}catch{notesError='notes-read';}
    panelMode=prefs.restoreMenu?prefs.menu:prefs.defaultMenu;
    try{await require('./local-google-client.cjs').importLocalGoogleClient({vault,resourcesPath:process.resourcesPath,localAppData:process.env.LOCALAPPDATA});await calendar.init();}catch(e){calendar.syncError=e.message;}
    timer=setInterval(()=>{if(active&&panelMode==='calendar'&&prefs.autoSync&&calendar.token&&Date.now()-Date.parse(calendar.lastSync||'1970')>=prefs.syncMinutes*60000)void sync().catch(()=>{});},30000);timer.unref();
  });
  let saving=Promise.resolve();
  function persist(){const json=JSON.stringify(prefs,null,2);saving=saving.catch(()=>{}).then(async()=>{await fsp.mkdir(dir(),{recursive:true});await fsp.writeFile(config()+'.tmp',json,{mode:0o600});await fsp.rename(config()+'.tmp',config());});return saving;}
  function hostState(){return {prefs,menu:panelMode,expanded,version:'1.0.13'};}
  function aiState(){const id=prefs.aiWebService,st=aiStatus.get(id)||{},v=aiViews.get(id);return {enabled:prefs.aiWebEnabled,service:id,services:aiWeb.SERVICE_IDS.map(k=>({id:k,label:aiWeb.SERVICES[k].label})),error:id==='chatgpt'?managed.state().error:st.error||'',ready:!!st.ready,canGoBack:!!(v&&!v.webContents.isDestroyed()&&v.webContents.navigationHistory.canGoBack())};}
  function downloadRoot(){return prefs.downloadFolder||app.getPath('downloads');}
  function state(){return {...hostState(),downloadFolder:downloadRoot(),notes:notes.snapshot(),notesError,notesWarning:notes.warning,calendar:calendar.status(),calendars:calendar.calendars,events:calendar.events,range,reader:reader.status(),mail:{enabled:prefs.mailEnabled,error:mailError,ready:mailReady},aiWeb:aiState(),downloads:[...downloads.values()].slice(-50).map(({id,name,status,bytes})=>({id,name,status,bytes})),dark:nativeTheme.shouldUseDarkColors};}
  function emit(){revision++;if(panel&&!panel.webContents.isDestroyed())panel.webContents.send('wp:state',state());}
  function hosts(){for(const id of hostIds){const wc=require('electron').webContents.fromId(id);if(wc&&!wc.isDestroyed())wc.send('wp:host-state',hostState());else hostIds.delete(id);}}
  function setExpanded(value){expanded=value===true;hosts();emit();layout();}
  function watchEscape(wc){if(escapeHosts.has(wc))return;escapeHosts.add(wc);wc.on('before-input-event',(event,input)=>{
    if(!expanded||hostBlocked||mailModal||input.type!=='keyDown'||input.key!=='Escape'||input.isComposing)return;
    const panelFocused=wc===panel?.webContents||wc===mail?.webContents||aiContents.has(wc);
    if(panelFocused?!active:!activeHost(wc))return;
    event.preventDefault();setExpanded(false);
  });}
  function activeHost(wc){if(!wc||wc.isDestroyed()||!deps.isHost(wc))return false;const win=deps.window();if(!win||win.isDestroyed())return false;const m=deps.manager();if(!m)return wc===win.webContents;const current=m.list().find(t=>t.active);return wc===win.webContents?current?.kind==='home':m.tabIdForWebContents(wc.id)===current?.id;}
  function hostOrigin(){const win=deps.window();if(!win||!owner||!activeHost(owner)||win.isMinimized())return null;if(owner===win.webContents)return {x:0,y:0,width:win.getContentBounds().width,height:win.getContentBounds().height};const child=win.contentView.children.find(v=>v.webContents===owner);return child&&child.getVisible()?child.getBounds():null;}
  const managed = require('./desktop-chat.cjs').create({
    window: deps.window, changed: emit, prepareBrowser: async () => {}, isDocument: () => false
  });
  let chatVisible = false;
  function hideChat() {
    if (chatVisible) managed.hide();
    chatVisible = false;
  }
  function showChat(bounds) {
    const first = !chatVisible;
    chatVisible = true;
    managed.show('chatgpt', bounds);
    if (first) void managed.command('open');
  }
  function hide(){hideChat();active=false;panel?.setVisible(false);mail?.setVisible(false);if(mail&&!mail.webContents.isDestroyed())mail.webContents.setAudioMuted(true);hideAi();}
  function hideAi(except){for(const [id,v] of aiViews){if(v===except)continue;v.setVisible(false);if(!v.webContents.isDestroyed())v.webContents.setAudioMuted(true);}}
  function layout(){if(closing)return;const origin=hostOrigin();if(!origin||!rect||panelMode==='ai'){hide();return;}
    const zoom=owner.getZoomFactor();const r={x:Math.round(origin.x+rect.x*zoom),y:Math.round(origin.y+rect.y*zoom),width:Math.round(rect.width*zoom),height:Math.round(rect.height*zoom)};
    const win=deps.window(),b=win.getContentBounds();r.width=Math.min(r.width,b.width-r.x);r.height=Math.min(r.height,b.height-r.y);
    if(r.x<0||r.y<0||r.width<160||r.height<80){hide();return;}ensurePanel();active=true;panelBounds=r;
    win.contentView.addChildView(panel);panel.setBounds(r);panel.setVisible(true);
    if(panelMode==='mail'&&prefs.mailDisplay==='web'&&prefs.mailEnabled&&mailRect&&!mailModal){ensureMail();const z=panel.webContents.getZoomFactor();const m={x:Math.round(r.x+mailRect.x*z),y:Math.round(r.y+mailRect.y*z),width:Math.min(Math.round(mailRect.width*z),r.width),height:Math.min(Math.round(mailRect.height*z),r.height-Math.round(mailRect.y*z))};if(m.width>50&&m.height>50){win.contentView.addChildView(mail);mail.setBounds(m);mail.setVisible(true);mail.webContents.setAudioMuted(false);}}
    else {mail?.setVisible(false);mail?.webContents.setAudioMuted(true);}
    // mailRect is the panel's remote-page slot; the web AI page uses the same slot.
    let shown=null, showingChat=false;
    if(panelMode==='aiweb'&&prefs.aiWebEnabled&&mailRect&&!mailModal){const z=panel.webContents.getZoomFactor();const m={x:Math.round(r.x+mailRect.x*z),y:Math.round(r.y+mailRect.y*z),width:Math.min(Math.round(mailRect.width*z),r.width),height:Math.min(Math.round(mailRect.height*z),r.height-Math.round(mailRect.y*z))};if(m.width>50&&m.height>50 && prefs.aiWebService==='chatgpt'){showingChat=true;showChat(m);}else if(m.width>50&&m.height>50){const v=ensureAi(prefs.aiWebService);win.contentView.addChildView(v);v.setBounds(m);v.setVisible(true);v.webContents.setAudioMuted(false);shown=v;}}
    if(!showingChat) hideChat();
    hideAi(shown);
  }
  function aiSession(id){let s=aiSessions.get(id);if(s)return s;s=session.fromPartition(aiWeb.partitionOf(id));
    s.setUserAgent(aiWeb.browserUserAgent(s.getUserAgent(),process.versions.chrome),'ko-KR,ko,en-US,en');
    s.setPermissionRequestHandler((_wc,permission,cb)=>cb(aiWeb.permissionAllowed(permission)));s.setPermissionCheckHandler((_wc,permission)=>aiWeb.permissionAllowed(permission));
    s.on('will-download',download);aiSessions.set(id,s);return s;}
  function aiStatusOf(id){let st=aiStatus.get(id);if(!st){st={error:'',ready:false};aiStatus.set(id,st);}return st;}
  function openOutside(url){const u=httpsUrl(url);if(u)void shell.openExternal(u.href).catch(()=>{});}
  function popupOptions(ses){return {title:'로그인',width:520,height:720,autoHideMenuBar:true,webPreferences:{session:ses,nodeIntegration:false,nodeIntegrationInWorker:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,backgroundThrottling:true,preload:undefined}};}
  // Service and sign-in pages stay in the isolated session; every other link opens in the default browser.
  // In the panel view itself, account sign-in pages open in a separate sign-in window instead.
  function secureAi(wc,id,inPanel){mailContents.add(wc);aiContents.add(wc);wc.setUserAgent(wc.session.getUserAgent());
    const toLogin=(e,url)=>{if(!inPanel||!aiWeb.isSignIn(url))return false;e.preventDefault();openAiLogin(id,url);return true;};
    wc.setWindowOpenHandler(({url})=>{if(url==='about:blank'||aiWeb.classify(url))return {action:'allow',overrideBrowserWindowOptions:popupOptions(wc.session)};openOutside(url);return {action:'deny'};});
    wc.on('will-navigate',(e,url)=>{if(toLogin(e,url)||aiWeb.inPanel(url))return;e.preventDefault();openOutside(url);const blank=!wc.getURL()||wc.getURL()==='about:blank',win=BrowserWindow.fromWebContents(wc);if(blank&&win&&popups.has(win))win.close();});
    wc.on('will-redirect',(e,url)=>{if(toLogin(e,url))return;if(!aiWeb.redirectAllowed(url))e.preventDefault();});
    wc.on('will-attach-webview',e=>e.preventDefault());
    wc.on('did-create-window',win=>{popups.add(win);secureAi(win.webContents,id,false);win.on('closed',()=>popups.delete(win));});
  }
  // A full-size official sign-in page that shares only this service's session. It closes
  // itself once the page is back on the service, and the panel then shows the signed-in page.
  function openAiLogin(id,url){const service=aiWeb.SERVICES[id];let win=aiLogins.get(id);
    if(win&&!win.isDestroyed()){win.show();win.focus();if(url)win.loadURL(url).catch(()=>{});return;}
    win=new BrowserWindow({parent:deps.window(),title:service.label+' 로그인',width:1000,height:760,minWidth:520,minHeight:600,autoHideMenuBar:true,webPreferences:{session:aiSession(id),nodeIntegration:false,nodeIntegrationInWorker:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,backgroundThrottling:true}});
    aiLogins.set(id,win);popups.add(win);secureAi(win.webContents,id,false);win.on('page-title-updated',e=>e.preventDefault());let landed=null;
    const done=(_e,u)=>{if(!landed&&aiWeb.signedIn(id,u)){landed=u;win.close();}};
    win.webContents.on('did-navigate',done);win.webContents.on('did-navigate-in-page',done);
    win.on('closed',()=>{popups.delete(win);if(aiLogins.get(id)===win)aiLogins.delete(id);if(closing)return;const v=aiViews.get(id);if(v&&!v.webContents.isDestroyed())v.webContents.loadURL(landed||service.home).catch(()=>{});});
    win.loadURL(url||service.login).catch(()=>{});
  }
  function ensureAi(id){let v=aiViews.get(id);if(v&&!v.webContents.isDestroyed())return v;
    v=new WebContentsView({webPreferences:{session:aiSession(id),nodeIntegration:false,nodeIntegrationInWorker:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,backgroundThrottling:true,spellcheck:false}});
    aiViews.set(id,v);const wc=v.webContents,st=aiStatusOf(id);watchEscape(wc);secureAi(wc,id,true);wc.setZoomFactor(prefs.aiWebZoom);
    wc.on('did-finish-load',()=>wc.setZoomFactor(prefs.aiWebZoom));
    wc.on('did-start-loading',()=>{st.error='';st.ready=false;emit();});
    wc.on('did-stop-loading',()=>{st.ready=!st.error;emit();});
    wc.on('did-navigate',()=>emit());wc.on('did-navigate-in-page',()=>emit());
    wc.on('did-fail-load',(_e,code,_text,_url,main)=>{if(main&&code!==-3){st.error='ai-network';emit();}});
    wc.on('render-process-gone',()=>{if(aiViews.get(id)===v)aiViews.delete(id);st.error='ai-crashed';st.ready=false;emit();});
    wc.loadURL(aiWeb.SERVICES[id].home).catch(()=>{});return v;}
  // The user's own Edge (or Chrome) in a separate app window: their existing profile and sign-in, no embedding.
  async function openAiBrowser(id){const url=aiWeb.SERVICES[id].home;
    if(process.platform==='win32'){const exe=aiWeb.browserCandidates().find(f=>fs.existsSync(f));
      if(exe){const win=deps.window();let bounds=null;if(win&&!win.isDestroyed()&&panelBounds){const c=win.getContentBounds();bounds={x:c.x+panelBounds.x,y:c.y+panelBounds.y,width:panelBounds.width,height:panelBounds.height};}
        const child=spawn(exe,aiWeb.appWindowArgs(url,bounds),{detached:true,stdio:'ignore'});child.on('error',()=>openOutside(url));child.unref();return;}}
    await external(url);}
  async function resetAi(id){const label=aiWeb.SERVICES[id].label;
    const r=await dialog.showMessageBox(deps.window(),{type:'question',buttons:['취소','로그아웃'],defaultId:0,cancelId:0,message:label+' 로그인을 오피스에서 지울까요?',detail:'대화 기록은 '+label+' 계정에 그대로 남습니다. 다른 AI 서비스와 웹 브라우저의 로그인은 바뀌지 않습니다.'});
    if(r.response!==1)return false;const v=aiViews.get(id);aiViews.delete(id);
    for(const w of [...popups])if(!w.isDestroyed()&&w.webContents.session===aiSessions.get(id))w.close();
    if(v){deps.window()?.contentView.removeChildView(v);if(!v.webContents.isDestroyed())v.webContents.close();}
    const s=aiSession(id);await s.clearStorageData();await s.clearCache();await s.closeAllConnections();aiStatus.delete(id);layout();return true;}
  function ensurePanel(){if(panel&&!panel.webContents.isDestroyed())return;panel=new WebContentsView({webPreferences:{preload:path.join(__dirname,'panel-preload.cjs'),partition:'workpanel-trusted-ui',nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,backgroundThrottling:true,spellcheck:false}});watchEscape(panel.webContents);panel.webContents.setWindowOpenHandler(()=>({action:'deny'}));panel.webContents.on('will-navigate',e=>e.preventDefault());panel.webContents.on('did-finish-load',emit);panel.webContents.on('render-process-gone',()=>{mail?.setVisible(false);panel=null;});panel.webContents.loadFile(path.join(__dirname,'index.html')).catch(()=>{});}
  async function external(url){const u=httpsUrl(url);if(!u)throw Error('invalid-url');await shell.openExternal(u.href);}
  function secureRemote(wc){mailContents.add(wc);wc.setWindowOpenHandler(({url})=>{
      if(url==='about:blank'||mailUrl(url))return {action:'allow',overrideBrowserWindowOptions:{title:'NAVER WORKS',width:1000,height:760,autoHideMenuBar:true,webPreferences:{session:mailSession,nodeIntegration:false,nodeIntegrationInWorker:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,backgroundThrottling:true,preload:undefined}}};
      mailDiagnostics.record('popup-blocked',url);void confirmExternal(url,wc).catch(()=>{});return {action:'deny'};
    });
    const navigate=(e,url)=>{if(url==='about:blank'||mailUrl(url))return;e.preventDefault();mailDiagnostics.record('navigation-blocked',url);void confirmExternal(url,wc).catch(()=>{});};
    wc.on('did-navigate',(_e,url)=>mailDiagnostics.record('navigated',url));
    wc.on('did-fail-load',(_e,code,_text,url,main)=>{if(main&&code!==-3){mailDiagnostics.record('load-failed',url,code);mailError='mail-network';emit();}});
    wc.on('will-navigate',navigate);wc.on('will-redirect',navigate);wc.on('will-attach-webview',e=>e.preventDefault());
    wc.on('did-create-window',win=>{popups.add(win);secureRemote(win.webContents);win.on('closed',()=>popups.delete(win));});
  }
  let confirming=false;
  async function confirmExternal(url,wc){const u=httpsUrl(url);if(!u||confirming)return;confirming=true;try{
    const parent=(wc&&!wc.isDestroyed()?BrowserWindow.fromWebContents(wc):null)||deps.window();
    parent.show();parent.focus();
    const ans=await dialog.showMessageBox(parent,{type:'question',buttons:['취소','브라우저에서 열기'],defaultId:0,cancelId:0,title:'외부 링크',message:u.hostname,detail:'외부 사이트를 기본 브라우저에서 열까요? 로그인 중이라면 외부 브라우저의 로그인은 내장 메일과 별도로 유지됩니다.'});if(ans.response===1)await external(u.href);
  }finally{confirming=false;}}
  async function showMailDiagnostics(parent=deps.window()){
    await dialog.showMessageBox(parent,{title:'메일 연결 진단',message:'최근 메일 연결 기록',detail:'주소의 도메인과 오류 코드만 표시합니다. 비밀번호·메일 본문·쿠키는 수집하지 않습니다. 로그인 성공 여부를 판정하는 기록은 아닙니다.\n\n'+mailDiagnostics.text(),buttons:['닫기']});
  }
  function ensureMail(){if(mail&&!mail.webContents.isDestroyed())return;
    if(!mailSession){mailSession=session.fromPartition('persist:electimes-workpanel-mail');mailSession.setPermissionRequestHandler((_wc,_p,cb)=>cb(false));mailSession.setPermissionCheckHandler(()=>false);mailSession.on('will-download',download);mailSession.webRequest.onErrorOccurred(d=>mailDiagnostics.record('request-failed',d.url,d.error));mailSession.webRequest.onCompleted(d=>{if(d.statusCode>=400)mailDiagnostics.record('http-error',d.url,d.statusCode);});}
    mail=new WebContentsView({webPreferences:{session:mailSession,nodeIntegration:false,nodeIntegrationInWorker:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,backgroundThrottling:true}});
    watchEscape(mail.webContents);
    secureRemote(mail.webContents);mail.webContents.setZoomFactor(prefs.mailZoom);mail.webContents.on('did-finish-load',()=>mail.webContents.setZoomFactor(prefs.mailZoom));mail.webContents.on('did-start-loading',()=>{mailError='';mailReady=false;emit();});mail.webContents.on('did-stop-loading',()=>{mailReady=!mailError;emit();});mail.webContents.on('did-fail-load',(_e,code,_text,_url,main)=>{if(main&&code!==-3){mailError='mail-network';emit();}});mail.webContents.on('render-process-gone',()=>{mailError='mail-crashed';mail=null;emit();});mail.webContents.loadURL(prefs.mailUrl).catch(()=>{});
  }
  function mailLoginUrl(){const u=new URL('https://auth.worksmobile.com/d/login/electimes.com');u.searchParams.set('accessUrl',prefs.mailUrl);return u.href;}
  function openMailLogin(){
    if(!prefs.mailEnabled)throw Error('mail-disabled');
    ensureMail();
    if(loginWindow&&!loginWindow.isDestroyed()){loginWindow.show();loginWindow.focus();return;}
    // A full-size official login page shares only the isolated mail session.
    const win=new BrowserWindow({parent:deps.window(),title:'네이버웍스 로그인',width:1100,height:800,minWidth:760,minHeight:600,autoHideMenuBar:true,webPreferences:{session:mailSession,nodeIntegration:false,nodeIntegrationInWorker:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,backgroundThrottling:true}});
    loginWindow=win;popups.add(win);secureRemote(win.webContents);
    win.on('closed',()=>{popups.delete(win);if(loginWindow===win)loginWindow=null;if(!closing&&mail&&!mail.webContents.isDestroyed())mail.webContents.reload();});
    // Explicit official company login entry; inbox is a separate action.
    // Never infer authentication success or copy an external browser's cookies.
    win.setAutoHideMenuBar(false);
    win.setMenu(Menu.buildFromTemplate([{label:'로그인 도움말',submenu:[
      {label:'메일 로그인 처음부터',click:()=>win.loadURL(mailLoginUrl()).catch(()=>{})},
      {label:'새로고침',click:()=>win.webContents.reload()},
      {label:'브라우저에서 로그인',click:()=>external(prefs.mailUrl).catch(()=>{})},
      {label:'연결 진단 보기',click:()=>showMailDiagnostics(win).catch(()=>{})},
      {label:'창 닫고 메일함 갱신',click:()=>win.close()}
    ]}]));
    mailDiagnostics.record('login-start',mailLoginUrl());
    win.loadURL(mailLoginUrl()).catch(()=>{mailError='mail-network';emit();});
  }
  function download(event,item,wc){if(wc!==mail?.webContents&&!aiContents.has(wc)&&![...popups].some(w=>w.webContents===wc)){event.preventDefault();return;}
    const id=crypto.randomUUID();let reserved=null;
    try{reserved=reserveDownload(downloadRoot(),item.getFilename());const {name,file,fd}=reserved;fs.closeSync(fd);item.setSavePath(file);const d={id,name,file,status:'downloading',bytes:0};downloads.set(id,d);emit();
      let last=0;item.on('updated',()=>{d.bytes=item.getReceivedBytes();if(Date.now()-last>500){last=Date.now();emit();}});
      item.once('done',async(_e,status)=>{d.status=status;d.bytes=item.getReceivedBytes();if(status==='completed'&&process.platform==='win32'){try{await fsp.writeFile(file+':Zone.Identifier','[ZoneTransfer]\r\nZoneId=3\r\n');}catch{}}
        emit();if(status==='completed'&&prefs.offerOpen&&fileKind(name)!=='blocked'&&!closing){const a=await dialog.showMessageBox(deps.window(),{type:'question',title:'첨부파일 다운로드 완료',message:name,detail:'원본은 보존됩니다. 오피스에서 열면 별도의 편집용 사본을 새 탭으로 엽니다.',buttons:['나중에','열기'],defaultId:0,cancelId:0});if(a.response===1)await openDownload(id).catch(()=>{});}});
    }catch{if(reserved)try{fs.rmSync(reserved.file,{force:true});}catch{}event.preventDefault();mailError='download-folder';emit();}
  }
  async function openDownload(id){const d=downloads.get(id);if(!d||d.status!=='completed')throw Error('download-not-ready');const kind=fileKind(d.name);if(kind==='blocked')throw Error('executable-blocked');if(kind==='office'){
      const cache=path.join(dir(),'attachment-copies');await fsp.mkdir(cache,{recursive:true});const folder=await fsp.mkdtemp(path.join(cache,'edit-'));const file=path.join(folder,d.name);await fsp.copyFile(d.file,file,fs.constants.COPYFILE_EXCL);await deps.openDocument(file);
    }else if(kind==='image'){const win=new BrowserWindow({title:d.name+'',width:900,height:700,autoHideMenuBar:true,webPreferences:{partition:'workpanel-image-preview',nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());await win.loadFile(d.file);
    }else{const a=await dialog.showMessageBox(deps.window(),{type:'question',buttons:['취소','기본 프로그램으로 열기'],defaultId:0,cancelId:0,message:d.name,detail:'이 형식은 오피스에서 지원하지 않습니다. 신뢰하는 첨부파일만 열어 주세요.'});if(a.response===1){const err=await shell.openPath(d.file);if(err)throw Error('external-open-failed');}}
  }
  async function sync(){if(!calendar.token)return;await calendar.sync(prefs.calendarIds,range);emit();}
  function checked(e,panelOnly=false){if(e.senderFrame!==e.sender.mainFrame)return false;if(panelOnly)return e.sender===panel?.webContents;return deps.isHost(e.sender);}
  ipcMain.handle('wp:host-init',async e=>{if(!checked(e))throw Error('forbidden');await ready;hostIds.add(e.sender.id);watchEscape(e.sender);return hostState();});
  ipcMain.on('wp:host-layout',(e,p)=>{if(!checked(e)||!activeHost(e.sender)||!p||typeof p!=='object')return;
    owner=e.sender;hostBlocked=p.blocked===true;if(p.visible!==true||!p.rect){rect=null;hide();return;}const r=p.rect;if(!['x','y','width','height'].every(k=>Number.isFinite(r[k])&&Math.abs(r[k])<10000))return;rect=r;layout();});
  ipcMain.handle('wp:host-action',async(e,p)=>{if(!checked(e)||!activeHost(e.sender))throw Error('forbidden');await ready;owner=e.sender;if(p?.action==='menu'&&['ai','aiweb','mail','calendar','notes','settings'].includes(p.value)){
      panelMode=p.value;if(panelMode!=='settings'){prefs.menu=panelMode;await persist();}mailRect=null;mailModal=false;hosts();emit();layout();if(panelMode==='calendar')void sync().catch(()=>{});
    }else if(p?.action==='width'&&Number.isFinite(p.value)){prefs=settingsOf({width:p.value},prefs);await persist();hosts();}
    else if(p?.action==='expanded'){setExpanded(p.value);}
    else if(p?.action==='closed'){rect=null;hide();}
    return hostState();});
  ipcMain.on('wp:mail-layout',(e,r)=>{if(!checked(e,true)||!r||!['x','y','width','height'].every(k=>Number.isFinite(r[k])&&r[k]>=0&&r[k]<10000))return;mailRect=r;layout();});
  ipcMain.on('wp:mail-modal',(e,value)=>{if(!checked(e,true))return;mailModal=value===true;layout();});
  ipcMain.handle('wp:action',async(e,p)=>{if(!checked(e,true))return {ok:false,error:'forbidden'};try{await ready;const a=p?.action,x=p?.value;
      if(a?.startsWith('reader-')){
        if(!prefs.mailEnabled)throw Error('mail-disabled');
        let data;
        if(a==='reader-connect')data=await reader.connect(x);
        else if(a==='reader-disconnect'){await reader.disconnect();data={};}
        else if(a==='reader-folders')data=await reader.folders();
        else if(a==='reader-list')data=await reader.list(x);
        else if(a==='reader-read')data=await reader.read(x);
        else if(a==='reader-attachment'){
          const item=reader.attachment(x?.key,x?.index),id=crypto.randomUUID();
          const root=downloadRoot();let saved;try{saved=await saveAttachment(root,item.name,item.content);}catch{throw Error('download-folder');}
          downloads.set(id,{id,name:saved.name,file:saved.file,status:'completed',bytes:item.content.length});
          data={id,name:saved.name,folder:root};
        }
        else if(a==='reader-link-save'){
          const url=reader.link(x?.key,x?.index),root=downloadRoot(),id=crypto.randomUUID();
          const saved=await require('./linked-attachment.cjs').saveLinkedAttachment({url,name:x?.name,root});
          downloads.set(id,{id,...saved,status:'completed'});data={id,name:saved.name,folder:root};
        }
        else if(a==='reader-link'){await confirmExternal(reader.link(x?.key,x?.index));data={};}
        else throw Error('unknown-action');
        return {ok:true,data,reader:reader.status()};
      }
      if(a==='notes-create'){notesQuitReady=false;const note=await notes.create();return {ok:true,note};}
      if(a==='notes-save'){notesQuitReady=false;const note=await notes.update(x);return {ok:true,note};}
      if(a==='notes-delete'){notesQuitReady=false;const ans=await dialog.showMessageBox(deps.window(),{type:'question',buttons:['취소','메모 삭제'],defaultId:0,cancelId:0,message:'이 메모와 할 일 목록을 삭제할까요?'});if(ans.response===1)await notes.remove(x);return {ok:true,deleted:ans.response===1};}
      if(a==='state')return {ok:true,state:state()};
      if(a==='settings'){const before=prefs;prefs=settingsOf(x,prefs);await persist();if(!prefs.mailEnabled)mail?.setVisible(false);if(prefs.aiWebZoom!==before.aiWebZoom)for(const v of aiViews.values())if(!v.webContents.isDestroyed())v.webContents.setZoomFactor(prefs.aiWebZoom);if(mail&&!mail.webContents.isDestroyed()&&prefs.mailZoom!==before.mailZoom)mail.webContents.setZoomFactor(prefs.mailZoom);if(prefs.mailUrl!==before.mailUrl&&mail){mail.webContents.loadURL(prefs.mailUrl).catch(()=>{});}hosts();emit();layout();}
      else if(a==='download-folder'){const r=await dialog.showOpenDialog(deps.window(),{title:'메일 첨부파일 기본 저장 위치',defaultPath:downloadRoot(),properties:['openDirectory','createDirectory']});if(!r.canceled&&r.filePaths[0]){prefs.downloadFolder=r.filePaths[0];await persist();}}
      else if(a==='download-folder-open'){try{await fsp.mkdir(downloadRoot(),{recursive:true});const error=await shell.openPath(downloadRoot());if(error)throw Error(error);}catch{throw Error('download-folder');}}
      else if(a==='reset-mail'){const r=await dialog.showMessageBox(deps.window(),{type:'question',buttons:['취소','로그인 초기화'],defaultId:0,cancelId:0,message:'내장 웹메일의 네이버웍스 로그인을 초기화할까요?',detail:'작성 중인 메일은 먼저 저장하세요. 외부 브라우저의 로그인과 간편 메일 연결은 바뀌지 않습니다.'});if(r.response===1){for(const w of popups)w.close();if(mail){deps.window().contentView.removeChildView(mail);mail.webContents.close();mail=null;}if(mailSession){await mailSession.clearStorageData();await mailSession.clearCache();await mailSession.closeAllConnections();}mailReady=false;mailError='';layout();}}
      else if(a==='ai-service'){if(!aiWeb.SERVICES[x])throw Error('unknown-action');prefs=settingsOf({aiWebService:x},prefs);await persist();layout();}
      else if(a==='ai-home'){if(!prefs.aiWebEnabled)throw Error('ai-disabled');const v=aiViews.get(prefs.aiWebService);if(v&&!v.webContents.isDestroyed())await v.webContents.loadURL(aiWeb.SERVICES[prefs.aiWebService].home).catch(()=>{});else layout();}
      else if(a==='ai-back'){const v=aiViews.get(prefs.aiWebService);if(v?.webContents.navigationHistory.canGoBack())v.webContents.navigationHistory.goBack();}
      else if(a==='ai-reload'){const v=aiViews.get(prefs.aiWebService);if(v&&!v.webContents.isDestroyed())v.webContents.reload();else layout();}
      else if(a==='ai-link'){if(!prefs.aiWebEnabled)throw Error('ai-disabled');const u=httpsUrl(String(x||'').trim()),id=u&&aiWeb.serviceOf(u.href);if(!id)throw Error('ai-link');prefs=settingsOf({aiWebService:id},prefs);await persist();layout();const v=ensureAi(id);await v.webContents.loadURL(u.href).catch(()=>{});}
      else if(a==='ai-login'){if(!prefs.aiWebEnabled)throw Error('ai-disabled');if(prefs.aiWebService==='chatgpt')await managed.command('open');else openAiLogin(prefs.aiWebService);}
      else if(a==='ai-browser')await openAiBrowser(prefs.aiWebService);
      else if(a==='ai-external')await external(aiWeb.SERVICES[prefs.aiWebService].home);
      else if(a==='ai-reset')await resetAi(prefs.aiWebService);
      else if(a==='mail-login')openMailLogin();
      else if(a==='mail-expand'){setExpanded(!expanded);}
      else if(a==='mail-diagnostics')await showMailDiagnostics();
      else if(a==='mail-home'){if(!prefs.mailEnabled)throw Error('mail-disabled');ensureMail();await mail.webContents.loadURL(prefs.mailUrl);}
      else if(a==='mail-back')mail?.webContents.navigationHistory.goBack();
      else if(a==='mail-reload'){if(!mail)ensureMail();else mail.webContents.reload();}
      else if(a==='mail-external')await external(prefs.mailUrl);
      else if(a==='google-privacy')await external(require('./google-deployment.cjs').privacyUrl);
      else if(a==='google-external')await external('https://calendar.google.com/');
      else if(a==='download-open')await openDownload(x);
      else if(a==='download-show'){const d=downloads.get(x);if(d?.status==='completed')shell.showItemInFolder(d.file);}
      else if(a==='google-import'){const r=await dialog.showOpenDialog(deps.window(),{filters:[{name:'Google OAuth desktop client',extensions:['json']}],properties:['openFile']});if(!r.canceled){const f=r.filePaths[0];if((await fsp.stat(f)).size>100000)throw Error('desktop-client-required');await calendar.configure(clientOf(JSON.parse(await fsp.readFile(f,'utf8'))));}}
      else if(a==='google-connect'){void calendar.connect(x==='edit').then(sync).catch(err=>{calendar.syncError=err.message;emit();});}
      else if(a==='google-cancel')calendar.cancel();
      else if(a==='google-disconnect'){const r=await dialog.showMessageBox(deps.window(),{buttons:['취소','연결 해제'],defaultId:0,cancelId:0,message:'구글 캘린더 연결을 해제할까요?'});if(r.response===1)await calendar.disconnect();}
      else if(a==='sync')await sync();
      else if(a==='range'){if(!x||!Number.isFinite(Date.parse(x.start))||!Number.isFinite(Date.parse(x.end))||Date.parse(x.end)<=Date.parse(x.start)||Date.parse(x.end)-Date.parse(x.start)>367*86400000)throw Error('invalid-time');range={start:new Date(x.start).toISOString(),end:new Date(x.end).toISOString()};await sync();}
      else if(['event-create','event-update','event-delete'].includes(a)){if(!x||typeof x!=='object')throw Error('invalid-event');await calendar.mutate(a.slice(6),x);await sync();}
      else if(a==='event-external'){const event=calendar.events.find(v=>v.id===x?.id&&v.calendarId===x?.calendarId);if(event?.htmlLink)await external(event.htmlLink);}
      else if(a==='help')await external('https://developers.google.com/workspace/calendar/api/quickstart/js#authorize_credentials_for_a_desktop_application');
      else throw Error('unknown-action');
      emit();return {ok:true,state:state()};
    }catch(err){return {ok:false,error:String(err.message).slice(0,100)};}});
  nativeTheme.on('updated',emit);
  function attach(){const m=deps.manager();if(m&&!m.__workPanelLayout){m.__workPanelLayout=true;const original=m.layout.bind(m);m.layout=(...args)=>{const result=original(...args);layout();const win=deps.window();for(const wc of [win?.webContents,...(win?.contentView.children||[]).map(v=>v.webContents)].filter(Boolean))if(!wc.isDestroyed()&&deps.isHost(wc))wc.send('wp:refresh');return result;};}const w=deps.window();if(w&&!w.__workPanelAttached){w.__workPanelAttached=true;w.on('minimize',hide);w.on('restore',layout);w.on('resize',layout);w.on('closed',()=>{reader.close();for(const popup of popups)popup.close();for(const v of [panel,mail,...aiViews.values()]){const wc=v?.webContents;if(wc&&!wc.isDestroyed())wc.close();}panel=mail=null;aiViews.clear();});}}
  app.on('before-quit',event=>{if(!notesQuitReady&&notes.flushRequired&&event?.preventDefault){event.preventDefault();notes.flush().then(()=>{notesQuitReady=true;setImmediate(()=>app.quit());}).catch(()=>{void dialog.showMessageBox(deps.window(),{type:'error',message:'메모를 저장하지 못해 종료를 중단했습니다.',detail:'메모 내용을 복사해 보관하고 저장 공간을 확인해 주세요.'});});return;}closing=true;managed.close();clearInterval(timer);calendar.close();reader.close();for(const w of popups)w.close();for(const v of [panel,mail,...aiViews.values()]){const wc=v?.webContents;if(wc&&!wc.isDestroyed())wc.close();}});
  installed={attach,layout};return installed;
}
module.exports={register,attach:()=>installed?.attach(),isMailContents:wc=>mailContents.has(wc)};
