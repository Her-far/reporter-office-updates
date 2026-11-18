'use strict';
// Remote services never receive an Office preload, Node, document data or IPC.
const {WebContentsView,session,shell,dialog,Menu,clipboard}=require('electron');
const {providers,https,allowed,googleLogin}=require('./ai-web-policy.cjs');
const remote=new WeakSet();
function create(deps){
 const views=new Map(),popups=new Set(),configuredSessions=new WeakSet();let selected='chatgpt',visible=false,closed=false,externalPrompt=false;
 const state=()=>{const item=views.get(selected);return {provider:selected,loading:!!item?.loading,error:item?.error||'',canBack:!!item?.view.webContents.navigationHistory.canGoBack(),canForward:!!item?.view.webContents.navigationHistory.canGoForward()};};
 const changed=()=>{if(!closed)deps.changed();};
 function notice(item,message){item.error=message;changed();}
 function hide(){visible=false;for(const item of views.values()){item.view.setVisible(false);if(!item.view.webContents.isDestroyed())item.view.webContents.setAudioMuted(true);}}
 async function offerExternal(url,item){
  if(externalPrompt||!https(url))return;externalPrompt=true;
  try{
   const response=await dialog.showMessageBox(deps.window(),{type:'question',buttons:['취소','브라우저에서 열기'],defaultId:1,cancelId:0,message:'외부 브라우저에서 열까요?',detail:googleLogin(url)?'Google 로그인은 내장 화면에서 지원하지 않습니다. 기본 브라우저에서 이 AI 서비스를 이용할 수 있습니다. 두 창의 로그인은 별도로 유지됩니다.':new URL(url).hostname});
   if(response.response===1)await shell.openExternal(googleLogin(url)?providers[item.id].url:url);
  }finally{externalPrompt=false;}
 }
 function blocked(url,item){
  if(googleLogin(url)){notice(item,'Google 로그인은 ‘브라우저에서 열기’를 이용해 주세요.');return;}
  if(https(url))void offerExternal(url,item).catch(()=>notice(item,'외부 브라우저를 열지 못했습니다.'));
 }
 function secure(wc,item){
  remote.add(wc);
  wc.on('will-attach-webview',e=>e.preventDefault());
  for(const eventName of ['will-navigate','will-redirect'])wc.on(eventName,(e,url,_sameDocument,isMainFrame)=>{if(isMainFrame===false||allowed(item.id,url))return;e.preventDefault();blocked(url,item);});
  wc.setWindowOpenHandler(({url})=>{
   if(url==='about:blank'||allowed(item.id,url))return {action:'allow',overrideBrowserWindowOptions:{parent:deps.window(),width:1050,height:780,autoHideMenuBar:true,webPreferences:{session:item.session,nodeIntegration:false,nodeIntegrationInWorker:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,preload:undefined}}};
   blocked(url,item);return {action:'deny'};
  });
  wc.on('did-create-window',win=>{popups.add(win);secure(win.webContents,item);win.on('closed',()=>popups.delete(win));});
  wc.on('before-input-event',(e,input)=>{if(visible&&input.type==='keyDown'&&input.key==='Escape'&&!input.isComposing&&deps.expanded()){e.preventDefault();deps.restore();}});
  wc.on('context-menu',(_event,params)=>{
   const items=[{role:'copy',enabled:!!params.selectionText},{role:'paste',enabled:params.isEditable},{role:'selectAll'}];
   if(https(params.linkURL))items.push({type:'separator'},{label:'링크를 브라우저에서 열기',click:()=>offerExternal(params.linkURL,item)});
   Menu.buildFromTemplate(items).popup({window:deps.window()});
  });
 }
 function ensure(id){
  let item=views.get(id);if(item&&!item.view.webContents.isDestroyed())return item;
  const ses=session.fromPartition('persist:electimes-ai-web-test-'+id);
  // Ordinary explicit Ctrl+V works without granting background clipboard reads.
  ses.setPermissionCheckHandler((_wc,permission,origin)=>permission==='clipboard-sanitized-write'&&allowed(id,origin));
  ses.setPermissionRequestHandler((wc,permission,callback)=>callback(permission==='clipboard-sanitized-write'&&!!wc&&allowed(id,wc.getURL())));
  ses.setDevicePermissionHandler(()=>false);
  if(!configuredSessions.has(ses))ses.on('will-download',(_event,download)=>{
   download.setSaveDialogOptions({title:'AI 첨부파일 저장',defaultPath:require('node:path').join(require('electron').app.getPath('downloads'),require('./policy.cjs').safeFilename(download.getFilename()))});
  });
  configuredSessions.add(ses);
  // Stop Google authentication before it enters an embedded user-agent. This
  // does not spoof the browser, remove security headers or transfer cookies.
  ses.webRequest.onBeforeRequest({urls:['https://accounts.google.com/*']},(details,callback)=>{
   if(details.resourceType==='mainFrame'||details.resourceType==='subFrame'){callback({cancel:true});if(item)notice(item,'Google 로그인은 ‘브라우저에서 열기’를 이용해 주세요.');}else callback({});
  });
  const view=new WebContentsView({webPreferences:{session:ses,nodeIntegration:false,nodeIntegrationInWorker:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,backgroundThrottling:true,spellcheck:true}});
  item={id,view,session:ses,loading:true,error:''};views.set(id,item);secure(view.webContents,item);view.setVisible(false);
  const wc=view.webContents;
  wc.on('did-start-loading',()=>{item.loading=true;changed();});
  wc.on('did-stop-loading',()=>{item.loading=false;changed();});
  wc.on('did-navigate',changed);wc.on('did-navigate-in-page',changed);
  wc.on('did-fail-load',(_e,code,_description,_url,main)=>{if(main&&code!==-3)notice(item,'화면을 불러오지 못했습니다. 새로고침하거나 브라우저에서 열어 주세요.');});
  wc.on('render-process-gone',()=>notice(item,'웹 화면이 종료됐습니다. 새로고침해 주세요.'));
  void wc.loadURL(providers[id].url).catch(()=>{});
  return item;
 }
 function show(id,bounds){if(closed)return;selected=Object.hasOwn(providers,id)?id:'chatgpt';hide();const item=ensure(selected),win=deps.window();win.contentView.addChildView(item.view);item.view.setBounds(bounds);item.view.setVisible(true);item.view.webContents.setAudioMuted(false);visible=true;}
 async function command(action,owner){
  const item=ensure(selected),wc=item.view.webContents;
  if(action==='external'){const url=wc.getURL();await shell.openExternal(https(url)?.hostname===new URL(providers[selected].url).hostname?url:providers[selected].url);}
  else if(action==='new'){item.error='';await wc.loadURL(providers[selected].url);}
  else if(action==='reload'){item.error='';wc.reload();}
  else if(action==='back'&&wc.navigationHistory.canGoBack())wc.navigationHistory.goBack();
  else if(action==='forward'&&wc.navigationHistory.canGoForward())wc.navigationHistory.goForward();
  else if(action==='paste-ai'){wc.focus();wc.pasteAndMatchStyle();}
  else if(action==='paste-document'){
   if(!deps.isDocument(owner)){notice(item,'문서 탭을 열고 붙여넣을 위치를 먼저 선택해 주세요.');return;}
   if(!clipboard.readText()){notice(item,'먼저 AI 답변을 복사해 주세요.');return;}
   owner.focus();owner.pasteAndMatchStyle();
  }
  else if(action==='reset'){
   hide();const response=await dialog.showMessageBox(deps.window(),{type:'question',buttons:['취소','이 서비스 로그인 초기화'],defaultId:0,cancelId:0,message:providers[selected].name+'의 테스트판 로그인을 초기화할까요?',detail:'외부 브라우저의 계정과 대화는 삭제하지 않습니다.'});
   if(response.response===1){for(const popup of popups)if(!popup.isDestroyed())popup.close();wc.close();views.delete(selected);await item.session.clearStorageData();await item.session.clearCache();}
   deps.relayout();
  }
  changed();
 }
 function close(){if(closed)return;closed=true;for(const popup of popups)if(!popup.isDestroyed())popup.close();for(const item of views.values())if(!item.view.webContents.isDestroyed())item.view.webContents.close();views.clear();}
 return {state,show,hide,command,close};
}
module.exports={create,isRemote:wc=>remote.has(wc)};
