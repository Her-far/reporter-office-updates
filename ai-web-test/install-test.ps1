$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$prod=Join-Path $env:RUNNER_TEMP 'Office Production Fixture'
$target=Join-Path $env:RUNNER_TEMP 'Office AI Web Test Fixture'
$fullTarget=Join-Path $env:RUNNER_TEMP 'Office AI Web Full Fixture'
$manifest=Get-Content -Raw "$root/dist/payload-manifest.json"|ConvertFrom-Json -AsHashtable
$base=Get-Content -Raw "$root/package/base-manifest.json"|ConvertFrom-Json -AsHashtable
$report=@{compact=$false;full=$false;productionPreserved=$false;wrongBaseRejected=$false;uninstallPreservesUserFiles=$false;separateRegistration=$false}
function Install([string]$exe,[string]$folder,[int]$expected=0){
 $p=Start-Process -FilePath $exe -ArgumentList @('/S',('/D='+$folder)) -Wait -PassThru
 if($p.ExitCode -ne $expected){throw "Installer exited $($p.ExitCode), expected $expected"}
}
function Verify([string]$folder,$inventory){
 foreach($name in $inventory.Keys){if((Get-FileHash -LiteralPath (Join-Path $folder $name) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $inventory[$name]){throw "Payload mismatch: $name"}}
}
try{
 Install "$root/base.exe" $prod
 $prodKey='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ElectimesOffice'
 $before=(Get-ItemProperty $prodKey|Select-Object DisplayName,DisplayVersion,InstallLocation,UninstallString|ConvertTo-Json -Compress)
 $prodProfile=Join-Path $env:APPDATA 'Electimes Office'
 New-Item -ItemType Directory $prodProfile -Force|Out-Null
 $prodMarker=Join-Path $prodProfile 'ai-web-test-preservation.txt';[IO.File]::WriteAllText($prodMarker,'production profile remains untouched')
 $compact="$root/dist/ElectimesOffice-AIWeb-Test-1.0.12.2-Compact-Setup.exe"
 $resource=Join-Path $prod 'resources/electimes-version.json';$original=[IO.File]::ReadAllBytes($resource)
 [IO.File]::WriteAllText($resource,'{"version":"wrong"}')
 Install $compact $target 4
 if(Test-Path $target){throw 'Invalid baseline wrote test payload'}
 [IO.File]::WriteAllBytes($resource,$original);$report.wrongBaseRejected=$true
 Install $compact $prod 4
 Verify $prod $base
 Install $compact $target;Verify $target $manifest;$report.compact=$true
 if(Test-Path (Join-Path $target 'resources/electimes-update-source.json')){throw 'Test contains production update configuration'}
 if(!(Test-Path (Join-Path $target 'Uninstall-AIWeb-Test.exe'))){throw 'Missing separate uninstaller'}
 Install $compact $target;Verify $target $manifest
 Verify $prod $base
 if($before -ne (Get-ItemProperty $prodKey|Select-Object DisplayName,DisplayVersion,InstallLocation,UninstallString|ConvertTo-Json -Compress)){throw 'Production registration changed'}
 if([IO.File]::ReadAllText($prodMarker) -ne 'production profile remains untouched'){throw 'Production profile changed'}
 $report.productionPreserved=$true
 $testReg=Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ElectimesOfficeAIWebTest'
 if($testReg.InstallLocation -ne $target){throw 'Wrong test install registry'};$report.separateRegistration=$true
 [IO.File]::WriteAllText((Join-Path $target '사용자 문서 보존.txt'),'keep user file')
 $uninstall=Start-Process -FilePath (Join-Path $target 'Uninstall-AIWeb-Test.exe') -ArgumentList @('/S',('_?='+$target)) -Wait -PassThru
 if($uninstall.ExitCode -ne 0){throw 'Uninstall failed'}
 if([IO.File]::ReadAllText((Join-Path $target '사용자 문서 보존.txt')) -ne 'keep user file'){throw 'User document removed'}
 if(Test-Path (Join-Path $target 'ElectimesOffice-AIWeb-Test.exe')){throw 'Test executable left behind'}
 Verify $prod $base;$report.uninstallPreservesUserFiles=$true
 Install "$root/dist/ElectimesOffice-AIWeb-Test-1.0.12.2-Full-Setup.exe" $fullTarget
 Verify $fullTarget $manifest;$report.full=$true
 # Both applications must be able to run concurrently with distinct profiles.
 $production=Start-Process -FilePath (Join-Path $prod 'Electimes Office.exe') -PassThru
 $test=Start-Process -FilePath (Join-Path $fullTarget 'ElectimesOffice-AIWeb-Test.exe') -PassThru
 try{
  for($i=0;$i -lt 30;$i++){
   Start-Sleep -Seconds 1;$production.Refresh();$test.Refresh()
   if($production.HasExited -or $test.HasExited){throw 'Side-by-side startup exited'}
   if($production.MainWindowHandle -ne 0 -and $test.MainWindowHandle -ne 0){break}
  }
  if(!$production.MainWindowHandle -or !$test.MainWindowHandle){throw 'Side-by-side windows unavailable'}
  if($test.MainWindowTitle -notmatch 'AI 웹 테스트'){throw 'Test edition is not clearly identified'}
  $report.sideBySideStartup=$true
 }finally{foreach($p in @($production,$test)){if(!$p.HasExited){Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue}}}
 $report.pass=$true
}finally{$report|ConvertTo-Json -Depth 8|Set-Content "$root/install-windows.json" -Encoding utf8}
