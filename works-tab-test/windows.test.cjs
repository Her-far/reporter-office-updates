'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { _electron } = require('playwright');
const { WORKS_URL } = require('./src/policy.cjs');
const root = __dirname, report = { testEdition: 1, productionDataWritten: false, liveAccountsTested: false };
let app, home;
const timer = setTimeout(() => { console.error('Test deadline exceeded'); process.exit(1); }, 330000); timer.unref();
async function until(fn, label, timeout = 45000) { const end = Date.now() + timeout; while (Date.now() < end) { const result = await fn(); if (result) return result; await new Promise(r => setTimeout(r, 100)); } throw Error('Timed out: ' + label); }
async function launch() {
  app = await _electron.launch({ executablePath: path.join(root, 'stage/Electimes Office Works Test.exe'), env: { ...process.env, GENOFFICE_NO_SPARE_VIEW: '1', GENOFFICE_LANG: 'ko' }, timeout: 60000 });
  home = await app.firstWindow();
  await home.waitForFunction(() => window.electimesWorks && window.aiOfficeTabs);
  const welcome = home.locator('.onb-overlay'); await welcome.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
  if (await welcome.isVisible()) await welcome.getByRole('button', { name: /^Skip$|건너뛰기/ }).click();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 900));
}
const fixture = '<!doctype html><html lang="ko"><meta charset="utf-8"><title>Works test fixture</title><body><h1>Works 통합 테스트</h1><label>일간 업무보고<textarea id="draft"></textarea></label><a id="escape" href="https://example.com/untrusted">외부 이동</a><script>window.visitCount=1;document.body.dataset.saved=localStorage.getItem("works-test-key")||"";</script></body></html>';
async function interceptWorks() { await app.context().route(WORKS_URL + '**', route => route.fulfill({ contentType: 'text/html', body: fixture })); }
async function remotePage() { return until(() => app.context().pages().find(p => p.url().startsWith(WORKS_URL)), 'Works remote'); }
async function hostPage() { return until(() => app.context().pages().find(p => p.url().endsWith('/works-tab/host.html')), 'Works host'); }
async function closeApp() { if (app) { const old = app; app = null; await old.evaluate(({ app }) => app.exit(0)); await old.close().catch(() => {}); } }
async function geometry() {
  return app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return { bounds: win.getContentBounds(), views: win.contentView.children.filter(v => v.webContents && !v.webContents.isDestroyed()).map(v => ({ url: v.webContents.getURL(), visible: v.getVisible(), bounds: v.getBounds() })) };
  });
}
(async () => {
  await launch();
  report.profile = await app.evaluate(({ app }) => ({ userData: app.getPath('userData'), name: app.getName(), version: app.getVersion() }));
  assert(report.profile.userData.endsWith('ElectimesOffice-Works-Test')); assert.equal(report.profile.version, '1.0.12-works-test.1');
  const update = await home.evaluate(() => window.aiOffice.reporterUpdates.check()); assert.equal(update.phase, 'unconfigured'); assert.equal(update.source, ''); report.updatesDisabled = true;
  await interceptWorks();
  await home.getByRole('button', { name: '전기신문 Works 열기', exact: true }).click();
  let remote = await remotePage(); await remote.locator('#draft').fill('오전 취재 일정 · 탭 이동 후에도 유지');
  await remote.evaluate(() => localStorage.setItem('works-test-key', 'persisted-test-session'));
  const id = await home.evaluate(async () => (await window.aiOfficeTabs.list()).find(t => t.kind === 'works').id);
  assert.equal(await remote.evaluate(() => typeof require), 'undefined');
  assert.equal(await remote.evaluate(() => typeof window.aiOffice), 'undefined');
  assert.equal(await remote.evaluate(() => typeof window.worksTab), 'undefined');
  assert.equal(await remote.evaluate(() => typeof window.electimesWorks), 'undefined');
  report.security = await app.evaluate(({ webContents }, origin) => {
    const wc = webContents.getAllWebContents().find(w => w.getURL().startsWith(origin));
    const p = wc.getLastWebPreferences(); return { sandbox: p.sandbox, contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration, webSecurity: p.webSecurity, preload: p.preload || null, storagePath: wc.session.storagePath };
  }, WORKS_URL);
  assert(report.security.sandbox && report.security.contextIsolation && report.security.webSecurity); assert.equal(report.security.nodeIntegration, false); assert.equal(report.security.preload, null);
  // A deliberately cancelled native navigation never commits. Do not wait for a commit.
  await remote.locator('#escape').click({ noWaitAfter: true }); await remote.waitForTimeout(250); assert.equal(remote.url(), WORKS_URL); report.foreignNavigationBlocked = true;
  console.log('PASS: launch, profile isolation, disabled updater, remote security and navigation');
  await home.evaluate(() => window.aiOfficeTabs.activate('home'));
  assert.equal((await geometry()).views.find(v => v.url.startsWith(WORKS_URL)).visible, false);
  await home.getByRole('button', { name: '전기신문 Works 열기', exact: true }).click();
  assert.equal((await home.evaluate(() => window.aiOfficeTabs.list())).filter(t => t.kind === 'works').length, 1);
  assert.equal(await remote.locator('#draft').inputValue(), '오전 취재 일정 · 탭 이동 후에도 유지'); report.singletonAndDraftPreserved = true;
  await home.evaluate(() => window.aiOffice.newHwp());
  const editor = await until(() => app.context().pages().find(p => p.url().includes('/hwp/renderer/index.html') || p.url().includes('hwp/index.html')), 'HWP document');
  await editor.locator('.hwp-app[data-phase="ready"]').waitFor({ timeout: 60000 });
  assert.equal((await geometry()).views.find(v => v.url.startsWith(WORKS_URL)).visible, false);
  await home.evaluate(id => window.aiOfficeTabs.activate(id), id);
  assert.equal(await remote.locator('#draft').inputValue(), '오전 취재 일정 · 탭 이동 후에도 유지'); report.documentSwitch = true;
  console.log('PASS: singleton Works tab and draft preservation across HWP document switching');
  report.resizes = [];
  for (const size of [[900, 650], [1500, 950], [1100, 750]]) {
    await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(...size), size);
    await remote.waitForTimeout(200);
    const g = await geometry(), view = g.views.find(v => v.url.startsWith(WORKS_URL)), host = g.views.find(v => v.url.endsWith('/works-tab/host.html'));
    assert(view.visible); assert.equal(view.bounds.y, host.bounds.y + 48); assert.equal(view.bounds.width, g.bounds.width); assert.equal(view.bounds.y + view.bounds.height, g.bounds.height);
    report.resizes.push({ width: g.bounds.width, height: g.bounds.height, page: view.bounds });
  }
  await home.evaluate(id => window.aiOfficeTabs.close(id), id);
  await until(async () => !(await geometry()).views.some(v => v.url.startsWith(WORKS_URL)), 'remote destroyed on close');
  await home.getByRole('button', { name: '전기신문 Works 열기', exact: true }).click();
  remote = await remotePage(); await remote.waitForFunction(() => document.body.dataset.saved === 'persisted-test-session'); report.reopenSessionPreserved = true;
  await closeApp(); await launch(); await interceptWorks();
  assert.equal((await home.evaluate(() => window.aiOfficeTabs.list())).filter(t => t.kind === 'works').length, 0);
  await home.getByRole('button', { name: '전기신문 Works 열기', exact: true }).click(); remote = await remotePage();
  await remote.waitForFunction(() => document.body.dataset.saved === 'persisted-test-session'); report.restartSessionPreserved = true;
  console.log('PASS: resize bounds, tab close, reopen and application restart persistence');
  const host = await hostPage();
  await app.context().unroute(WORKS_URL + '**'); await app.context().route(WORKS_URL + '**', route => route.abort('internetdisconnected'));
  await host.evaluate(() => window.worksTab.action('retry')); await host.locator('#retry').waitFor({ state: 'visible' });
  assert.equal((await geometry()).views.find(v => v.url.startsWith(WORKS_URL)).visible, false);
  await app.context().unroute(WORKS_URL + '**'); await interceptWorks(); await host.locator('#retry').click();
  await remote.locator('#draft').waitFor(); report.offlineRetry = true;
  console.log('PASS: offline error and successful retry');
  // Read-only live smoke: login screen only; no company account credentials or data changes.
  await app.context().unroute(WORKS_URL + '**');
  await host.evaluate(() => window.worksTab.action('retry'));
  await remote.getByText('전력에너지 산업의 밝은 미래', { exact: false }).first().waitFor({ timeout: 60000 });
  await remote.screenshot({ path: path.join(root, 'works-live-login-windows.png') });
  report.liveLoginPage = true;
  report.pass = true; console.log(JSON.stringify(report, null, 2));
})().catch(error => { report.error = String(error.stack || error); console.error(error); process.exitCode = 1; }).finally(async () => {
  fs.writeFileSync(path.join(root, 'works-windows.json'), JSON.stringify(report, null, 2));
  await closeApp().catch(() => {}); process.exit(process.exitCode || 0);
});
