'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const asar=require('../build/asar-tools.cjs'),patch=require('../build/update-download-confirm.cjs');
const exact=(s,before,after)=>{assert.equal(s.split(before).length,2);return s.replace(before,()=>after)};
const base=process.env.BASE_ASAR;
if(!base)throw Error('Set BASE_ASAR to the verified production 1.0.6 archive');
const archive=asar.parseArchive(fs.readFileSync(base));
const bundles=asar.filesOf(archive.header).filter(([name])=>/^out\/renderer\/.*\.js$/.test(name)).map(([name])=>[name,asar.content(archive,name).toString()]).filter(([,source])=>source.includes('function ReporterUpdatePane()'));
assert.equal(bundles.length,2);
function handler(source,api,state,setState){
  const start=source.indexOf('  const install = () => act(async () => {',source.indexOf('function ReporterUpdatePane()'));
  const end=source.indexOf('\n  return ',start);
  assert(start>=0&&end>start);
  return vm.runInNewContext(source.slice(start,end)+'\ninstall;',{
    api,api2:api,state,setState,act:fn=>fn()
  });
}
for(const [name,source] of bundles){
 test(name+': reproduce released handler auto-installing after download',async()=>{
  let installs=0;
  await handler(source,{download:async()=>({phase:'ready'}),install:async()=>installs++},{phase:'available'},()=>{})();
  assert.equal(installs,1);
 });
 for(const cached of [false,true])test(name+': '+(cached?'cached':'fresh')+' download waits for another click',async()=>{
  let installs=0,downloads=0,next;
  const api={download:async()=>{downloads++;if(!cached)await new Promise(r=>setTimeout(r,10));return {phase:'ready',percent:100}},install:async()=>installs++};
  const fixed=patch(source,exact);
  await handler(fixed,api,{phase:'available'},s=>next=s)();
  assert.equal(next.phase,'ready');assert.equal(downloads,1);assert.equal(installs,0);
  await handler(fixed,api,next,s=>next=s)();
  assert.equal(downloads,1);assert.equal(installs,1);
 });
 test(name+': cancelled/failed downloads cannot install',async()=>{
  let installs=0,next;
  await handler(patch(source,exact),{download:async()=>({phase:'error'}),install:async()=>installs++},{phase:'available'},s=>next=s)();
  assert.equal(next.phase,'error');assert.equal(installs,0);
 });
}
