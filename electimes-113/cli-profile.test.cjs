'use strict';
// BASE_DIR=<extracted published 1.0.12 installer> node --test cli-profile.test.cjs
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const { spawn, spawnSync } = require('node:child_process');
const { patchCli, APP_EXE, INSTALL_DIR, CLI_FILES } = require('./cli-profile.cjs');

const baseDir = process.env.BASE_DIR;
if (!baseDir) throw Error('Set BASE_DIR to the extracted, verified 1.0.12 installer');
const cliDir = path.join(baseDir, 'resources/cli');
const original = Object.fromEntries(CLI_FILES.map(f => [f, fs.readFileSync(path.join(cliDir, f), 'utf8')]));
const patched = patchCli(original);

// Top-level functions of the esbuild bundle, evaluated with a chosen platform.
function fn(bundle, name) {
  const start = bundle.indexOf(`\nfunction ${name}(`);
  assert.notEqual(start, -1, name);
  return bundle.slice(start + 1, bundle.indexOf('\n}\n', start) + 2);
}
function windowsView(bundle) {
  const product = /\n {4}PRODUCT_NAME = "([^"]+)";/.exec(bundle)[1];
  for (const line of ['    USER_DATA_DIR_NAME = PRODUCT_NAME;', '    APP_BINARY_NAME = PRODUCT_NAME;']) assert.equal(bundle.split(line).length, 2);
  const names = ['genofficeUserDataDir', 'genofficeDevUserDataDir', 'installedAppBinaries', 'appBinaryForResources', 'windowsAppLaunch', 'mcpLaunchFromLauncher'];
  const ctx = {
    process: { platform: 'win32' }, import_node_path13: path.win32, import_node_path15: path.win32,
    import_node_os7: { homedir: () => 'C:\\Users\\reporter' }, import_node_os8: { homedir: () => 'C:\\Users\\reporter' },
    packagedResourcesDir: () => null, USER_DATA_DIR_NAME: product, DEV_USER_DATA_DIR_NAME: `${product}-Dev`, APP_BINARY_NAME: product,
    LINUX_APP_BINARY: 'ieumoffice', CLI_BUNDLE_FILE: 'genoffice.cjs', isWindowsPath: p => p.includes('\\'),
  };
  vm.runInNewContext(names.map(n => fn(bundle, n)).join('\n') + `\nthis.api={${names.join(',')}};`, ctx);
  return ctx.api;
}

const env = { APPDATA: 'C:\\Users\\reporter\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\reporter\\AppData\\Local' };
const install = `C:\\Users\\reporter\\AppData\\Local\\Programs\\${INSTALL_DIR}`;
const launcher = `${install}\\resources\\cli\\ieumoffice.cmd`;

test('the shipped application really is Electimes Office.exe', () => {
  assert.ok(fs.existsSync(path.join(baseDir, APP_EXE)));
  assert.ok(!fs.existsSync(path.join(baseDir, 'IeumOffice.exe')));
});

test('Windows launchers start the company executable', () => {
  assert.match(original['ieumoffice.cmd'], /IeumOffice\.exe/);
  assert.equal(patched['ieumoffice.cmd'], original['ieumoffice.cmd'].replace('IeumOffice.exe', APP_EXE));
  assert.ok(!/IeumOffice\.exe/.test(patched['ieumoffice.cmd'] + patched.ieumoffice));
  assert.equal(patched.ieumoffice.split(`"$here/../../${APP_EXE}"`).length, 3);
  assert.ok(patched['ieumoffice.cmd'].includes('set ELECTRON_RUN_AS_NODE=1'));
});

test('the CLI resolves the same Windows profile the application uses', () => {
  assert.equal(windowsView(original['genoffice.cjs']).genofficeUserDataDir(env), 'C:\\Users\\reporter\\AppData\\Roaming\\IeumOffice');
  const api = windowsView(patched['genoffice.cjs']);
  assert.equal(api.genofficeUserDataDir(env), 'C:\\Users\\reporter\\AppData\\Roaming\\Electimes Office');
  assert.equal(api.genofficeDevUserDataDir(env), 'C:\\Users\\reporter\\AppData\\Roaming\\Electimes Office-Dev');
  // The application exports its profile to child processes; that still wins.
  assert.equal(api.genofficeUserDataDir({ ...env, GENOFFICE_USER_DATA: 'D:\\profile' }), 'D:\\profile');
});

test('MCP registration launches the installed app runtime, not a system node', () => {
  const exists = p => path.win32.normalize(p) === `${install}\\${APP_EXE}`;
  assert.equal(windowsView(original['genoffice.cjs']).mcpLaunchFromLauncher(launcher, { exists }).command, 'node');
  const launch = windowsView(patched['genoffice.cjs']).mcpLaunchFromLauncher(launcher, { exists });
  assert.equal(path.win32.normalize(launch.command), `${install}\\${APP_EXE}`);
  assert.deepEqual([...launch.args], [`${install}\\resources\\cli\\genoffice.cjs`, 'mcp']);
  assert.equal(launch.env.ELECTRON_RUN_AS_NODE, '1');
});

