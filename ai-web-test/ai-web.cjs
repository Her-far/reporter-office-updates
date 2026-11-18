'use strict';
const {app,screen,clipboard}=require('electron'),fs=require('node:fs'),path=require('node:path');
const {BrowserCompanion,providers,makeSync}=require('./browser-companion.cjs');
function create(deps){
 let bridge=null,initializing=null,selected='chatgpt',browser='chrome',browsers=[],windows={},visible=false,bounds=null,busy=false,error='',closed=false,syncing=false,dirty=false,raise=false,last='',bound=false;
 const prefs=()=>path.join(app.getPath('userData'),'browser-companion.json');
 try{const p=JSON.parse(fs.readFileSync(prefs(),'utf8'));if(['chrome','edge'].includes(p.browser))browser=p.browser;}catch{}
 function state(){return {provider:selected,browser,browsers,windows,busy,error,version:3};}
 function notify(){const s=JSON.stringify(state());if(s!==last){last=s;deps.changed();}}
 async function ensure(){if(bridge)return;if(initializing)return initializing;initializing=(async()=>{const w=deps.window();if(!w||w.isDestroyed())return;const h=w.getNativeWindowHandle();const hwnd=h.length>=8?h.readBigUInt64LE().toString():String(h.readUInt32LE());bridge=new BrowserCompanion({executable:path.join(process.resourcesPath,'browser-companion.exe'),hwnd,pid:process.pid,onExit:()=>{if(!closed){bridge=null;windows={};error='브라우저 연결이 종료됐습니다. 열기를 눌러 다시 연결해 주세요.';notify();}}});const result=await bridge.call({action:'list'});browsers=result.browsers;windows=result.windows;if(!browsers.includes(browser))browser=browsers[0]||'chrome';if(!bound){bound=true;w.on('move',()=>schedule());w.on('resize',()=>schedule());w.on('minimize',()=>schedule());w.on('restore',()=>schedule(true));w.on('focus',()=>schedule(true));w.on('hide',()=>schedule());w.on('show',()=>schedule(true));}notify();})().finally(()=>{initializing=null;});return initializing;}
 function rect(){const w=deps.window();if(!w||w.isDestroyed()||!bounds)return null;const c=w.getContentBounds(),d={x:c.x+bounds.x,y:c.y+bounds.y,width:bounds.width,height:bounds.height};return screen.dipToScreenRect(w,d);}
 function schedule(focus=false){if(closed)return;dirty=true;raise=raise||focus;void sync();}
 async function sync(){if(syncing||!bridge||closed)return;syncing=true;try{while(dirty&&!closed){dirty=false;const w=deps.window(),canShow=visible&&!!w&&!w.isDestroyed()&&!w.isMinimized()&&w.isVisible(),r=canShow?rect():null;const msg=makeSync(selected,r,canShow&&!!r,raise);raise=false;windows=await bridge.call(msg);notify();}}catch(e){if(!closed){error=e.message;notify();}}finally{syncing=false;}}
 async function command(a,owner){if(typeof a!=='string')return;error='';try{
  if(a==='paste-document'){if(!deps.isDocument(owner))throw Error('문서를 열고 붙여넣을 위치를 선택해 주세요.');if(!clipboard.readText())throw Error('웹사이트에서 답변을 먼저 복사해 주세요.');owner.focus();owner.pasteAndMatchStyle();return;}
  if(a.startsWith('browser:')){const choice=a.slice(8);if(!['chrome','edge'].includes(choice))return;browser=choice;fs.writeFileSync(prefs(),JSON.stringify({browser}));notify();return;}
  if(!['open','detach','refresh-state'].includes(a)||busy)return;
  await ensure();if(!bridge)throw Error('브라우저를 준비하지 못했습니다.');
  if(a==='open'){busy=true;notify();await deps.prepareBrowser();windows=await bridge.call({action:'open',provider:selected,browser});schedule(true);}
  else if(a==='detach'){windows=await bridge.call({action:'detach',provider:selected});}
  else windows=await bridge.call({action:'state'});
 }catch(e){error=e.message||'브라우저를 열지 못했습니다.';}finally{busy=false;notify();}}
 function show(id,r){selected=Object.hasOwn(providers,id)?id:'chatgpt';visible=true;bounds=r;void ensure().then(()=>schedule()).catch(e=>{error=e.message;notify();});}
 function hide(){visible=false;schedule();}
 const timer=setInterval(()=>{if(!closed&&bridge&&Object.keys(windows).length&&!busy)schedule();},1200);timer.unref();
 function close(){if(closed)return;closed=true;clearInterval(timer);if(bridge)void bridge.close().catch(()=>{});}
 return {state,show,hide,command,close};
}
module.exports={create,isRemote:()=>false};
