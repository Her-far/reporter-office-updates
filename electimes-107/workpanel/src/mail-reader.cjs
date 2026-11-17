/* Read-only NAVER WORKS client. Credentials and attachment bytes never enter state/IPC. */
const crypto=require('node:crypto');
const {ImapFlow}=require('imapflow');
const {simpleParser}=require('mailparser');
const sanitize=require('sanitize-html');
const {safeFilename}=require('./policy.cjs');
const MAX_MESSAGE=30*1024*1024, PAGE_SIZE=50;
const KNOWN_ERRORS=new Set(['reader-credentials','reader-connect-first','reader-auth','reader-network','reader-busy','reader-message-missing','reader-message-large','reader-stale','reader-invalid','reader-attachment-missing','secure-storage-unavailable','secure-storage-read']);
const cleanError=e=>KNOWN_ERRORS.has(e?.message)?e.message:e?.authenticationFailed?'reader-auth':'reader-network';
function credentialsOf(x){
  if(!x||typeof x.email!=='string'||typeof x.password!=='string')throw Error('reader-credentials');
  const email=x.email.trim(),password=x.password;
  if(email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email)||/[\r\n\0]/.test(email)||!password||password.length>512||/[\r\n\0]/.test(password))throw Error('reader-credentials');
  return {email,password};
}
function address(a){return (a||[]).slice(0,50).map(v=>v.name?`${v.name} <${v.address||''}>`:v.address||'').join(', ').slice(0,4000);}
function dateOf(d){return d&&Number.isFinite(new Date(d).getTime())?new Date(d).toISOString():'';}
function folderOf(x){if(typeof x!=='string'||!x||x.length>2048||/[\r\n\0]/.test(x))throw Error('reader-invalid');return x;}
function idOf(x){if(!Number.isSafeInteger(x)||x<1||x>4294967295)throw Error('reader-invalid');return x;}
function bodyOf(parsed){
  const links=[];
  const html=sanitize(String(parsed.html||'').slice(0,2*1024*1024),{
    allowedTags:['p','br','div','span','b','strong','i','em','u','s','blockquote','pre','code','ul','ol','li','h1','h2','h3','h4','hr','table','thead','tbody','tfoot','tr','td','th','caption','img','a'],
    allowedAttributes:{img:['src','alt'],td:['colspan','rowspan'],th:['colspan','rowspan']},
    allowedSchemes:['data'],allowedSchemesByTag:{img:['data']},allowProtocolRelative:false,
    transformTags:{a:(_tag,a)=>{try{const u=new URL(a.href);if(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.href.length<4096&&!links.includes(u.href)&&links.length<40)links.push(u.href);}catch{}return {tagName:'span',attribs:{}};},img:(_tag,a)=>({tagName:'img',attribs:{...(/^data:image\/(?:png|jpeg|gif|webp);base64,[a-zA-Z0-9+/=\s]+$/.test(a.src||'')&&a.src.length<3*1024*1024?{src:a.src}:{}),alt:a.alt||'[외부 이미지 생략]'}})},
  });
  return {html,text:String(parsed.text||'').slice(0,2*1024*1024),links};
}
class MailReader{
  constructor({vault,clientFactory=o=>new ImapFlow(o),parser=simpleParser}){this.vault=vault;this.factory=clientFactory;this.parser=parser;this.credentials=null;this.busy=false;this.client=null;this.current=null;this.stopped=false;this.storageError='';}
  async init(){try{const v=await this.vault.read('mail-reader');if(v)this.credentials=credentialsOf(v);}catch{this.storageError='secure-storage-read';}}
  status(){return {configured:!!this.credentials,email:this.credentials?.email||'',busy:this.busy,error:this.storageError};}
  async run(fn,credentials=this.credentials){
    if(this.stopped)throw Error('reader-network');if(this.busy)throw Error('reader-busy');if(!credentials)throw Error('reader-connect-first');this.busy=true;
    let c;try{c=this.factory({host:'imap.worksmobile.com',port:993,secure:true,tls:{rejectUnauthorized:true,minVersion:'TLSv1.2'},auth:{user:credentials.email,pass:credentials.password},logger:false,emitLogs:false,logRaw:false,disableAutoIdle:true,connectionTimeout:20000,greetingTimeout:15000,socketTimeout:30000,maxLiteralSize:MAX_MESSAGE+4096,maxResponseSize:MAX_MESSAGE+1048576,maxLineLength:1048576});this.client=c;c.on('error',()=>{});await c.connect();return await fn(c);}catch(e){throw Error(cleanError(e));}finally{try{c?.close();}catch{}this.client=null;this.busy=false;}
  }
  async connect(raw){const auth=credentialsOf(raw);if(!await this.vault.available())throw Error('secure-storage-unavailable');return this.run(async c=>{const folders=await this.getFolders(c);await this.vault.write('mail-reader',auth);this.credentials=auth;this.current=null;this.storageError='';return {folders,email:auth.email};},auth);}
  async disconnect(){if(this.busy)throw Error('reader-busy');await this.vault.remove('mail-reader');this.credentials=null;this.current=null;this.storageError='';}
  async getFolders(c){const folders=await c.list();return folders.filter(f=>!f.flags?.has('\\Noselect')).map(f=>({path:f.path,name:f.name||f.path,specialUse:f.specialUse||''}));}
  async folders(){return this.run(c=>this.getFolders(c));}
  async list(raw={}){
    const folder=folderOf(raw.folder||'INBOX'),query=typeof raw.query==='string'?raw.query.trim().slice(0,200):'';
    const before=raw.before==null?null:idOf(raw.before),validity=raw.validity==null?'':String(raw.validity);
    if(before!==null&&!/^\d+$/.test(validity))throw Error('reader-invalid');
    return this.run(async c=>{const lock=await c.getMailboxLock(folder,{readOnly:true});try{
      const uidValidity=String(c.mailbox.uidValidity);if(before!==null&&uidValidity!==validity)throw Error('reader-stale');
      const criteria={all:true};if(before!==null){if(before<=1)return {items:[],next:null,folder,validity:uidValidity,total:c.mailbox.exists};criteria.uid='1:'+(before-1);}if(query)criteria.or=[{subject:query},{from:query}];if(raw.unread===true)criteria.seen=false;
      const uids=(await c.search(criteria,{uid:true})||[]).sort((a,b)=>b-a),page=uids.slice(0,PAGE_SIZE),items=[];
      if(page.length)for await(const m of c.fetch(page.join(','),{uid:true,envelope:true,flags:true,internalDate:true,bodyStructure:true},{uid:true})){
        const attachment=n=>!!n&&(n.disposition?.toLowerCase()==='attachment'||!!n.dispositionParameters?.filename||!!n.parameters?.name||(n.childNodes||[]).some(attachment));
        items.push({uid:m.uid,folder,validity:uidValidity,subject:String(m.envelope?.subject||'(제목 없음)').slice(0,2000),from:address(m.envelope?.from),date:dateOf(m.internalDate||m.envelope?.date),unread:!m.flags?.has('\\Seen'),important:!!m.flags?.has('\\Flagged'),attachment:attachment(m.bodyStructure)});
      }
      items.sort((a,b)=>b.uid-a.uid);return {items,folder,validity:uidValidity,next:uids.length>PAGE_SIZE?page.at(-1):null,total:uids.length};
    }finally{lock.release();}});
  }
  async read(raw){
    const folder=folderOf(raw?.folder),uid=idOf(raw?.uid),validity=String(raw?.validity||'');if(!/^\d+$/.test(validity))throw Error('reader-invalid');
    return this.run(async c=>{const lock=await c.getMailboxLock(folder,{readOnly:true});try{
      if(String(c.mailbox.uidValidity)!==validity)throw Error('reader-stale');
      const meta=await c.fetchOne(uid,{size:true},{uid:true});if(!meta)throw Error('reader-message-missing');if(meta.size>MAX_MESSAGE)throw Error('reader-message-large');
      const m=await c.fetchOne(uid,{source:{start:0,maxLength:MAX_MESSAGE+1}},{uid:true});if(!m?.source)throw Error('reader-message-missing');if(m.source.length>MAX_MESSAGE)throw Error('reader-message-large');
      const parsed=await this.parser(m.source,{skipImageLinks:false,maxHtmlLengthToParse:2*1024*1024}),key=crypto.randomUUID(),body=bodyOf(parsed);
      this.current={key,attachments:parsed.attachments||[],links:body.links};
      return {key,uid,folder,validity,subject:String(parsed.subject||'(제목 없음)').slice(0,2000),from:String(parsed.from?.text||'').slice(0,4000),to:String(parsed.to?.text||'').slice(0,4000),date:dateOf(parsed.date),...body,attachments:this.current.attachments.map((a,index)=>({index,name:safeFilename(a.filename||'attachment'),size:a.content?.length||a.size||0}))};
    }finally{lock.release();}});
  }
  attachment(key,index){if(this.current?.key!==key||!Number.isSafeInteger(index)||index<0||!this.current.attachments[index])throw Error('reader-attachment-missing');const a=this.current.attachments[index];return {name:safeFilename(a.filename||'attachment'),content:a.content};}
  link(key,index){if(this.current?.key!==key||!Number.isSafeInteger(index)||index<0||!this.current.links[index])throw Error('reader-invalid');return this.current.links[index];}
  close(){this.stopped=true;try{this.client?.close();}catch{}this.current=null;this.credentials=null;}
}
module.exports={MailReader,credentialsOf,bodyOf,MAX_MESSAGE};
