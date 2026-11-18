# 1.0.12 Windows print-dialog compatibility

Base: the immutable published 1.0.11 installer, SHA-256
`d333bff0e1de01e333698cb74199064feece7f730e6a76d5b9f26a6e42222722`.

The report is specific to Office: a legacy printer preferences property sheet
clips its right and bottom controls, while the same driver works from Hancom.
The exact printer is not available to CI, so driver-specific resolution remains
a field check; this release addresses the application's calling context.

Electron 43.7.6 / Chromium 150.0.7871.250 calls `PrintDlgExW` on the UI thread
without a scoped DPI override. Windows OOP printer drivers are disabled by
default in that Chromium version; no feature/sandbox flags are changed here.
The native addon wraps ONLY the current executable's named PrintDlgExW import
(normal or delay import), switches to UNAWARE_GDISCALED for that synchronous
call, and restores the exact previous thread context on return. It does not
modify executable instructions, on-disk binaries, another process, DEVMODE,
printer resolution, the main window, global display settings, or printer
preferences. Missing support leaves the original print path available.

Sources: [Chromium printing context](https://chromium.googlesource.com/chromium/src/+/refs/tags/150.0.7871.250/printing/printing_context_system_dialog_win.cc),
[Windows mixed-mode DPI](https://learn.microsoft.com/en-us/windows/win32/hidpi/high-dpi-improvements-for-desktop-applications).

The HWP printer path additionally uses a visible, focused parented owner as
other existing Office print paths already do. PDF export stays hidden.

`print-native.cjs` inspects real Windows dialog DPI/Cancel bounds and confirms
context restoration plus invariant PDF page size at Electron display factors
1, 1.25, 1.5 and 2. These are application display factors, not changes to the
runner's OS display DPI. No physical printer or confidential document is used.
`smoke.ps1` checks a fresh install, a small patch upgrade, all installed hashes,
wrong-base rejection, application registration and installed startup.

Small patch only targets 1.0.11. Earlier versions use the full installer so they
retain cumulative fixes. Every unchanged resource (including all HWP engines)
is checked against the base. The uninstall inventory includes the new addon.
