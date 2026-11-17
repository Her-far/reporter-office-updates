const test=require('node:test'),assert=require('node:assert/strict');
const {CalendarService}=require('../src/calendar.cjs'),{tokenExchange}=require('../src/oauth.cjs');
const deployment=require('../src/google-deployment.cjs'),{READ_SCOPES}=require('../src/policy.cjs');
test('fresh profile connects through company relay without a config file, persists and refreshes after restart',async()=>{
 const store={},calls=[];let opened;
 const proof='v1.'+'a'.repeat(43);
 const vault={available:async()=>true,read:async n=>store[n]||null,write:async(n,v)=>{store[n]=structuredClone(v);},remove:async n=>{delete store[n];}};
 const fetcher=async(url,options)=>{const body=new URLSearchParams(options.body);calls.push({url,body});assert.equal(url,deployment.tokenEndpoint);assert(!body.has('client_secret'));assert.equal(body.get('client_id'),deployment.client_id);
  if(body.get('grant_type')==='authorization_code')return {ok:true,json:async()=>({access_token:'access',refresh_token:'refresh',refresh_proof:proof,scope:READ_SCOPES.join(' '),expires_in:3600})};
  assert.equal(body.get('refresh_proof'),proof);return {ok:true,json:async()=>({access_token:'renewed',refresh_token:'rotated',refresh_proof:'v1.'+'b'.repeat(43),expires_in:3600})};};
 const service=new CalendarService({vault,deploymentClient:deployment,fetcher,openExternal:async u=>{opened=new URL(u);}});await service.init();assert.equal(service.status().configured,true);assert.equal(service.status().connected,false);assert.equal(service.status().viaRelay,true);
 const connected=service.connect(false);while(!opened)await new Promise(r=>setTimeout(r,5));
 assert.equal(opened.origin,'https://accounts.google.com');assert.equal(opened.searchParams.get('prompt'),'select_account consent');assert.equal(opened.searchParams.get('code_challenge_method'),'S256');assert(!opened.searchParams.has('client_secret'));assert(!opened.searchParams.has('include_granted_scopes'));
 const callback=new URL(opened.searchParams.get('redirect_uri'));callback.search=new URLSearchParams({state:opened.searchParams.get('state'),code:'fixture-code'});assert.equal((await fetch(callback)).status,200);await connected;
 assert.equal(store['google-token'].refreshProof,proof);assert(!Object.hasOwn(store['google-token'],'accessToken'));assert.deepEqual(store['google-client'],deployment);assert.equal(calls.length,1);
 const restarted=new CalendarService({vault,deploymentClient:deployment,fetcher});await restarted.init();assert.equal(await restarted.access(),'renewed');assert.equal(store['google-token'].refreshToken,'rotated');assert.equal(store['google-token'].refreshProof,'v1.'+'b'.repeat(43));
 service.close();restarted.close();
});
test('existing encrypted local registration and account continue using Google directly',async()=>{
 const saved={client_id:'legacy.apps.googleusercontent.com',client_secret:'synthetic-legacy-secret'};
 const store={'google-client':saved,'google-token':{refreshToken:'old-refresh',scopes:READ_SCOPES}};
 const s=new CalendarService({vault:{read:async n=>store[n]||null},deploymentClient:deployment,fetcher:async(url,options)=>{assert.equal(url,'https://oauth2.googleapis.com/token');const body=new URLSearchParams(options.body);assert.equal(body.get('client_secret'),saved.client_secret);assert(!body.has('refresh_proof'));return {ok:true,json:async()=>({access_token:'legacy-new',expires_in:3600})};}});
 await s.init();assert.equal(s.status().viaRelay,false);assert.equal(await s.access(),'legacy-new');
});
test('tokens cannot be redirected to an untrusted relay or different registration',async()=>{
 const never=()=>assert.fail('must not send tokens');
 assert.throws(()=>tokenExchange(never,{...deployment,tokenEndpoint:'https://attacker.test/token'},{refresh_token:'sensitive'}),/config-invalid/);
 assert.throws(()=>tokenExchange(never,{...deployment,client_id:'other.apps.googleusercontent.com'},{refresh_token:'sensitive'}),/config-invalid/);
});
test('cancelled and failed relay authentication never saves a connection',async()=>{
 let opened,writes=0;
 const s=new CalendarService({vault:{read:async()=>null,available:async()=>true,write:async()=>{writes++;}},deploymentClient:deployment,openExternal:async u=>{opened=new URL(u);},fetcher:async()=>({status:503,ok:false,json:async()=>({error:'temporarily_unavailable'})})});await s.init();
 const a=s.connect(false);const rejected=assert.rejects(a,/oauth-service-unavailable/);while(!opened)await new Promise(r=>setTimeout(r,5));const cb=new URL(opened.searchParams.get('redirect_uri'));cb.search=new URLSearchParams({state:opened.searchParams.get('state'),code:'fixture'});await fetch(cb);await rejected;assert.equal(writes,0);assert.equal(s.status().connected,false);
 opened=null;const b=s.connect(false);const cancelled=assert.rejects(b,/oauth-cancelled/);while(!opened)await new Promise(r=>setTimeout(r,5));s.cancel();await cancelled;assert.equal(writes,0);s.close();
});
test('disconnect during a refresh-token write cannot restore the removed account on restart',async()=>{
 let release,writing;const gate=new Promise(r=>release=r),started=new Promise(r=>writing=r);
 const store={'google-client':deployment,'google-token':{refreshToken:'old',refreshProof:'v1.'+'a'.repeat(43),scopes:READ_SCOPES}};
 const vault={read:async n=>store[n]||null,write:async(n,v)=>{writing();await gate;store[n]=v;},remove:async n=>{delete store[n];}};
 const service=new CalendarService({vault,deploymentClient:deployment,fetcher:async url=>url.endsWith('/revoke')?{ok:true}:{ok:true,json:async()=>({access_token:'a',refresh_token:'rotated',refresh_proof:'v1.'+'b'.repeat(43),expires_in:3600})}});
 await service.init();const refresh=service.access();const rejected=assert.rejects(refresh,/oauth-cancelled/);await started;const disconnected=service.disconnect();release();await rejected;await disconnected;
 assert.equal(service.token,null);assert.equal(store['google-token'],undefined);const restarted=new CalendarService({vault,deploymentClient:deployment});await restarted.init();assert.equal(restarted.status().connected,false);
});
