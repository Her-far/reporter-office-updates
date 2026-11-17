// Uses the actual original and rebuilt shell, not a reimplementation of its guard.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const asar=require('../build/asar-tools.cjs');
const {mailUrl}=require('../src/policy.cjs');
const original=process.argv[2],rebuilt=process.argv[3];
if(!original||!rebuilt)throw Error('Pass original app.asar and rebuilt app.asar');
function setup(file){
 const archive=asar.parseArchive(fs.readFileSync(file));
 const source=asar.content(archive,'out/main/index.js').toString();
 const start=source.indexOf('function installNavigationGuard(app) {');
 const end=source.indexOf('const DROP_OPEN_CHANNEL',start);
 assert(start>=0&&end>start);
 const app=new EventEmitter(),members=new WeakSet();
 vm.runInNewContext('const INSTALLED=Symbol();'+source.slice(start,end)+';installNavigationGuard(app);',
 {app,require:name=>{assert.equal(name,'./work-panel/main.cjs');return {isMailContents:wc=>members.has(wc)};}});
 const wc=new EventEmitter();wc.getURL=()=> 'https://auth.worksmobile.com/';wc.setWindowOpenHandler=()=>{};
 app.emit('web-contents-created',{},wc);
 return {wc,members};
}
function navigate(wc,url){const e={url,blocked:false,preventDefault(){this.blocked=true;}};wc.emit('will-navigate',e,url);return e.blocked;}
const old=setup(original);old.members.add(old.wc);
assert(navigate(old.wc,'https://mail.worksmobile.com/'));console.log('PASS: reproduced original global guard blocking registered mail navigation');
const current=setup(rebuilt);
assert(navigate(current.wc,'https://mail.worksmobile.com/'));console.log('PASS: unregistered editor remains blocked');
current.members.add(current.wc);
// The actual dedicated policy remains attached in secureRemote (covered by core tests).
current.wc.on('will-navigate',(e,url)=>{if(url!=='about:blank'&&!mailUrl(url))e.preventDefault();});
assert(!navigate(current.wc,'https://mail.worksmobile.com/'));console.log('PASS: registered mail reaches official mailbox');
assert(!navigate(current.wc,'https://auth.worksmobile.com/login'));console.log('PASS: registered mail reaches official authentication');
for(const url of ['https://worksmobile.com.evil.example/','file:///C:/Windows/system.ini','javascript:alert(1)']){
 assert(navigate(current.wc,url));console.log('PASS: unsafe navigation still blocked: '+new URL(url).protocol);
}
