'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const source=fs.readFileSync(path.join(__dirname,'../build/update-handoff.cjs'),'utf8');
function fixture(mode='ready'){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'handoff-unit-')),child=Object.assign(new EventEmitter(),{pid:123,exitCode:null,signalCode:null,killed:false,unref(){},kill(){this.killed=true;this.signalCode='SIGTERM'}});
 let ready,commit;
 const module={exports:{}};
 vm.runInNewContext(source,{module,Buffer,process,setTimeout,require:name=>name==='node:child_process'?{spawn(_command,args){
  const script=Buffer.from(args.at(-1),'base64').toString('utf16le');
  ready=script.match(/WriteAllText\('([^']+)'/)[1];commit=script.match(/Test-Path -LiteralPath '([^']+)'/)[1];
  if(mode==='ready')setTimeout(()=>fs.writeFileSync(ready,'ready'),5);else setTimeout(()=>child.emit('error',Error('helper unavailable')),5);
  return child;
 }}:require(name)});
 return {dir,child,api:module.exports,get ready(){return ready},get commit(){return commit}};
}
test('starting helper does not authorize installation; only confirmed quit commits it',async()=>{
 const f=fixture();try{await f.api.prepare({dir:f.dir,script:'Write-Output fixture'});assert(fs.existsSync(f.ready));assert(!fs.existsSync(f.commit));f.api.commit();assert(fs.existsSync(f.commit));f.api.commit();f.api.cancel();assert(!f.child.killed);}finally{fs.rmSync(f.dir,{recursive:true,force:true})}
});
test('cancelled document close kills the waiting helper and cannot install later',async()=>{
 const f=fixture();try{await f.api.prepare({dir:f.dir,script:'Write-Output fixture'});f.api.cancel();assert(f.child.killed);assert(!fs.existsSync(f.ready));assert(!fs.existsSync(f.commit));assert.throws(()=>f.api.commit());}finally{fs.rmSync(f.dir,{recursive:true,force:true})}
});
test('helper startup failure rejects before quit can be requested',async()=>{
 const f=fixture('error');try{await assert.rejects(f.api.prepare({dir:f.dir,script:'Write-Output fixture'}),/helper unavailable/);assert(f.child.killed);assert(!fs.existsSync(f.commit));assert.throws(()=>f.api.commit());}finally{fs.rmSync(f.dir,{recursive:true,force:true})}
});
