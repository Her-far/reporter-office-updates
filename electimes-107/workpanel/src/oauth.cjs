const http=require('node:http'),crypto=require('node:crypto');
const {READ_SCOPES,WRITE_SCOPE}=require('./policy.cjs');
function clientOf(json) {
  const c=json?.installed;
  if (!c || typeof c.client_id!=='string' || !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(c.client_id) || typeof c.client_secret!=='string' || c.client_secret.length>1024) throw Error('desktop-client-required');
  return {client_id:c.client_id,client_secret:c.client_secret};
}
async function postForm(fetcher,url,body,signal) {
  const r=await fetcher(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body).toString(),signal:signal || AbortSignal.timeout(25000)});
  const j=await r.json(); if (!r.ok || j.error) throw Error(j.error==='invalid_grant' ? 'reconnect-required' : 'oauth-failed'); return j;
}
function authorize(client,{openExternal,fetcher=fetch,edit=false,timeout=180000}) {
  let stop;const promise=new Promise((resolve,reject)=>{
    const state=crypto.randomBytes(32).toString('base64url'),verifier=crypto.randomBytes(48).toString('base64url');
    const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
    const callback='/oauth/'+crypto.randomBytes(16).toString('hex');
    const ac=new AbortController();let finished=false,timer,redirect;
    const finish=(err,value)=>{if(finished)return;finished=true;clearTimeout(timer);server.close();ac.abort();err?reject(err):resolve(value);};
    stop=()=>finish(Error('oauth-cancelled'));
    const server=http.createServer(async(req,res)=>{
      res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");
      if(req.method!=='GET' || req.headers.host!==new URL(redirect).host || (req.url?.length||0)>8192){res.writeHead(400);res.end('Invalid request');return;}
      const u=new URL(req.url,redirect);if(u.pathname!==callback){res.writeHead(404);res.end();return;}
      const s=u.searchParams.get('state')||'';
      if(Buffer.byteLength(s)!==Buffer.byteLength(state) || !crypto.timingSafeEqual(Buffer.from(s),Buffer.from(state))){res.writeHead(400);res.end('Invalid state');return;}
      if(u.searchParams.has('error')){res.end('Connection cancelled. Return to Office.');finish(Error('oauth-cancelled'));return;}
      const code=u.searchParams.get('code');if(!code){res.writeHead(400);res.end('Missing code');return;}
      if(server.busy){res.writeHead(409);res.end();return;}server.busy=true;
      try{
        const token=await postForm(fetcher,'https://oauth2.googleapis.com/token',{...client,code,code_verifier:verifier,redirect_uri:redirect,grant_type:'authorization_code'},ac.signal);
        const scopes=String(token.scope || '').split(' ');
        const needed=edit?[READ_SCOPES[0],WRITE_SCOPE]:READ_SCOPES;
        if(!needed.every(s=>scopes.includes(s) || (s===READ_SCOPES[1]&&scopes.includes(WRITE_SCOPE)))) throw Error('permission-missing');
        if(!token.refresh_token || !token.access_token)throw Error('reconnect-required');
        res.end('Connected. You can close this window and return to Electimes Office.');
        finish(null,{refreshToken:token.refresh_token,accessToken:token.access_token,expiresAt:Date.now()+Number(token.expires_in||3600)*1000,scopes});
      }catch(e){res.end('Connection failed. Return to Office and retry.');finish(e);}
    });
    server.on('error',()=>finish(Error('oauth-listener-failed')));
    server.listen(0,'127.0.0.1',async()=>{
      redirect='http://127.0.0.1:'+server.address().port+callback;
      const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search=new URLSearchParams({client_id:client.client_id,redirect_uri:redirect,response_type:'code',scope:(edit?[READ_SCOPES[0],WRITE_SCOPE]:READ_SCOPES).join(' '),state,code_challenge:challenge,code_challenge_method:'S256',access_type:'offline',prompt:'consent',include_granted_scopes:'true'}).toString();
      timer=setTimeout(()=>finish(Error('oauth-timeout')),timeout);timer.unref?.();
      try{await openExternal(url.href);}catch{finish(Error('browser-open-failed'));}
    });
  });return {promise,cancel:()=>stop?.()};
}
module.exports={clientOf,authorize,postForm};
