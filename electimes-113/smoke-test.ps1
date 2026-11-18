# Windows check of the 1.0.13 TEST installer: upgrade over the published 1.0.12,
# exact installed payload, registration, real startup of the installed app, and
# returning to 1.0.12 with the published full installer.
# Usage: ./smoke-test.ps1 -Installer <exe> -Base <published 1.0.12 exe> -Manifest <payload-manifest.json> -Version 1.0.13-test.1
param([string]$Installer,[string]$Base,[string]$Manifest,[string]$Version)
$ErrorActionPreference='Stop'
$report=[ordered]@{version=$Version;upgradeFrom112=$false;payloadVerified=$false;registration=$false;startup=$false;rollbackTo112=$false}
$files=Get-Content -Raw $Manifest | ConvertFrom-Json -AsHashtable
$target=Join-Path $env:RUNNER_TEMP 'Electimes-113-test'
function Install([string]$exe){
 $p=Start-Process -FilePath (Resolve-Path $exe) -ArgumentList @('/S',('/D='+$target)) -Wait -PassThru
 if($p.ExitCode -ne 0){throw "Installer $exe returned $($p.ExitCode)"}
}
function Build(){ (Get-Content -Raw (Join-Path $target 'resources/electimes-version.json') | ConvertFrom-Json) }
try{
 Install $Base
 if((Build).build -ne 112){throw 'Published 1.0.12 did not install'}
 Install $Installer
 $v=Build; if($v.build -ne 113 -or $v.version -ne $Version){throw "Wrong installed version: $($v.version)"}
 $report.upgradeFrom112=$true
 foreach($name in $files.Keys){
  $file=Join-Path $target $name
  if(!(Test-Path -LiteralPath $file)){throw "Installed file missing: $name"}
  if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLower() -ne $files[$name]){throw "Installed file mismatch: $name"}
 }
 $report.payloadVerified=$true;$report.payloadFiles=$files.Count
 $reg=Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ElectimesOffice'
 if($reg.DisplayVersion -ne $Version){throw "Registration shows $($reg.DisplayVersion)"}
 $report.registration=$true
 $app=Start-Process -FilePath (Join-Path $target 'Electimes Office.exe') -PassThru -RedirectStandardError 'startup-stderr.txt' -RedirectStandardOutput 'startup-stdout.txt'
 try{
  for($i=0;$i -lt 40;$i++){
   Start-Sleep -Seconds 1;$app.Refresh()
   if($app.HasExited){throw "Installed app exited: $($app.ExitCode)"}
   if($app.MainWindowTitle -match 'Error|JavaScript'){throw 'Startup exception dialog'}
   if($app.MainWindowHandle -ne 0 -and $app.MainWindowTitle -match '전기신문|Electimes'){break}
  }
  if($app.MainWindowTitle -notmatch '전기신문|Electimes'){throw 'Installed Office window did not appear'}
  Start-Sleep -Seconds 5
  $log=Get-Content -Raw 'startup-stderr.txt' -ErrorAction SilentlyContinue
  if($log -match 'ReferenceError|SyntaxError|Uncaught Exception|Cannot find module'){throw 'Installed app startup validation failed'}
  $report.startup=$true;$report.windowTitle=$app.MainWindowTitle
 }finally{
  if(!$app.HasExited){$app.CloseMainWindow()|Out-Null;Start-Sleep -Seconds 3;$app.Refresh();if(!$app.HasExited){Stop-Process -Id $app.Id -Force}}
  Start-Sleep -Seconds 2
 }
 Install $Base
 if((Build).build -ne 112){throw 'Published 1.0.12 full installer did not restore 1.0.12'}
 if((Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ElectimesOffice').DisplayVersion -ne '1.0.12'){throw 'Rollback registration'}
 $report.rollbackTo112=$true
}finally{
 $report|ConvertTo-Json|Set-Content windows-smoke.json -Encoding UTF8
 $report|ConvertTo-Json
}
