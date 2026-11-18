$ErrorActionPreference='Stop'
$report=@{version='1.0.12';fullInstall=$false;patchUpdate=$false;wrongBaseRejected=$false;manifestVerified=$false}
$manifest=Get-Content -Raw payload-manifest.json | ConvertFrom-Json -AsHashtable
function Install([string]$exe,[string]$target,[int]$expected=0) {
 $process=Start-Process -FilePath (Join-Path $PWD $exe) -ArgumentList @('/S',('/D='+$target)) -Wait -PassThru
 if($process.ExitCode -ne $expected){throw "Installer $exe returned $($process.ExitCode), expected $expected"}
}
function Verify([string]$target) {
 foreach($name in $manifest.Keys){
  $file=Join-Path $target $name
  if(!(Test-Path -LiteralPath $file)){throw "Installed file missing: $name"}
  if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLower() -ne $manifest[$name]){throw "Installed file mismatch: $name"}
 }
 $version=Get-Content -Raw (Join-Path $target 'resources/electimes-version.json') | ConvertFrom-Json
 if($version.build -ne 112){throw 'Wrong installed version'}
}
$full=Join-Path $env:RUNNER_TEMP 'Electimes-Full-112'
Install 'ElectimesOffice-Setup-1.0.12-x64.exe' $full
Verify $full
$report.fullInstall=$true
$target=Join-Path $env:RUNNER_TEMP 'Electimes-Patch-112'
Install 'base.exe' $target
# Rejection must not touch the existing application when this small patch is
# accidentally launched over a version for which it lacks cumulative fixes.
$metadata=Join-Path $target 'resources/electimes-version.json'
[IO.File]::WriteAllText($metadata,'{"version":"1.0.10","build":110}',[Text.UTF8Encoding]::new($false))
$before=(Get-FileHash (Join-Path $target 'resources/app.asar')).Hash
Install 'ElectimesOffice-Update-1.0.12-x64.exe' $target 4
if((Get-FileHash (Join-Path $target 'resources/app.asar')).Hash -ne $before){throw 'Wrong-base patch changed the app'}
$report.wrongBaseRejected=$true
[IO.File]::WriteAllText($metadata,'{"version":"1.0.11","build":111}',[Text.UTF8Encoding]::new($false))
Install 'ElectimesOffice-Update-1.0.12-x64.exe' $target
Verify $target
$report.patchUpdate=$true
$report.manifestVerified=$true
$registration=Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ElectimesOffice'
if($registration.DisplayVersion -ne '1.0.12'){throw 'Installed application registration version is stale'}
# Launch the installed update, then quit normally. Do not publish an installer
# solely on the basis of archive extraction.
$app=Start-Process -FilePath (Join-Path $target 'Electimes Office.exe') -PassThru -RedirectStandardError 'startup-stderr.txt' -RedirectStandardOutput 'startup-stdout.txt'
try{
 for($i=0;$i -lt 30;$i++){
  Start-Sleep -Seconds 1;$app.Refresh()
  if($app.HasExited){throw "Installed app exited: $($app.ExitCode)"}
  if($app.MainWindowTitle -match 'Error|JavaScript'){throw 'Startup exception dialog'}
  if($app.MainWindowHandle -ne 0 -and $app.MainWindowTitle -match '전기신문|Electimes'){break}
 }
 if($app.MainWindowTitle -notmatch '전기신문|Electimes'){throw 'Installed Office window did not appear'}
 $log=Get-Content -Raw 'startup-stderr.txt' -ErrorAction SilentlyContinue
 if($log -match 'ReferenceError|Uncaught Exception|Cannot find module|DPI compatibility unavailable'){throw 'Installed app startup validation failed'}
 $report.startup=$true;$report.windowTitle=$app.MainWindowTitle
}finally{
 if(!$app.HasExited){$app.CloseMainWindow()|Out-Null;Start-Sleep -Seconds 3;$app.Refresh();if(!$app.HasExited){Stop-Process -Id $app.Id -Force}}
 $report|ConvertTo-Json|Set-Content windows-smoke.json -Encoding UTF8
}
