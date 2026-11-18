'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const a=require('../electimes-109/workpanel/build/asar-tools.cjs');
const base=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),root=__dirname;
if(base===out||out.startsWith(base+path.sep)||fs.existsSync(out))throw Error('Use an empty isolated output directory');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),original=fs.readFileSync(path.join(base,'resources/app.asar')),archive=a.parseArchive(original),replace=new Map();
const lf=s=>s.replace(/\r\n/g,'\n');
function exact(s,before,after){if(s.split(before).length!==2)throw Error('Unexpected source anchor: '+before.slice(0,120));return s.replace(before,()=>after);}
function js(name,source){new vm.Script(source);replace.set(name,Buffer.from(source));}
const pkg=JSON.parse(a.content(archive,'package.json'));if(pkg.name!=='electimes-office'||pkg.version!=='1.0.12')throw Error('Expected the published 1.0.12 payload');
let main=a.content(archive,'out/main/index.js').toString();
main=exact(main,'app.setName("Electimes Office")','app.setName("Electimes Office AI Web Test")');
main=exact(main,'getPath("appData"), "Electimes Office")','getPath("appData"), "ElectimesOffice-AIWeb-Test")');
main=exact(main,'app.setAppUserModelId("kr.co.electimes.office")','app.setAppUserModelId("kr.co.electimes.office.aiwebtest")');
main=exact(main,'const journalistUpdateMessage = {','require("./ai-web-test-bootstrap.cjs");\nconst journalistUpdateMessage = {');
main=exact(main,"if (require('./work-panel/main.cjs').isMailContents(contents)) return;","if (require('./work-panel/main.cjs').isMailContents(contents) || require('./work-panel/ai-web.cjs').isRemote(contents)) return;");
js('out/main/index.js',main);
js('out/main/ai-web-test-bootstrap.cjs',fs.readFileSync(path.join(root,'test-bootstrap.cjs'),'utf8'));
js('out/main/reporter-updater.cjs',fs.readFileSync(path.join(root,'disabled-updater.cjs'),'utf8'));
for(const name of ['ai-web.cjs','ai-web-policy.cjs','browser-companion.cjs'])js('out/main/work-panel/'+name,fs.readFileSync(path.join(root,name),'utf8'));
let policy=lf(a.content(archive,'out/main/work-panel/policy.cjs').toString());
policy=exact(policy,"menu:'ai', defaultMenu:'ai',","menu:'ai', defaultMenu:'ai', aiMode:'web', aiProvider:'chatgpt',");
policy=exact(policy,'  return next;',"  const ai=require('./ai-web-policy.cjs').preferences(p,{mode:prev.aiMode||'web',provider:prev.aiProvider||'chatgpt'});next.aiMode=ai.mode;next.aiProvider=ai.provider;\n  return next;");
js('out/main/work-panel/policy.cjs',policy);
let panel=lf(a.content(archive,'out/main/work-panel/main.cjs').toString());
panel=exact(panel,"  const reader=new (require('./mail-reader.cjs').MailReader)({vault});",`  const aiWeb=require('./ai-web.cjs').create({window:deps.window,vault,owner:()=>owner,changed:()=>hosts(),expanded:()=>expanded,restore:()=>setExpanded(false),relayout:()=>layout(),isDocument:wc=>!!deps.manager()?.tabIdForWebContents(wc?.id),prepareBrowser:async()=>{if(prefs.width<600){prefs.width=600;await persist();hosts();layout();}if(deps.window().getContentBounds().width<850)setExpanded(true);}});
  const reader=new (require('./mail-reader.cjs').MailReader)({vault});`);
panel=exact(panel,"await require('./migrate.cjs').importTestPanel(app.getPath('appData'),app.getPath('userData')).catch(()=>{});",'/* Independent profile: no production/test profile migration. */');
panel=exact(panel,"await require('./local-google-client.cjs').importLocalGoogleClient({vault,resourcesPath:process.resourcesPath,localAppData:process.env.LOCALAPPDATA});",'/* Do not import registrations from another edition. */');
panel=exact(panel,"return {prefs,menu:panelMode,expanded,version:'1.0.10'};","return {prefs,menu:panelMode,expanded,version:'1.0.12-aiweb.3',aiWeb:aiWeb.state()};");
panel=exact(panel,'function hide(){active=false;','function hide(){aiWeb.hide();active=false;');
panel=exact(panel,"if(!origin||!rect||panelMode==='ai')","if(!origin||!rect||(panelMode==='ai'&&prefs.aiMode!=='web'))");
panel=exact(panel,'{hide();return;}ensurePanel();active=true;',`{hide();return;}
    if(panelMode==='ai'&&prefs.aiMode==='web'){panel?.setVisible(false);mail?.setVisible(false);mail?.webContents.setAudioMuted(true);active=true;aiWeb.show(prefs.aiProvider,r);return;}
    aiWeb.hide();ensurePanel();active=true;`);
