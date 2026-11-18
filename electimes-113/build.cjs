'use strict';
// 1.0.13 overlay on the verified, published 1.0.12 payload: the CLI launcher/profile
// correction and web AI (ChatGPT, Claude, Gemini) in the work panel.
// Usage: node build.cjs <extracted-1.0.12-installer> <new-stage-dir> [test-label, e.g. test.1]
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), vm = require('node:vm');
const asar = require('../electimes-109/workpanel/build/asar-tools.cjs');
const { patchCli, CLI_FILES } = require('./cli-profile.cjs');

const BASE_ASAR_SHA256 = '07a6eaff72dd557c59e18ed67efda7ed96003474ed41b9b883db0aa94ff9b6e8';
const FROM = { version: '1.0.12', build: 112 }, TO = { version: '1.0.13', build: 113 };
// A test build shows its label (Settings, install notes); application code stays 1.0.13.
const label = process.argv[4] || '';
if (label && !/^test\.\d{1,3}$/.test(label)) throw Error('Test label must look like test.1');
const shown = label ? `${TO.version}-${label}` : TO.version;

const base = path.resolve(process.argv[2] || ''), out = path.resolve(process.argv[3] || '');
if (!process.argv[2] || !process.argv[3]) throw Error('Usage: node build.cjs <base-installer> <stage>');
if (base === out || out.startsWith(base + path.sep) || fs.existsSync(out)) throw Error('Use a new staging directory');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function exact(s, a, b) { if (s.split(a).length !== 2) throw Error('Unexpected source anchor: ' + a.slice(0, 90)); return s.replace(a, () => b); }

const original = fs.readFileSync(path.join(base, 'resources/app.asar'));
if (sha(original) !== BASE_ASAR_SHA256) throw Error('Expected the published 1.0.12 app.asar');
const version = JSON.parse(fs.readFileSync(path.join(base, 'resources/electimes-version.json'), 'utf8'));
if (version.version !== FROM.version || version.build !== FROM.build) throw Error('Expected published 1.0.12 resources');
const archive = asar.parseArchive(original), replacements = new Map();
const pkg = JSON.parse(asar.content(archive, 'package.json'));
if (pkg.name !== 'electimes-office' || pkg.version !== FROM.version) throw Error('Expected published 1.0.12 package');

