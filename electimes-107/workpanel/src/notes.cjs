const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
function noteOf(n){
 if(!n||typeof n.id!=='string'||!/^[a-f0-9-]{36}$/.test(n.id)||typeof n.title!=='string'||n.title.length>200||typeof n.body!=='string'||n.body.length>30000||!Array.isArray(n.todos)||n.todos.length>100)throw Error('notes-limit');
 return {id:n.id,title:n.title,body:n.body,todos:n.todos.map(t=>{if(!t||typeof t.id!=='string'||!/^[a-f0-9-]{36}$/.test(t.id)||typeof t.text!=='string'||t.text.length>500||typeof t.done!=='boolean')throw Error('notes-limit');return {id:t.id,text:t.text,done:t.done};}),updatedAt:typeof n.updatedAt==='string'?n.updatedAt:''};
}
class NotesStore{
 constructor(file){this.file=file;this.notes=[];this.tail=Promise.resolve();this.flushRequired=false;this.ready=false;this.validPrimary=false;this.warning='';}
 async init(){
  const parse=s=>{const v=JSON.parse(s);if(v.version!==1||!Array.isArray(v.notes)||v.notes.length>100)throw Error('notes-read');return v.notes.map(noteOf);};
  try{this.notes=parse(await fs.readFile(this.file,'utf8'));this.validPrimary=true;}catch(e){if(e.code!=='ENOENT'){try{this.notes=parse(await fs.readFile(this.file+'.bak','utf8'));this.warning='최근 저장 파일 대신 백업에서 메모를 복원했습니다.';}catch{throw Error('notes-read');}}}
  this.ready=true;
 }
 snapshot(){return this.notes.map(n=>({...n,todos:n.todos.map(t=>({...t}))}));}
 save(){
  if(!this.ready)throw Error('notes-read');const data=JSON.stringify({version:1,notes:this.notes});if(Buffer.byteLength(data)>2*1024*1024)throw Error('notes-limit');
  const write=this.tail.catch(()=>{}).then(async()=>{await fs.mkdir(path.dirname(this.file),{recursive:true});await fs.writeFile(this.file+'.tmp',data,{mode:0o600});if(this.validPrimary)await fs.copyFile(this.file,this.file+'.bak');await fs.rename(this.file+'.tmp',this.file);this.validPrimary=true;});
  this.tail=write;this.flushRequired=true;write.then(()=>{if(this.tail===write)this.flushRequired=false;},()=>{});return write;
 }
 async create(){if(!this.ready)throw Error('notes-read');if(this.notes.length>=100)throw Error('notes-limit');const n={id:randomUUID(),title:'',body:'',todos:[],updatedAt:new Date().toISOString()};this.notes.unshift(n);try{await this.save();}catch(e){this.notes=this.notes.filter(x=>x.id!==n.id);throw e;}return n;}
 async update(raw){const n=noteOf(raw),i=this.notes.findIndex(x=>x.id===n.id);if(i<0)throw Error('notes-missing');n.updatedAt=new Date().toISOString();const old=this.notes[i];this.notes[i]=n;try{await this.save();}catch(e){if(this.notes[i]===n)this.notes[i]=old;throw e;}return n;}
 async remove(id){const i=this.notes.findIndex(n=>n.id===id);if(i<0)throw Error('notes-missing');const old=this.notes.splice(i,1)[0];try{await this.save();}catch(e){this.notes.splice(i,0,old);throw e;}}
 async flush(){await this.tail;}
}
module.exports={NotesStore,noteOf};
