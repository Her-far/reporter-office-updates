'use strict';
// Evidence, not a gate: opens the REAL ChatGPT, Claude and Gemini pages (and the
// Google sign-in page Gemini links to) in the built application's web AI panel
// and records where each one ends up, with a screenshot. No account is used.
// A CI machine's address may be shown a bot check that people do not see.
//   ELECTRON_BINARY=<electron 43.7.6> WORKPANEL_PAYLOAD=<stage> WORKPANEL_QA_DIR=<out> node ai-web-live.cjs
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { prepare, launchOptions, wait } = require('./harness.cjs');
const out = path.resolve(process.env.WORKPANEL_QA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'electimes-aiweb-live-')));
const harness = prepare(out);

(async () => {
  const app = await _electron.launch(launchOptions(harness)), report = [];
  try {
    await app.evaluate(({ shell }) => { globalThis.__external = []; shell.openExternal = async url => { globalThis.__external.push(url); }; });
    const root = await app.firstWindow(); await root.waitForSelector('.wp-toolbar', { timeout: 30000 });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.getParentWindow()).setContentSize(1400, 900));
    await root.locator('[data-menu=aiweb]').click();
    const panel = await wait(async () => app.context().pages().find(p => p.url().includes('work-panel/index.html')), 'panel');
    await panel.locator('.ai-services').waitFor();
    const view = id => app.evaluate(async ({ BrowserWindow, session }, id) => {
      const w = BrowserWindow.getAllWindows().flatMap(w => w.contentView.children).map(v => v.webContents).find(w => w && w.session === session.fromPartition('persist:electimes-workpanel-ai-' + id));
      if (!w) return null;
      const text = await w.executeJavaScript('document.body ? document.body.innerText.slice(0, 600) : ""').catch(() => '');
      return { url: w.getURL(), title: w.getTitle(), text: text.replace(/\s+/g, ' '), png: (await w.capturePage()).toPNG().toString('base64') };
    }, id);
    for (const [id, label] of [['chatgpt', 'ChatGPT'], ['claude', 'Claude'], ['gemini', 'Gemini']]) {
      await panel.locator('.ai-services button', { hasText: label }).click();
      await new Promise(r => setTimeout(r, 20000));
      const v = await view(id);
      if (v) fs.writeFileSync(path.join(out, `live-${id}.png`), Buffer.from(v.png, 'base64'));
      const entry = v ? { service: id, url: v.url, title: v.title, text: v.text, botCheck: /security|보안 확인|verify you are human|사람인지/i.test(v.title + ' ' + v.text) } : { service: id, error: 'no view' };
      report.push(entry); console.log(JSON.stringify({ ...entry, text: entry.text?.slice(0, 160) }));
    }
    // Google's own sign-in page in Gemini's session: does it offer the normal flow?
    await panel.evaluate(() => window.workPanel.action('ai-service', 'gemini'));
    await app.evaluate(async ({ BrowserWindow, session }) => {
      const w = BrowserWindow.getAllWindows().flatMap(w => w.contentView.children).map(v => v.webContents).find(w => w && w.session === session.fromPartition('persist:electimes-workpanel-ai-gemini'));
      await w.loadURL('https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fgemini.google.com%2Fapp&hl=ko').catch(() => {});
    });
    await new Promise(r => setTimeout(r, 8000));
    const g = await view('gemini');
    if (g) fs.writeFileSync(path.join(out, 'live-google-signin.png'), Buffer.from(g.png, 'base64'));
    const google = { service: 'google-signin', url: g?.url, title: g?.title, flow: /flowName=([A-Za-z]+)/.exec(g?.url || '')?.[1] || null,
      refused: /안전하지 않|may not be secure|not secure/i.test(g?.text || '') };
    report.push(google); console.log(JSON.stringify(google));
    fs.writeFileSync(path.join(out, 'live-report.json'), JSON.stringify({ note: 'No account used. CI addresses can get bot checks people do not see.', report, external: await app.evaluate(() => globalThis.__external) }, null, 2));
  } finally { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); }
})().catch(e => { console.error('LIVE PROBE ERROR', e); process.exitCode = 1; });
