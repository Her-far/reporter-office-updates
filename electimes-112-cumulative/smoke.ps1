$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$manifest=Get-Content -Raw "$root/payload-manifest.json" | ConvertFrom-Json -AsHashtable
$inputs=Get-Content -Raw "$root/releases.json" | ConvertFrom-Json
$patch=Join-Path $root 'ElectimesOffice-Update-1.0.12-Cumulative-x64.exe'
$report=@{version='1.0.12';cases=@();wrongBaseRejected=$false;newerVersionRejected=$false;repeatInstall=$false}
function Install([string]$exe,[string]$target,[int]$expected=0) {
 $process=Start-Process -FilePath $exe -ArgumentList @('/S',('/D='+$target)) -Wait -PassThru
 if($process.ExitCode -ne $expected){throw "Installer returned $($process.ExitCode), expected $expected"}
}
function Verify([string]$target) {
 foreach($name in $manifest.Keys){
  $file=Join-Path $target $name
  if(!(Test-Path -LiteralPath $file)){throw "Installed file missing: $name"}
  if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLower() -ne $manifest[$name]){throw "Installed file mismatch: $name"}
 }
 if(!(Test-Path (Join-Path $target 'Uninstall.exe'))){throw 'Uninstaller missing'}
 $registration=Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ElectimesOffice'
 if($registration.DisplayVersion -ne '1.0.12'){throw 'Installed version registration is stale'}
}
function Startup([string]$target,[int]$build) {
 $profile=Join-Path $env:RUNNER_TEMP "Office-Cumulative-Profile-$build"
 New-Item -ItemType Directory -Path $profile -Force|Out-Null
 $marker=Join-Path $profile 'user-preservation-fixture.txt'
 [IO.File]::WriteAllText($marker,'사용자 설정과 메모 보존',[Text.UTF8Encoding]::new($false))
 $stderr=Join-Path $root "startup-$build-stderr.txt"
 $app=Start-Process -FilePath (Join-Path $target 'Electimes Office.exe') -ArgumentList @(('"--user-data-dir='+$profile+'"')) -PassThru -RedirectStandardError $stderr -RedirectStandardOutput (Join-Path $root "startup-$build-stdout.txt")
 try{
  for($i=0;$i -lt 30;$i++){
   Start-Sleep -Seconds 1;$app.Refresh()
   if($app.HasExited){throw "Updated app exited: $($app.ExitCode)"}
   if($app.MainWindowTitle -match 'Error|JavaScript'){throw 'Startup exception dialog'}
   if($app.MainWindowHandle -ne 0 -and $app.MainWindowTitle -match '전기신문|Electimes'){break}
  }
  if($app.MainWindowTitle -notmatch '전기신문|Electimes'){throw 'Updated Office window did not appear'}
  $log=Get-Content -Raw $stderr -ErrorAction SilentlyContinue
  if($log -match 'ReferenceError|Uncaught Exception|Cannot find module|DPI compatibility unavailable'){throw 'Startup validation failed'}
  if([IO.File]::ReadAllText($marker) -ne '사용자 설정과 메모 보존'){throw 'Profile marker changed'}
 }finally{
  if(!$app.HasExited){$app.CloseMainWindow()|Out-Null;Start-Sleep -Seconds 2;$app.Refresh();if(!$app.HasExited){Stop-Process -Id $app.Id -Force}}
  Get-Process -Name 'Electimes Office' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq (Join-Path $target 'Electimes Office.exe') } | Stop-Process -Force
 }
}
try{
 foreach($input in $inputs | Where-Object {$_.build -lt 112}){
  $build=[int]$input.build
  $target=Join-Path $env:RUNNER_TEMP "전기신문 누적 업데이트 $build"
  Install (Join-Path "$root/downloads" $input.name) $target
  $metadata=Join-Path $target 'resources/electimes-version.json'
  $original=[IO.File]::ReadAllText($metadata)
  $asar=Join-Path $target 'resources/app.asar'
  $before=(Get-FileHash $asar).Hash
  if($build -eq 106){
   foreach($unsupported in @(105,113)){
    [IO.File]::WriteAllText($metadata,('{"version":"1.0.'+($unsupported-100)+'","build":'+$unsupported+'}'),[Text.UTF8Encoding]::new($false))
    Install $patch $target 4
    if((Get-FileHash $asar).Hash -ne $before){throw 'Unsupported-base patch changed the app'}
   }
   [IO.File]::WriteAllText($metadata,$original,[Text.UTF8Encoding]::new($false))
   $report.wrongBaseRejected=$true;$report.newerVersionRejected=$true
  }
  $document=Join-Path $target 'user-document-preservation.txt'
  [IO.File]::WriteAllText($document,'사용자 문서 보존',[Text.UTF8Encoding]::new($false))
  Install $patch $target
  Verify $target
  if((Get-FileHash (Join-Path $target 'resources/workpanel-upgrade.asar')).Hash -ne $before){throw 'Local OAuth configuration migration backup was not preserved'}
  if([IO.File]::ReadAllText($document) -ne '사용자 문서 보존'){throw 'User file changed'}
  if($build -eq 110){
   Install $patch $target
   Verify $target
   if((Get-FileHash (Join-Path $target 'resources/workpanel-upgrade.asar')).Hash -ne $before){throw 'Repeat install overwrote migration backup'}
   $report.repeatInstall=$true
  }
  Startup $target $build
  $report.cases+=@{fromBuild=$build;toBuild=112;installed=$true;manifestVerified=$true;startup=$true;userFilePreserved=$true;migrationBackupPreserved=$true}
  Write-Host "Verified real installation and startup: $build -> 112"
  Remove-Item -LiteralPath $target -Recurse -Force
 }
}finally{
 $report|ConvertTo-Json -Depth 8|Set-Content (Join-Path $root 'cumulative-install-windows.json') -Encoding UTF8
}
