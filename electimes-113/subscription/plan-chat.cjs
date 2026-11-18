'use strict';
const crypto=require('node:crypto');const {json,failure,RESOURCE}=require('./plan-auth.cjs');
// Bounded SSE parser; incomplete streams are never recorded as successful replies.
async function consume(body,onEvent){const decoder=new TextDecoder();let buffer='';for await(const chunk of body){buffer+=decoder.decode(chunk,{stream:true});if(buffer.length>8*1024*1024)throw Error('응답 크기가 너무 큽니다.');let match;while((match=/\r?\n\r?\n/.exec(buffer))){const frame=buffer.slice(0,match.index);buffer=buffer.slice(match.index+match[0].length);const data=frame.split(/\r?\n/).filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trimStart()).join('\n');if(data&&data!=='[DONE]')onEvent(JSON.parse(data));}}}
class PlanChat{
 constructor({auth,vault,fetch,changed}){Object.assign(this,{auth,vault,fetch,changed});this.data={};this.abort=null;this.error='';this.chain=Promise.resolve();this.ready=this.init();}
 async init(){await this.auth.ready;this.data=await this.vault.read('plan-conversations')||{};for(const account of Object.values(this.data))for(const t of account.threads||[])for(const m of t.messages||[])if(m.status==='streaming')m.status='interrupted';}
 save(){const snapshot=JSON.parse(JSON.stringify(this.data));this.chain=this.chain.catch(()=>{}).then(()=>this.vault.write('plan-conversations',snapshot));return this.chain;}
 account(){const id=this.auth.data?.active;if(!id)return null;return this.data[id]||(this.data[id]={threads:[],active:null});}
 thread(){const a=this.account();return a?.threads.find(t=>t.id===a.active);}
 state(){const a=this.account(),t=this.thread();return {busy:!!this.abort,error:this.error,active:a?.active||null,threads:(a?.threads||[]).map(t=>({id:t.id,title:t.title})),messages:t?.messages||[]};}
 notify(){this.changed?.();}
 async newThread(){await this.ready;if(this.abort)throw Error('답변을 중지한 뒤 새 대화를 시작해 주세요.');const a=this.account();if(!a)throw Error('계정을 먼저 연결해 주세요.');if(a.threads.length>=100)throw Error('저장된 대화가 100개입니다. 필요 없는 대화를 먼저 삭제해 주세요.');const t={id:crypto.randomUUID(),title:'새 대화',messages:[]};a.threads.unshift(t);a.active=t.id;await this.save();this.notify();return t;}
 async select(id){await this.ready;if(this.abort)throw Error('답변을 중지한 뒤 대화를 바꿔 주세요.');const a=this.account();if(!a?.threads.some(t=>t.id===id))throw Error('대화를 찾지 못했습니다.');a.active=id;this.error='';await this.save();this.notify();}
 async remove(){if(this.abort)throw Error('답변을 중지한 뒤 삭제해 주세요.');const a=this.account();if(!a)return;a.threads=a.threads.filter(t=>t.id!==a.active);a.active=a.threads[0]?.id||null;await this.save();this.notify();}
 stop(){this.abort?.abort();}
 async send({text,model,search=false}){await this.ready;if(this.abort)throw Error('답변을 기다리거나 중지해 주세요.');if(typeof text!=='string'||!text.trim()||text.length>80000)throw Error('질문은 1~80,000자로 입력해 주세요.');if(!this.auth.catalog.some(m=>m.id===model))throw Error('사용 가능한 모델을 선택해 주세요.');
  const abort=new AbortController();this.abort=abort;this.error='';let reply,t;
  try{const token=await this.auth.access();if(abort.signal.aborted)return;t=this.thread();if(!t){this.abort=null;t=await this.newThread();this.abort=abort;}const history=t.messages.filter(m=>m.role==='user'||m.status==='complete').map(m=>({role:m.role,content:m.text}));if(JSON.stringify(history).length+text.length>500000)throw Error('대화가 길어졌습니다. 새 대화를 시작해 주세요.');history.push({role:'user',content:text});
   t.messages.push({role:'user',text,status:'complete'});reply={role:'assistant',text:'',status:'streaming',sources:[]};t.messages.push(reply);if(t.title==='새 대화')t.title=text.slice(0,40);await this.save();this.notify();
   const body={model,input:history,store:false,stream:true,instructions:'사용자의 언어로 정확하고 명료하게 답하세요. 최신 정보가 필요한데 검색할 수 없다면 그 한계를 밝히세요. 출처와 사실을 지어내지 마세요.'};if(search)body.tools=[{type:'web_search'}];
   const response=await this.fetch(RESOURCE+'/responses',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:abort.signal});if(!response.ok)await json(response);let complete=false;
   await consume(response.body,e=>{if(e.type==='response.output_text.delta')reply.text+=e.delta||'';if(e.type==='response.output_text.annotation.added'&&e.annotation?.type==='url_citation')reply.sources.push({title:e.annotation.title,url:e.annotation.url});if(e.type==='response.completed')complete=true;if(['response.failed','response.incomplete','error'].includes(e.type))throw failure(e.response?.error?.code||e.error?.code||e.code||e.type);this.notify();});
   if(!complete)throw Error('응답이 중간에 끊겼습니다. 아래 답변은 미완성입니다.');reply.status='complete';
  }catch(e){if(reply)reply.status='interrupted';this.error=abort.signal.aborted?'답변을 중지했습니다.':e.message||'답변을 받지 못했습니다.';}finally{this.abort=null;await this.save();this.notify();}
 }
}
module.exports={PlanChat,consume};
