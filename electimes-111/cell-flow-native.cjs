'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{_electron}=require('playwright');
const root=__dirname,report={version:'1.0.11',nativePackaged:true,cases:[]};let app,current;
const bundle=path.join(root,'stage/resources/modules/hwp/renderer/studio/assets/index-Bk_t2nzj.js'),original=fs.readFileSync(bundle);
// Read-only inspection. The production bundle is restored before payload verification.
const probe=`\nwindow.__electimesCellFlow=()=>{const d=z.doc;if(!d)return null;const cell=(index)=>Array.from({length:d.getCellParagraphCount(0,0,2,index)},(_,p)=>{const n=d.getCellParagraphLength(0,0,2,index,p),path=JSON.stringify([{controlIndex:2,cellIndex:index,cellParaIndex:p}]);return{text:d.getTextInCell(0,0,2,index,p,0,n),first:JSON.parse(d.getCursorRectByPath(0,0,path,0)),last:JSON.parse(d.getCursorRectByPath(0,0,path,n))}});return{position:U?.cursor.getPosition(),selection:U?.cursor.getSelectionOrdered(),info:JSON.parse(d.getPageInfo(0)),source:cell(0),target:cell(1)}};\n`;
if(!original.toString().includes('window.rhwpStudio={notifySaved:a=>Zw(a),fonts:'))throw Error('Unexpected editor diagnostic anchor');
fs.writeFileSync(bundle,Buffer.concat([original,Buffer.from(probe)]));
async function until(fn,label,ms=45000){const end=Date.now()+ms;while(Date.now()<end){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+label);}
function check(state,label){
  for(let i=1;i<state.target.length;i++){
    const previous=state.target[i-1].last,next=state.target[i].first;
    if(previous.pageIndex!==next.pageIndex){assert(next.pageIndex>previous.pageIndex);continue;}
    assert(next.y>=previous.y+previous.height-0.2,label+': paragraph overlap '+i);
  }
}
(async()=>{
  app=await _electron.launch({executablePath:path.join(root,'stage/Electimes Office.exe'),args:[`--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(),'electimes-cell-flow-'))}`],env:{...process.env,GENOFFICE_NO_SPARE_VIEW:'1',GENOFFICE_LANG:'en'},timeout:60000});
  const home=await app.firstWindow();await home.waitForFunction(()=>window.aiOffice?.openPath,{timeout:45000});
  const welcome=home.locator('.onb-overlay');await welcome.waitFor({state:'visible',timeout:10000}).catch(()=>{});
  if(await welcome.isVisible())await welcome.getByRole('button',{name:/^Skip$|건너뛰기/}).click();
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async(...args)=>{const opts=args.at(-1),discard=opts.buttons?.findIndex(b=>/don't save|저장 안|저장하지/i.test(b));if(discard>=0)return{response:discard,checkboxChecked:false};throw Error('Unexpected dialog: '+opts.message)}});
  for(const mode of ['html','internal']){
    const entry={mode};report.cases.push(entry);
    const fixture=path.join(root,`native-${mode}.hwp`);fs.writeFileSync(fixture,Buffer.from(fs.readFileSync(path.join(root,'engine/cell-flow-flat.hwp.b64'),'utf8'),'base64'));
    const previousPages=new Set(app.context().pages());await home.evaluate(p=>window.aiOffice.openPath(p),fixture);
    const page=await until(()=>app.context().pages().find(p=>!previousPages.has(p)&&(p.url().includes('/hwp/')||p.url().includes('://hwp/'))),'HWP editor');
    await page.locator('.hwp-app[data-phase="ready"]').waitFor({timeout:60000});
    if(await page.locator('.wp-dock').isVisible())await page.locator('.ai-panel-collapse').click();
    const frame=await until(()=>page.frames().find(f=>f.url().includes('/studio/')),'studio');current=frame;
    await frame.locator('.document-page-canvas').first().waitFor();
    await frame.evaluate(()=>document.fonts.ready);await new Promise(r=>setTimeout(r,500));
    const read=()=>frame.evaluate(()=>window.__electimesCellFlow());const before=await read();entry.before=before;check(before,'before');
    const canvas=await frame.locator('.document-page-canvas').first().boundingBox(),scale=canvas.width/before.info.width;
    const point=r=>({x:canvas.x+(r.x+0.6)*scale,y:canvas.y+(r.y+r.height/2)*scale});
    let copied=before.source[0].text;
    if(mode==='internal'){
      const a=point(before.source[0].first),b=point(before.source[0].last);
      await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:15});await page.mouse.up();
      await page.keyboard.press('Control+c');
      copied=await app.evaluate(({clipboard})=>clipboard.readText());
      assert.equal(copied.trim(),before.source[0].text.trim(),'Actual native selection copied the source paragraph');
    }else await app.evaluate(({clipboard},text)=>clipboard.write({text,html:`<span style="font-size:10pt">${text}</span>`}),copied);
    const target=point(before.target[0].first);await page.mouse.click(target.x,target.y);await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Control+v');
    await until(async()=>{const s=await read();return s.target[0].text.length>before.target[0].text.length;},'paste changes paragraph');
    entry.pasted=await read();check(entry.pasted,'paste');
    assert.equal(entry.pasted.target[0].text,before.target[0].text.slice(0,2)+copied+before.target[0].text.slice(2));
    assert.deepEqual(entry.pasted.target.slice(1).map(p=>p.text),before.target.slice(1).map(p=>p.text));
    await page.keyboard.press('Enter');await until(async()=>((await read()).target.length===before.target.length+1),'Enter splits paragraph');
    entry.entered=await read();check(entry.entered,'Enter');
    await page.keyboard.press('Backspace');await until(async()=>((await read()).target.length===before.target.length),'Backspace merges paragraph');
    check(await read(),'Backspace');
    for(let i=0;i<3;i++)await page.keyboard.press('Control+z');
    await until(async()=>JSON.stringify((await read()).target.map(p=>p.text))===JSON.stringify(before.target.map(p=>p.text)),'undo restores text');
    entry.undo=await read();check(entry.undo,'undo');
    await page.keyboard.press('Control+y');await until(async()=>((await read()).target[0].text.length>before.target[0].text.length),'redo paste');
    entry.redo=await read();check(entry.redo,'redo');
    await page.screenshot({path:path.join(root,`cell-flow-${mode}-windows.png`)});
    entry.keyboardPaste=true;entry.undoRedo=true;entry.noOverlap=true;
    await home.locator('.tab-close').last().click();await page.waitForEvent('close',{timeout:5000}).catch(()=>{});
  }
  console.log(JSON.stringify({nativeKeyboardCases:report.cases.length,undoRedo:true,noOverlap:true}));
})().catch(async e=>{report.error=String(e);if(current)try{report.state=await current.evaluate(()=>window.__electimesCellFlow())}catch{}console.error(e);process.exitCode=1;}).finally(async()=>{
  fs.writeFileSync(path.join(root,'cell-flow-windows.json'),JSON.stringify(report,null,2));
  try{await require('./close-app.cjs')(app);}catch(e){console.error(e);process.exitCode=1;}finally{fs.writeFileSync(bundle,original);}
});
