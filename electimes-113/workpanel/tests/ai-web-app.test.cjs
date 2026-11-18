'use strict';
// Drives the built 1.0.13 application (Electron 43.7.6) through the web AI panel.
// The three services are served by stand-in pages on their real https origins,
// installed with protocol.handle on each service's own session. No account or
// real AI page is used; live sign-in is a separate Windows check.
//   ELECTRON_BINARY=<electron 43.7.6> WORKPANEL_PAYLOAD=<stage> node ai-web-app.test.cjs
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { prepare, launchOptions, wait } = require('./harness.cjs');
const out = path.resolve(process.env.WORKPANEL_QA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'electimes-aiweb-')));
const harness = prepare(out);

const results = [];
const ok = (name, value) => { assert(value, name); results.push(name); console.log('PASS', name); };

(async () => {
  const app = await _electron.launch(launchOptions(harness));
  try {
    // Stand-in pages, a record of links handed to the default browser, and a scripted logout answer.
    await app.evaluate(({ session, shell, dialog }) => {
      globalThis.__external = []; shell.openExternal = async url => { globalThis.__external.push(url); };
      dialog.showMessageBox = async () => ({ response: 1 });
      const page = (title, body) => new Response(`<!doctype html><meta charset=utf-8><title>${title}</title><body style="font:16px sans-serif;margin:12px"><h1>${title}</h1>${body}<pre id=ua></pre><script>ua.textContent=navigator.userAgent</script>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      for (const id of ['chatgpt', 'claude', 'gemini']) {
        const s = session.fromPartition('persist:electimes-workpanel-ai-' + id);
        s.protocol.handle('https', req => {
          const u = new URL(req.url);
          if (u.pathname === '/favicon.ico') return new Response('', { status: 404 });
          return page(u.host + u.pathname, `
            <a id=login href="https://auth.openai.com/log-in">login</a>
            <a id=google href="https://accounts.google.com/v3/signin/identifier">google</a>
            <a id=cite target=_blank href="https://example.com/source">source</a>
            <a id=search href="https://www.google.com/search?q=x">search</a>
            <a id=file href="file:///C:/Windows/win.ini">file</a>
            <button id=copy onclick="navigator.clipboard.writeText('웹 AI 답변 복사').then(()=>document.title='copied',e=>document.title='denied:'+e.name)">copy</button>`);
        });
      }
    });

    const root = await app.firstWindow(); await root.waitForSelector('.wp-toolbar', { timeout: 30000 });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1400, 900)); await root.waitForTimeout(300);
    ok('Web AI tab sits next to the document AI tab', await root.locator('.wp-toolbar [data-menu]').evaluateAll(ns => ns.map(n => n.dataset.menu).join()) === 'ai,aiweb,mail,calendar,notes');
    await root.locator('[data-menu=aiweb]').click();
    const view = url => app.evaluate(({ webContents }, url) => !!webContents.getAllWebContents().find(w => w.getURL().startsWith(url)), url);
    await wait(() => view('https://chatgpt.com/'), 'ChatGPT view');
    const panel = await wait(async () => app.context().pages().find(p => p.url().includes('work-panel/index.html')), 'panel');
    await panel.locator('.ai-services').waitFor();
    ok('Service switcher shows ChatGPT, Claude, Gemini', (await panel.locator('.ai-services button').allInnerTexts()).join() === 'ChatGPT,Claude,Gemini');
    ok('First-use notice warns about unpublished copy', (await panel.locator('.ai-notice').innerText()).includes('미공개 원고'));

    const info = id => app.evaluate(async ({ webContents, session, BrowserWindow }, id) => {
      const w = BrowserWindow.getAllWindows()[0].contentView.children.map(v => v.webContents).find(w => w && w.session === session.fromPartition('persist:electimes-workpanel-ai-' + id));
      if (!w) return null; const p = w.getLastWebPreferences();
      const view = BrowserWindow.getAllWindows()[0].contentView.children.find(v => v.webContents === w);
      return { url: w.getURL(), node: p.nodeIntegration, isolation: p.contextIsolation, sandbox: p.sandbox, webSecurity: p.webSecurity, preload: p.preload || null,
        visible: !!view?.getVisible(), bounds: view?.getBounds(), ua: await w.executeJavaScript('navigator.userAgent'), title: w.getTitle() };
    }, id);
    await wait(async () => (await info('chatgpt'))?.visible, 'ChatGPT visible');
    let c = await info('chatgpt');
    ok('Remote page is sandboxed, isolated and without preload', !c.node && c.isolation && c.sandbox && c.webSecurity && !c.preload);
    ok('Page sees a plain Chrome user agent', /Chrome\/\d+\.0\.0\.0 Safari\/537\.36$/.test(c.ua) && !/Electron|electimes/i.test(c.ua));
    const win = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentBounds());
    ok('Page is placed inside the side panel', c.bounds.width >= 250 && c.bounds.height > 300 && c.bounds.x > win.width / 3 && c.bounds.x + c.bounds.width <= win.width + 1);

    await panel.getByRole('button', { name: '확인', exact: true }).click();
    await wait(async () => !(await panel.locator('.ai-notice').count()), 'notice dismissed');
    ok('Notice stays dismissed', (await panel.evaluate(() => window.workPanel.action('state'))).state.prefs.aiWebNoticeSeen === true);

    const run = (id, js) => app.evaluate(({ webContents, session, BrowserWindow }, [id, js]) => {
      const w = BrowserWindow.getAllWindows()[0].contentView.children.map(v => v.webContents).find(w => w && w.session === session.fromPartition('persist:electimes-workpanel-ai-' + id));
      return w.executeJavaScript(js, true);
    }, [id, js]);

    await run('chatgpt', "document.getElementById('copy').click()");
    await wait(async () => (await info('chatgpt')).title === 'copied', 'copy');
    ok("The page's own copy button reaches the clipboard", await app.evaluate(({ clipboard }) => clipboard.readText()) === '웹 AI 답변 복사');

    await run('chatgpt', "document.getElementById('login').click()");
    await wait(async () => (await info('chatgpt')).url.startsWith('https://auth.openai.com/'), 'sign-in page');
    ok('Sign-in page opens inside the panel', true);
    await run('chatgpt', "document.getElementById('google').click()");
    await wait(async () => (await info('chatgpt')).url.startsWith('https://accounts.google.com/'), 'Google sign-in');
    ok('Google sign-in opens inside the same isolated session', true);
    const before = (await info('chatgpt')).url;
    await run('chatgpt', "document.getElementById('search').click()");
    await wait(() => app.evaluate(() => globalThis.__external.includes('https://www.google.com/search?q=x')), 'search outside');
    ok('Other sites open in the default browser, not the panel', (await info('chatgpt')).url === before);
    await run('chatgpt', "document.getElementById('cite').click()");
    await wait(() => app.evaluate(() => globalThis.__external.includes('https://example.com/source')), 'citation outside');
    ok('Answer citations open in the default browser', true);
    await run('chatgpt', "document.getElementById('file').click()");
    await new Promise(r => setTimeout(r, 500));
    ok('Local files are neither opened nor handed out', (await info('chatgpt')).url === before && !(await app.evaluate(() => globalThis.__external.some(u => !u.startsWith('https://')))));
    await run('chatgpt', "void window.open('https://accounts.google.com/o/oauth2/auth','_blank','popup')");
    const popup = await wait(() => app.evaluate(({ BrowserWindow, session }) => { const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('https://accounts.google.com/o/oauth2')); return w ? { same: w.webContents.session === session.fromPartition('persist:electimes-workpanel-ai-chatgpt'), sandbox: w.webContents.getLastWebPreferences().sandbox } : null; }), 'sign-in popup');
    ok('Sign-in popup shares only the service session', popup.same && popup.sandbox);
    await app.evaluate(({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) if (w.webContents.getURL().startsWith('https://accounts.google.com/o/oauth2')) w.close(); });
    await panel.getByRole('button', { name: '뒤로' }).click();
    await wait(async () => (await info('chatgpt')).url.startsWith('https://auth.openai.com/'), 'back');
    ok('Back button returns to the previous page', true);

    await app.evaluate(({ session }) => session.fromPartition('persist:electimes-workpanel-ai-chatgpt').cookies.set({ url: 'https://chatgpt.com/', name: 'signed_in', value: '1', expirationDate: Date.now() / 1000 + 3600 }));
    await panel.locator('.ai-services button', { hasText: 'Claude' }).click();
    await wait(async () => (await info('claude'))?.visible, 'Claude visible');
    ok('Switching service hides the previous page', !(await info('chatgpt')).visible);
    ok('Sessions are separate per service', await app.evaluate(async ({ session }) => (await session.fromPartition('persist:electimes-workpanel-ai-claude').cookies.get({})).length === 0 && (await session.fromPartition('persist:electimes-workpanel-mail').cookies.get({ name: 'signed_in' })).length === 0));
    await panel.locator('.ai-services button', { hasText: 'Gemini' }).click();
    await wait(async () => (await info('gemini'))?.visible, 'Gemini visible');
    ok('Gemini opens its official address', (await info('gemini')).url === 'https://gemini.google.com/app');
    await panel.locator('.ai-services button', { hasText: 'ChatGPT' }).click();
    await wait(async () => (await info('chatgpt'))?.visible, 'ChatGPT again');
    ok('Returning keeps the conversation page', (await info('chatgpt')).url.startsWith('https://auth.openai.com/'));

    await panel.locator('.mail-more summary').click();
    await panel.getByLabel('로그인 링크').fill('https://claude.ai/magic-link#token');
    await panel.getByRole('button', { name: '이동', exact: true }).click();
    await wait(async () => (await info('claude'))?.url === 'https://claude.ai/magic-link#token' && (await info('claude')).visible, 'login link');
    ok('A pasted e-mail sign-in link opens in its service', true);
    const refused = await panel.evaluate(() => window.workPanel.action('ai-link', 'https://example.com/phish'));
    ok('Links outside the three services are refused', !refused.ok && refused.error === 'ai-link');

    await panel.locator('.ai-services button', { hasText: 'ChatGPT' }).click();
    await wait(async () => (await info('chatgpt'))?.visible, 'ChatGPT for logout');
    await panel.evaluate(() => window.workPanel.action('ai-reset'));
    ok('Logout clears only that service', await app.evaluate(async ({ session }) => (await session.fromPartition('persist:electimes-workpanel-ai-chatgpt').cookies.get({})).length === 0));
    await wait(async () => (await info('chatgpt'))?.url === 'https://chatgpt.com/', 'fresh page after logout');
    ok('After logout the service starts again', true);

    await panel.locator('.mail-more summary').click();
    const panelY = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.find(v => v.webContents?.getURL().includes('work-panel/index.html')).getBounds().y);
    const menuBottom = await panel.locator('.ai-extra').evaluate(n => n.getBoundingClientRect().bottom);
    await wait(async () => (await info('chatgpt')).bounds.y >= panelY + menuBottom - 1, 'page moves below the open menu', 5000).catch(async e => { fs.writeFileSync(path.join(out, 'panel-menu-fail.png'), await panel.screenshot()); console.log('DEBUG menu', panelY, menuBottom, JSON.stringify((await info('chatgpt')).bounds), await panel.locator('.ai-toolbar').evaluate(n => n.getBoundingClientRect().height), await panel.locator('.mail-more').evaluate(n => n.getBoundingClientRect().height)); throw e; });
    fs.writeFileSync(path.join(out, 'panel-menu.png'), await panel.screenshot());
    ok('Open menu is not covered by the page', true);
    await panel.locator('.mail-more summary').click();

    await root.locator('[data-menu=ai]').click();
    await wait(async () => !(await info('chatgpt')).visible, 'hidden for document AI');
    ok('Document AI tab hides every web page', !(await info('claude'))?.visible && !(await info('gemini'))?.visible);
    await root.locator('[data-menu=aiweb]').click();
    await wait(async () => (await info('chatgpt'))?.visible, 'shown again');
    ok('Web AI tab shows the last service again', true);

    await panel.evaluate(() => window.workPanel.action('settings', { aiWebEnabled: false }));
    await wait(async () => !(await info('chatgpt')).visible, 'disabled');
    ok('Turning web AI off hides the page', (await panel.locator('.ai-shell .empty').innerText()).includes('웹 AI를 켜'));
    await root.locator('[data-menu=mail]').click();
    await wait(async () => await root.locator('[data-menu=aiweb]').isHidden(), 'tab hidden');
    ok('Turning web AI off removes the tab', true);
    await panel.evaluate(() => window.workPanel.action('settings', { aiWebEnabled: true }));
    await wait(async () => await root.locator('[data-menu=aiweb]').isVisible(), 'tab back');
    ok('Turning web AI on restores the tab', true);

    await root.locator('[data-menu=aiweb]').click();
    await wait(async () => (await info('chatgpt'))?.visible, 'final');
    fs.writeFileSync(path.join(out, 'panel.png'), await panel.screenshot());
    const shot = await app.evaluate(async ({ webContents, session, BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0].contentView.children.map(v => v.webContents).find(w => w && w.session === session.fromPartition('persist:electimes-workpanel-ai-chatgpt')); return (await w.capturePage()).toPNG().toString('base64'); });
    fs.writeFileSync(path.join(out, 'page.png'), Buffer.from(shot, 'base64'));
    fs.writeFileSync(path.join(out, 'home.png'), await root.screenshot());
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ environment: 'Linux Electron 43.7.6 headless, built 1.0.13 payload, stand-in service pages', results, live: 'unverified: real sign-in needs Windows and accounts' }, null, 2));
    console.log(`\n${results.length} checks passed. Output: ${out}`);
  } finally { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); }
})().catch(e => { console.error('FAIL', e); process.exitCode = 1; });
