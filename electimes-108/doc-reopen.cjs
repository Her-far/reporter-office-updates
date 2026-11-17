// Drives the unmodified packaged Windows app against an isolated test profile.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {_electron}=require('playwright');
const root=__dirname,profile=fs.mkdtempSync(path.join(os.tmpdir(),'electimes-doc-reopen-'));
fs.writeFileSync(path.join(profile,'app-settings.json'),JSON.stringify({onboardingSeen:true}));
fs.writeFileSync(path.join(profile,'ai-settings.json'),JSON.stringify({providers:{},subscriptionNoticeSeen:true}));
const fixture=path.join(root,'재열기 검증.doc');
const original=Buffer.from(fs.readFileSync(path.join(root,'../electimes-106/fixture.doc.b64'),'utf8'),'base64');fs.writeFileSync(fixture,original);
const results=[],dialogs=[];let app;
async function until(fn,what,timeout=45000){const end=Date.now()+timeout;while(Date.now()<end){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,100))}throw Error('Timed out: '+what)}
(async()=>{app=await _electron.launch({executablePath:path.resolve(process.argv[2]||path.join(root,'stage/Electimes Office.exe')),args:[`--user-data-dir=${profile}`],env:{...process.env,GENOFFICE_NO_SPARE_VIEW:'1',GENOFFICE_LANG:'en'},timeout:60000});
const page=await app.firstWindow();await page.waitForFunction(()=>window.aiOffice&&window.aiOfficeTabs,{timeout:45000});
// Packaged editions may use their own settings location; dismiss the real first-run UI.
const welcome=page.locator('.onb-overlay');await welcome.waitFor({state:'visible',timeout:10000}).catch(()=>{});if(await welcome.isVisible())await welcome.getByRole('button',{name:/^Skip$|건너뛰기/}).click();

await app.evaluate(({dialog})=>{globalThis.__docTestDialogs=[];dialog.showMessageBox=async(...args)=>{const opts=args.at(-1);globalThis.__docTestDialogs.push({type:opts.type,message:opts.message});const discard=opts.buttons?.findIndex(b=>/don't save|저장 안|저장하지/i.test(b));if(discard>=0)return{response:discard,checkboxChecked:false};throw Error('Unexpected dialog: '+opts.message)}});
async function opened(){const tabs=await until(async()=>{const all=await page.evaluate(()=>window.aiOfficeTabs.list());return all.filter(t=>t.kind==='docs').length===1?all:null},'one DOCX tab');const tab=tabs.find(t=>t.kind==='docs');assert.equal(tab.active,true);assert.match(tab.title,/재열기 검증.*docx/i);
const wcId=await until(()=>app.evaluate(async({webContents})=>{const w=webContents.getAllWebContents().filter(w=>!w.isDestroyed()&&!w.isCrashed()&&w.getURL().includes('://docs/')).at(-1);if(!w)return false;try{return await w.executeJavaScript('document.querySelector(".doc-page")?.innerText.includes("전력시장 DOC 편집 시험")')?w.id:false}catch{return false}}),'rendered Korean DOC content');return{tabId:tab.id,wcId};}
async function close(){await page.locator('.tab-close').last().click();await until(async()=>!(await page.evaluate(()=>window.aiOfficeTabs.list())).some(t=>t.kind==='docs'),'DOC tab closed');}
await page.evaluate(p=>window.aiOffice.openPath(p),fixture);let last=await opened();results.push({entry:'initial',...last});
for(const entry of ['recent-double-click','drop','recent-double-click','drop']){await close();if(entry==='recent-double-click'){await page.locator('.nav-item').filter({hasText:/Recent|최근/}).first().click();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.locator('.recent-item').filter({hasText:'재열기 검증.doc'}).first().dblclick();}else{await page.evaluate(()=>{const input=document.createElement('input');input.type='file';input.id='doc-reopen-test-file';input.hidden=true;document.body.append(input)});await page.locator('#doc-reopen-test-file').setInputFiles(fixture);await page.evaluate(()=>{const input=document.querySelector('#doc-reopen-test-file'),dataTransfer=new DataTransfer();for(const file of input.files)dataTransfer.items.add(file);window.dispatchEvent(new DragEvent('drop',{dataTransfer,bubbles:true,cancelable:true}));input.remove()});}const current=await opened();assert.notEqual(current.wcId,last.wcId);results.push({entry,...current});last=current;}
// Opening the same still-open source must preserve that document's renderer.
await page.evaluate(p=>window.aiOffice.openPath(p),fixture);assert.equal((await opened()).wcId,last.wcId);
await close();assert.deepEqual(fs.readFileSync(fixture),original);
const ds=await app.evaluate(()=>globalThis.__docTestDialogs);assert.equal(ds.some(d=>d.type==='error'),false);
const report={version:'1.0.8',platform:process.platform,packagedApp:true,realDocContentRendered:true,cycles:results,openDocumentReused:true,originalUnchanged:true,savePromptHandledByTest:true};
fs.writeFileSync(path.join(root,'doc-reopen-windows.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(async e=>{console.error(e);if(app){try{console.error('UI:',await(await app.firstWindow()).locator('body').innerText());console.error('Tabs:',await(await app.firstWindow()).evaluate(()=>window.aiOfficeTabs.list()));}catch{}}process.exitCode=1}).finally(async()=>{await require('./close-app.cjs')(app)});
