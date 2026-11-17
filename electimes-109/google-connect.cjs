// Fresh installed-user flow plus real relay/Google protocol check; no personal account sign-in.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{_electron}=require('playwright');
const config=require('./workpanel/src/google-deployment.cjs');
const deadline=setTimeout(()=>{console.error('Google connection test timed out');process.exit(1);},180000);deadline.unref();
let app,profile;
async function until(fn,label){const end=Date.now()+40000;while(Date.now()<end){const r=await fn();if(r)return r;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout: '+label);}
(async()=>{
 app=await _electron.launch({executablePath:path.join(__dirname,'stage/Electimes Office.exe'),env:{...process.env,GENOFFICE_NO_SPARE_VIEW:'1',GENOFFICE_LANG:'en'},timeout:60000});
 const page=await app.firstWindow();await page.waitForFunction(()=>window.aiOffice&&window.aiOfficeTabs,{timeout:45000});
 const welcome=page.locator('.onb-overlay');await welcome.waitFor({state:'visible',timeout:10000}).catch(()=>{});if(await welcome.isVisible())await welcome.getByRole('button',{name:/^Skip$|건너뛰기/}).click();
 await page.locator('.wp-toolbar [data-menu=calendar]').click();
 const panelEval=script=>app.evaluate(async({webContents},code)=>{const wc=webContents.getAllWebContents().find(w=>w.getURL().includes('/work-panel/index.html'));if(!wc)return null;return wc.executeJavaScript(code);},script);
 const state=await until(async()=>{const r=await panelEval("workPanel.action('state')");return r?.state||null;},'fresh calendar');
 assert.equal(state.version,'1.0.9');assert.equal(state.calendar.configured,true);assert.equal(state.calendar.connected,false);assert.equal(state.calendar.viaRelay,true);
 profile=await app.evaluate(({app})=>app.getPath('userData'));
 assert(!fs.existsSync(path.join(profile,'work-panel/secure/google-client.sealed')),'Fresh test must not rely on imported settings');
 await until(()=>panelEval("[...document.querySelectorAll('button')].some(b=>b.textContent==='구글 계정 연결')"),'connect button');
 const text=await panelEval('document.body.innerText');assert(!text.includes('설정 파일 가져오기'));assert(!text.includes('OAuth JSON'));
 await app.evaluate(({shell})=>{process.__calendarTestURLs=[];shell.openExternal=async u=>{process.__calendarTestURLs.push(u);};});
 await panelEval("[...document.querySelectorAll('button')].find(b=>b.textContent==='구글 계정 연결').click()");
 const login=await until(()=>app.evaluate(()=>process.__calendarTestURLs[0]),'system browser login');
 const url=new URL(login);assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.searchParams.get('client_id'),config.client_id);assert.equal(url.searchParams.get('prompt'),'select_account consent');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert(!url.searchParams.has('client_secret'));assert.equal(new URL(url.searchParams.get('redirect_uri')).hostname,'127.0.0.1');
 await panelEval("workPanel.action('google-cancel')");
 await until(async()=>{const r=await panelEval("workPanel.action('state')");return !r.state.calendar.connecting;},'cancel');
 const network=await app.evaluate(async({net},config)=>{
  const h=await net.fetch(new URL('/health',config.tokenEndpoint).href,{redirect:'error'});const health=await h.json();
  const p=await net.fetch(config.tokenEndpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.client_id,grant_type:'authorization_code',code:'invalid-native-regression-probe',code_verifier:'a'.repeat(43),redirect_uri:'http://127.0.0.1:49152/oauth/'+'b'.repeat(22)}).toString()});const probe=await p.json();
  return {healthStatus:h.status,health,probeStatus:p.status,probe};
 },config);
 assert.equal(network.healthStatus,200);assert.equal(network.health.configured,true);
 assert.equal(network.probeStatus,400);assert.deepEqual(network.probe,{error:'invalid_grant'},'Relay must reach Google with valid app registration and reject only the synthetic code');
 const report={version:'1.0.9',platform:'win32',freshProfile:true,noConfigImport:true,accountSelection:true,pkce:true,cancellation:true,liveRelayHealthy:true,googleTokenEndpointReached:true,personalAccountSignInTested:false};
 fs.writeFileSync(path.join(__dirname,'google-connect-windows.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{try{await require('./close-app.cjs')(app);}catch(e){console.error(e);process.exitCode=1;}if(profile)fs.rmSync(path.join(profile,'work-panel'),{recursive:true,force:true});process.exit(process.exitCode||0);});
