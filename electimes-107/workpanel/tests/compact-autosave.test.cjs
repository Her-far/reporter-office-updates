/* Actual bundled React host + WASM editor, with native IPC stubbed in Chromium. */
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'));
const root=path.resolve(process.argv[2]||'dist-107/compact-stage/resources');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.woff2':'font/woff2','.ttf':'font/ttf'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:process.env.CHROMIUM_BINARY,headless:true,args:['--no-sandbox']});try{
 const page=await browser.newPage({viewport:{width:1200,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  localStorage.setItem('hwpapp.showAi','0');
  window.hwpApi=new Proxy({}, {get:(_,name)=>{
   if(String(name).startsWith('on'))return()=>()=>{};
   const values={getLanguage:'ko',getTheme:'light',getAiPanelPrefs:{},getAiSettings:{},getNewDocumentFont:{fontFamily:'바탕',fontSize:13},getAutoSaveDefault:{on:false,updatedAt:0},getAuthorName:'',getMemoModalOpen:false,trackingDropped:false};
   return async()=>values[name]??null;
  }});
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/modules/hwp/renderer/index.html');
 await page.locator('.hwp-app[data-phase="ready"]').waitFor({timeout:60000});
 const frame=page.frameLocator('.hwp-editor-host iframe');const toggle=frame.getByRole('checkbox',{name:'자동 저장'});
 await toggle.waitFor();assert.equal(await page.locator('.hwp-topbar').count(),0);
 assert.equal(await page.locator('.app-main').evaluate(n=>n.getBoundingClientRect().top),0);
 await toggle.check();assert(await toggle.isChecked());await page.waitForTimeout(100);
 const stored=await page.evaluate(()=>localStorage.getItem('hwpapp.autoSave'));assert(stored,'preference not persisted');
 await page.reload();await page.locator('.hwp-app[data-phase="ready"]').waitFor({timeout:60000});await toggle.waitFor();assert(await toggle.isChecked());
 await toggle.focus();await page.keyboard.press('Space');assert(!(await toggle.isChecked()));
 console.log('PASS: original React switch toggles, persists on reload and supports keyboard Space; separate row removed');
 for(const width of [1200,500,320,1200]){
  await page.setViewportSize({width,height:800});await page.waitForTimeout(150);
  const box=await toggle.boundingBox(),menu=await frame.locator('#menu-bar').boundingBox();assert(box&&menu);assert(box.x>=menu.x+menu.width-1);assert(box.x+box.width<=width+1);
  assert.equal(await frame.locator('.wp-autosave-slot').count(),1);
  if(width===320){await frame.getByRole('button',{name:'다음 상단 메뉴'}).click();await page.waitForTimeout(400);assert(await frame.locator('#menu-bar').evaluate(n=>n.scrollLeft>0));}
 }
 await page.screenshot({path:'dist-107/compact-autosave.png'});
 assert.deepEqual(errors,[]);console.log('PASS: real editor loads; autosave and horizontal menu coexist at 320–1200px without overlap');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exit(1);});
