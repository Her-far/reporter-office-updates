/* Keep app credentials on the user's PC; never download them from a public host. */
const fs=require('node:fs/promises'),path=require('node:path');
const {clientOf}=require('./oauth.cjs');
let rawFs;try{rawFs=require('original-fs').promises;}catch{rawFs=fs;}
async function readArchiveClient(archive){
  const file=await rawFs.open(archive,'r');
  try{
    const stat=await file.stat(),prefix=Buffer.alloc(16);
    if((await file.read(prefix,0,16,0)).bytesRead!==16||prefix.readUInt32LE(0)!==4)throw Error('invalid-asar');
    const headerSize=prefix.readUInt32LE(4),jsonSize=prefix.readUInt32LE(12),start=8+headerSize;
    if(jsonSize>16*1024*1024||jsonSize>headerSize-8||start>stat.size)throw Error('invalid-asar');
    const json=Buffer.alloc(jsonSize);if((await file.read(json,0,jsonSize,16)).bytesRead!==jsonSize)throw Error('invalid-asar');
    let entry=JSON.parse(json);for(const part of ['out','main','work-panel','google-client.json'])entry=entry?.files?.[part];
    if(!entry||entry.unpacked||entry.link)return null;
    const offset=Number(entry.offset),size=entry.size;
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(size)||size<1||size>100000||start+offset+size>stat.size)throw Error('invalid-asar');
    const data=Buffer.alloc(size);if((await file.read(data,0,size,start+offset)).bytesRead!==size)throw Error('invalid-asar');
    return data.toString('utf8');
  }finally{await file.close();}
}
async function importLocalGoogleClient({vault,resourcesPath,localAppData}){
  const backup=path.join(resourcesPath,'workpanel-upgrade.asar');
  const candidates=[backup];
  if(localAppData)candidates.push(path.join(localAppData,'Programs','ElectimesOffice-WorkPanel-Test','resources','app.asar'));
  let cleanup=false;
  try{
    if(await vault.read('google-client')){cleanup=true;return {status:'existing'};}
    for(const archive of candidates){
      let text;
      try{text=await readArchiveClient(archive);if(!text)continue;}
      catch(e){if(['ENOENT','ENOTDIR'].includes(e.code))continue;throw e;}
      let client;try{client=clientOf(JSON.parse(text));}catch{continue;}
      await vault.write('google-client',client);
      cleanup=true;return {status:'imported'};
    }
    cleanup=true;return {status:'missing'};
  }finally{if(cleanup)await rawFs.rm(backup,{force:true}).catch(()=>{});}
}
module.exports={importLocalGoogleClient,readArchiveClient};
