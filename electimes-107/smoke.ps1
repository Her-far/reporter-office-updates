$ErrorActionPreference = 'Stop'
$target = Join-Path $env:RUNNER_TEMP 'Electimes-Office-Test'
$setup = Start-Process -FilePath (Join-Path $PWD 'ElectimesOffice-Setup-1.0.7-x64.exe') -ArgumentList @('/S', ('/D=' + $target)) -Wait -PassThru
if ($setup.ExitCode -ne 0) { throw "Setup exit: $($setup.ExitCode)" }
$version = Get-Content -Raw -LiteralPath (Join-Path $target 'resources/electimes-version.json') | ConvertFrom-Json
if ($version.build -ne 107) { throw 'Wrong installed version' }
$registration = Get-ItemProperty 'HKCU:\Software\RegisteredApplications'
if ($registration.'Electimes Office' -ne 'Software\ElectimesOffice\Capabilities') { throw 'Missing registration' }
if (Test-Path (Join-Path $target 'resources/doc-converter')) { throw 'Retired converter bundled' }
$target = Join-Path $env:RUNNER_TEMP 'Electimes-Office-Upgrade-Test'
$base = Start-Process -FilePath (Join-Path $PWD 'base.exe') -ArgumentList @('/S', ('/D=' + $target)) -Wait -PassThru
if ($base.ExitCode -ne 0) { throw "Base setup exit: $($base.ExitCode)" }
$before = Get-Content -Raw -LiteralPath (Join-Path $target 'resources/electimes-version.json') | ConvertFrom-Json
if ($before.build -ne 106) { throw 'Upgrade did not start from 1.0.6' }
$patch = Start-Process -FilePath (Join-Path $PWD 'ElectimesOffice-Setup-1.0.7-x64.exe') -ArgumentList @('/S', ('/D=' + $target)) -Wait -PassThru
if ($patch.ExitCode -ne 0) { throw "Update exit: $($patch.ExitCode)" }
$after = Get-Content -Raw -LiteralPath (Join-Path $target 'resources/electimes-version.json') | ConvertFrom-Json
if ($after.build -ne 107) { throw 'Upgrade did not reach 1.0.7' }
$app = Start-Process -FilePath (Join-Path $target 'Electimes Office.exe') -PassThru -RedirectStandardError 'startup-stderr.txt' -RedirectStandardOutput 'startup-stdout.txt'
$title = ''
try {
 for ($i=0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  $app.Refresh()
  if ($app.HasExited) { throw "App exited early: $($app.ExitCode)" }
  $title = $app.MainWindowTitle
  if ($title -match 'Error|JavaScript') { throw 'Startup error dialog' }
  if ($app.MainWindowHandle -ne 0 -and $title -match '전기신문|Electimes') { break }
 }
 if ($title -notmatch '전기신문|Electimes') { throw "No office window: $title" }
 $log = Get-Content -Raw 'startup-stderr.txt' -ErrorAction SilentlyContinue
 if ($log -match 'ReferenceError|Uncaught Exception|Cannot find module') { throw 'Startup exception in log' }
 @{version='1.0.7';nativeInstall=$true;nativeUpdate=$true;upgradedFrom='1.0.6';registration=$true;windowTitle=$title;interactiveEditingTested=$false} | ConvertTo-Json | Set-Content 'windows-smoke.json' -Encoding UTF8
} finally {
 if (-not $app.HasExited) { $app.CloseMainWindow() | Out-Null; Start-Sleep -Seconds 3; $app.Refresh(); if (-not $app.HasExited) { Stop-Process -Id $app.Id -Force } }
}
