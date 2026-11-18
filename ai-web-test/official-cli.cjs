'use strict';
// Host unmodified official executables in a real ConPTY. Credentials and
// authentication remain entirely within the publisher's program.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {execFile}=require('node:child_process');const {promisify}=require('node:util');
const execute=promisify(execFile);
const CLAUDE='https://downloads.claude.ai/claude-code-releases';
const AGY='https://antigravity-cli-auto-updater-974169037036.us-central1.run.app';
const providers={claude:{name:'Claude Code',binary:'claude.exe'},gemini:{name:'Google Antigravity',binary:'agy.exe'}};
function safeEnv(source=process.env){const out={};for(const [k,v]of Object.entries(source))if(/^(SystemRoot|WINDIR|COMSPEC|PATHEXT|PATH|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMDATA|USERNAME|USERDOMAIN|HOMEDRIVE|HOMEPATH|LANG|LC_ALL|HTTPS_PROXY|HTTP_PROXY|NO_PROXY)$/i.test(k)&&typeof v==='string')out[k]=v;return {...out,TERM:'xterm-256color',COLORTERM:'truecolor'};}
function publisherURL(s,id){try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password&&((id==='claude'&&u.hostname==='downloads.claude.ai')||(id==='gemini'&&['antigravity-cli-auto-updater-974169037036.us-central1.run.app','storage.googleapis.com'].includes(u.hostname)));}catch{return false;}}
class OfficialCLI{
 constructor({root,fetch,pty,event,changed}){Object.assign(this,{root,fetch,pty,event,changed});this.items=new Map();this.closed=false;}
 item(id){if(!Object.hasOwn(providers,id))throw Error('지원하지 않는 서비스입니다.');if(!this.items.has(id))this.items.set(id,{id,process:null,busy:false,notice:'',generation:0});return this.items.get(id);}
 file(id){const own=path.join(this.root,'tools',id,providers[id].binary);const candidates=id==='claude'?[own,path.join(os.homedir(),'.local/bin/claude.exe'),path.join(process.env.APPDATA||os.homedir(),'npm/node_modules/@anthropic-ai/claude-code/node_modules/@anthropic-ai/claude-code-win32-x64/claude.exe')]:[own,path.join(process.env.LOCALAPPDATA||os.homedir(),'agy/bin/agy.exe')];return candidates.find(f=>{try{return fs.statSync(f).isFile();}catch{return false;}})||null;}
 state(id){const p=this.item(id);return {installed:!!this.file(id),running:!!p.process,busy:p.busy,notice:p.notice,name:providers[id].name,generation:p.generation};}
 notify(){this.changed?.();}
 async read(url,id){if(!publisherURL(url,id))throw Error('공식 다운로드 주소가 아닙니다.');const r=await this.fetch(url,{redirect:'error',signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('공식 다운로드 서버 응답: '+r.status);return r;}
 async install(id){const p=this.item(id);if(p.busy||p.process)throw Error('실행 중인 프로그램을 먼저 종료해 주세요.');if(this.file(id)){p.notice='설치된 공식 프로그램을 찾았습니다. 시작을 눌러 주세요.';this.notify();return;}
  p.busy=true;p.abort=new AbortController();p.notice='공식 배포 정보를 확인하고 있습니다…';this.notify();let temp;
  try{
   let url,digest,algorithm,version;
   if(id==='claude'){version=(await(await this.read(CLAUDE+'/latest',id)).text()).trim();if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('공식 버전을 확인하지 못했습니다.');const m=await(await this.read(CLAUDE+'/'+version+'/manifest.json',id)).json();digest=m.platforms?.['win32-x64']?.checksum;algorithm='sha256';url=CLAUDE+'/'+version+'/win32-x64/claude.exe';}
   else{const m=await(await this.read(AGY+'/manifests/windows_amd64.json',id)).json();({url,version}=m);digest=m.sha512;algorithm='sha512';}
   if(!publisherURL(url,id)||typeof digest!=='string'||!new RegExp('^[a-fA-F0-9]{'+(algorithm==='sha256'?64:128)+'}$').test(digest))throw Error('공식 파일 검증 정보를 확인하지 못했습니다.');
   const dest=path.join(this.root,'tools',id,providers[id].binary);await fs.promises.mkdir(path.dirname(dest),{recursive:true});temp=dest+'.download';
   const r=await this.fetch(url,{redirect:'error',signal:AbortSignal.any([p.abort.signal,AbortSignal.timeout(600000)])});if(!r.ok||!r.body)throw Error('공식 프로그램 다운로드 실패: '+r.status);
   const total=Number(r.headers.get('content-length'))||0,hash=crypto.createHash(algorithm);let size=0,last=0;const file=await fs.promises.open(temp,'w');
   try{for await(const raw of r.body){const chunk=Buffer.from(raw);size+=chunk.length;if(size>800*1024*1024)throw Error('다운로드 파일 크기가 예상 범위를 넘었습니다.');hash.update(chunk);await file.write(chunk);if(Date.now()-last>250){last=Date.now();p.notice=`공식 프로그램 다운로드 ${Math.round(size/1048576)}${total?' / '+Math.round(total/1048576):''} MB`;this.notify();}}}finally{await file.close();}
   if(hash.digest('hex')!==digest.toLowerCase())throw Error('공식 체크섬이 일치하지 않아 설치를 중단했습니다.');
   // Windows trust verification in addition to the publisher's checksum.
   const script="$s=Get-AuthenticodeSignature -LiteralPath $env:OFFICE_VERIFY_EXE; if($s.Status -ne 'Valid'){exit 7}; $s.SignerCertificate.Subject";
   const result=await execute(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:45000,env:{...safeEnv(),OFFICE_VERIFY_EXE:temp}});
   if(!(id==='claude'?/Anthropic/i:/Google/i).test(result.stdout))throw Error('공식 게시자 서명을 확인하지 못했습니다.');
   await fs.promises.rename(temp,dest);temp=null;p.notice=providers[id].name+' '+version+' 설치 완료. 시작을 누르면 공식 로그인 안내가 표시됩니다.';
  }catch(e){p.notice=p.abort?.signal.aborted?'다운로드를 취소했습니다.':e.message;throw e;}finally{if(temp)await fs.promises.rm(temp,{force:true}).catch(()=>{});p.busy=false;p.abort=null;this.notify();}
 }
 start(id,cols=80,rows=28){const p=this.item(id);if(p.process||p.busy)return;const file=this.file(id);if(!file)throw Error('먼저 공식 프로그램을 설치해 주세요.');if(this.closed)throw Error('패널이 종료됐습니다.');const cwd=path.join(this.root,'workspaces',id);fs.mkdirSync(cwd,{recursive:true});
  p.generation++;const child=this.pty.spawn(file,[],{name:'xterm-256color',cols:Math.max(30,Math.min(300,Math.floor(cols))),rows:Math.max(8,Math.min(150,Math.floor(rows))),cwd,env:safeEnv(),useConpty:true});p.process=child;p.notice='공식 프로그램에서 구독 계정으로 로그인하세요. 추가 API 결제를 자동으로 설정하지 않습니다.';this.event({provider:id,reset:true});
  child.onData(data=>{if(p.process===child)this.event({provider:id,data});});child.onExit(({exitCode})=>{if(p.process===child){p.process=null;p.notice='프로그램이 종료됐습니다 ('+exitCode+'). 시작을 눌러 다시 열 수 있습니다.';this.notify();}});this.notify();
 }
 input(id,data){if(typeof data!=='string'||data.length>65536)throw Error('입력이 너무 깁니다.');this.item(id).process?.write(data);}
 resize(id,cols,rows){if(Number.isInteger(cols)&&Number.isInteger(rows)&&cols>=20&&cols<=350&&rows>=5&&rows<=200)this.item(id).process?.resize(cols,rows);}
 stop(id){const p=this.item(id);p.abort?.abort();const child=p.process;p.process=null;try{child?.kill();}catch{}p.notice='공식 프로그램을 종료했습니다. 대화 기록과 로그인은 해당 프로그램에서 관리합니다.';this.notify();}
 close(){this.closed=true;for(const id of this.items.keys())this.stop(id);}
}
module.exports={OfficialCLI,providers,safeEnv,publisherURL};
