'use strict';
// Official Sign in with ChatGPT direct-plan flow. No API-key fallback.
const http=require('node:http'),crypto=require('node:crypto');
const ISSUER='https://auth.openai.com',RESOURCE='https://api.openai.com/v1';
const TOKEN=ISSUER+'/api/accounts/oauth/token',SCOPE='openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const random=()=>crypto.randomBytes(32).toString('base64url');
const errors={subscription_sharing_user_not_eligible:'이 계정은 현재 ChatGPT 구독 연결을 지원하지 않습니다. 다른 지원 계정을 선택해 주세요.',subscription_sharing_usage_limit_exceeded:'ChatGPT 사용 한도에 도달했습니다. ChatGPT 설정에서 사용량을 확인해 주세요.',subscription_sharing_usage_unavailable:'ChatGPT 사용량을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.',chatpass_v2_scope_not_authorized:'ChatGPT 구독 사용 동의가 필요합니다. 계정을 다시 연결해 주세요.',access_denied:'로그인이 취소됐거나 계정 연결이 허용되지 않았습니다.',invalid_user:'계정을 다시 연결해 주세요.',unsupported_capability:'선택한 모델이 요청 기능을 지원하지 않습니다. 웹 검색을 끄거나 다른 모델을 선택해 주세요.'};
function failure(code,status){const e=new Error(errors[code]||`연결 요청을 완료하지 못했습니다 (${String(code||status||'network_error').replace(/[^a-zA-Z0-9_.-]/g,'').slice(0,90)}).`);e.code=code;e.status=status;return e;}
async function json(response){let value;try{value=await response.json();}catch{throw failure('invalid_server_response',response.status);}if(!response.ok)throw failure(value.error?.code||value.error?.type||(typeof value.error==='string'?value.error:'http_'+response.status),response.status);return value;}
class PlanAuth{
 constructor({vault,fetch,openExternal,jose,changed,initialized=Promise.resolve()}){Object.assign(this,{vault,fetch,openExternal,jose,changed,initialized});this.data=null;this.pending=null;this.revision=0;this.writeChain=Promise.resolve();this.refreshes=new Map();this.catalog=[];this.error='';this.ready=this.init();}
 async init(){await this.initialized;if(!await this.vault.available())throw Error('Windows 보안 저장소를 사용할 수 없어 계정을 연결할 수 없습니다.');this.data=await this.vault.read('chatgpt-plan')||{host:'urn:uuid:'+crypto.randomUUID(),profiles:[],active:null};await this.save();}
 save(){const data=JSON.parse(JSON.stringify(this.data));this.writeChain=this.writeChain.catch(()=>{}).then(()=>this.vault.write('chatgpt-plan',data));return this.writeChain;}
 current(){return this.data?.profiles.find(p=>p.id===this.data.active);}
 state(){const p=this.current();return {busy:!!this.pending,active:this.data?.active||null,accounts:(this.data?.profiles||[]).map(p=>({id:p.id,name:p.email||p.name||'ChatGPT 계정',connected:!!p.access,plan:!!p.scope?.split(' ').includes('chatgpt.tokens.use.direct')})),connected:!!p?.access,plan:!!p?.scope?.split(' ').includes('chatgpt.tokens.use.direct'),models:this.catalog,welcome:!!p?.access&&!p.welcomed,error:this.error};}
 notify(){this.changed?.();}
 cancel(){const p=this.pending;if(!p)return;this.pending=null;clearTimeout(p.timer);p.abort.abort();p.server.closeAllConnections?.();p.server.close();this.notify();}
 async start(id,{consent=false}={}){
  await this.ready;if(this.pending)throw Error('이미 로그인 중입니다. 브라우저에서 완료하거나 취소해 주세요.');
  const profile=id?this.data.profiles.find(p=>p.id===id):null;if(id&&!profile)throw Error('계정을 찾지 못했습니다.');
  const p={profile,state:random(),nonce:random(),verifier:random(),abort:new AbortController()};
  p.server=http.createServer((req,res)=>{void this.callback(p,req,res);});
  await new Promise((resolve,reject)=>{p.server.once('error',reject);p.server.listen(0,'127.0.0.1',resolve);});
  p.redirect='http://127.0.0.1:'+p.server.address().port+'/auth/callback';p.timer=setTimeout(()=>{if(this.pending===p){this.error='로그인 시간이 초과됐습니다. 다시 연결해 주세요.';this.cancel();}},300000);p.timer.unref?.();
  this.pending=p;this.error='';this.notify();
  const url=new URL(ISSUER+'/api/accounts/authorize');
  for(const [k,v]of Object.entries({client_id:profile?.id||'dynamic_agent_client',ext_agent_host_id:this.data.host,response_type:'code',redirect_uri:p.redirect,scope:SCOPE,resource:RESOURCE,state:p.state,nonce:p.nonce,code_challenge_method:'S256',code_challenge:crypto.createHash('sha256').update(p.verifier).digest('base64url')}))url.searchParams.set(k,v);
  if(profile){if(profile.hint)url.searchParams.set('id_token_hint',profile.hint);if(profile.email)url.searchParams.set('login_hint',profile.email);}else url.searchParams.set('agent_name_hint','전기신문 Office AI 테스트');
  if(consent)url.searchParams.set('prompt','consent');
  try{await this.openExternal(url.href);}catch{this.cancel();throw Error('기본 브라우저를 열지 못했습니다.');}
 }
 async verify(token,client,nonce){
  const keys=await json(await this.fetch(ISSUER+'/.well-known/jwks.json',{redirect:'error',signal:AbortSignal.timeout(20000)}));
  const {payload}=await this.jose.jwtVerify(token,this.jose.createLocalJWKSet(keys),{issuer:ISSUER,audience:client,algorithms:['RS256'],requiredClaims:['sub','exp','iat'],clockTolerance:15});
  if(typeof payload.sub!=='string'||!payload.sub||(nonce&&payload.nonce!==nonce))throw failure('invalid_identity');return payload;
 }
 async callback(p,req,res){
  const answer=(status,text)=>{if(!res.destroyed){res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(text);}};
  if(this.pending!==p||req.method!=='GET'||req.headers.host!==new URL(p.redirect).host){answer(400,'유효하지 않은 요청입니다.');return;}
  let u;try{u=new URL(req.url,p.redirect);}catch{answer(400,'유효하지 않은 요청입니다.');return;}
  if(u.pathname!=='/auth/callback'){answer(404,'Not found');return;}
  if(['state','code','client_id','error'].some(k=>u.searchParams.getAll(k).length>1)||u.searchParams.get('state')!==p.state){answer(400,'로그인 확인 정보가 일치하지 않습니다. 원래 로그인 창으로 돌아가 주세요.');return;}
  if(p.processing){answer(409,'로그인을 처리하고 있습니다.');return;}p.processing=true;
  try{
   if(u.searchParams.has('error'))throw failure(u.searchParams.get('error'));
   const client=u.searchParams.get('client_id')||p.profile?.id,code=u.searchParams.get('code');
   if(!client||client==='dynamic_agent_client'||client.length>512||!code||(p.profile&&client!==p.profile.id))throw failure('invalid_client_callback');
   if(!p.profile){p.profile=this.data.profiles.find(x=>x.id===client);if(!p.profile){p.profile={id:client};this.data.profiles.push(p.profile);await this.save();}}
   const value=await json(await this.fetch(TOKEN,{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:client,code,code_verifier:p.verifier,redirect_uri:p.redirect,resource:RESOURCE}).toString(),signal:AbortSignal.any([p.abort.signal,AbortSignal.timeout(30000)])}));
   const identity=await this.verify(value.id_token,client,p.nonce);
   if(this.pending!==p)throw failure('login_cancelled');
   if(p.profile.sub&&p.profile.sub!==identity.sub)throw failure('account_mismatch');
   this.applyToken(p.profile,value);Object.assign(p.profile,{sub:identity.sub,email:identity.email||'',name:identity.name||'',hint:value.id_token});this.data.active=client;this.catalog=[];this.revision++;await this.save();
   answer(200,'계정 연결이 완료되었습니다. 이 창을 닫고 전기신문 Office로 돌아가 주세요.');
   clearTimeout(p.timer);this.pending=null;p.server.close();this.notify();
   void this.models().catch(e=>{this.error=e.message;this.notify();});
  }catch(e){this.error=e.message||'계정을 연결하지 못했습니다.';answer(400,'계정 연결을 마치지 못했습니다. 전기신문 Office 패널의 안내를 확인해 주세요.');clearTimeout(p.timer);if(this.pending===p)this.pending=null;p.server.close();this.notify();}
 }
 applyToken(p,t){if(typeof t.access_token!=='string'||!t.access_token||!Number.isFinite(t.expires_in)||t.expires_in<=0)throw failure('invalid_token_response');p.access=t.access_token;p.expires=Date.now()+t.expires_in*1000;if(t.refresh_token)p.refresh=t.refresh_token;if(t.scope!==undefined)p.scope=t.scope;}
 async access(){await this.ready;const p=this.current();if(!p?.access)throw Error('먼저 ChatGPT 계정을 연결해 주세요.');if(!p.scope?.split(' ').includes('chatgpt.tokens.use.direct'))throw failure('chatpass_v2_scope_not_authorized');if(p.expires>Date.now()+60000)return p.access;
  if(!this.refreshes.has(p.id)){const run=this.refresh(p).finally(()=>this.refreshes.delete(p.id));this.refreshes.set(p.id,run);}return this.refreshes.get(p.id);
 }
 async refresh(p){const revision=this.revision;if(!p.refresh)throw Error('로그인 유효기간이 끝났습니다. 계정을 다시 연결해 주세요.');
  try{const t=await json(await this.fetch(TOKEN,{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:p.id,refresh_token:p.refresh,resource:RESOURCE}).toString(),signal:AbortSignal.timeout(25000)}));
   if(t.id_token){const identity=await this.verify(t.id_token,p.id);if(identity.sub!==p.sub)throw failure('account_mismatch');}
   if(this.revision!==revision)throw failure('account_changed');this.applyToken(p,t);if(t.id_token)p.hint=t.id_token;await this.save();return p.access;
  }catch(e){if(/^(invalid_grant|invalid_refresh_token|token_expired|refresh_token_expired|refresh_token_reused|refresh_token_invalidated)$/.test(e.code||'')&&this.revision===revision){for(const k of ['access','refresh','expires','hint'])delete p[k];await this.save();this.notify();}throw e;}
 }
 async models(){await this.ready;const active=this.data.active,token=await this.access();const data=await json(await this.fetch(RESOURCE+'/models',{redirect:'error',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(25000)}));if(this.data.active!==active)return;this.catalog=(data.models||[]).filter(x=>x.visibility==='list'&&typeof x.slug==='string').map(x=>({id:x.slug,name:x.display_name||x.slug}));this.error='';this.notify();return this.catalog;}
 async select(id){await this.ready;if(this.pending)throw Error('로그인을 마치거나 취소한 뒤 계정을 바꿔 주세요.');if(!this.data.profiles.some(x=>x.id===id))throw Error('계정을 찾지 못했습니다.');this.data.active=id;this.revision++;this.catalog=[];this.error='';await this.save();this.notify();if(this.current()?.access)await this.models();}
 async acknowledge(){const p=this.current();if(p){p.welcomed=true;await this.save();this.notify();}}
 async logout(){await this.ready;this.cancel();const p=this.current();if(!p)return;const token=p.refresh||p.access;this.revision++;for(const k of ['access','refresh','expires','hint'])delete p[k];this.catalog=[];await this.save();this.notify();if(!token)return;
  try{const d=await json(await this.fetch(ISSUER+'/.well-known/openid-configuration',{redirect:'error',signal:AbortSignal.timeout(10000)}));const endpoint=new URL(d.revocation_endpoint);if(d.issuer!==ISSUER||endpoint.origin!==ISSUER)throw Error('Invalid revocation endpoint');const r=await this.fetch(endpoint.href,{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token,token_type_hint:'refresh_token',client_id:p.id}).toString(),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Revoke failed');this.error='이 PC의 계정 연결을 해제했습니다.';}catch{this.error='이 PC의 연결은 해제했습니다. 서버 연결 해제는 확인하지 못했으니 ChatGPT 설정에서도 확인해 주세요.';}this.notify();
 }
 close(){this.cancel();this.revision++;}
}
module.exports={PlanAuth,failure,json,RESOURCE};
