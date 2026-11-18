# 1.0.13 CLI launcher and profile

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

`build.cjs` also sets version 1.0.13 / build 113 as earlier overlays did, and
verifies that every other resource is byte-identical to 1.0.12.

The tests evaluate the bundle's Windows functions (profile, app lookup, MCP
launch) with a Windows platform, and reproduce the open-document overwrite end
to end: the 1.0.12 bundle writes, the corrected bundle refuses with
`file_open_in_gui`. They do not run Windows itself. Before release, check on
Windows: `ieumoffice --help`, `ieumoffice open <copy>` with the app running,
`ieumoffice mcp install claude-code`, and a write refused for an open document.

Not included yet: installer packaging (NSIS), cumulative update, workflow and
feed. The bundled ieumoffice SKILL.md still names IeumOffice in its prose.
