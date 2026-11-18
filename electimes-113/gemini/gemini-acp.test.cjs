'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events'),{PassThrough,Writable}=require('node:stream');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {create}=require('./gemini-acp.cjs');
async function exercise(t,cached,deny=false,unsupported=false) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gemini-session-'));
 const calls=[];let active=cached,permissionReply,created=0,rejectNew=false,release;
 const installer={file:()=>'/fixture/agy.exe',state:()=>({installed:true}),close(){}};
 function launch(file,args,options) {
   assert.deepEqual(args,['acp']);assert.equal(options.cwd,path.join(root,'workspaces','gemini-chat'));
   assert(!options.env.GEMINI_API_KEY);const child=new EventEmitter();
   child.stdout=new PassThrough();child.stderr=new PassThrough();
   const send=m=>child.stdout.write(JSON.stringify({jsonrpc:'2.0',...m})+'\n');
   child.stdin=new Writable({write(data,enc,done){const m=JSON.parse(data);calls.push(m.method);
     if(!m.method){permissionReply=m.result;done();return;}
     let result={},error;
     if(m.method==='initialize')result={protocolVersion:1,authMethods:unsupported?[{id:'gemini-api-key'}]:[{id:'oauth-personal'}]};
     if(m.method==='session/new') {if(rejectNew)error={code:-1,message:'새 대화 실패'};else if(active)result={sessionId:'session'+(++created)};else error={code:-32000,message:'Authentication required'};}
     if(m.method==='authenticate'){assert.equal(m.params.methodId,'oauth-personal');if(deny)error={code:-1,message:'로그인 취소'};else active=true;}
     if(m.method==='session/prompt'){const text=m.params.prompt[0].text;assert(m.params.sessionId.startsWith('session'));send({id:98,method:'session/request_permission',params:{}});send({method:'session/update',params:{sessionId:m.params.sessionId,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'답변 '+text}}}});result={stopReason:'end_turn'};if(text==='대기'){release=()=>send({id:m.id,result});done();return;}}
     send(error?{id:m.id,error}:{id:m.id,result});done();
   }});
   child.kill=()=>child.emit('close');return child;
 }
 const panel=create({root,installer,launch,changed(){}});
 t.after(()=>{panel.close();fs.rmSync(root,{recursive:true,force:true});});
 await panel.run('connect');
 if(unsupported){assert.equal(panel.state().ready,false);assert(!calls.includes('session/new'));assert(!calls.includes('authenticate'));return;}
 assert.equal(calls.includes('authenticate'),true);
 assert(!calls.includes('session/new')||calls.indexOf('authenticate')<calls.indexOf('session/new'));
 if(deny){assert.equal(panel.state().ready,false);assert.equal(panel.state().busy,false);assert.match(panel.state().notice,/로그인 취소/);return;}
 assert.equal(panel.state().ready,true);
 await panel.run('send','질문');
 assert.deepEqual(panel.state().messages,[{role:'나',text:'질문'},{role:'Gemini',text:'답변 질문'}]);
 assert.deepEqual(permissionReply,{outcome:{outcome:'cancelled'}});
 const original=panel.state().current;
 rejectNew=true;await panel.run('new');assert.equal(panel.state().current,original);assert.equal(panel.state().messages.length,2);rejectNew=false;
 await panel.run('new');const second=panel.state().current;
 assert.notEqual(second,original);assert.deepEqual(panel.state().messages,[]);
 const waiting=panel.run('send','대기');
 await panel.run('new');await panel.run('select',original);
 assert.equal(panel.state().current,second);assert.equal(created,2);release();await waiting;
 await panel.run('select',original);assert.equal(panel.state().messages[1].text,'답변 질문');
 await panel.run('select',second);assert.equal(panel.state().messages[1].text,'답변 대기');
 assert.equal(calls.filter(m=>m==='authenticate').length,1);
}
test('personal browser authorization returns to panel and streams text',t=>exercise(t,false));
test('cached credentials still require the personal OAuth method before session creation',t=>exercise(t,true));
test('cancelled Google consent leaves a retryable disconnected panel',t=>exercise(t,false,true));

test('API-key-only helper cannot open a conversation',t=>exercise(t,true,false,true));
