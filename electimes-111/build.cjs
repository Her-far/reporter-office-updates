'use strict';
// Engine-only correction over the exact production 1.0.10 payload.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const asar=require('../electimes-109/workpanel/build/asar-tools.cjs');
const base=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
if(base===out||out.startsWith(base+path.sep)||fs.existsSync(out))throw Error('Use a new staging directory');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const original=fs.readFileSync(path.join(base,'resources/app.asar')),archive=asar.parseArchive(original),replacements=new Map();
const pkg=JSON.parse(asar.content(archive,'package.json'));
if(pkg.name!=='electimes-office'||pkg.version!=='1.0.10')throw Error('Expected published 1.0.10');
function exact(s,a,b){if(s.split(a).length!==2)throw Error('Unexpected version anchor');return s.replace(a,()=>b);}
for(const [name,a,b]of [
  ['out/main/work-panel/panel.js','전기신문 Office 1.0.10 · 업무패널','전기신문 Office 1.0.11 · 업무패널'],
  ['out/main/reporter-updater.cjs','let version = { version: "1.0.10", build: 110 }','let version = { version: "1.0.11", build: 111 }'],
]){const s=exact(asar.content(archive,name).toString(),a,b);new vm.Script(s);replacements.set(name,Buffer.from(s));}
pkg.version='1.0.11';pkg.electimesModificationNotice='HWP cell paste and range deletion reconnect subsequent paragraph positions. Existing notices and 1.0.10 panel fixes retained.';
replacements.set('package.json',Buffer.from(JSON.stringify(pkg,null,2)));
fs.cpSync(base,out,{recursive:true,filter:p=>!['$PLUGINSDIR','Uninstall.exe','uninstall.exe'].includes(path.basename(p))});
fs.writeFileSync(path.join(out,'resources/app.asar'),asar.rewriteArchive(original,replacements));
const wasm=require('../electimes-109/workpanel/build/hwp-engine.cjs')(out);
fs.writeFileSync(path.join(out,'resources/electimes-version.json'),JSON.stringify({version:'1.0.11',build:111}));
const notes=path.join(out,'ELECTIMES-INSTALL.txt');
fs.writeFileSync(notes,exact(fs.readFileSync(notes,'utf8'),'전기신문 Office 1.0.10','전기신문 Office 1.0.11')+'\nHWP 표 안에서 붙여넣기·잘라내기 후 문단이 겹치거나 이전 간격이 남는 문제를 수정했습니다.\n');
const changed=new Set(['resources/app.asar','resources/electimes-version.json','ELECTIMES-INSTALL.txt','BUILD-VERIFICATION.json',wasm]);
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
let preserved=0;
for(const file of walk(path.join(base,'resources'))){
  const rel=path.relative(base,file).split(path.sep).join('/');
  if(changed.has(rel)||rel.startsWith('resources/electimes-hwp-engine/'))continue;
  if(sha(fs.readFileSync(file))!==sha(fs.readFileSync(path.join(out,rel))))throw Error('Unrelated resource changed: '+rel);
  preserved++;
}
const report={version:'1.0.11',baseVersion:'1.0.10',modifiedAsarEntries:[...replacements.keys()],modifiedFiles:[...changed],preservedResources:preserved,engineSha256:sha(fs.readFileSync(path.join(out,wasm))),baseAsarSha256:sha(original)};
fs.writeFileSync(path.join(out,'BUILD-VERIFICATION.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
