'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const asar=require('../electimes-109/workpanel/build/asar-tools.cjs');
const base=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
if(base===out||out.startsWith(base+path.sep)||fs.existsSync(out))throw Error('Use a new staging directory');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const original=fs.readFileSync(path.join(base,'resources/app.asar')),archive=asar.parseArchive(original),replacements=new Map();
const pkg=JSON.parse(asar.content(archive,'package.json'));
if(pkg.name!=='electimes-office'||pkg.version!=='1.0.11')throw Error('Expected published 1.0.11');
function exact(s,a,b){if(s.split(a).length!==2)throw Error('Unexpected source anchor: '+a.slice(0,90));return s.replace(a,()=>b);}
for(const [name,a,b]of [
 ['out/main/work-panel/panel.js','전기신문 Office 1.0.11 · 업무패널','전기신문 Office 1.0.12 · 업무패널'],
 ['out/main/reporter-updater.cjs','let version = { version: "1.0.11", build: 111 }','let version = { version: "1.0.12", build: 112 }'],
]){const s=exact(asar.content(archive,name).toString(),a,b);new vm.Script(s);replacements.set(name,Buffer.from(s));}
let main=asar.content(archive,'out/main/index.js').toString();
main=exact(main,'const require$$1$1 = require("electron");','const require$$1$1 = require("electron");\nrequire("./print-compat.cjs").install();');
// Keep the HWP print owner visible, focused and attached to the Office window.
// PDF export continues to use the existing hidden window and CSS page size.
main=exact(main,'const printWindow$1 = () => new require$$1$1.BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });',`const printWindow$1 = (owner, interactive = false) => {
  const isInteractive = interactive && process.platform === "win32";
  const work = isInteractive ? require$$1$1.screen.getDisplayMatching(owner?.getBounds() ?? require$$1$1.screen.getPrimaryDisplay().workArea).workArea : null;
  return new require$$1$1.BrowserWindow({
    show: false,
    ...(isInteractive ? {title: "전기신문 Office — 인쇄", width: Math.min(900, work.width), height: Math.min(700, work.height), autoHideMenuBar: true, skipTaskbar: true, closable: false, ...(owner && !owner.isDestroyed() ? {parent: owner} : {})} : {}),
    webPreferences: {sandbox: true, javascript: false}
  });
};`);
main=exact(main,'await printJobToPrinter(printJob, printWindow$1);',`const printOwner = require$$1$1.BrowserWindow.fromWebContents(e.sender) ?? require$$1$1.BrowserWindow.getFocusedWindow();
        await printJobToPrinter(printJob, () => printWindow$1(printOwner, true));`);
main=exact(main,`function printJobToPrinter(job, createWindow) {
  return withPrintWindow(
    job,
    createWindow,
    (win2) => new Promise((resolve2, reject) => {
      win2.webContents.print(`,`function printJobToPrinter(job, createWindow) {
  return withPrintWindow(
    job,
    createWindow,
    (win2) => new Promise((resolve2, reject) => {
      if (process.platform === "win32") { win2.show(); win2.focus(); }
      win2.webContents.print(`);
new vm.Script(main);replacements.set('out/main/index.js',Buffer.from(main));
replacements.set('out/main/print-compat.cjs',fs.readFileSync(path.join(__dirname,'print-compat.cjs')));
pkg.version='1.0.12';pkg.electimesModificationNotice='Windows printer settings use a consistent legacy-dialog DPI context. HWP print owner remains visible. All 1.0.11 fixes and original notices retained.';
replacements.set('package.json',Buffer.from(JSON.stringify(pkg,null,2)));
fs.cpSync(base,out,{recursive:true,filter:p=>!['$PLUGINSDIR','Uninstall.exe','uninstall.exe'].includes(path.basename(p))});
fs.writeFileSync(path.join(out,'resources/app.asar'),asar.rewriteArchive(original,replacements));
const nativeDir=path.join(out,'resources/print-compat');fs.mkdirSync(nativeDir,{recursive:true});
fs.copyFileSync(path.join(__dirname,'native/build/Release/print_compat.node'),path.join(nativeDir,'print_compat.node'));
// Retain the small, auditable native source with the installed modification.
for(const file of ['print-compat.cc','binding.gyp'])fs.copyFileSync(path.join(__dirname,'native',file),path.join(nativeDir,file));
fs.writeFileSync(path.join(out,'resources/electimes-version.json'),JSON.stringify({version:'1.0.12',build:112}));
fs.writeFileSync(path.join(out,'ELECTIMES-INSTALL.txt'),exact(fs.readFileSync(path.join(out,'ELECTIMES-INSTALL.txt'),'utf8'),'전기신문 Office 1.0.11','전기신문 Office 1.0.12')+'\nWindows 인쇄 설정창의 배율 호환성과 HWP 인쇄창 표시를 개선했습니다.\n');
const changed=new Set(['resources/app.asar','resources/electimes-version.json','ELECTIMES-INSTALL.txt','BUILD-VERIFICATION.json']);
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
let preserved=0;
for(const file of walk(path.join(base,'resources'))){
 const rel=path.relative(base,file).split(path.sep).join('/');if(changed.has(rel))continue;
 if(sha(fs.readFileSync(file))!==sha(fs.readFileSync(path.join(out,rel))))throw Error('Unrelated resource changed: '+rel);preserved++;
}
const report={version:'1.0.12',baseVersion:'1.0.11',modifiedAsarEntries:[...replacements.keys()],preservedResources:preserved,baseAsarSha256:sha(original),nativeSha256:sha(fs.readFileSync(path.join(nativeDir,'print_compat.node')))};
fs.writeFileSync(path.join(out,'BUILD-VERIFICATION.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
