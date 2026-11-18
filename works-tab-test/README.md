# 전기신문 Office + Works 탭 테스트판

Published Office 1.0.12 is the immutable base. This overlay adds a singleton Works tab to the existing native document tab manager. The online Works page uses the existing production backend; tests must never submit real company records.

The preview has a distinct executable, application ID and `%APPDATA%/ElectimesOffice-Works-Test` profile. It is distributed as a portable ZIP. Updater IPC is inert, credentials are not migrated, and no installer, file association or production update manifest is changed.

## Build

Download the exact `electimes-v1.0.12` installer and verify SHA256 `8060e3e6e89bf33aed3d3a99fa00d1ea8e85cba22d42c3bc6693b47a38604431`. Extract with full 7-Zip, then run:

```sh
node --test works-tab-test/policy.test.cjs
node works-tab-test/build.cjs base-installer works-tab-test/stage
```

The builder rejects unexpected base versions and patch anchors. It preserves all unmodified ASAR entries and hashes every unrelated external resource, including document engines and the 1.0.12 native print adapter. Keep all original LICENSE and NOTICE files with the application.

## Windows checks

Install `playwright@1.62.1` in this directory and run `node windows.test.cjs`. The test uses the packaged Windows executable, synthetic intercepted Works content for mutable tests, and a final read-only visit to the real login page. It checks profile isolation, disabled updates, remote web preferences, blocked navigation, singleton behavior, draft preservation across document tabs, resize bounds, tab destruction, session persistence and failed-load retry. It does not log into real accounts or verify external push delivery.

Only the `test/electimes-works-tab-20261118` branch triggers the dedicated workflow. Passing builds are explicitly marked as GitHub prereleases with `make_latest: false`; the main branch and production feeds are untouched.

## Remote page boundary

Works uses a dedicated persistent Electron session and sandboxed `WebContentsView` with no preload, Node or Office API access. A separate trusted local toolbar exposes only state, retry, reload and open-in-browser commands; IPC requires its exact main frame. Only the fixed Works HTTPS origin can navigate inside the remote view. Other HTTPS popups require confirmation before opening the default browser, and native schemes are rejected. Permissions are denied by default. Downloads use a save dialog and are never automatically executed.

Tabs retain their views while inactive. Closing a Works tab closes its remote view. The Works tab is excluded from document recovery, MCP document lists, split view and detaching. Stored web sessions remain in the preview profile until logout or profile removal.
