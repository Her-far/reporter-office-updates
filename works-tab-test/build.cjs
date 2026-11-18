'use strict';
// Exact overlay on the published 1.0.12 payload. No release feed or installed app is edited.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), vm = require('node:vm');
const asar = require('../electimes-109/workpanel/build/asar-tools.cjs');
const base = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
if (base === out || out.startsWith(base + path.sep) || fs.existsSync(out)) throw Error('Use a new staging directory');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const original = fs.readFileSync(path.join(base, 'resources/app.asar')), archive = asar.parseArchive(original), replacements = new Map();
const pkg = JSON.parse(asar.content(archive, 'package.json'));
if (pkg.name !== 'electimes-office' || pkg.version !== '1.0.12') throw Error('Expected published Electimes Office 1.0.12');
function exact(source, before, after) {
  if (source.split(before).length !== 2) throw Error('Patch anchor is not unique: ' + before.slice(0, 120));
  return source.replace(before, () => after);
}
function add(name, content) {
  if (/\.(cjs|js)$/.test(name) && !name.includes('/renderer/')) new vm.Script(content.toString(), { filename: name });
  replacements.set(name, Buffer.from(content));
}
let main = asar.content(archive, 'out/main/index.js').toString();
main = exact(main, 'require$$1$1.app.setName("Electimes Office");', 'require$$1$1.app.setName("Electimes Office Works Test");');
main = exact(main, 'const profile = path$1.join(require$$1$1.app.getPath("appData"), "Electimes Office");', 'const profile = path$1.join(require$$1$1.app.getPath("appData"), "ElectimesOffice-Works-Test");');
main = exact(main, 'require$$1$1.app.setAppUserModelId("kr.co.electimes.office")', 'require$$1$1.app.setAppUserModelId("kr.co.electimes.office.works.test")');
main = exact(main, "if (require('./work-panel/main.cjs').isMailContents(contents)) return;", "if (require('./work-panel/main.cjs').isMailContents(contents) || require('./works-tab/main.cjs').isWorksContents(contents)) return;");
main = exact(main, 'function registerHomeIpc() {', "function registerHomeIpc() {\n  require('./works-tab/main.cjs').register({ window: () => shellWindow, manager: () => tabManager });");
main = exact(main, "require('./work-panel/main.cjs').attach();", "require('./work-panel/main.cjs').attach();\n  require('./works-tab/main.cjs').attach();");
main = exact(main, 't2.kind !== "home" && t2.kind !== "help" && !t2.present', 't2.kind !== "home" && t2.kind !== "help" && t2.kind !== "works" && !t2.present');
main = exact(main, 'tab.kind !== "home" && !tab.present && (tab.view || tab.opener)', 'tab.kind !== "home" && tab.kind !== "works" && !tab.present && (tab.view || tab.opener)');
main = exact(main, 'kind: target.kind,\n        present: target.present', 'kind: target.kind === "works" ? "home" : target.kind,\n        present: target.present');
main = exact(main, 'if (!tab || tab.present || this.closingIds.has(id2)) return null;', 'if (!tab || tab.kind === "works" || tab.present || this.closingIds.has(id2)) return null;');
main = exact(main, 'return !!tab && (!!tab.view || !!tab.opener) && !tab.present && !this.closingIds.has(id2);', 'return !!tab && tab.kind !== "works" && (!!tab.view || !!tab.opener) && !tab.present && !this.closingIds.has(id2);');
main = exact(main, 'if (!tab || !tab.view && !tab.opener || tab.present) return;', 'if (!tab || tab.kind === "works" || !tab.view && !tab.opener || tab.present) return;');
main = exact(main, 'tabs: this.tabs.map((t2) => ({\n        id: t2.id,', 'tabs: this.tabs.filter(t2 => t2.kind !== "works").map((t2) => ({\n        id: t2.id,');
add('out/main/index.js', main);
add('out/preload/index.js', asar.content(archive, 'out/preload/index.js').toString() + '\n' + fs.readFileSync(path.join(__dirname, 'src/shell-preload.cjs'), 'utf8'));
for (const name of fs.readdirSync(path.join(__dirname, 'src'))) {
  if (['shell-preload.cjs', 'updater-disabled.cjs'].includes(name)) continue;
  add('out/main/works-tab/' + name, fs.readFileSync(path.join(__dirname, 'src', name)));
}
add('out/main/reporter-updater.cjs', fs.readFileSync(path.join(__dirname, 'src/updater-disabled.cjs')));
// The preview gets its own preferences and never migrates earlier test credentials.
let panel = asar.content(archive, 'out/main/work-panel/main.cjs').toString();
panel = exact(panel, "await require('./migrate.cjs').importTestPanel(app.getPath('appData'),app.getPath('userData')).catch(()=>{});", '/* Isolated Works preview: do not import another profile. */');
panel = exact(panel, "await require('./local-google-client.cjs').importLocalGoogleClient({vault,resourcesPath:process.resourcesPath,localAppData:process.env.LOCALAPPDATA});", '/* Explicit account setup only in this test profile. */');
add('out/main/work-panel/main.cjs', panel);
const rendererHtml = asar.content(archive, 'out/renderer/index.html').toString();
const rendererCandidates = [...rendererHtml.matchAll(/<script[^>]+src="\.\/([^\"]+\.js)"/g)].map(match => 'out/renderer/' + match[1]).filter(name => asar.content(archive, name).includes(Buffer.from('function TabBar(')));
if (rendererCandidates.length !== 1) throw Error('Expected one tab bar bundle');
const rendererPath = rendererCandidates[0];
let renderer = asar.content(archive, rendererPath).toString();
renderer = exact(renderer, 'const KIND_ICON = {', 'const KIND_ICON = {\n  works: jsxRuntimeExports.jsx("span", { style: {fontWeight: 800, color: "#2856a1"}, children: "W" }),');
renderer = exact(renderer, '    splitHint && /* @__PURE__ */ jsxRuntimeExports.jsx(', `    jsxRuntimeExports.jsx("button", { className: "works-tab-launch", title: "전기신문 Works 열기 · 테스트판", "aria-label": "전기신문 Works 열기", onClick: () => { void window.electimesWorks.open(); }, style: { WebkitAppRegion: "no-drag", flexShrink: 0, cursor: "pointer", height: 28, alignSelf: "center", margin: "0 8px", padding: "0 12px", border: "1px solid #b9cbe8", borderRadius: 6, background: "#edf3ff", color: "#244c88", fontSize: 12, fontWeight: 700 }, children: "Works · 테스트" }),
    splitHint && /* @__PURE__ */ jsxRuntimeExports.jsx(`);
