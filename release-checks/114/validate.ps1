$ErrorActionPreference='Stop'
$dir=Join-Path $env:RUNNER_TEMP 'ElectimesOfficeQA'
function Install([string]$file) {
  $process=Start-Process -FilePath (Resolve-Path $file) -ArgumentList @('/S',('/D='+$dir)) -Wait -PassThru
  if ($process.ExitCode -ne 0) {throw "Installer exited with $($process.ExitCode)"}
}
function Check114 {
  $v=Get-Content -Raw "$dir/resources/electimes-version.json" | ConvertFrom-Json
  if($v.build -ne 114 -or $v.version -ne '1.0.14'){throw 'Version mismatch'}
  if((Get-FileHash "$dir/resources/app.asar").Hash -ne '88B77A435D82F3C7B5993C4BB36F4E01D5656F1CBdd797C8D887189ADCE1C843'){throw 'Application hash mismatch'}
  $caps=Get-Item 'HKCU:\Software\ElectimesOffice\Capabilities\FileAssociations'
  if($caps.GetValueNames().Count -ne 20){throw 'File associations missing'}
  foreach($ext in $caps.GetValueNames()) {
    $id=$caps.GetValue($ext)
    $value=(Get-Item "HKCU:\Software\Classes\$id\DefaultIcon").GetValue('')
    if($value -notmatch '^"([^"]+\.ico)",0$' -or -not (Test-Path -LiteralPath $Matches[1])){throw "Missing icon for $ext"}
  }
}
Install ./base.exe
Install ./ElectimesOffice-Update-1.0.14-x64.exe
Check114
Install ./ElectimesOffice-Setup-1.0.14-x64.exe
Check114