for (const [name, a, b] of [
  ['out/main/reporter-updater.cjs', 'let version = { version: "1.0.12", build: 112 }', 'let version = { version: "1.0.13", build: 113 }'],
]) { const s = exact(asar.content(archive, name).toString(), a, b); new vm.Script(s); replacements.set(name, Buffer.from(s)); }
if (label) {
  const mainPath = 'out/main/index.js';
  const source = asar.content(archive, mainPath).toString();
  const main = exact(source, 'app.getPath("appData"), "Electimes Office");',
    'app.getPath("appData"), "Electimes Office Wide AI Test");');
  new vm.Script(main);
  replacements.set(mainPath, Buffer.from(main));
}
// Work panel: each replaced file must be exactly the shipped 1.0.12 version first.
const lf = t => t.replace(/\r\n/g, '\n');
const read = (...p) => lf(fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8'));
const wp = 'out/main/work-panel/';
const shipped = {
  'main.cjs': read('electimes-110/workpanel/src/main.cjs'),
  'panel.js': read('electimes-109/workpanel/src/panel.js').replace('전기신문 Office 1.0.9 · 업무패널', '전기신문 Office 1.0.12 · 업무패널'),
  'policy.cjs': read('electimes-109/workpanel/src/policy.cjs'),
  'panel.css': read('electimes-109/workpanel/src/panel.css'),
};
for (const [name, text] of Object.entries(shipped)) {
  if (lf(asar.content(archive, wp + name).toString()) !== text) throw Error('Work panel base differs: ' + name);
  const next = read('electimes-113/workpanel/src', name); if (!name.endsWith('.css')) new vm.Script(next);
  replacements.set(wp + name, Buffer.from(next));
}
if (asar.filesOf(archive.header).some(([n]) => n === wp + 'ai-web.cjs')) throw Error('Unexpected existing web AI module');
const aiModule = read('electimes-113/workpanel/src/ai-web.cjs'); new vm.Script(aiModule); replacements.set(wp + 'ai-web.cjs', Buffer.from(aiModule));
// The side-panel toolbar is inlined into every editor preload.
const oldHost = read('electimes-110/workpanel/src/host-preload.cjs'), newHost = read('electimes-113/workpanel/src/host-preload.cjs');
function replaceHost(t) {
  const variants = [...new Set([oldHost, oldHost.replace(/\n/g, '\r\n')])].filter(v => t.includes(v));
  if (variants.length !== 1 || t.split(variants[0]).length !== 2) throw Error('Expected one 1.0.12 work panel host');
  const next = t.replace(variants[0], () => newHost); new vm.Script(next); return next;
}
replacements.set('out/preload/index.js', Buffer.from(replaceHost(asar.content(archive, 'out/preload/index.js').toString())));
for(const [source,target] of [['ai-web.cjs','desktop-chat.cjs'],['browser-companion.cjs','browser-companion.cjs']]) {
  const code = fs.readFileSync(path.join(__dirname,'browser',source),'utf8');
  new vm.Script(code);
  replacements.set(wp + target, Buffer.from(code));
}
pkg.version = TO.version;
pkg.electimesModificationNotice = 'Web AI (official ChatGPT, Claude and Gemini pages in isolated sessions) in the work panel; the bundled command line starts Electimes Office.exe and uses the Electimes Office profile. All 1.0.12 fixes and original notices retained.';
replacements.set('package.json', Buffer.from(JSON.stringify(pkg, null, 2)));

fs.cpSync(base, out, { recursive: true, filter: p => !['$PLUGINSDIR', 'Uninstall.exe', 'uninstall.exe'].includes(path.basename(p)) });
fs.writeFileSync(path.join(out, 'resources/app.asar'), asar.rewriteArchive(original, replacements));

fs.copyFileSync(path.join(__dirname,'browser/browser-companion.exe'),path.join(out,'resources/browser-companion.exe'));
const cliDir = path.join(out, 'resources/cli');
const input = Object.fromEntries(CLI_FILES.map(f => [f, fs.readFileSync(path.join(cliDir, f), 'utf8')]));
const patched = patchCli(input);
new vm.Script(patched['genoffice.cjs'].replace(/^#!.*\n/, ''), { filename: 'genoffice.cjs' });
for (const f of CLI_FILES) fs.writeFileSync(path.join(cliDir, f), patched[f]);
const modulePreloads = [];
for (const module of fs.readdirSync(path.join(out, 'resources/modules'))) {
  const dir = path.join(out, 'resources/modules', module, 'preload'); if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir)) { if (!name.endsWith('.js')) continue; const file = path.join(dir, name);
    fs.writeFileSync(file, replaceHost(fs.readFileSync(file, 'utf8'))); modulePreloads.push(path.relative(out, file).split(path.sep).join('/')); }
}

fs.writeFileSync(path.join(out, 'resources/electimes-version.json'), JSON.stringify({ version: shown, build: TO.build }));
fs.writeFileSync(path.join(out, 'ELECTIMES-INSTALL.txt'),
  exact(fs.readFileSync(path.join(out, 'ELECTIMES-INSTALL.txt'), 'utf8'), '전기신문 Office 1.0.12', '전기신문 Office ' + shown) +
  (label ? '\n이 설치판은 시험판입니다. 원래대로 돌아가려면 정식 1.0.12 전체 설치판을 다시 설치하세요. 문서와 설정은 유지됩니다.\n' : '') +
  '\n업무 패널에 ‘웹 AI’를 추가했습니다. ChatGPT·Claude·Gemini 공식 웹사이트를 패널에서 본인 계정으로 쓸 수 있습니다.\n명령줄 도구(ieumoffice)가 전기신문 Office 실행 파일과 사용자 데이터 폴더를 사용하도록 수정했습니다.\n');

const changed = new Set(['resources/app.asar', 'resources/electimes-version.json', 'ELECTIMES-INSTALL.txt', 'BUILD-VERIFICATION.json',
  ...CLI_FILES.map(f => 'resources/cli/' + f), ...modulePreloads]);
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
let preserved = 0;
for (const file of walk(path.join(base, 'resources'))) {
  const rel = path.relative(base, file).split(path.sep).join('/'); if (changed.has(rel)) continue;
  if (sha(fs.readFileSync(file)) !== sha(fs.readFileSync(path.join(out, rel)))) throw Error('Unrelated resource changed: ' + rel); preserved++;
}
const report = {
  version: shown, build: TO.build, baseVersion: FROM.version, modifiedAsarEntries: [...replacements.keys()],
  modifiedResources: [...CLI_FILES.map(f => 'resources/cli/' + f), ...modulePreloads], preservedResources: preserved,
  asarSha256: sha(fs.readFileSync(path.join(out, 'resources/app.asar'))), baseAsarSha256: sha(original),
  cliSha256: Object.fromEntries(CLI_FILES.map(f => [f, sha(fs.readFileSync(path.join(cliDir, f)))])),
};
fs.writeFileSync(path.join(out, 'BUILD-VERIFICATION.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
