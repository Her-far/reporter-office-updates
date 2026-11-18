'use strict';
// Small, audited overlay on the exact published 1.0.9 installer.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const asar=require('../electimes-109/workpanel/build/asar-tools.cjs');
const base=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
if(base===out||out.startsWith(base+path.sep)||fs.existsSync(out))throw Error('Use a new staging directory');
const oldSrc=path.join(__dirname,'../electimes-109/workpanel/src'),src=path.join(__dirname,'workpanel/src');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const original=fs.readFileSync(path.join(base,'resources/app.asar')),archive=asar.parseArchive(original),replacements=new Map();
const pkg=JSON.parse(asar.content(archive,'package.json'));if(pkg.name!=='electimes-office'||pkg.version!=='1.0.9')throw Error('Expected published 1.0.9');
function exact(s,old,next){if(s.split(old).length!==2)throw Error('Unexpected patch anchor: '+old.slice(0,70));return s.replace(old,()=>next);}
const oldHost=fs.readFileSync(path.join(oldSrc,'host-preload.cjs'),'utf8'),newHost=fs.readFileSync(path.join(src,'host-preload.cjs'),'utf8');
const lf=s=>s.replace(/\r\n/g,'\n');
function replaceHost(s){const variants=[...new Set([lf(oldHost),lf(oldHost).replace(/\n/g,'\r\n')])],matches=variants.filter(v=>s.includes(v));if(matches.length!==1)throw Error('Expected one original work panel host');return exact(s,matches[0],newHost);}
function js(name,text){new vm.Script(text);replacements.set(name,Buffer.from(text));}
js('out/preload/index.js',replaceHost(asar.content(archive,'out/preload/index.js').toString()));
const mainName='out/main/work-panel/main.cjs';
if(lf(asar.content(archive,mainName).toString())!==lf(fs.readFileSync(path.join(oldSrc,'main.cjs'),'utf8')))throw Error('Work panel base differs');
js(mainName,fs.readFileSync(path.join(src,'main.cjs'),'utf8'));
js('out/main/work-panel/panel.js',exact(asar.content(archive,'out/main/work-panel/panel.js').toString(),'전기신문 Office 1.0.9 · 업무패널','전기신문 Office 1.0.10 · 업무패널'));
js('out/main/reporter-updater.cjs',exact(asar.content(archive,'out/main/reporter-updater.cjs').toString(),'let version = { version: "1.0.9", build: 109 }','let version = { version: "1.0.10", build: 110 }'));
pkg.version='1.0.10';pkg.electimesModificationNotice='Home panel position and expansion recovery on verified 1.0.9. Original notices retained.';
replacements.set('package.json',Buffer.from(JSON.stringify(pkg,null,2)));
fs.cpSync(base,out,{recursive:true,filter:p=>!['$PLUGINSDIR','Uninstall.exe','uninstall.exe'].includes(path.basename(p))});
fs.writeFileSync(path.join(out,'resources/app.asar'),asar.rewriteArchive(original,replacements));
const changed=new Set(['resources/app.asar','resources/electimes-version.json','BUILD-VERIFICATION.json']);
for(const module of fs.readdirSync(path.join(out,'resources/modules'))){
 const preloads=path.join(out,'resources/modules',module,'preload');if(!fs.existsSync(preloads))continue;
 for(const name of fs.readdirSync(preloads)){if(!name.endsWith('.js'))continue;const file=path.join(preloads,name),s=fs.readFileSync(file,'utf8');const next=replaceHost(s);new vm.Script(next);fs.writeFileSync(file,next);changed.add(path.relative(out,file).split(path.sep).join('/'));}
}
fs.writeFileSync(path.join(out,'resources/electimes-version.json'),JSON.stringify({version:'1.0.10',build:110}));
const installNotes=path.join(out,'ELECTIMES-INSTALL.txt');fs.writeFileSync(installNotes,exact(fs.readFileSync(installNotes,'utf8'),'전기신문 Office 1.0.9','전기신문 Office 1.0.10')+'\n홈 화면도 설정한 패널 위치를 사용합니다. 확대 후에는 ‘패널로 돌아가기’ 버튼이나 Esc로 복귀하세요.\n');changed.add('ELECTIMES-INSTALL.txt');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
let preserved=0;
for(const file of walk(path.join(base,'resources'))){const rel=path.relative(base,file).split(path.sep).join('/');if(changed.has(rel))continue;if(sha(fs.readFileSync(file))!==sha(fs.readFileSync(path.join(out,rel))))throw Error('Unrelated resource changed: '+rel);preserved++;}
const report={version:'1.0.10',baseVersion:'1.0.9',modifiedAsarEntries:[...replacements.keys()],modifiedFiles:[...changed],preservedResources:preserved,baseAsarSha256:sha(original),asarSha256:sha(fs.readFileSync(path.join(out,'resources/app.asar')))};
fs.writeFileSync(path.join(out,'BUILD-VERIFICATION.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