panel=exact(panel,"    }else if(p?.action==='width'",`    }else if(p?.action==='ai-mode'&&['document','web'].includes(p.value)){prefs.aiMode=p.value;await persist();hosts();layout();}
    else if(p?.action==='ai-provider'&&Object.hasOwn(require('./ai-web-policy.cjs').providers,p.value)){prefs.aiProvider=p.value;await persist();hosts();layout();}
    else if(p?.action==='ai-web'&&panelMode==='ai'&&prefs.aiMode==='web'){await aiWeb.command(p.value,owner);hosts();}
    else if(p?.action==='width'`);
panel=exact(panel,"w.on('closed',()=>{reader.close();","w.on('closed',()=>{aiWeb.close();reader.close();");
panel=exact(panel,'closing=true;clearInterval(timer);','closing=true;aiWeb.close();clearInterval(timer);');
js('out/main/work-panel/main.cjs',panel);
const oldHost=lf(fs.readFileSync(path.join(root,'../electimes-110/workpanel/src/host-preload.cjs'),'utf8'));
const newHost=require('./host-changes.cjs')(oldHost,exact);new vm.Script(newHost);
const patchHost=source=>exact(lf(source),oldHost,newHost);
js('out/preload/index.js',patchHost(a.content(archive,'out/preload/index.js').toString()));
Object.assign(pkg,{name:'electimes-office-ai-web-test',productName:'전기신문 Office AI 웹 테스트',version:'1.0.12-aiweb.3',electimesModificationNotice:'Isolated real Chrome/Edge browser companion test on published 1.0.12. Production profile, associations and automatic updates remain separate. Original notices preserved.'});
replace.set('package.json',Buffer.from(JSON.stringify(pkg,null,2)));
fs.cpSync(base,out,{recursive:true,filter:p=>!['$PLUGINSDIR','Uninstall.exe','uninstall.exe'].includes(path.basename(p))});
fs.copyFileSync(path.join(root,'browser-companion.exe'),path.join(out,'resources/browser-companion.exe'));
fs.renameSync(path.join(out,'Electimes Office.exe'),path.join(out,'ElectimesOffice-AIWeb-Test.exe'));
fs.writeFileSync(path.join(out,'resources/app.asar'),a.rewriteArchive(original,replace));
const changed=new Set(['resources/app.asar','resources/electimes-version.json','resources/electimes-update-source.json','resources/app-update.yml']);
for(const module of fs.readdirSync(path.join(out,'resources/modules'))){
 const dir=path.join(out,'resources/modules',module,'preload');if(!fs.existsSync(dir))continue;
 for(const name of fs.readdirSync(dir)){if(!name.endsWith('.js'))continue;const file=path.join(dir,name),next=patchHost(fs.readFileSync(file,'utf8'));new vm.Script(next);fs.writeFileSync(file,next);changed.add(path.relative(out,file).split(path.sep).join('/'));}
}
for(const name of ['electimes-update-source.json','app-update.yml'])fs.rmSync(path.join(out,'resources',name),{force:true});
fs.writeFileSync(path.join(out,'resources/electimes-version.json'),JSON.stringify({version:pkg.version,build:112,edition:'ai-web-test',updates:false}));
fs.copyFileSync(path.join(root,'사용안내.txt'),path.join(out,'AI-웹-테스트-사용안내.txt'));
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
let preserved=0;
for(const file of walk(path.join(base,'resources'))){const rel=path.relative(base,file).split(path.sep).join('/');if(changed.has(rel))continue;if(sha(fs.readFileSync(file))!==sha(fs.readFileSync(path.join(out,rel))))throw Error('Unexpected application resource change: '+rel);preserved++;}
const report={version:pkg.version,baseVersion:'1.0.12',baseAsarSha256:sha(original),asarSha256:sha(fs.readFileSync(path.join(out,'resources/app.asar'))),modifiedAsarEntries:[...replace.keys()],modifiedFiles:[...changed],preservedResources:preserved,productionUpdates:false,separateProfile:'ElectimesOffice-AIWeb-Test',liveAccountLoginVerified:false};
fs.writeFileSync(path.join(out,'BUILD-VERIFICATION.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
