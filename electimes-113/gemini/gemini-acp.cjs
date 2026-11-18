'use strict';
const path = require('node:path');
const fs = require('node:fs');
const readline = require('node:readline');
const {spawn} = require('node:child_process');
const {OfficialCLI, safeEnv} = require('./official-cli.cjs');

class Connection {
  constructor(child, update, ended) {
    this.child = child;
    this.pending = new Map();
    this.serial = 0;
    const lines = readline.createInterface({input:child.stdout});
    lines.on('line', line => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (message.method) {
        if (message.id !== undefined) {
          const reply = message.method === 'session/request_permission'
            ? {result:{outcome:{outcome:'cancelled'}}}
            : {error:{code:-32601,message:'Unsupported client method'}};
          this.write({id:message.id,...reply});
        } else if (message.method === 'session/update') update(message.params);
        return;
      }
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.error) request.reject(Object.assign(new Error(message.error.message), {code:message.error.code}));
      else request.resolve(message.result);
    });
    const finish = () => {
      if (this.done) return;
      this.done = true;
      for (const request of this.pending.values()) request.reject(new Error('Google 프로그램 연결이 종료됐습니다.'));
      this.pending.clear();
      ended(this);
    };
    child.on('error', finish);
    child.on('close', finish);
    child.stdin.on('error', finish);
    child.stderr.resume();
  }
  write(message) {
    if (!this.done) this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',...message})+'\n');
  }
  call(method, params) {
    if (this.done) return Promise.reject(new Error('Google 프로그램을 다시 연결하세요.'));
    const id = ++this.serial;
    return new Promise((resolve,reject) => {
      this.pending.set(id,{resolve,reject});
      this.write({id,method,params});
    });
  }
  close() { this.child.kill(); }
}

function create({root,fetch,changed, launch=spawn, installer}) {
  let client, sessionId, busy=false, notice='', timer, closed=false, operation='';
  const threads=new Map();
  function notify() {
    if (!closed && !timer) timer=setTimeout(() => {timer=null; changed();},60);
  }
  const program = installer || new OfficialCLI({root,fetch,changed:notify});
  const cwd=path.join(root,'workspaces','gemini-chat');
  function state() {
    const installed=program.state('gemini');
    return {installed:installed.installed,ready:!!sessionId,busy,
      notice:installed.busy?installed.notice:notice,
      current:sessionId, conversations:Array.from(threads,([id,t])=>({id,title:t.title})),
      messages:threads.get(sessionId)?.messages || [],cancellable:busy && operation!=='new'};
  }
  function update(params) {
    const u=params?.update, last=threads.get(sessionId)?.messages.at(-1);
    if (params?.sessionId===sessionId && u?.sessionUpdate==='agent_message_chunk' &&
        u.content?.type==='text' && last?.role==='Gemini') {
      last.text += u.content.text;
      notify();
    }
  }
  async function connect() {
    const exe=program.file('gemini');
    if (!exe) throw Error('먼저 Google 공식 프로그램을 설치하세요.');
    fs.mkdirSync(cwd,{recursive:true});
    const child=launch(exe,['acp'],{cwd,env:safeEnv(),windowsHide:true,stdio:['pipe','pipe','pipe']});
    const link=new Connection(child,update,ended => {
      if (client===ended) { client=null; sessionId=null; notify(); }
    });
    client=link;
    const capabilities=await link.call('initialize',{protocolVersion:1,clientCapabilities:{},clientInfo:{name:'electimes-office',version:'1.0.13'}});
    if (capabilities?.protocolVersion!==1) throw Error('호환되는 Google Antigravity 버전을 설치하세요.');
    if (!capabilities.authMethods?.some(m=>m.id==='oauth-personal')) {
      throw Error('Google 개인 계정 로그인을 사용할 수 없습니다. Antigravity 버전을 확인하세요.');
    }
    notice='Google 개인 계정 연결을 확인하고 있습니다. 브라우저가 열리면 로그인을 마쳐 주세요.'; notify();
    await link.call('authenticate',{methodId:'oauth-personal'});
    await newConversation(link);
  }
  async function newConversation(link) {
    if (!link) throw Error('Google 계정을 먼저 연결하세요.');
    const result=await link.call('session/new',{cwd,mcpServers:[]});
    const id=result?.sessionId;
    if (client!==link || typeof id!=='string' || !id || threads.has(id)) throw Error('새 대화를 열지 못했습니다.');
    threads.set(id,{title:'새 대화 '+(threads.size+1),messages:[]});
    sessionId=id;notice='';
  }
  async function run(action,value) {
    if (action==='cancel') {
      if(operation==='new')return;
      if (sessionId && busy) client?.write({method:'session/cancel',params:{sessionId}});
      else if (busy) {client?.close();program.stop('gemini');}
      return;
    }
    if (busy || closed) return;
    busy=true;operation=action;notice='';notify();
    try {
      if(action==='install') {await program.install('gemini');notice='설치했습니다. Google 계정으로 연결하세요.';}
      else if(action==='connect'&&!sessionId) {threads.clear();notice='Google 프로그램에 연결 중입니다.';await connect();}
      else if(action==='new') await newConversation(client);
      else if(action==='select') {
        if (!client || !threads.has(value)) throw Error('연결 중인 대화를 선택하세요.');
        sessionId=value;
      }
      else if(action==='send') {
        if(!sessionId||!client) throw Error('Google 계정을 먼저 연결하세요.');
        if(typeof value!=='string'||!value.trim()||value.length>80000) throw Error('질문을 1~80,000자로 입력하세요.');
        const thread=threads.get(sessionId), messages=thread.messages;
        if (!messages.length) thread.title=value.trim().replace(/\s+/g,' ').slice(0,40);
        messages.push({role:'나',text:value},{role:'Gemini',text:''});
        const r=await client.call('session/prompt',{sessionId,prompt:[{type:'text',text:value}]});
        if (r?.stopReason==='cancelled') notice='답변을 중지했습니다.';
        else if (!messages.at(-1).text) notice='표시할 텍스트 답변이 없습니다.';
      }
    } catch(e) {
      if(action==='connect') {client?.close();client=null;sessionId=null;}
      notice=e.message||'Google 계정 연결을 다시 시도하세요.';
    } finally {busy=false;operation='';notify();}
  }
  function close() {closed=true;clearTimeout(timer);client?.close();program.close();}
  return {state,run,close};
}
module.exports={create};
