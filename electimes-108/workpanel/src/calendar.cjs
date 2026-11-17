const {READ_SCOPES,WRITE_SCOPE,eventOf,eventBody}=require('./policy.cjs');
const {authorize,tokenExchange}=require('./oauth.cjs');
class CalendarService {
  constructor({vault,fetcher=fetch,openExternal,onChange=()=>{},deploymentClient=null}){Object.assign(this,{vault,fetcher,openExternal,onChange,deploymentClient});this.token=null;this.client=null;this.events=[];this.calendars=[];this.lastSync=null;this.syncError='';this.generation=0;this.closed=false;}
  async init(){this.client=await this.vault.read('google-client')||this.deploymentClient;this.token=await this.vault.read('google-token');}
  status(){return {configured:!!this.client,connected:!!this.token,viaRelay:!!this.client?.tokenEndpoint,permission:this.token?.scopes?.includes(WRITE_SCOPE)?'edit':'read',connecting:!!this.auth,lastSync:this.lastSync,error:this.syncError};}
  async configure(client){if(this.token||this.auth)throw Error('disconnect-first');await this.vault.write('google-client',client);this.client=client;}
  async connect(edit){if(!this.client)throw Error('desktop-client-required');if(this.auth)throw Error('oauth-busy');if(!await this.vault.available())throw Error('secure-storage-unavailable');
    const gen=this.generation;this.auth=authorize(this.client,{openExternal:this.openExternal,fetcher:this.fetcher,edit});this.onChange();
    try{const token=await this.auth.promise;if(gen!==this.generation||this.closed)throw Error('oauth-cancelled');await this.vault.write('google-client',this.client);await this.vault.write('google-token',this.storedToken(token));this.token=token;this.syncError='';}finally{this.auth=null;this.onChange();}
  }
  storedToken(token){return {refreshToken:token.refreshToken,scopes:token.scopes,...(token.refreshProof?{refreshProof:token.refreshProof}:{})};}
  cancel(){this.auth?.cancel();}
  async disconnect(){this.generation++;this.auth?.cancel();const token=this.token;this.token=null;this.events=[];this.calendars=[];this.lastSync=null;this.syncError='';await this.vault.remove('google-token');this.onChange();
    if(token?.refreshToken){try{await this.fetcher('https://oauth2.googleapis.com/revoke',{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:token.refreshToken}).toString(),signal:AbortSignal.timeout(10000)});}catch{this.syncError='revoke-offline';}}
  }
  async access(){if(!this.token)throw Error('connect-first');if(this.token.accessToken&&this.token.expiresAt>Date.now()+60000)return this.token.accessToken;
    if(this.refreshing)return this.refreshing;const gen=this.generation,t=this.token;
    this.refreshing=(async()=>{const j=await tokenExchange(this.fetcher,this.client,{refresh_token:t.refreshToken,grant_type:'refresh_token',...(this.client.tokenEndpoint?{refresh_proof:t.refreshProof||''}:{})});if(gen!==this.generation||this.closed)throw Error('oauth-cancelled');if(!j.access_token)throw Error('reconnect-required');
      const next={...t,accessToken:j.access_token,expiresAt:Date.now()+Number(j.expires_in||3600)*1000};
      if(j.refresh_token){if(this.client.tokenEndpoint&&!/^v1\.[A-Za-z0-9_-]{43}$/.test(j.refresh_proof||''))throw Error('oauth-failed');next.refreshToken=j.refresh_token;if(j.refresh_proof)next.refreshProof=j.refresh_proof;await this.vault.write('google-token',this.storedToken(next));}
      if(gen!==this.generation||this.closed)throw Error('oauth-cancelled');this.token=next;return j.access_token;})();
    try{return await this.refreshing;}finally{this.refreshing=null;}
  }
  async request(route,{method='GET',body,etag,retry=true}={}){
    const token=await this.access();const r=await this.fetcher('https://www.googleapis.com/calendar/v3/'+route,{method,redirect:'error',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{}),...(etag?{'If-Match':etag}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
    if(r.status===401&&retry){if(this.token)this.token.expiresAt=0;return this.request(route,{method,body,etag,retry:false});}
    if(r.status===412)throw Error('event-conflict');if(r.status===403)throw Error('calendar-forbidden');if(r.status===429)throw Error('rate-limited');if(!r.ok)throw Error('calendar-network');return r.status===204?null:r.json();
  }
  async pages(route){const list=[];let pageToken,seen=new Set();do{const u=route+(route.includes('?')?'&':'?')+new URLSearchParams(pageToken?{pageToken}:{});const j=await this.request(u);list.push(...(j.items||[]));pageToken=j.nextPageToken;if(pageToken&&seen.has(pageToken))throw Error('calendar-pagination');seen.add(pageToken);if(list.length>50000)throw Error('calendar-too-many');}while(pageToken);return list;}
  async sync(ids,range){if(this.syncing){await this.syncing.catch(()=>{});return this.sync(ids,range);}const gen=this.generation;
    this.syncing=(async()=>{try{const calendars=await this.pages('users/me/calendarList?maxResults=250');const selected=calendars.filter(c=>ids.includes(c.id)||(ids.includes('primary')&&c.primary));const all=[];
      for(const c of selected){const qs=new URLSearchParams({timeMin:range.start,timeMax:range.end,timeZone:'Asia/Seoul',singleEvents:'true',orderBy:'startTime',maxResults:'2500'});const events=await this.pages('calendars/'+encodeURIComponent(c.id)+'/events?'+qs);all.push(...events.map(e=>eventOf(e,c)).filter(Boolean));}
      if(gen!==this.generation||this.closed)return;this.calendars=calendars.map(c=>({id:c.id,summary:c.summary||c.id,accessRole:c.accessRole,primary:!!c.primary}));this.events=all.sort((a,b)=>a.start.localeCompare(b.start));this.lastSync=new Date().toISOString();this.syncError='';
    }catch(e){if(gen===this.generation)this.syncError=e.message;throw e;}finally{this.onChange();}})();try{return await this.syncing;}finally{this.syncing=null;}
  }
  async mutate(action,input){if(!this.token?.scopes?.includes(WRITE_SCOPE))throw Error('edit-permission-required');const c=this.calendars.find(c=>c.id===input.calendarId);if(!c||!['owner','writer'].includes(c.accessRole))throw Error('read-only-calendar');
    let route='calendars/'+encodeURIComponent(c.id)+'/events';let etag;
    if(action!=='create'){const e=this.events.find(e=>e.id===input.id&&e.calendarId===c.id);if(!e||!input.etag||input.etag!==e.etag)throw Error('event-conflict');etag=e.etag;route+='/'+encodeURIComponent(e.id);}
    return this.request(route+'?sendUpdates=none',{method:action==='create'?'POST':action==='delete'?'DELETE':'PATCH',...(action==='delete'?{}:{body:eventBody(input)}),etag});
  }
  close(){this.closed=true;this.generation++;this.auth?.cancel();}
}
module.exports={CalendarService};
