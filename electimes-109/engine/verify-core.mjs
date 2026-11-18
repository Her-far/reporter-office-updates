import fs from 'node:fs';import path from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
const root=path.dirname(fileURLToPath(import.meta.url)),oldRoot=path.resolve(process.argv[2]),newRoot=path.resolve(process.argv[3]);
const oldFile=path.join(oldRoot,'resources/modules/hwp/renderer/studio/assets/rhwp_bg-BmBlhBaD.wasm'),nextFile=path.join(newRoot,'rhwp_bg.wasm');
const a=fs.readFileSync(oldFile),b=fs.readFileSync(nextFile),oldModule=new WebAssembly.Module(a),newModule=new WebAssembly.Module(b);
assert.deepEqual(WebAssembly.Module.imports(newModule),WebAssembly.Module.imports(oldModule),'WASM imports must match existing bundled glue');
assert.deepEqual(WebAssembly.Module.exports(newModule),WebAssembly.Module.exports(oldModule),'Every existing vendor API must be retained');
const old=await import(pathToFileURL(path.join(oldRoot,'resources/modules/hwp/renderer/studio/rhwp.js'))),next=await import(pathToFileURL(path.join(newRoot,'rhwp.js')));
const oldExports=old.initSync({module:a}),newExports=next.initSync({module:b});
for(const [name,value]of Object.entries(oldExports))if(typeof value==='function')assert.equal(newExports[name]?.length,value.length,'Export arity changed: '+name);
const report={engine:'0.8.7',compatibleExports:WebAssembly.Module.exports(newModule).length,cases:[]};let baselineTitle;
for(const file of ['zones-base','zones-two-bands','zones-parallel']){
 const bytes=Buffer.from(fs.readFileSync(path.join(root,file+'.hwp.b64'),'utf8'),'base64');const before=new old.HwpDocument(bytes),after=new next.HwpDocument(bytes);
 assert.deepEqual(after.exportHwp(),before.exportHwp(),'Layout must not change stored document');assert.equal(after.pageCount(),before.pageCount());
 const tables=JSON.parse(after.getPageControlLayout(0)).controls.filter(x=>x.type==='table');
 if(file==='zones-base')baselineTitle=tables[0].y;
 if(file==='zones-two-bands'){assert(Math.abs(tables[0].y-baselineTitle)<0.2,'Later band must not push earlier title');assert(tables[1].y+tables[1].h<JSON.parse(after.getPageInfo(0)).footerArea.y)}
 else assert.equal(after.getPageTextLayout(0),before.getPageTextLayout(0),'Unrelated layout changed: '+file);
 report.cases.push({fixture:file,storedBytesUnchanged:true,tables:tables.map(x=>({y:x.y,height:x.h}))});before.free();after.free();
}
fs.writeFileSync(path.join(root,'../hwp-engine-windows.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
