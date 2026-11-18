'use strict';
const {spawn}=require('node:child_process'),readline=require('node:readline');
const providers=Object.freeze({chatgpt:'https://chatgpt.com/',claude:'https://claude.ai/new',gemini:'https://gemini.google.com/app'});
function makeSync(provider,rect,visible,raise=false){if(!Object.hasOwn(providers,provider))throw Error('Unknown service');const r=rect||{x:0,y:0,width:0,height:0};if(!['x','y','width','height'].every(k=>Number.isFinite(r[k])&&Math.abs(r[k])<=20000))throw Error('Invalid browser bounds');return {action:'sync',provider,...Object.fromEntries(Object.entries(r).map(([k,v])=>[k,Math.round(v)])),visible:!!visible,raise:!!raise};}
class BrowserCompanion{
 constructor({executable,hwnd,pid,onExit=()=>{}}){this.seq=0;this.pending=new Map();this.closed=false;this.process=spawn(executable,[String(hwnd),String(pid)],{windowsHide:true,stdio:['pipe','pipe','pipe']});this.lines=readline.createInterface({input:this.process.stdout});this.lines.on('line',line=>{try{const data=JSON.parse(line),p=this.pending.get(data.id);if(!p)return;this.pending.delete(data.id);clearTimeout(p.timer);data.ok?p.resolve(data.result):p.reject(Error(data.error));}catch{}});const fail=()=>{for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('브라우저 연결 도구가 종료됐습니다.'));}this.pending.clear();onExit();};this.process.on('error',fail);this.process.on('exit',fail);this.process.stdin.on('error',()=>{});this.process.stderr.resume();}
 call(data){if(this.closed)return Promise.reject(Error('Browser companion is closed'));const id=++this.seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('브라우저 응답을 기다리는 시간이 초과됐습니다.'));},35000);this.pending.set(id,{resolve,reject,timer});this.process.stdin.write(JSON.stringify({...data,id})+'\n');});}
 async close(){if(this.closed)return;try{await this.call({action:'release-all'});}finally{this.closed=true;this.process.stdin.end();}}
}
module.exports={BrowserCompanion,providers,makeSync};
