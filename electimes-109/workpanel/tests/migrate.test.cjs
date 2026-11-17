const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {importTestPanel}=require('../src/migrate.cjs');
test('test panel migration preserves notes, encrypted connections and source without replacing production data',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'panel-migrate-'));
 try{
  const from=path.join(root,'ElectimesOffice-WorkPanel-Test','work-panel'),prod=path.join(root,'Electimes Office');
  await fs.mkdir(path.join(from,'secure'),{recursive:true});
  await fs.writeFile(path.join(from,'notes.json'),'{"notes":[{"title":"취재"}]}');
  await fs.writeFile(path.join(from,'settings.json'),'{"width":620}');
  await fs.writeFile(path.join(from,'secure/mail-reader.sealed'),Buffer.from([0,3,7,9]));
  await fs.writeFile(path.join(from,'unrelated.txt'),'do not copy');
  const r=await importTestPanel(root,prod);assert.equal(r.status,'imported');
  for(const name of r.files)assert.deepEqual(await fs.readFile(path.join(prod,'work-panel',name)),await fs.readFile(path.join(from,name)));
  await assert.rejects(fs.access(path.join(prod,'work-panel/unrelated.txt')));
  await fs.writeFile(path.join(prod,'work-panel/notes.json'),'production changes');
  await fs.rm(path.join(prod,'work-panel/secure/mail-reader.sealed')); // intentional disconnect
  assert.equal((await importTestPanel(root,prod)).status,'existing');
  assert.equal(await fs.readFile(path.join(prod,'work-panel/notes.json'),'utf8'),'production changes');
  await assert.rejects(fs.access(path.join(prod,'work-panel/secure/mail-reader.sealed')));
  assert.equal(await fs.readFile(path.join(from,'notes.json'),'utf8'),'{"notes":[{"title":"취재"}]}');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('migration leaves missing test profiles and existing production folders alone',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'panel-migrate-'));
 try{const prod=path.join(root,'Electimes Office');assert.equal((await importTestPanel(root,prod)).status,'missing');await assert.rejects(fs.access(prod));await fs.mkdir(path.join(prod,'work-panel'),{recursive:true});assert.equal((await importTestPanel(root,prod)).status,'existing');}finally{await fs.rm(root,{recursive:true,force:true});}
});
