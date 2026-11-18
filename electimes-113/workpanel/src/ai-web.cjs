/* Web AI in the work panel: the official ChatGPT, Claude and Gemini web pages,
 * each in its own sandboxed, persistent session. The user signs in on the
 * service's own page. The application never reads the pages, injects scripts,
 * copies browser cookies or relaxes web security. Text moves between the page
 * and a document only through the user's own copy and paste. */
const path = require('node:path');

const SERVICES = Object.freeze({
  chatgpt: Object.freeze({ id: 'chatgpt', label: 'ChatGPT', home: 'https://chatgpt.com/', login: 'https://chatgpt.com/auth/login', main: 'chatgpt.com', hosts: ['chatgpt.com', 'openai.com', 'oaistatic.com', 'oaiusercontent.com'] }),
  claude: Object.freeze({ id: 'claude', label: 'Claude', home: 'https://claude.ai/new', login: 'https://claude.ai/login', main: 'claude.ai', hosts: ['claude.ai', 'claude.com', 'anthropic.com', 'claudeusercontent.com'] }),
  gemini: Object.freeze({ id: 'gemini', label: 'Gemini', home: 'https://gemini.google.com/app', login: 'https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fgemini.google.com%2Fapp&hl=ko', main: 'gemini.google.com', hosts: ['gemini.google.com'] }),
});
const SERVICE_IDS = Object.keys(SERVICES);

// Sign-in pages the services send users to (Google, Apple, Microsoft accounts and
// the Cloudflare check). They are shown inside the same isolated session so the
// login lands where the service expects it.
const AUTH_HOSTS = ['accounts.google.com', 'accounts.google.co.kr', 'accounts.youtube.com', 'consent.google.com', 'consent.youtube.com',
  'appleid.apple.com', 'login.live.com', 'account.live.com', 'login.microsoftonline.com', 'challenges.cloudflare.com'];

const partitionOf = id => `persist:electimes-workpanel-ai-${SERVICES[id] ? id : 'chatgpt'}`;

function httpsUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && String(value).length < 8192 ? u : null; } catch { return null; }
}
const hostIn = (host, list) => list.some(h => host === h || host.endsWith('.' + h));

/** 'service' for any of the three AI services, 'auth' for a sign-in page, otherwise null. */
function classify(url) {
  const u = httpsUrl(url); if (!u) return null;
  if (SERVICE_IDS.some(id => hostIn(u.hostname, SERVICES[id].hosts))) return 'service';
  if (hostIn(u.hostname, AUTH_HOSTS)) return 'auth';
  return null;
}

/** The service a pasted sign-in link belongs to, or null. */
function serviceOf(url) {
  const u = httpsUrl(url); if (!u) return null;
  return SERVICE_IDS.find(id => hostIn(u.hostname, SERVICES[id].hosts)) || null;
}

// Account sign-in pages. Signing in inside the narrow panel view did not complete
// for ChatGPT and Gemini, while Claude's Google sign-in, which the site opens as a
// separate window, did. These pages therefore always open in a separate sign-in
// window that shares only the service's session (as the mail login already does).
const SIGN_IN_HOSTS = AUTH_HOSTS.filter(h => h !== 'challenges.cloudflare.com').concat(['auth.openai.com', 'auth0.openai.com']);
function isSignIn(url) {
  const u = httpsUrl(url); if (!u) return false;
  return hostIn(u.hostname, SIGN_IN_HOSTS) || (u.hostname === 'chatgpt.com' && /^\/auth\/login/.test(u.pathname));
}

/** The sign-in window has finished when it is back on the service itself. */
function signedIn(id, url) {
  const u = httpsUrl(url), s = SERVICES[id]; if (!u || !s) return false;
  return u.hostname === s.main && !/^\/(auth|login|api\/auth|magic-link|sso)(\/|$)/.test(u.pathname);
}

/** A top-level navigation the user or page starts inside the panel. */
function inPanel(url) { return url === 'about:blank' || classify(url) !== null; }

/** Server redirects (sign-in cookie hand-offs between Google domains) only need HTTPS. */
function redirectAllowed(url) { return !!httpsUrl(url); }

/** Chrome's own reduced user agent for this engine, without application or Electron tokens.
 * Sign-in pages treat an unknown embedded browser as unsupported. */
function browserUserAgent(electronUserAgent, chromeVersion) {
  const platform = /^Mozilla\/5\.0 \(([^)]+)\)/.exec(electronUserAgent || '')?.[1] || 'Windows NT 10.0; Win64; x64';
  const major = /^(\d+)/.exec(chromeVersion || '')?.[1] || /Chrome\/(\d+)/.exec(electronUserAgent || '')?.[1] || '150';
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}

// Only what the pages need for their own copy buttons and full-screen images.
const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write', 'fullscreen']);
const permissionAllowed = permission => ALLOWED_PERMISSIONS.has(permission);

/** Installed Edge first (present on every supported Windows), then Chrome. */
function browserCandidates(env = process.env) {
  const roots = [env['ProgramFiles(x86)'], env.ProgramFiles, env.LOCALAPPDATA].filter(Boolean);
  const out = [];
  for (const rel of [['Microsoft', 'Edge', 'Application', 'msedge.exe'], ['Google', 'Chrome', 'Application', 'chrome.exe']])
    for (const root of roots) out.push(path.win32.join(root, ...rel));
  return out;
}

/** Arguments for a separate app window of the user's own browser and profile. */
function appWindowArgs(url, bounds) {
  // Only the three fixed official pages are ever passed to another program.
  if (!SERVICE_IDS.some(id => SERVICES[id].home === url)) throw Error('invalid-url');
  const args = ['--app=' + url];
  if (bounds && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(bounds[k]))) {
    args.push(`--window-size=${Math.max(420, Math.round(bounds.width))},${Math.max(560, Math.round(bounds.height))}`,
      `--window-position=${Math.round(bounds.x)},${Math.round(bounds.y)}`);
  }
  return args;
}

module.exports = { SERVICES, SERVICE_IDS, AUTH_HOSTS, partitionOf, classify, serviceOf, isSignIn, signedIn, inPanel, redirectAllowed, browserUserAgent, permissionAllowed, browserCandidates, appWindowArgs };
