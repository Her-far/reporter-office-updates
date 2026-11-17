/* Investigation probe: synthetic blank paragraphs. A pass does not reproduce or resolve the reported document-specific bug. */
const http=require('http'),fs=require('fs'),path=require('path');const {chromium}=require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'));
const root=path.resolve(process.argv[2]||'dist/base-app/resources');const server=http.createServer((req,res)=>{let file=path.join(root,decodeURIComponent(new URL(req.url,'http://local').pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}try{let b=fs.readFileSync(file);if(file.endsWith('index-Bk_t2nzj.js'))b=Buffer.concat([b,Buffer.from('\nwindow.__wpQA={wasm:z,get input(){return U},get viewer(){return Q},load:xa,newDoc:Zu,eventBus:q};')]);const ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.woff2':'font/woff2','.ttf':'font/ttf'})[ext]||'application/octet-stream');res.end(b);}catch{res.writeHead(404);res.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:process.env.CHROMIUM_BINARY,headless:true,args:['--no-sandbox']});try{const page=await browser.newPage();page.on('pageerror',e=>console.log('PAGEERROR',e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/modules/hwp/renderer/studio/index.html');await page.waitForFunction(()=>window.__wpQA,{timeout:45000});await page.waitForTimeout(3000);await page.evaluate(()=>{__wpQA.input.textarea.focus();});
await page.keyboard.insertText('첫째 문단');await page.keyboard.press('Enter');await page.keyboard.press('Enter');await page.keyboard.insertText('둘째 문단');await page.keyboard.press('Enter');await page.keyboard.press('Enter');await page.keyboard.insertText('마지막 문단');
const snapshot=()=>page.evaluate(()=>{const w=__wpQA.wasm;return Array.from({length:w.getParagraphCount(0)},(_,p)=>({p,text:w.getTextRange(0,p,0,w.getParagraphLength(0,p)),rect:w.getCursorRect(0,p,0)}));});

for(const format of ['Hwp','Hwpx']){
 console.log('BEFORE'+format,await snapshot());
 await page.evaluate(async format=>{const w=__wpQA.wasm;window.saved=w['export'+format]();await __wpQA.load(window.saved,'regression.'+format.toLowerCase(),null,performance.now(),{skipRecent:true,suppressDialogs:true});},format);
 console.log('AFTERLOAD'+format,await snapshot());
 await page.evaluate(()=>{const i=__wpQA.input;i.cursor.moveTo({sectionIndex:0,paragraphIndex:2,charOffset:0});i.updateCaret();i.textarea.focus();const d=new DataTransfer;d.setData('text/plain','※');d.setData('text/html','<html><body><!--StartFragment--><span style="font-size:13pt;font-family:바탕">※</span><!--EndFragment--></body></html>');i.textarea.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:d}));});
 await page.waitForTimeout(300);console.log('AFTERPASTE'+format,await snapshot());
 await page.keyboard.press('Control+End');await page.keyboard.press('Enter');console.log('AFTERENTER'+format,await snapshot());
}
await page.evaluate(async()=>{await __wpQA.newDoc();const i=__wpQA.input;i.textarea.focus();const d=new DataTransfer;d.setData('text/plain','첫째 문단\n\n둘째 문단\n\n마지막 문단');d.setData('text/html','<html><body><!--StartFragment--><p>첫째 문단</p><p><br></p><p>둘째 문단</p><p><br></p><p>마지막 문단</p><!--EndFragment--></body></html>');i.textarea.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:d}));});
await page.waitForTimeout(300);console.log('AFTERHTML',await snapshot());
await page.evaluate(async()=>{await __wpQA.load(__wpQA.wasm.exportHwpx(),'html.hwpx',null,performance.now(),{skipRecent:true,suppressDialogs:true});});
console.log('AFTERHTMLLOAD',await snapshot());
await page.keyboard.press('Control+End');await page.keyboard.press('Enter');console.log('AFTERHTMLENTER',await snapshot());
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exit(1)});
