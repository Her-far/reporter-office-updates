const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {randomUUID}=require('node:crypto'),{NotesStore}=require('../src/notes.cjs'),{settingsOf,DEFAULTS}=require('../src/policy.cjs');
test('notes and checkbox completion survive restart, rapid writes preserve latest edit, deletion persists',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'wp-notes-')),file=path.join(dir,'notes.json');try{
  const a=new NotesStore(file);await a.init();const n=await a.create();n.title='취재 메모';n.body='원고 확인';n.todos=[{id:randomUUID(),text:'자료 확인',done:false}];await a.update(n);
  await Promise.all(['초안','최종 초안','최종 원고'].map(body=>a.update({...n,body,todos:n.todos.map(t=>({...t,done:true}))})));await a.flush();
  const b=new NotesStore(file);await b.init();assert.equal(b.notes[0].body,'최종 원고');assert.equal(b.notes[0].todos[0].done,true);assert.equal(b.notes[0].title,'취재 메모');
  await b.remove(n.id);const c=new NotesStore(file);await c.init();assert.equal(c.notes.length,0);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('corrupt primary recovers backup without discarding original data; corrupt both forbids writes',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'wp-notes-')),file=path.join(dir,'notes.json');try{
  const a=new NotesStore(file);await a.init();const n=await a.create();await a.update({...n,body:'백업 원고'});await a.update({...n,body:'새 원고'});await fs.writeFile(file,'broken');
  const b=new NotesStore(file);await b.init();assert.equal(b.notes[0].body,'백업 원고');assert(b.warning);await b.update({...b.notes[0],body:'복구 원고'});const c=new NotesStore(file);await c.init();assert.equal(c.notes[0].body,'복구 원고');
  await fs.writeFile(file,'broken');await fs.writeFile(file+'.bak','broken');const d=new NotesStore(file);await assert.rejects(d.init(),/notes-read/);await assert.rejects(d.create(),/notes-read/);assert.equal(await fs.readFile(file,'utf8'),'broken');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('shared panel width is bounded, legacy mail width ignored; old agenda selection migrates to notes',()=>{
 const p=settingsOf({menu:'schedule',defaultMenu:'schedule',mailWidth:900,mailZoom:0.85});assert.equal(p.menu,'notes');assert.equal(p.defaultMenu,'notes');assert.equal(p.width,400);assert.equal(p.mailWidth,undefined);assert.equal(p.mailZoom,0.85);assert.equal(DEFAULTS.width,400);assert.equal(DEFAULTS.panelWidthVersion,1);
 assert.equal(settingsOf({mailWidth:9999,mailZoom:100}).mailZoom,1.5);assert.equal(settingsOf({width:1,mailZoom:0}).width,300);
});

test('quit waits only while a note write is outstanding',async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'wp-quit-'));try{const s=new NotesStore(path.join(dir,'notes.json'));await s.init();assert.equal(s.flushRequired,false);const pending=s.create();assert.equal(s.flushRequired,true);await pending;assert.equal(s.flushRequired,false);await s.flush();}finally{await fs.rm(dir,{recursive:true,force:true});}});
