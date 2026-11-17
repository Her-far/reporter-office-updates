const deadline=setTimeout(()=>{console.error('Work panel native test exceeded 180 seconds');process.exit(1);},180000);deadline.unref();
// Native packaged Windows workflow; synthetic notes only, no live account login.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{_electron}=require('playwright');
const root=__dirname,source=path.join(process.env.APPDATA,'ElectimesOffice-WorkPanel-Test','work-panel');
fs.mkdirSync(source,{recursive:true});
const notes={version:1,notes:[{id:'11111111-1111-4111-8111-111111111111',title:'통합 확인 메모',body:'취재 메모 보존',todos:[],updatedAt:'2026-11-17T00:00:00Z'}]};
fs.writeFileSync(path.join(source,'notes.json'),JSON.stringify(notes));fs.writeFileSync(path.join(source,'settings.json'),JSON.stringify({menu:'notes',width:620,panelWidthVersion:1}));
// Synthetic local upgrade registration exercises real Windows encryption;
// this test-only credential is never a live Google credential.
const fixtureClient=Buffer.from(JSON.stringify({installed:{client_id:'fixture.apps.googleusercontent.com',client_secret:'not-a-live-credential'}}));
const fixtureHeader=Buffer.from(JSON.stringify({files:{out:{files:{main:{files:{'work-panel':{files:{'google-client.json':{size:fixtureClient.length,offset:'0'}}}}}}}}}));
const padded=(fixtureHeader.length+3)&~3,fixturePrefix=Buffer.alloc(16+padded);
fixturePrefix.writeUInt32LE(4,0);fixturePrefix.writeUInt32LE(8+padded,4);fixturePrefix.writeUInt32LE(4+padded,8);fixturePrefix.writeUInt32LE(fixtureHeader.length,12);fixtureHeader.copy(fixturePrefix,16);
const upgradeArchive=path.join(root,'stage/resources/workpanel-upgrade.asar');
fs.writeFileSync(upgradeArchive,Buffer.concat([fixturePrefix,fixtureClient]));
let app;async function until(fn,label){const end=Date.now()+45000;while(Date.now()<end){const r=await fn();if(r)return r;await new Promise(r=>setTimeout(r,150));}throw Error('Timeout: '+label);}
(async()=>{
 app=await _electron.launch({executablePath:path.join(root,'stage/Electimes Office.exe'),env:{...process.env,GENOFFICE_NO_SPARE_VIEW:'1',GENOFFICE_LANG:'en'},timeout:60000});
 console.log('Launched packaged app');const page=await app.firstWindow();await page.waitForFunction(()=>window.aiOffice&&window.aiOfficeTabs,{timeout:45000});
 const welcome=page.locator('.onb-overlay');await welcome.waitFor({state:'visible',timeout:10000}).catch(()=>{});if(await welcome.isVisible())await welcome.getByRole('button',{name:/^Skip$|건너뛰기/}).click();
 console.log('Home ready, opening notes');await page.locator('.wp-toolbar [data-menu=notes]').click();console.log('Notes tab clicked');
 const getState=()=>app.evaluate(async({webContents})=>{const wc=webContents.getAllWebContents().find(w=>w.getURL().includes('/work-panel/index.html'));if(!wc)return null;try{return (await wc.executeJavaScript("workPanel.action('state')")).state}catch{return null}});
 const state=await until(async()=>{const s=await getState();return s?.notes?.length?s:null},'migrated notes');assert.equal(state.notes[0].body,notes.notes[0].body);assert.equal(state.calendar.configured,true,JSON.stringify(state.calendar));assert.equal(state.version,'1.0.7');
 console.log('Migration verified');const widths=[];
 for(const menu of ['ai','mail','calendar','notes']){await page.locator('.wp-toolbar [data-menu='+menu+']').click();await until(async()=>await page.locator('.wp-dock').getAttribute('data-wp-menu')===menu,'tab '+menu);widths.push(await page.locator('.wp-dock').evaluate(e=>Math.round(e.getBoundingClientRect().width)));}
 assert.equal(new Set(widths).size,1);assert(!await page.locator('.wp-toolbar').innerText().then(t=>t.includes('TEST')));
 const profile=await app.evaluate(({app})=>app.getPath('userData'));assert(fs.existsSync(path.join(profile,'work-panel/imported-from-test.json')));assert.deepEqual(JSON.parse(fs.readFileSync(path.join(source,'notes.json'))),notes);
 assert(!fs.existsSync(upgradeArchive));assert(fs.existsSync(path.join(profile,'work-panel/secure/google-client.sealed')));assert(!fs.readFileSync(path.join(profile,'work-panel/secure/google-client.sealed')).includes(Buffer.from('not-a-live-credential')));
 const updater=await page.evaluate(()=>window.aiOffice.reporterUpdates.state());assert.equal(updater.currentVersion,'1.0.7');assert.equal(updater.currentBuild,107);
 const report={version:'1.0.7',nativePackaged:true,noteMigration:true,testSourcePreserved:true,sharedWidths:widths,googleClientMigratedLocally:true,productionUpdaterEnabled:true,liveAccountsTested:false};fs.writeFileSync(path.join(root,'workpanel-windows.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{try{await require('./close-app.cjs')(app);}catch(e){console.error(e);process.exitCode=1;}process.exit(process.exitCode||0);});
