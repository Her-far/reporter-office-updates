# 1.0.13 web AI in the work panel, CLI launcher and profile

Base: the immutable published 1.0.12 installer, SHA-256
`8060e3e6e89bf33aed3d3a99fa00d1ea8e85cba22d42c3bc6693b47a38604431`
(`resources/app.asar` `07a6eaff72dd557c59e18ed67efda7ed96003474ed41b9b883db0aa94ff9b6e8`).

1.0.12 ships the upstream CLI unchanged. `resources/cli/ieumoffice.cmd` (and the
POSIX launcher used from Git Bash) start `IeumOffice.exe`, which does not exist;
the executable is `Electimes Office.exe`. Inside `genoffice.cjs` the product name
was still `IeumOffice`, so a CLI or MCP server started outside the app looked
for the profile in `%APPDATA%\IeumOffice` instead of `%APPDATA%\Electimes Office`.
It could not find the app's control endpoint or open documents, and wrote into
documents the user had open in the app. `mcp install` also registered a system
`node` instead of the app runtime, because it could not find the app executable.

## Web AI (work panel)

A **웹 AI** tab next to **AI** shows the official ChatGPT, Claude or Gemini web
page in the side panel. The user signs in with their own account (free accounts
work) and moves text between the page and a document by copy and paste. The
document AI (subscription or API key) is unchanged.

- Each service is a sandboxed `WebContentsView` (`contextIsolation`, `sandbox`,
  `webSecurity`, no preload) with its own persistent session
  (`persist:electimes-workpanel-ai-<service>`), separate from mail and from
  each other. The app never reads or scripts the pages and never imports browser
  cookies.
- The session sends Chrome's own reduced user agent (no `Electron/` or app
  token). With the default Electron agent, Google's sign-in served its reduced
  "WebLite" flow in a probe; with this agent it served the normal flow.
- The service pages and their sign-in pages (Google, Apple, Microsoft accounts,
  Cloudflare check) stay in the panel; sign-in popups share only that service's
  session. Every other link, including answer citations, opens in the default
  browser. Only HTTPS redirects are followed. Local files are never opened.
- The views join the shell's navigation-guard set (`isMailContents`); without
  that the global guard blocks every sign-in redirect.
- Only `clipboard-sanitized-write` (the pages' copy buttons) and `fullscreen` are
  granted. Downloads use the panel's download folder.
- Fallbacks when embedded sign-in is refused: **Edge 창으로 열기** starts the
  user's own Edge (else Chrome) as an `--app` window over the panel, with the
  user's normal profile and sign-in; **기본 브라우저에서 열기**; and pasting an
  e-mailed sign-in link (Claude) into the panel's menu.
- A first-use notice asks users not to enter embargoed copy, sources or personal
  data. Settings: enable/disable (hides the tab), first service, zoom; per-service
  logout clears only that session.

Sources: `workpanel/src/` (`ai-web.cjs` new; `main.cjs` and `host-preload.cjs`
from 1.0.10, `panel.js`, `policy.cjs`, `panel.css` from 1.0.9, each verified
against the 1.0.12 ASAR before it is replaced).

```
node --test workpanel/tests/ai-web.test.cjs
ELECTRON_BINARY=<electron 43.7.6> WORKPANEL_PAYLOAD=<stage> xvfb-run node workpanel/tests/ai-web-app.test.cjs
```

`ai-web-app.test.cjs` drives the built 1.0.13 application with stand-in pages on
the services' real HTTPS origins (29 checks: isolation, user agent, placement,
copy button, in-panel sign-in, popups, outside links, per-service sessions,
pasted link, logout, menu overlap, tab hiding). Live sign-in to the three real
services is not covered and must be checked on Windows with real accounts.

## CLI launcher and profile

`cli-profile.cjs` changes only the CLI product constants to the values the
application already uses (`Electimes Office`, `전기신문 오피스`), the installer
folder (`ElectimesOffice`) in the fallback search, and the two launchers. Each
edit requires exactly one anchor. Command names (`ieumoffice`,
`ieumoffice-editor`), `~/.ieumoffice` skill paths and `GENOFFICE_*` variables are
unchanged. `GENOFFICE_USER_DATA`, which the app exports to its child processes,
still takes precedence.

```
node build.cjs <extracted-1.0.12-installer> <new-stage>
BASE_DIR=<extracted-1.0.12-installer> node --test cli-profile.test.cjs
```

`build.cjs` applies both changes, sets version 1.0.13 / build 113 as earlier
overlays did, replaces the work panel host in `out/preload/index.js` and the nine
`resources/modules/*/preload/index.js`, and verifies that every other resource
is byte-identical to 1.0.12.

The tests evaluate the bundle's Windows functions (profile, app lookup, MCP
launch) with a Windows platform, and reproduce the open-document overwrite end
to end: the 1.0.12 bundle writes, the corrected bundle refuses with
`file_open_in_gui`. They do not run Windows itself. Before release, check on
Windows: sign-in to ChatGPT, Claude and Gemini in the panel and with Edge;
`ieumoffice --help`, `ieumoffice open <copy>` with the app running,
`ieumoffice mcp install claude-code`, and a write refused for an open document.

Not included yet: installer packaging (NSIS), cumulative update, workflow and
feed. The bundled ieumoffice SKILL.md still names IeumOffice in its prose.

## Test installer

`.github/workflows/electimes-113-test.yml` (push to this branch, or run by hand)
builds a **test** full installer `ElectimesOffice-Setup-1.0.13-test.N-x64.exe`
on Windows and uploads it as a workflow artifact. It does not create a release
or change `electimes-latest.json`.

```
node build.cjs <extracted-1.0.12-installer> <stage> test.N
python package-test.py <stage> test.N <dist>
./smoke-test.ps1 -Installer <exe> -Base <1.0.12 exe> -Manifest <dist>/payload-manifest.json -Version 1.0.13-test.N
```

The test build reports `{"version":"1.0.13-test.N","build":113}`; application
code is 1.0.13. The Windows job installs it over the published 1.0.12, checks
every installed file against the stage, the registration and real startup,
then reinstalls the published 1.0.12 to confirm the way back. It also runs the
web AI panel test on Windows and opens the real three pages without an account
(screenshots only; a CI address may get bot checks).

Because the test build is build 113, an official release after it should use
build 114 or later, or testers reinstall with the official full installer.
