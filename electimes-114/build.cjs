// Build the 1.0.14 stage from the signed-off 1.0.13 payload and the output of icons.py.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const asar = require('../electimes-109/workpanel/build/asar-tools.cjs');
const families = require('./formats.json');
const [base, art, stage] = process.argv.slice(2);
if (!stage || fs.existsSync(stage)) throw Error('Usage: node build.cjs <base> <art> <new stage>');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const original = fs.readFileSync(path.join(base, 'resources/app.asar'));
if (sha(original) !== 'b38c909288158e85b476a1f18a2b21df9a72b09303a82763c6f83bedf7a1f6ac')
  throw Error('Expected production 1.0.13');
const archive = asar.parseArchive(original), changed = new Map();
function once(source, search, replacement) {
  if (source.split(search).length !== 2) throw Error('Unexpected base at ' + search);
  return source.replace(search, () => replacement);
}
function edit(name, update) {
  changed.set(name, Buffer.from(update(asar.content(archive, name).toString())));
}
const renderer = 'out/renderer/';
const iconPath = k => './file-icons/' + k + '.svg';
for (const file of fs.readdirSync(path.join(art, 'svg')))
  changed.set(renderer + 'file-icons/' + file, fs.readFileSync(path.join(art, 'svg', file)));

const imported = {Docx:'docx', Xlsx:'xlsx', Pptx:'pptx', Hwp:'hwp', Epub:'epub',
                  Mindmap:'xmind', Html:'html', Md:'md', Pdf:'pdf'};
edit(renderer + 'assets/DriveBrowser-CJObKamo.js', source => {
  for (const [id, family] of Object.entries(imported)) {
    const match = source.match(new RegExp('const icon' + id + ' = "data:image/svg[^"\\n]+";'));
    if (!match) throw Error('Missing icon: '+id);
    source = once(source, match[0], 'const icon' + id + ' = ' + JSON.stringify(iconPath(family)) + ';');
  }
  return source;
});
edit(renderer + 'assets/index-B-z79QL9.js', source => {
  const mapping = {...families, ppt:'pptx', folder:'folder', 'pdf-tools':'pdf-tools'};
  const homeIcons = Object.fromEntries(Object.entries(mapping).map(([ext, family])=>[ext,iconPath(family)]));
  const start = source.indexOf('const FILE_ICONS = {'), end = source.indexOf('\n};',start);
  if (start < 0 || end < 0) throw Error('Missing home icon map');
  source = once(source, source.slice(start,end+3),'const FILE_ICONS = ' + JSON.stringify(homeIcons,null,2) + ';');
  const hwp = '  { key: "hwp", label: "filterHwp" },\n';
  const all = '  { key: "all", label: "filterAll" },\n';
  source = once(once(source, hwp, ''), all, all+hwp);
  source = once(source, 'jsxRuntimeExports.jsx("span", { className: "quick-folder", children: /* @__PURE__ */ jsxRuntimeExports.jsx(FolderIcon, { size: 18 }) })',
                        'jsxRuntimeExports.jsx(FileBadge, { ext: "folder", size: 30 })');
  return once(source, 'jsxRuntimeExports.jsx(FileBadge, { ext: "pdf", size: 30 })',
                      'jsxRuntimeExports.jsx(FileBadge, { ext: "pdf-tools", size: 30 })');
});
edit('out/main/default-app.cjs', source => {
  source = once(source, 'function windowsRegistrationValues(exePath)', 'const iconFamilies = '+JSON.stringify(families)+';\nfunction windowsRegistrationValues(exePath)');
  const old = '{ key: key + "\\\\DefaultIcon", name: "", value: `"${exePath}",0` }';
  return once(source, old, '{ key: key + "\\\\DefaultIcon", name: "", value: `"${import_node_path.win32.join(import_node_path.win32.dirname(exePath), "resources", "file-icons", iconFamilies[extension] + ".ico")}",0` }');
});
edit('out/main/reporter-updater.cjs', s=>once(s, 'version: "1.0.13", build: 113', 'version: "1.0.14", build: 114'));
for (const file of ['main.cjs','panel.js','gemini-acp.cjs'])
  edit('out/main/work-panel/'+file,s=>once(s,'1.0.13','1.0.14'));
edit('package.json', s=>{
  const pkg=JSON.parse(s);
  pkg.version='1.0.14';
  pkg.electimesModificationNotice += ' File type icons and Hangul-first home filters updated in 1.0.14.';
  return JSON.stringify(pkg,null,2)+'\n';
});
fs.cpSync(base, stage, {recursive:true,filter:p=> !['$pluginsdir','uninstall.exe'].includes(path.basename(p).toLowerCase())});
const resources = path.join(stage,'resources');
fs.cpSync(path.join(art,'ico'),path.join(resources,'file-icons'),{recursive:true});
for (const [name,family] of Object.entries({hwp:'hwp',mindmap:'xmind',epub:'epub'}))
  fs.copyFileSync(path.join(art,'ico',family+'.ico'),path.join(resources,name+'.ico'));
const finalArchive=asar.rewriteArchive(original,changed);
fs.writeFileSync(path.join(resources,'app.asar'),finalArchive);
fs.writeFileSync(path.join(resources,'electimes-version.json'), JSON.stringify({version:'1.0.14',build:114}));
const guide = path.join(stage,'ELECTIMES-INSTALL.txt');
fs.writeFileSync(guide,once(fs.readFileSync(guide,'utf8'),'전기신문 Office 1.0.13','전기신문 Office 1.0.14')+'\n홈 화면과 Windows 파일 아이콘에 형식별 색띠를 적용하고 한글 필터를 전체 다음에 배치했습니다.\n');
fs.writeFileSync(path.join(stage,'BUILD-VERIFICATION.json'),JSON.stringify({
  version:'1.0.14',build:114,baseVersion:'1.0.13',modifiedAsarEntries:[...changed.keys()],
  asarSha256:sha(finalArchive),baseAsarSha256:sha(original), fileIcons:families
},null,2));