add(rendererPath, renderer);
add('out/renderer/index.html', exact(rendererHtml, '<title>Electimes Office</title>', '<title>전기신문 Office · Works 테스트판</title>'));
pkg.name = 'electimes-office-works-test'; pkg.productName = 'Electimes Office Works Test'; pkg.version = '1.0.12-works-test.1'; pkg.desktopName = 'electimes-office-works-test.desktop';
pkg.description = '전기신문 Office · Works 문서 탭 연동 테스트판';
pkg.electimesModificationNotice = 'Isolated Works tab preview based on verified 1.0.12. All upstream copyright and license notices retained.';
add('package.json', JSON.stringify(pkg, null, 2));
fs.cpSync(base, out, { recursive: true, filter: file => !['$PLUGINSDIR', 'Uninstall.exe', 'uninstall.exe'].includes(path.basename(file)) });
fs.writeFileSync(path.join(out, 'resources/app.asar'), asar.rewriteArchive(original, replacements));
fs.renameSync(path.join(out, 'Electimes Office.exe'), path.join(out, 'Electimes Office Works Test.exe'));
fs.writeFileSync(path.join(out, 'resources/electimes-version.json'), JSON.stringify({ version: pkg.version, build: 112 }));
fs.writeFileSync(path.join(out, 'resources/electimes-update-source.json'), JSON.stringify({ url: '', disabled: true }));
fs.writeFileSync(path.join(out, 'ELECTIMES-INSTALL.txt'), fs.readFileSync(path.join(__dirname, '사용안내.txt')));
fs.copyFileSync(path.join(__dirname, '사용안내.txt'), path.join(out, '먼저 읽어주세요.txt'));
const changed = new Set(['resources/app.asar', 'resources/electimes-version.json', 'resources/electimes-update-source.json']);
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
let preservedResources = 0;
for (const file of walk(path.join(base, 'resources'))) {
  const relative = path.relative(base, file).split(path.sep).join('/');
  if (changed.has(relative)) continue;
  if (hash(fs.readFileSync(file)) !== hash(fs.readFileSync(path.join(out, relative)))) throw Error('Unrelated resource changed: ' + relative);
  preservedResources++;
}
const report = { version: pkg.version, baseVersion: '1.0.12', profile: 'ElectimesOffice-Works-Test', automaticUpdates: false, modifiedAsarEntries: [...replacements.keys()], preservedResources, baseAsarSha256: hash(original), asarSha256: hash(fs.readFileSync(path.join(out, 'resources/app.asar'))) };
fs.writeFileSync(path.join(out, 'BUILD-VERIFICATION.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
