'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync,spawn}=require('node:child_process'),{_electron}=require('playwright');
const root=__dirname,report={version:'1.0.12-aiweb.3',checks:[],liveAccountLoginVerified:false,browserWindows:[]};let app,home;
const ok=(name,v=true)=>{assert(v,name);report.checks.push(name);console.log('PASS',name);};
async function until(fn,label,ms=45000){const end=Date.now()+ms;while(Date.now()<end){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,160));}throw Error('Timed out: '+label);}
async function state(p=home){return app.evaluate(async({ipcMain,webContents},url)=>{const wc=webContents.getAllWebContents().find(w=>w.getURL()===url);return ipcMain._invokeHandlers.get('wp:host-init')({sender:wc,senderFrame:wc.mainFrame});},p.url());}
async function webState(p=home){const s=await state(p);return s.aiWeb;}
async function mode(p,value){await p.locator('[data-ai-mode='+value+']').click();await until(()=>p.locator('.wp-dock').getAttribute('data-wp-ai-mode').then(v=>v===value),'mode '+value);}
async function service(p,id){await p.locator('.wp-ai-provider').selectOption(id);await until(()=>webState(p).then(s=>s.provider===id),'provider '+id);}
async function opened(id,p=home){return until(async()=>{const s=await webState(p);if(s.error)throw Error(s.error);return !s.busy&&s.windows[id]?.visible?s.windows[id]:false;},'real browser '+id,70000);}
async function desktop(name){if(app){await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].focus()).catch(()=>{});await new Promise(r=>setTimeout(r,350));}const file=path.join(root,'browser-desktop-'+name+'.png');const script="Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $r=[System.Windows.Forms.SystemInformation]::VirtualScreen; $b=[System.Drawing.Bitmap]::new($r.Width,$r.Height); $g=[System.Drawing.Graphics]::FromImage($b); $g.CopyFromScreen($r.Location,[System.Drawing.Point]::Empty,$r.Size); $b.Save('"+file.replace(/'/g,"''")+"'); $g.Dispose(); $b.Dispose()";execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script]);}
function completeFreshBrowserSetup(){
 const script=`Add-Type -AssemblyName UIAutomationClient; Add-Type -AssemblyName UIAutomationTypes
 $root=[System.Windows.Automation.AutomationElement]::RootElement
 $handled=@()
 for($i=0;$i -lt 24;$i++){
  foreach($label in @('Stay signed out','Start without your data','Continue without signing in')){
   $condition=[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty,$label)
   $button=$root.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$condition)
   if($button -and $button.Current.IsEnabled){
    $pattern=$button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    $pattern.Invoke();$handled+=$label;Start-Sleep -Milliseconds 900
   }
  }
  if($handled.Count -gt 0){break};Start-Sleep -Milliseconds 400
 }
 $handled|ConvertTo-Json -Compress`;
 console.log('CI fresh browser setup:',execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',timeout:50000}).trim());
}
function auditBrowserWindows(){
 const script=`Add-Type -AssemblyName UIAutomationClient;Add-Type -AssemblyName UIAutomationTypes
 $result=@{processes=@();windows=@();registry=@()}
 $result.processes=@(Get-Process chrome,msedge -ErrorAction SilentlyContinue|Select-Object ProcessName,Id,Path,MainWindowHandle,MainWindowTitle)
 foreach($r in @('HKCU:','HKLM:')){foreach($n in @('chrome.exe','msedge.exe')){$key=$r+'\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\'+$n;if(Test-Path $key){$result.registry+=@{name=$n;path=(Get-Item $key).GetValue('')}}}}
 $roots=[System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
 foreach($el in $roots){try{$proc=Get-Process -Id $el.Current.ProcessId -ErrorAction Stop;if($proc.ProcessName -notin @('chrome','msedge')){continue};$b=$el.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Button));$labels=@();foreach($v in $b){if($labels.Count -lt 40){$labels+=$v.Current.Name}};$result.windows+=@{pid=$proc.Id;path=$proc.Path;title=$el.Current.Name;class=$el.Current.ClassName;hwnd=$el.Current.NativeWindowHandle;buttons=$labels}}catch{}}
 $result|ConvertTo-Json -Depth 6 -Compress`;
 try{const value=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',timeout:40000});fs.writeFileSync(path.join(root,'browser-diagnostics-windows.json'),value);console.log('Browser diagnostic capture saved');}catch(e){console.log('Browser diagnostic capture failed',e.message);}
}
async function expected(p=home){const slot=await p.locator('.wp-slot').boundingBox();return app.evaluate(({BrowserWindow,screen,webContents},{slot,url})=>{const w=BrowserWindow.getAllWindows()[0],c=w.getContentBounds(),wc=webContents.getAllWebContents().find(v=>v.getURL()===url),view=w.contentView.children.find(v=>v.webContents===wc),origin=wc===w.webContents?{x:0,y:0}:view.getBounds(),z=wc.getZoomFactor();return screen.dipToScreenRect(w,{x:c.x+origin.x+slot.x*z,y:c.y+origin.y+slot.y*z,width:slot.width*z,height:slot.height*z});},{slot,url:p.url()});}
async function aligned(id,p=home){let last;try{return await until(async()=>{const s=await webState(p),w=s.windows[id],r=await expected(p);last={actual:w,expected:r,error:s.error};if(s.error)throw Error(s.error);return w?.visible&&['x','y','width','height'].every(k=>Math.abs(w.rect[k]-r[k])<=10);},'browser follows panel '+id);}catch(e){report.geometry=last;throw e;}}
(async()=>{
 app=await _electron.launch({executablePath:path.join(root,'stage/ElectimesOffice-AIWeb-Test.exe'),env:{...process.env,GENOFFICE_NO_SPARE_VIEW:'1',GENOFFICE_LANG:'ko'},timeout:60000});home=await app.firstWindow();await home.locator('.wp-toolbar').waitFor({timeout:45000});await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setMinimumSize(800,600);w.setBounds({x:10,y:10,width:980,height:700});});
 // Use the public state API already exposed by the work-panel preload.
 await mode(home,'web');await until(()=>webState().then(s=>s?.browsers?.length),'browser discovery');
 const initial=await webState();
 // CI starts with fresh browser profiles. Seed ordinary blank windows once to
 // skip browser-install onboarding, which is unrelated to service login.
 for(const [id,tail]of [['chrome','Google/Chrome/Application/chrome.exe'],['edge','Microsoft/Edge/Application/msedge.exe']]){if(!initial.browsers.includes(id))continue;const exe=[process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean).map(p=>path.join(p,tail)).find(p=>fs.existsSync(p));if(exe){const child=spawn(exe,['--no-default-browser-check','--new-window','about:blank'],{detached:true,stdio:'ignore'});child.unref();}}
 await new Promise(r=>setTimeout(r,4500));completeFreshBrowserSetup();await new Promise(r=>setTimeout(r,2000));await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].focus());
 ok('Installed real Chrome or Edge discovered',initial.browsers.length>0);report.browsers=initial.browsers;
 ok('Browser mode has no embedded terminal or custom subscription chat',await app.evaluate(({webContents})=>!webContents.getAllWebContents().some(w=>/plan-panel|claude\.ai|gemini\.google|chatgpt\.com/.test(w.getURL()))));
 await service(home,'claude');await home.locator('[data-ai-command=open]').click();let claude=await opened('claude');await aligned('claude');ok('A real browser window opens at the Claude website panel');report.browserWindows.push(claude);
 // The runner has no user login. Observe only the public website/title.
 await until(()=>webState().then(s=>/Claude/i.test(s.windows.claude?.title||'')),'Claude page title',60000);await desktop('claude');
 const same=claude.hwnd;await home.locator('[data-ai-command=open]').click();claude=await opened('claude');ok('Open reuses the managed window instead of creating duplicate windows',claude.hwnd===same);
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setPosition(30,25));await aligned('claude');ok('Native browser follows Office movement');
 for(const side of ['left','right']){await home.evaluate(side=>window.aiOffice.setAiPanelPrefs({side}),side);await until(()=>home.evaluate(side=>document.documentElement.dataset.aiPanelSide===side,side),'side '+side);await aligned('claude');await home.locator('.wp-expand').click();await until(()=>home.locator('.wp-dock').evaluate(n=>n.classList.contains('wp-expanded')),'expand');await aligned('claude');await home.locator('.wp-expand').click();await until(()=>home.locator('.wp-dock').evaluate(n=>!n.classList.contains('wp-expanded')),'restore');await aligned('claude');ok(side+' home browser panel expands and restores');}
 await mode(home,'document');await until(()=>webState().then(s=>!s.windows.claude.visible),'hidden in document-assistant mode');await mode(home,'web');await opened('claude');ok('Switching panel mode hides and restores the same browser window',(await webState()).windows.claude.hwnd===same);
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].minimize());await until(()=>webState().then(s=>!s.windows.claude.visible),'minimize browser');await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.restore();w.focus();});await opened('claude');await aligned('claude');ok('Office minimize and restore also hides and restores browser');
 for(const id of ['gemini','chatgpt']){await service(home,id);await home.locator('[data-ai-command=open]').click();const w=await opened(id);await aligned(id);ok(id+' opens in real browser while other service is hidden',!(await webState()).windows.claude.visible);report.browserWindows.push(w);await new Promise(r=>setTimeout(r,2200));await desktop(id);}
 if(initial.browsers.includes('edge')&&initial.browsers.includes('chrome')){await home.locator('[data-ai-command=detach]').click();await until(()=>webState().then(s=>!s.windows.chatgpt),'detach');await home.locator('.wp-ai-browser').selectOption(initial.browser==='chrome'?'edge':'chrome');await home.locator('[data-ai-command=open]').click();const w=await opened('chatgpt');await aligned('chatgpt');ok('Alternative installed browser opens and aligns',w.browser!==initial.browser);}
 await home.locator('[data-ai-command=detach]').click();await until(()=>webState().then(s=>!s.windows.chatgpt),'detach independent browser');ok('Detach releases window management without ending the browser');
 await home.evaluate(()=>window.aiOffice.newHwp());const editor=await until(()=>app.context().pages().find(p=>p.url().includes('/hwp/renderer/index.html')||p.url().includes('hwp/index.html')),'HWP');await editor.locator('.hwp-app[data-phase="ready"]').waitFor({timeout:60000});await mode(editor,'web');await service(editor,'claude');await opened('claude',editor);await aligned('claude',editor);ok('Existing web browser follows from home into a document');
 const frame=await until(()=>editor.frames().find(f=>f.url().includes('/studio/')),'studio');const input=frame.locator('textarea').first();await input.waitFor({state:'attached'});await input.focus();await input.pressSequentially('Document fixture text');await input.press('End');await app.evaluate(({clipboard})=>clipboard.writeText(' USER COPIED WEB ANSWER'));await editor.locator('[data-ai-command=paste-document]').click();await input.focus();await input.press('ControlOrMeta+A');await input.press('ControlOrMeta+C');await until(()=>app.evaluate(({clipboard})=>clipboard.readText()).then(x=>x.includes('USER COPIED WEB ANSWER')),'paste HWP');ok('Explicit browser-answer clipboard paste works in HWP');
 const file=path.join(root,'browser-test.hwpx');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);await editor.evaluate(()=>window.hwpApi.requestFileCommand('save'));await until(()=>fs.existsSync(file),'saved HWP');
 report.pass=true;
})().catch(async e=>{report.error=String(e);console.error(e);process.exitCode=1;auditBrowserWindows();try{await desktop('failure');}catch{}}).finally(async()=>{fs.writeFileSync(path.join(root,'ui-windows.json'),JSON.stringify(report,null,2));try{await require('../electimes-110/close-app.cjs')(app);}catch(e){console.error(e);process.exitCode=1;}process.exit(process.exitCode||0);});
