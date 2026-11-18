'use strict';
const WORKS_URL = 'https://moa-work-studio-605315.idealnacre6.chatgpt.site/';
const WORKS_ORIGIN = new URL(WORKS_URL).origin;
function isWorksUrl(value) {
  try { const u = new URL(value); return u.origin === WORKS_ORIGIN && !u.username && !u.password; } catch { return false; }
}
function externalUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; }
}
function mainFrameFrom(event, contents) {
  return !!contents && !contents.isDestroyed() && event.sender === contents && event.senderFrame === contents.mainFrame;
}
function pageBounds(bounds, zoom = 1) {
  const header = Math.min(bounds.height, Math.ceil(48 * zoom));
  return { x: bounds.x, y: bounds.y + header, width: bounds.width, height: Math.max(0, bounds.height - header) };
}
module.exports = { WORKS_URL, WORKS_ORIGIN, isWorksUrl, externalUrl, mainFrameFrom, pageBounds };
