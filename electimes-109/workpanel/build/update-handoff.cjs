'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
let pending=null;
const ps=value=>"'"+value.replaceAll("'","''")+"'";
function alive(pid){try{process.kill(pid,0);return true}catch{return false}}
function cancel(){
 const job=pending;if(!job||job.committed)return;pending=null;
 fs.writeFileSync(job.cancel,'cancel');
 if(job.pid&&alive(job.pid))try{process.kill(job.pid)}catch{}
 if(job.child&&job.child.exitCode===null)job.child.kill();
 for(const file of [job.ready,job.commit,job.script])try{fs.unlinkSync(file)}catch{}
}
async function prepare({dir,script,parentPid=process.pid}){
 cancel();
 const stem=path.join(dir,'install-handoff-'+parentPid+'-'+crypto.randomBytes(8).toString('hex'));
 const job={ready:stem+'.ready',commit:stem+'.commit',cancel:stem+'.cancel',log:path.join(dir,'install-handoff.log'),script:stem+'.ps1',child:null,pid:null,committed:false,error:null};pending=job;
 // The helper waits for will-quit, so a cancelled document-save dialog never
 // installs anything. A cancellation marker also covers a slow startup race.
 const gate=`$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
if (Test-Path -LiteralPath ${ps(job.cancel)}) { exit 0 }
[IO.File]::WriteAllText(${ps(job.ready)}, [string]$PID)
Write-Output 'helper-ready'
$authorized = $false
for ($attempt = 0; $attempt -lt 18000; $attempt++) {
  if (Test-Path -LiteralPath ${ps(job.cancel)}) { exit 0 }
  if (Test-Path -LiteralPath ${ps(job.commit)}) { $authorized = $true; break }
  if (($attempt % 10) -eq 0 -and -not (Get-Process -Id ${parentPid} -ErrorAction SilentlyContinue)) {
    if (Test-Path -LiteralPath ${ps(job.commit)}) { $authorized = $true; break }
    exit 0
  }
  Start-Sleep -Milliseconds 100
}
if (-not $authorized) { exit 0 }
Write-Output 'helper-committed'
Remove-Item -LiteralPath ${ps(job.ready)}, ${ps(job.commit)} -ErrorAction SilentlyContinue
`;
 fs.writeFileSync(job.script,'\uFEFF'+gate+script,'utf8');
 const shell=path.join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
 // DETACHED_PROCESS prevents Windows PowerShell 5 from running its script.
 // Start-Process creates a separate hidden console, which also survives the
 // application's inherited console closing. The short launcher is not the
 // installer helper; readiness records the actual helper PID.
 const launch=`$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'; Start-Process -FilePath ${ps(shell)} -ArgumentList @('-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',${ps('"'+job.script+'"')}) -WindowStyle Hidden -RedirectStandardOutput ${ps(stem+'.out.log')} -RedirectStandardError ${ps(stem+'.err.log')} -PassThru | Out-Null`;
 const fd=fs.openSync(job.log,'w');
 try{
  job.child=cp.spawn(shell,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(launch,'utf16le').toString('base64')],{stdio:['ignore',fd,fd],windowsHide:true});
  job.child.on('error',error=>{job.error=error;fs.appendFileSync(job.log,'Helper startup: '+String(error)+'\n')});job.child.unref();
 }finally{fs.closeSync(fd)}
 try{
  const deadline=Date.now()+20000;
  while(!fs.existsSync(job.ready)){
   if(job.error)throw job.error;
   if(pending!==job)throw Error('업데이트 설치 준비가 취소되었습니다.');
   if(job.child.exitCode!==null&&job.child.exitCode!==0)throw Error('업데이트 설치 도우미를 시작하지 못했습니다.');
   if(Date.now()>=deadline)throw Error('업데이트 설치 도우미가 응답하지 않습니다. 다시 시도하거나 설치파일을 직접 실행하세요.');
   await new Promise(resolve=>setTimeout(resolve,50));
  }
  job.pid=Number(fs.readFileSync(job.ready,'utf8').trim());
  if(!Number.isSafeInteger(job.pid)||job.pid<1||!alive(job.pid))throw Error('업데이트 설치 도우미를 시작하지 못했습니다.');
 }catch(error){cancel();throw error}
}
function commit(){
 const job=pending;if(job?.committed)return;
 if(!job||job.error||!fs.existsSync(job.ready)||!alive(job.pid))throw Error('업데이트 설치 도우미가 준비되지 않았습니다.');
 fs.writeFileSync(job.commit,'install');job.committed=true;
}
module.exports={prepare,commit,cancel};
