'use strict';
// 1.0.13 overlay: apply the CLI launcher/profile correction to the verified,
// published 1.0.12 payload. Usage: node build.cjs <extracted-1.0.12-installer> <new-stage-dir>
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), vm = require('node:vm');
const asar = require('../electimes-109/workpanel/build/asar-tools.cjs');
const { patchCli, CLI_FILES } = require('./cli-profile.cjs');

const BASE_ASAR_SHA256 = '07a6eaff72dd557c59e18ed67efda7ed96003474ed41b9b883db0aa94ff9b6e8';
const FROM = { version: '1.0.12', build: 112 }, TO = { version: '1.0.13', build: 113 };

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
  ['out/main/work-panel/panel.js', '전기신문 Office 1.0.12 · 업무패널', '전기신문 Office 1.0.13 · 업무패널'],
  ['out/main/reporter-updater.cjs', 'let version = { version: "1.0.12", build: 112 }', 'let version = { version: "1.0.13", build: 113 }'],
]) { const s = exact(asar.content(archive, name).toString(), a, b); new vm.Script(s); replacements.set(name, Buffer.from(s)); }
pkg.version = TO.version;
pkg.electimesModificationNotice = 'The bundled command line starts Electimes Office.exe and uses the Electimes Office profile. All 1.0.12 fixes and original notices retained.';
replacements.set('package.json', Buffer.from(JSON.stringify(pkg, null, 2)));

fs.cpSync(base, out, { recursive: true, filter: p => !['$PLUGINSDIR', 'Uninstall.exe', 'uninstall.exe'].includes(path.basename(p)) });
fs.writeFileSync(path.join(out, 'resources/app.asar'), asar.rewriteArchive(original, replacements));

const cliDir = path.join(out, 'resources/cli');
const input = Object.fromEntries(CLI_FILES.map(f => [f, fs.readFileSync(path.join(cliDir, f), 'utf8')]));
const patched = patchCli(input);
new vm.Script(patched['genoffice.cjs'].replace(/^#!.*\n/, ''), { filename: 'genoffice.cjs' });
for (const f of CLI_FILES) fs.writeFileSync(path.join(cliDir, f), patched[f]);

fs.writeFileSync(path.join(out, 'resources/electimes-version.json'), JSON.stringify(TO));
fs.writeFileSync(path.join(out, 'ELECTIMES-INSTALL.txt'),
  exact(fs.readFileSync(path.join(out, 'ELECTIMES-INSTALL.txt'), 'utf8'), '전기신문 Office 1.0.12', '전기신문 Office 1.0.13') +
  '\n명령줄 도구(ieumoffice)가 전기신문 Office 실행 파일과 사용자 데이터 폴더를 사용하도록 수정했습니다.\n');

const changed = new Set(['resources/app.asar', 'resources/electimes-version.json', 'ELECTIMES-INSTALL.txt', 'BUILD-VERIFICATION.json',
  ...CLI_FILES.map(f => 'resources/cli/' + f)]);
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
let preserved = 0;
for (const file of walk(path.join(base, 'resources'))) {
  const rel = path.relative(base, file).split(path.sep).join('/'); if (changed.has(rel)) continue;
  if (sha(fs.readFileSync(file)) !== sha(fs.readFileSync(path.join(out, rel)))) throw Error('Unrelated resource changed: ' + rel); preserved++;
}
const report = {
  version: TO.version, baseVersion: FROM.version, modifiedAsarEntries: [...replacements.keys()],
  modifiedResources: CLI_FILES.map(f => 'resources/cli/' + f), preservedResources: preserved, baseAsarSha256: sha(original),
  cliSha256: Object.fromEntries(CLI_FILES.map(f => [f, sha(fs.readFileSync(path.join(cliDir, f)))])),
};
fs.writeFileSync(path.join(out, 'BUILD-VERIFICATION.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