test('app lookup prefers the shipped executable and knows the installer folder', () => {
  const api = windowsView(patched['genoffice.cjs']);
  const found = api.installedAppBinaries(env, 'win32', `${install}\\resources`);
  assert.equal(found[0], `${install}\\${APP_EXE}`);
  assert.ok(found.includes(`${install}\\${APP_EXE}`));
  const nsi = fs.readFileSync(path.join(__dirname, '../electimes-104/setup-104.nsi'), 'utf8');
  assert.match(nsi, new RegExp(`InstallDir "\\$LOCALAPPDATA\\\\Programs\\\\${INSTALL_DIR}"`));
});

test('patching is exact: a second application or a different base is refused', () => {
  assert.throws(() => patchCli(patched), /anchor/);
  assert.throws(() => patchCli({ ...original, 'ieumoffice.cmd': '@echo off\r\n' }), /cmd launcher anchor/);
});

test('only the product constants and install fallbacks change in the bundle', () => {
  const a = original['genoffice.cjs'].split('\n'), b = patched['genoffice.cjs'].split('\n');
  assert.equal(a.length, b.length);
  const diff = a.map((l, i) => l === b[i] ? null : b[i].trim()).filter(Boolean);
  assert.deepEqual(diff, [
    'PRODUCT_NAME = "Electimes Office";',
    'ko: "\\uC804\\uAE30\\uC2E0\\uBB38 \\uC624\\uD53C\\uC2A4"',
    `env.LOCALAPPDATA ? (0, import_node_path15.join)(env.LOCALAPPDATA, "Programs", "${INSTALL_DIR}", \`\${APP_BINARY_NAME}.exe\`) : "",`,
    `env.ProgramFiles ? (0, import_node_path15.join)(env.ProgramFiles, "${INSTALL_DIR}", \`\${APP_BINARY_NAME}.exe\`) : ""`,
  ]);
  assert.equal(JSON.parse('"\\uC804\\uAE30\\uC2E0\\uBB38 \\uC624\\uD53C\\uC2A4"'), '전기신문 오피스');
});

// End to end: a document open in the app must not be written by the CLI.
// The CLI's own profile lookup is exercised through XDG_CONFIG_HOME, the
// non-Windows branch of the same function.
test('the CLI refuses to write a document the application has open', async t => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'electimes-cli-'));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  // Same layout as an install: the bundle uses resources/cli/node_modules.
  const cli = path.join(work, 'app', 'resources', 'cli');
  // The bundle resolves its dependencies beside itself; a symlink is not followed.
  fs.mkdirSync(cli, { recursive: true }); fs.cpSync(path.join(cliDir, 'node_modules'), path.join(cli, 'node_modules'), { recursive: true });
  // The CLI recognizes an install by resources/wasm/pdfium.wasm.
  fs.symlinkSync(path.join(baseDir, 'resources/wasm'), path.join(cli, '..', 'wasm'));
  fs.writeFileSync(path.join(cli, 'genoffice.cjs'), patched['genoffice.cjs']);
  fs.copyFileSync(path.join(cliDir, 'package.json'), path.join(cli, 'package.json'));
  const docs = path.join(work, 'docs'); fs.mkdirSync(docs);
  fs.writeFileSync(path.join(docs, 'a.md'), '# 원고\n\n본문입니다.\n');
  const doc = path.join(docs, 'a.docx'), ops = path.join(work, 'ops.json');
  fs.writeFileSync(ops, JSON.stringify([{ op: 'insert_content', index: 0, html: '<p>CLI</p>' }]));
  const runEnv = { ...process.env, XDG_CONFIG_HOME: path.join(work, 'config') }; delete runEnv.GENOFFICE_USER_DATA;
  const run = (bundle, ...args) => spawnSync(process.execPath, [bundle, ...args, '--json'], { env: runEnv, encoding: 'utf8' });
  assert.equal(JSON.parse(run(path.join(cli, 'genoffice.cjs'), 'create', '--type', 'docx', '--from', path.join(docs, 'a.md'), '--out', doc).stdout).status, 'ok');

  const app = spawn(process.execPath, ['-e', 'setTimeout(()=>{},60000)']);
  t.after(() => app.kill());
  const profile = path.join(work, 'config', 'Electimes Office'); fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'open-documents.json'), JSON.stringify({ pid: app.pid, paths: [doc] }));
  const before = fs.readFileSync(doc);

  const refused = run(path.join(cli, 'genoffice.cjs'), 'docs', 'apply', doc, '--ops', ops);
  const result = JSON.parse(refused.stdout);
  assert.notEqual(refused.status, 0);
  assert.equal(result.status, 'error');
  assert.match(JSON.stringify(result), /file_open_in_gui/);
  assert.match(JSON.stringify(result), /Electimes Office has this file open/);
  assert.deepEqual(fs.readFileSync(doc), before);

  // The unmodified 1.0.12 bundle writes into the open document.
  const old = path.join(cli, 'original.cjs'); fs.writeFileSync(old, original['genoffice.cjs']);
  assert.equal(JSON.parse(run(old, 'docs', 'apply', doc, '--ops', ops).stdout).status, 'ok');
  assert.notDeepEqual(fs.readFileSync(doc), before);
});
