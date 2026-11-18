'use strict';
// node --test electimes-113/workpanel/tests/ai-web.test.cjs
const test = require('node:test'), assert = require('node:assert/strict');
const ai = require('../src/ai-web.cjs');
const { settingsOf, DEFAULTS, MENUS } = require('../src/policy.cjs');

test('three services, each with its own persistent session', () => {
  assert.deepEqual(ai.SERVICE_IDS, ['chatgpt', 'claude', 'gemini']);
  const parts = ai.SERVICE_IDS.map(ai.partitionOf);
  assert.equal(new Set(parts).size, 3);
  for (const p of parts) assert.match(p, /^persist:electimes-workpanel-ai-/);
  assert.notEqual(ai.partitionOf('chatgpt'), 'persist:electimes-workpanel-mail');
});

test('service and sign-in pages stay in the panel; everything else leaves it', () => {
  for (const url of ['https://chatgpt.com/', 'https://auth.openai.com/log-in', 'https://claude.ai/new', 'https://gemini.google.com/app',
    'https://accounts.google.com/v3/signin/identifier', 'https://appleid.apple.com/auth', 'https://login.live.com/', 'about:blank'])
    assert.ok(ai.inPanel(url), url);
  for (const url of ['https://www.google.com/search?q=x', 'https://support.google.com/gemini', 'https://example.com/',
    'https://chatgpt.com.evil.example/', 'https://evilchatgpt.com/', 'http://chatgpt.com/', 'file:///C:/Windows/win.ini', 'javascript:alert(1)',
    'https://user:pw@chatgpt.com/'])
    assert.ok(!ai.inPanel(url), url);
  assert.equal(ai.classify('https://accounts.google.com/'), 'auth');
  assert.equal(ai.classify('https://chatgpt.com/c/1'), 'service');
});

test('sign-in redirects between Google domains are followed only over HTTPS', () => {
  assert.ok(ai.redirectAllowed('https://accounts.youtube.com/accounts/SetSID'));
  assert.ok(ai.redirectAllowed('https://www.google.co.kr/accounts/SetSID'));
  assert.ok(!ai.redirectAllowed('http://accounts.google.com/'));
  assert.ok(!ai.redirectAllowed('file:///etc/passwd'));
});

test('pasted login links open only on their own service', () => {
  assert.equal(ai.serviceOf('https://claude.ai/magic-link#abc'), 'claude');
  assert.equal(ai.serviceOf('https://chatgpt.com/auth/login'), 'chatgpt');
  assert.equal(ai.serviceOf('https://accounts.google.com/'), null);
  assert.equal(ai.serviceOf('https://claude.ai.example.com/'), null);
});

test('pages see a plain Chrome user agent, not the app or Electron', () => {
  const electron = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) electimes-office/1.0.13 Chrome/150.0.7871.250 Electron/43.7.6 Safari/537.36';
  const ua = ai.browserUserAgent(electron, '150.0.7871.250');
  assert.equal(ua, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36');
  assert.doesNotMatch(ua, /Electron|electimes/i);
});

test('only copy and full-screen permissions are granted', () => {
  assert.ok(ai.permissionAllowed('clipboard-sanitized-write'));
  for (const p of ['media', 'geolocation', 'notifications', 'clipboard-read', 'openExternal', 'hid', 'serial', 'usb'])
    assert.ok(!ai.permissionAllowed(p), p);
});

test('Edge app window uses the user\'s own browser at the panel position', () => {
  const env = { 'ProgramFiles(x86)': 'C:\\Program Files (x86)', ProgramFiles: 'C:\\Program Files', LOCALAPPDATA: 'C:\\Users\\r\\AppData\\Local' };
  const list = ai.browserCandidates(env);
  assert.equal(list[0], 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');
  assert.ok(list.some(f => f.endsWith('\\Google\\Chrome\\Application\\chrome.exe')));
  assert.deepEqual(ai.appWindowArgs('https://gemini.google.com/app', { x: 900, y: 80, width: 400, height: 700 }),
    ['--app=https://gemini.google.com/app', '--window-size=420,700', '--window-position=900,80']);
  assert.deepEqual(ai.appWindowArgs('https://claude.ai/new'), ['--app=https://claude.ai/new']);
  // Only the three official pages; no arbitrary command-line content.
  assert.throws(() => ai.appWindowArgs('https://example.com/'), /invalid-url/);
  assert.throws(() => ai.appWindowArgs('https://chatgpt.com/ --disable-web-security'), /invalid-url/);
});

test('web AI preferences: menu, defaults and validation', () => {
  assert.ok(MENUS.includes('aiweb'));
  assert.equal(DEFAULTS.aiWebEnabled, true); assert.equal(DEFAULTS.aiWebService, 'chatgpt'); assert.equal(DEFAULTS.aiWebNoticeSeen, false);
  const p = settingsOf({ menu: 'aiweb', defaultMenu: 'aiweb', aiWebService: 'gemini', aiWebZoom: 9, aiWebEnabled: false });
  assert.equal(p.menu, 'aiweb'); assert.equal(p.aiWebService, 'gemini'); assert.equal(p.aiWebZoom, 1.5); assert.equal(p.aiWebEnabled, false);
  assert.equal(settingsOf({ aiWebService: 'bing' }).aiWebService, 'chatgpt');
  // Settings saved by 1.0.12 load unchanged.
  const old = settingsOf({ menu: 'mail', mailDisplay: 'web', width: 520 });
  assert.equal(old.menu, 'mail'); assert.equal(old.width, 520); assert.equal(old.aiWebService, 'chatgpt');
});

test('account sign-in pages go to a separate window and finish back on the service', () => {
  for (const url of ['https://accounts.google.com/v3/signin/identifier', 'https://auth.openai.com/log-in', 'https://chatgpt.com/auth/login?next=/', 'https://appleid.apple.com/auth', 'https://login.live.com/'])
    assert.ok(ai.isSignIn(url), url);
  for (const url of ['https://chatgpt.com/', 'https://claude.ai/login', 'https://gemini.google.com/app', 'https://challenges.cloudflare.com/x', 'http://accounts.google.com/'])
    assert.ok(!ai.isSignIn(url), url);
  assert.ok(ai.signedIn('chatgpt', 'https://chatgpt.com/'));
  assert.ok(ai.signedIn('gemini', 'https://gemini.google.com/app'));
  assert.ok(ai.signedIn('claude', 'https://claude.ai/new'));
  for (const [id, url] of [['chatgpt', 'https://chatgpt.com/auth/login'], ['chatgpt', 'https://auth.openai.com/'], ['claude', 'https://claude.ai/login'], ['claude', 'https://claude.ai/magic-link'], ['gemini', 'https://accounts.google.com/'], ['gemini', 'https://chatgpt.com/']])
    assert.ok(!ai.signedIn(id, url), id + ' ' + url);
  for (const id of ai.SERVICE_IDS) assert.ok(ai.inPanel(ai.SERVICES[id].login) && !ai.signedIn(id, ai.SERVICES[id].login));
});
