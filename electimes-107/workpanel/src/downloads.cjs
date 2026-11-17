/* Reserve each filename atomically in the user's chosen folder; never overwrite existing files. */
const fs=require('node:fs'),path=require('node:path');
const {safeFilename}=require('./policy.cjs');
function reserveDownload(root,filename){
  if(typeof root!=='string'||!path.isAbsolute(root))throw Error('download-folder');
  fs.mkdirSync(root,{recursive:true});
  const clean=safeFilename(filename),ext=path.extname(clean),stem=clean.slice(0,clean.length-ext.length);
  for(let index=0;index<10000;index++){
    const suffix=index?' ('+index+')':'',name=index?stem.slice(0,Math.max(1,180-ext.length-suffix.length))+suffix+ext:clean,file=path.join(root,name);
    try{return {name,file,fd:fs.openSync(file,'wx',0o600)};}catch(e){if(e.code!=='EEXIST')throw e;}
  }
  throw Error('download-folder');
}
async function saveAttachment(root,name,bytes){
  const target=reserveDownload(root,name);let closed=false;
  try{
    await new Promise((resolve,reject)=>fs.writeFile(target.fd,bytes,e=>e?reject(e):resolve()));
    fs.closeSync(target.fd);closed=true;
    if(process.platform==='win32')await fs.promises.writeFile(target.file+':Zone.Identifier','[ZoneTransfer]\r\nZoneId=3\r\n').catch(()=>{});
    return {name:target.name,file:target.file};
  }catch(e){if(!closed)try{fs.closeSync(target.fd);}catch{}await fs.promises.rm(target.file,{force:true}).catch(()=>{});throw e;}
}
module.exports={reserveDownload,saveAttachment};
