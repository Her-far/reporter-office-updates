param([string]$BuildDirectory)
$ErrorActionPreference = 'Stop'
$BuildDirectory = (Resolve-Path $BuildDirectory).Path
$sandbox = Join-Path $env:RUNNER_TEMP ('workpanel-validation-' + [guid]::NewGuid())
New-Item -ItemType Directory $sandbox | Out-Null
$official = Join-Path $sandbox 'Official'
$test = Join-Path $sandbox 'WorkPanel-Test'
$profile = Join-Path $env:APPDATA 'ElectimesOffice-WorkPanel-Test'
$prodProfile = Join-Path $env:APPDATA 'Electimes Office'
$before = @{}
$processes = @()
try {
  $p = Start-Process (Join-Path $BuildDirectory 'base-1.0.4.exe') -ArgumentList @('/S',('/D='+$official)) -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw 'Official baseline fixture installation failed' }
  New-Item -ItemType Directory -Force $prodProfile | Out-Null
  $sentinel = Join-Path $prodProfile 'workpanel-ci-preservation.txt'
  'Synthetic production preservation fixture' | Set-Content $sentinel
  foreach ($f in @('Electimes Office.exe','resources/app.asar','resources/electimes-version.json')) { $before[$f]=(Get-FileHash (Join-Path $official $f)).Hash }
  $registration = (Get-ItemProperty 'HKCU:\Software\RegisteredApplications').'Electimes Office'
  $p = Start-Process (Join-Path $BuildDirectory 'ElectimesOffice-WorkPanel-Test-Setup.exe') -ArgumentList @('/S',('/D='+$test)) -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "Test installation failed: $($p.ExitCode)" }
  $identity = Get-Content -Raw (Join-Path $test 'resources/electimes-version.json') | ConvertFrom-Json
  if ($identity.version -ne '1.0.4-workpanel.2' -or $identity.updates -ne $false) { throw 'Wrong test identity' }
  if (Test-Path (Join-Path $test 'resources/electimes-update-source.json')) { throw 'Production updater source included' }
  if ((Get-ItemProperty 'HKCU:\Software\RegisteredApplications').'Electimes Office' -ne $registration) { throw 'Production registration changed' }
  foreach ($f in $before.Keys) { if ((Get-FileHash (Join-Path $official $f)).Hash -ne $before[$f]) { throw "Production file changed: $f" } }
  New-Item -ItemType Directory -Force $profile | Out-Null
  '{"language":"ko","onboardingSeen":true,"aiPanelSide":"right"}' | Set-Content (Join-Path $profile 'app-settings.json') -Encoding utf8NoBOM
  '{"providers":{},"subscriptionNoticeSeen":true}' | Set-Content (Join-Path $profile 'ai-settings.json') -Encoding utf8NoBOM
  $o = Start-Process (Join-Path $official 'Electimes Office.exe') -PassThru
  $processes += $o
  $t = Start-Process (Join-Path $test 'ElectimesOffice-WorkPanel-Test.exe') -PassThru -RedirectStandardError (Join-Path $BuildDirectory 'startup-stderr.txt') -RedirectStandardOutput (Join-Path $BuildDirectory 'startup-stdout.txt')
  $processes += $t
  $title=''
  for ($i=0;$i -lt 40;$i++) {
    Start-Sleep -Seconds 1
    $t.Refresh();$o.Refresh()
    if ($t.HasExited -or $o.HasExited) { throw 'Side-by-side startup failed' }
    $title=$t.MainWindowTitle
    if ($title -match 'Error|JavaScript') { throw 'Startup error dialog' }
    if ($t.MainWindowHandle -ne 0 -and $title -match 'TEST|테스트|Test') { break }
  }
  if ($title -notmatch 'TEST|테스트|Test') { throw "No distinct test window title: $title" }
  if (!(Test-Path $profile) -or !(Test-Path $sentinel)) { throw 'Profile isolation failed' }
  foreach ($p in $processes) { if (!$p.HasExited) { Stop-Process -Id $p.Id -Force } }
  Start-Sleep -Seconds 2
  # A user document placed in the test install folder must survive uninstall.
  'Synthetic user document' | Set-Content (Join-Path $test 'user-document.txt')
  $u=Start-Process (Join-Path $test 'Uninstall-WorkPanel-Test.exe') -ArgumentList '/S' -Wait -PassThru
  Start-Sleep -Seconds 4
  if (Test-Path (Join-Path $test 'ElectimesOffice-WorkPanel-Test.exe')) { throw 'Test uninstall failed' }
  if (!(Test-Path (Join-Path $test 'user-document.txt')) -or !(Test-Path $sentinel) -or !(Test-Path $profile)) { throw 'Uninstall removed user/profile data' }
  foreach ($f in $before.Keys) { if ((Get-FileHash (Join-Path $official $f)).Hash -ne $before[$f]) { throw "Uninstall changed production file: $f" } }
  $log=Get-Content -Raw (Join-Path $BuildDirectory 'startup-stderr.txt') -ErrorAction SilentlyContinue
  if ($log -match 'ReferenceError|Uncaught Exception|Cannot find module') { throw 'Startup exception' }
  @{version='1.0.4-workpanel.2';nativeInstall=$true;sideBySideStartup=$true;windowTitle=$title;productionFilesPreserved=$true;productionRegistrationPreserved=$true;separateProfile=$true;nativeUninstall=$true;userFilesPreserved=$true;liveMailLogin='unverified';liveGoogleOAuth='unverified';interactiveEditing='unverified'} | ConvertTo-Json | Set-Content (Join-Path $BuildDirectory 'windows-smoke.json') -Encoding utf8NoBOM
} finally { foreach ($p in $processes) { $p.Refresh();if (!$p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } } }
