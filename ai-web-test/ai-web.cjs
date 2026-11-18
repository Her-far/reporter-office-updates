'use strict';
const {app,WebContentsView,ipcMain,net,shell,clipboard,Menu}=require('electron');
const path=require('node:path');const {PlanAuth}=require('./plan-auth.cjs'),{PlanChat}=require('./plan-chat.cjs'),{OfficialCLI}=require('./official-cli.cjs');
function create(deps){
 let view=null,selected='chatgpt',visible=false,closed=false,error='',emitTimer=null;
 const runtime=path.join(process.resourcesPath,'ai-runtime/node_modules');
 const auth=new PlanAuth({vault:deps.vault,initialized:app.whenReady(),fetch:(...args)=>net.fetch(...args),openExternal:u=>shell.openExternal(u),jose:require(path.join(runtime,'jose')),changed:emit});
 const chat=new PlanChat({auth,vault:deps.vault,fetch:(...args)=>net.fetch(...args),changed:emit});
 const cli=new OfficialCLI({root:path.join(app.getPath('userData'),'subscription-panel'),fetch:(...args)=>net.fetch(...args),pty:require(path.join(runtime,'node-pty')),changed:emit,event:e=>{if(view&&!view.webContents.isDestroyed())view.webContents.send('plan:terminal',e);}});
 const ready=Promise.all([auth.ready,chat.ready]).then(()=>{if(auth.current()?.access)void auth.models().catch(e=>{error=e.message;emit();});}).catch(e=>{error=e.message;});
 function state(){return {provider:selected,error,auth:auth.state(),chat:chat.state(),cli:selected==='chatgpt'?null:cli.state(selected)};}
 function emit(){if(closed||emitTimer)return;emitTimer=setTimeout(()=>{emitTimer=null;if(view&&!view.webContents.isDestroyed())view.webContents.send('plan:state',state());},60);}
 function trusted(e){return !!view&&e.sender===view.webContents&&e.senderFrame===view.webContents.mainFrame;}
 async function action(p){await ready;error='';const a=p?.action,x=p?.value;
  if(a==='state')return state();
  if(a==='login'){if(chat.abort)throw Error('답변을 중지한 뒤 연결해 주세요.');await auth.start(x?.id||undefined,{consent:x?.consent===true});}
  else if(a==='cancel-login')auth.cancel();
  else if(a==='logout'){chat.stop();await auth.logout();}
  else if(a==='account'){if(chat.abort)throw Error('답변을 중지한 뒤 계정을 바꿔 주세요.');await auth.select(x);}
  else if(a==='acknowledge')await auth.acknowledge();
  else if(a==='models')await auth.models();
  else if(a==='send'){if(selected!=='chatgpt')throw Error('서비스를 확인해 주세요.');void chat.send(x).catch(e=>{error=e.message;emit();});}
  else if(a==='stop')chat.stop();
  else if(a==='new')await chat.newThread();
  else if(a==='thread')await chat.select(x);
  else if(a==='delete-thread')await chat.remove();
  else if(a==='usage')await shell.openExternal('https://chatgpt.com/');
  else if(a==='copy'){if(typeof x!=='string'||x.length>500000)throw Error('복사할 내용을 확인해 주세요.');clipboard.writeText(x);}
  else if(a==='source'){const u=new URL(x);if(u.protocol!=='https:'||u.username||u.password)throw Error('지원하지 않는 링크입니다.');await shell.openExternal(u.href);}
  else if(a==='cli-install'){if(selected==='chatgpt')return;void cli.install(selected).catch(e=>{error=e.message;emit();});}
  else if(a==='cli-start'){if(selected==='chatgpt')return;cli.start(selected,x?.cols,x?.rows);}
  else if(a==='cli-stop'){if(selected!=='chatgpt')cli.stop(selected);}
  else if(a==='paste-document'){const owner=deps.owner();if(!deps.isDocument(owner))throw Error('문서 탭을 열고 붙여넣을 위치를 선택해 주세요.');if(typeof x==='string'&&x.length<=500000)clipboard.writeText(x);if(!clipboard.readText())throw Error('먼저 답변을 복사해 주세요.');owner.focus();owner.pasteAndMatchStyle();}
  emit();return state();
 }
 ipcMain.handle('plan:action',async(e,p)=>{if(!trusted(e))throw Error('forbidden');try{return {ok:true,state:await action(p)};}catch(e){error=e.message||'요청을 처리하지 못했습니다.';emit();return {ok:false,error};}});
 ipcMain.on('plan:input',(e,p)=>{if(!trusted(e)||!visible||p?.provider!==selected||selected==='chatgpt')return;try{cli.input(selected,p.data);}catch{}});
 ipcMain.on('plan:resize',(e,p)=>{if(!trusted(e)||!['claude','gemini'].includes(p?.provider))return;cli.resize(p.provider,p.cols,p.rows);});
 function ensure(){if(view&&!view.webContents.isDestroyed())return;view=new WebContentsView({webPreferences:{preload:path.join(__dirname,'plan-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,spellcheck:true,partition:'office-subscription-local'}});
  const wc=view.webContents;wc.setWindowOpenHandler(()=>({action:'deny'}));wc.on('will-navigate',e=>e.preventDefault());wc.on('will-attach-webview',e=>e.preventDefault());wc.on('did-finish-load',emit);
  wc.on('before-input-event',(e,input)=>{if(visible&&input.type==='keyDown'&&input.key==='Escape'&&!input.isComposing&&deps.expanded()){e.preventDefault();deps.restore();}});
  wc.on('context-menu',(_e,p)=>Menu.buildFromTemplate([{role:'copy',enabled:!!p.selectionText},{role:'paste',enabled:p.isEditable},{role:'selectAll'}]).popup({window:deps.window()}));
  wc.on('render-process-gone',()=>{cli.close();view=null;error='대화 화면이 종료됐습니다. 패널을 다시 열어 주세요.';});
  view.setVisible(false);void wc.loadFile(path.join(__dirname,'plan-panel.html')).catch(e=>{error=e.message;emit();});
 }
 function hide(){visible=false;view?.setVisible(false);}
 function show(id,bounds){if(closed)return;selected=['chatgpt','claude','gemini'].includes(id)?id:'chatgpt';ensure();deps.window().contentView.addChildView(view);view.setBounds(bounds);view.setVisible(true);visible=true;emit();}
 async function command(a,owner){if(a==='paste-document')await action({action:a});else if(a==='paste-ai'){view?.webContents.focus();view?.webContents.pasteAndMatchStyle();}else if(a==='new'&&selected==='chatgpt')await action({action:'new'});deps.changed();}
 function close(){if(closed)return;closed=true;clearTimeout(emitTimer);auth.close();chat.stop();cli.close();if(view&&!view.webContents.isDestroyed())view.webContents.close();ipcMain.removeHandler('plan:action');}
 return {state:()=>({provider:selected,error}),show,hide,command,close};
}
module.exports={create,isRemote:()=>false};
