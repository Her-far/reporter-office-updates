param([string]$Source,[string]$Target,[string]$Manifest)
$ErrorActionPreference='Stop'
try {
 $data=Get-Content -LiteralPath $Manifest -Raw | ConvertFrom-Json
 $files=@{};foreach($property in $data.PSObject.Properties){$files[$property.Name]=[string]$property.Value}
 $sourcePath=[IO.Path]::GetFullPath($Source).TrimEnd('\')
 $targetPath=[IO.Path]::GetFullPath($Target).TrimEnd('\')
 if($sourcePath -eq $targetPath){throw 'Test and production directories must differ'}
 foreach($name in $files.Keys){
  $file=Join-Path $sourcePath $name
  if(!(Test-Path -LiteralPath $file -PathType Leaf)){throw "The 1.0.12 source is incomplete: $name"}
  $stream=[IO.File]::OpenRead($file);$hash=[Security.Cryptography.SHA256]::Create()
  try{$actual=[BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}finally{$stream.Dispose();$hash.Dispose()}
  if($actual -ne $files[$name]){throw "The installed version differs from the required 1.0.12: $name"}
 }
 # Copy only the published application inventory, never user documents or profiles.
 foreach($name in $files.Keys){
  $to=Join-Path $targetPath $(if($name -eq 'Electimes Office.exe'){'ElectimesOffice-AIWeb-Test.exe'}else{$name})
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($to))|Out-Null
  [IO.File]::Copy((Join-Path $sourcePath $name),$to,$true)
 }
 exit 0
}catch{Write-Output $_.Exception.Message;exit 4}
