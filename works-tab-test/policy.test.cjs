'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { WORKS_URL, isWorksUrl, externalUrl, mainFrameFrom, pageBounds } = require('./src/policy.cjs');
test('Works navigation uses exact HTTPS origin, without credentials', () => {
  assert(isWorksUrl(WORKS_URL)); assert(isWorksUrl(WORKS_URL + '?next=calendar#daily'));
  for (const value of ['javascript:alert(1)', 'file:///C:/Windows', 'https://moa-work-studio-605315.idealnacre6.chatgpt.site.evil.test/', WORKS_URL.replace('https:', 'http:'), WORKS_URL.replace('https://', 'https://u:p@'), 'not-a-url']) assert.equal(isWorksUrl(value), false, value);
});
test('External browser rejects native schemes and URL credentials', () => {
  assert.equal(externalUrl('https://calendar.google.com/calendar/u/0/r'), 'https://calendar.google.com/calendar/u/0/r');
  for (const value of ['file:///tmp/test', 'javascript:alert(1)', 'ms-settings:privacy', 'http://example.com', 'https://u:p@example.com']) assert.equal(externalUrl(value), null);
});
test('Privileged actions require the exact trusted main frame', () => {
  const host = { mainFrame: {}, isDestroyed: () => false }, other = { mainFrame: {}, isDestroyed: () => false };
  assert(mainFrameFrom({ sender: host, senderFrame: host.mainFrame }, host));
  assert.equal(mainFrameFrom({ sender: host, senderFrame: {} }, host), false);
  assert.equal(mainFrameFrom({ sender: other, senderFrame: other.mainFrame }, host), false);
  assert.equal(mainFrameFrom({ sender: host, senderFrame: host.mainFrame }, null), false);
});
test('Remote content always leaves room for the toolbar, including zoom and tiny windows', () => {
  assert.deepEqual(pageBounds({ x: 0, y: 40, width: 1280, height: 800 }), { x: 0, y: 88, width: 1280, height: 752 });
  assert.deepEqual(pageBounds({ x: 0, y: 50, width: 800, height: 600 }, 1.5), { x: 0, y: 122, width: 800, height: 528 });
  assert.equal(pageBounds({ x: 0, y: 0, width: 100, height: 20 }).height, 0);
});
test('Updater actions are inert, cannot enable a production feed, and reject other frames', () => {
  const handlers = new Map(), host = { mainFrame: {} }, module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('./src/updater-disabled.cjs'), 'utf8'), { module, require(name) { assert.equal(name, 'electron'); return { ipcMain: { handle: (name, fn) => handlers.set(name, fn) } }; } });
  module.exports.registerReporterUpdates(() => ({ webContents: host }));
  assert.equal(handlers.size, 7);
  for (const fn of handlers.values()) {
    const state = fn({ sender: host, senderFrame: host.mainFrame }, 'https://example.com/production.json');
    assert.equal(state.source, ''); assert.equal(state.phase, 'unconfigured');
    assert.throws(() => fn({ sender: host, senderFrame: {} }));
  }
});
