'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
let pending=null;
const ps=value=>"'"+value.replaceAll("'","''")+"'";
function cancel(){
 const job=pending;if(!job||job.committed)return;pending=null;
 if(job.child&&job.child.exitCode===null)job.child.kill();
 for(const file of [job.ready,job.commit,job.script])try{fs.unlinkSync(file)}catch{}
}
async function prepare({dir,script,parentPid=process.pid}){
 cancel();
 const stem=path.join(dir,'install-handoff-'+parentPid+'-'+crypto.randomBytes(8).toString('hex'));
 const job={ready:stem+'.ready',commit:stem+'.commit',log:path.join(dir,'install-handoff.log'),script:stem+'.ps1',child:null,committed:false,error:null};
 pending=job;
 // Start the helper while Electron is still running. It cannot install until
 // will-quit writes the commit marker, after all document close guards accept.
 const gate=`$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[IO.File]::WriteAllText(${ps(job.ready)}, 'ready')
$authorized = $false
for ($attempt = 0; $attempt -lt 18000; $attempt++) {
  if (Test-Path -LiteralPath ${ps(job.commit)}) { $authorized = $true; break }
  if (($attempt % 10) -eq 0 -and -not (Get-Process -Id ${parentPid} -ErrorAction SilentlyContinue)) {
    if (Test-Path -LiteralPath ${ps(job.commit)}) { $authorized = $true; break }
    exit 0
  }
  Start-Sleep -Milliseconds 100
}
if (-not $authorized) { exit 0 }
Remove-Item -LiteralPath ${ps(job.ready)}, ${ps(job.commit)} -ErrorAction SilentlyContinue
`;
 fs.writeFileSync(job.script,'\uFEFF'+gate+script,'utf8');
 const fd=fs.openSync(job.log,'w');
 try{
  job.child=cp.spawn(path.join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',job.script],{detached:true,stdio:['ignore',fd,fd],windowsHide:true});
  job.child.on('error',error=>{job.error=error;fs.appendFileSync(job.log,'Helper startup: '+String(error)+'\n')});
  job.child.on('exit',(code,signal)=>{if(!job.committed)fs.appendFileSync(job.log,JSON.stringify({code,signal})+'\n')});job.child.unref();
 }finally{fs.closeSync(fd)}
 try{
  const deadline=Date.now()+20000;
  while(!fs.existsSync(job.ready)){
   if(job.error)throw job.error;
   if(pending!==job)throw Error('업데이트 설치 준비가 취소되었습니다.');
   if(job.child.exitCode!==null||job.child.signalCode!==null)throw Error('업데이트 설치 도우미를 시작하지 못했습니다.');
   if(Date.now()>=deadline)throw Error('업데이트 설치 도우미가 응답하지 않습니다. 다시 시도하거나 설치파일을 직접 실행하세요.');
   await new Promise(resolve=>setTimeout(resolve,50));
  }
 }catch(error){cancel();throw error}
}
function commit(){
 const job=pending;
 if(job?.committed)return;
 if(!job||job.error||!fs.existsSync(job.ready)||job.child.exitCode!==null||job.child.signalCode!==null)throw Error('업데이트 설치 도우미가 준비되지 않았습니다.');
 fs.writeFileSync(job.commit,'install');job.committed=true;
}
module.exports={prepare,commit,cancel};
