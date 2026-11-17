/* Reproducible, fail-closed assembly over the verified 1.0.6 Windows payload. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const asar=require('./asar-tools.cjs');
const base=path.resolve(process.argv[2]||''),out=path.resolve(process.argv[3]||'');
if(!process.argv[2]||!process.argv[3]||base===out||out.startsWith(base+path.sep))throw Error('Usage: node build.cjs BASE_1.0.6_FOLDER NEW_PRODUCTION_FOLDER');
const src=path.resolve(__dirname,'../src'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const orig=fs.readFileSync(path.join(base,'resources/app.asar')),a=asar.parseArchive(orig),rep=new Map();
const pkg=JSON.parse(asar.content(a,'package.json'));if(pkg.version!=='1.0.6'||pkg.name!=='electimes-office')throw Error('Expected Electimes Office 1.0.6');
function exact(s,old,next){if(s.split(old).length!==2)throw Error('Anchor count changed: '+old.slice(0,90));return s.replace(old,()=>next);}
let main=asar.content(a,'out/main/index.js').toString();
// The upstream editor guard blocked login POST/JS navigation before our mail guard ran.
// Exempt only main-process-registered mail contents; secureRemote still validates every navigation.
main=exact(main,'if (event.url !== contents.getURL()) event.preventDefault();',"if (require('./work-panel/main.cjs').isMailContents(contents)) return;\n      if (event.url !== contents.getURL()) event.preventDefault();");
main=exact(main,'function registerHomeIpc() {',`function registerHomeIpc() {
  require('./work-panel/main.cjs').register({
    window: () => shellWindow,
    manager: () => tabManager,
    isHost: wc => wc === shellWindow?.webContents || !!tabManager?.describeWebContents(wc.id),
    openDocument: file => openDocumentPath(file)
  });`);
main=exact(main,'  createShellWindow();\n  installBackToHomeItems();',"  createShellWindow();\n  require('./work-panel/main.cjs').attach();\n  installBackToHomeItems();");
new vm.Script(main);rep.set('out/main/index.js',Buffer.from(main));
let updater=asar.content(a,'out/main/reporter-updater.cjs').toString();
updater=exact(updater,'let version = { version: "1.0.6", build: 106 }','let version = { version: "1.0.9", build: 109 }');
new vm.Script(updater);rep.set('out/main/reporter-updater.cjs',Buffer.from(updater));
let updateRendererCount=0;
for(const [name] of asar.filesOf(a.header)) {
  if(!/^out\/renderer\/.*\.js$/.test(name))continue;
  const source=asar.content(a,name).toString();
  if(!source.includes('function ReporterUpdatePane()'))continue;
  rep.set(name,Buffer.from(require('./update-download-confirm.cjs')(source,exact)));
  updateRendererCount++;
}
if(updateRendererCount!==2)throw Error('Expected both shipped update settings renderers');
const host=fs.readFileSync(path.join(src,'host-preload.cjs'),'utf8');
for(const[name]of asar.filesOf(a.header))if(/^out\/preload\/index\.js$/.test(name)){const next=asar.content(a,name).toString()+'\n'+host;new vm.Script(next);rep.set(name,Buffer.from(next));}
for(const name of fs.readdirSync(src)){if(!/\.(cjs|html|css|js)$/.test(name)||name==='host-preload.cjs')continue;const b=fs.readFileSync(path.join(src,name));if(/\.(cjs|js)$/.test(name))new vm.Script(b.toString());rep.set('out/main/work-panel/'+name,b);}
// Ship locked, pure-JavaScript reader dependencies with their original licenses.
const dependencyRoot=path.resolve(__dirname,'../node_modules');
if(!fs.existsSync(path.join(dependencyRoot,'imapflow/package.json')))throw Error('Run npm ci --ignore-scripts before building');
function includeDependencies(dir,prefix){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(entry.name==='.bin'||entry.name==='.package-lock.json')continue;const file=path.join(dir,entry.name),dest=prefix+'/'+entry.name;if(entry.isDirectory())includeDependencies(file,dest);else if(entry.isFile())rep.set(dest,fs.readFileSync(file));}}
includeDependencies(dependencyRoot,'out/main/work-panel/node_modules');
// Developer-only build input. Never copied into source archives or exposed via IPC.
const oauthFile=process.env.WORKPANEL_GOOGLE_OAUTH_FILE;
if(process.env.PUBLIC_RELEASE==='1'&&oauthFile)throw Error('Public releases cannot include Google app credentials');
if(oauthFile){const {clientOf}=require('../src/oauth.cjs');const client=clientOf(JSON.parse(fs.readFileSync(oauthFile,'utf8')));rep.set('out/main/work-panel/google-client.json',Buffer.from(JSON.stringify({installed:client})));}
Object.assign(pkg,{version:'1.0.9',electimesModificationNotice:'Work panel integration on production 1.0.6; DOC reopen and update redirect fixes retained. Original notices retained.'});rep.set('package.json',Buffer.from(JSON.stringify(pkg,null,2)));
if(fs.existsSync(out))throw Error('Output already exists; select a new empty folder');fs.cpSync(base,out,{recursive:true});fs.rmSync(path.join(out,'$PLUGINSDIR'),{recursive:true,force:true});
// Some 7-Zip versions reconstruct the base installer uninstaller.
// NSIS generates the new version; never ship the previous generated executable as payload.
for(const name of fs.readdirSync(out))if(/^uninstall\.exe$/i.test(name))fs.rmSync(path.join(out,name));
fs.writeFileSync(path.join(out,'resources/app.asar'),asar.rewriteArchive(orig,rep));
const modified=[];
modified.push(require('./compact-autosave.cjs')(path.join(out,'resources/modules/hwp/renderer'),exact));
// Keep the original HWP menu elements and handlers; add scroll controls around them.
const studioRelative='resources/modules/hwp/renderer/studio/index.html',studio=path.join(out,'resources/modules/hwp/renderer/studio');
const studioHtml=fs.readFileSync(path.join(out,studioRelative),'utf8');
fs.writeFileSync(path.join(out,studioRelative),exact(studioHtml,'</head>','<link rel="stylesheet" href="./editor-menu-scroll.css"><script defer src="./editor-menu-scroll.js"></script></head>'));
modified.push(studioRelative);
for(const name of ['editor-menu-scroll.js','editor-menu-scroll.css'])fs.copyFileSync(path.join(src,name),path.join(studio,name));

for(const module of fs.readdirSync(path.join(out,'resources/modules'))){const root=path.join(out,'resources/modules',module,'preload');if(!fs.existsSync(root))continue;
  for(const name of fs.readdirSync(root)){if(!name.endsWith('.js'))continue;const file=path.join(root,name),text=fs.readFileSync(file,'utf8')+'\n'+host;new vm.Script(text);fs.writeFileSync(file,text);modified.push(path.relative(out,file).split(path.sep).join('/'));}}


const docs=path.resolve(__dirname,'../docs');if(fs.existsSync(docs))fs.cpSync(docs,path.join(out,'WorkPanel-Guide'),{recursive:true});

fs.writeFileSync(path.join(out,'resources/electimes-version.json'),JSON.stringify({version:'1.0.9',build:109}));
fs.copyFileSync(path.join(docs,'사용안내.txt'),path.join(out,'사용안내.txt'));
fs.copyFileSync(path.join(docs,'사용안내.txt'),path.join(out,'ELECTIMES-INSTALL.txt'));
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
const protectedFiles=walk(path.join(base,'resources')).filter(f=>!/app\.asar$/.test(f)&&!modified.includes(path.relative(base,f).split(path.sep).join('/'))&&!/electimes-version\.json$|electimes-update-source\.json$|app-update\.yml$/.test(f));
for(const file of protectedFiles){const target=path.join(out,path.relative(base,file));if(!fs.existsSync(target)||sha(fs.readFileSync(file))!==sha(fs.readFileSync(target)))throw Error('Unexpected engine/resource change: '+path.relative(base,file));}
const report={version:pkg.version,baseAsarSha256:sha(orig),productionAsarSha256:sha(fs.readFileSync(path.join(out,'resources/app.asar'))),modifiedAsarEntries:[...rep.keys()],modifiedEditorPreloads:modified,unchangedProtectedFiles:protectedFiles.length,productionUpdates:true,googleOAuthPreconfigured:true,googleOAuthTransport:oauthFile?'local-client':'company-relay',windowsGuiVerified:false};
fs.writeFileSync(path.join(out,'BUILD-VERIFICATION.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
