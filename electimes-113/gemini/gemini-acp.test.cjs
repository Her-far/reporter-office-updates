'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events'),{PassThrough,Writable}=require('node:stream');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {create}=require('./gemini-acp.cjs');
async function exercise(t,cached,deny=false) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gemini-session-'));
 const calls=[];let active=cached,permissionReply;
 const installer={file:()=>'/fixture/agy.exe',state:()=>({installed:true}),close(){}};
 function launch(file,args,options) {
   assert.deepEqual(args,['acp']);assert.equal(options.cwd,path.join(root,'workspaces','gemini-chat'));
   assert(!options.env.GEMINI_API_KEY);const child=new EventEmitter();
   child.stdout=new PassThrough();child.stderr=new PassThrough();
   const send=m=>child.stdout.write(JSON.stringify({jsonrpc:'2.0',...m})+'\n');
   child.stdin=new Writable({write(data,enc,done){const m=JSON.parse(data);calls.push(m.method);
     if(!m.method){permissionReply=m.result;done();return;}
     let result={},error;
     if(m.method==='initialize')result={protocolVersion:1,authMethods:[{id:'oauth-personal'}]};
     if(m.method==='session/new') {if(active)result={sessionId:'session'};else error={code:-32000,message:'Authentication required'};}
     if(m.method==='authenticate'){assert.equal(m.params.methodId,'oauth-personal');if(deny)error={code:-1,message:'로그인 취소'};else active=true;}
     if(m.method==='session/prompt'){assert.equal(m.params.sessionId,'session');assert.equal(m.params.prompt[0].text,'질문');send({id:98,method:'session/request_permission',params:{}});send({method:'session/update',params:{sessionId:'session',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'답변'}}}});result={stopReason:'end_turn'};}
     send(error?{id:m.id,error}:{id:m.id,result});done();
   }});
   child.kill=()=>child.emit('close');return child;
 }
 const panel=create({root,installer,launch,changed(){}});
 t.after(()=>{panel.close();fs.rmSync(root,{recursive:true,force:true});});
 await panel.run('connect');
 assert.equal(calls.includes('authenticate'),!cached);
 if(deny){assert.equal(panel.state().ready,false);assert.equal(panel.state().busy,false);assert.match(panel.state().notice,/로그인 취소/);return;}
 assert.equal(panel.state().ready,true);
 await panel.run('send','질문');
 assert.deepEqual(panel.state().messages,[{role:'나',text:'질문'},{role:'Gemini',text:'답변'}]);
 assert.deepEqual(permissionReply,{outcome:{outcome:'cancelled'}});
}
test('personal browser authorization returns to panel and streams text',t=>exercise(t,false));
test('cached account starts conversation without another browser sign-in',t=>exercise(t,true));
test('cancelled Google consent leaves a retryable disconnected panel',t=>exercise(t,false,true));
