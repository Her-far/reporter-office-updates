/* Import the prior test panel once, preserving the production profile and source. */
const fs=require('node:fs/promises'),path=require('node:path'),{constants}=require('node:fs');
async function importTestPanel(appData,userData){
  const from=path.join(appData,'ElectimesOffice-WorkPanel-Test','work-panel'),to=path.join(userData,'work-panel');
  if(path.resolve(from)===path.resolve(to))return {status:'same-profile'};
  try{await fs.lstat(to);return {status:'existing'};}catch(e){if(e.code!=='ENOENT')throw e;}
  try{const s=await fs.lstat(from);if(!s.isDirectory()||s.isSymbolicLink())return {status:'missing'};}catch(e){if(e.code==='ENOENT')return {status:'missing'};throw e;}
  await fs.mkdir(userData,{recursive:true});
  const temp=await fs.mkdtemp(path.join(userData,'work-panel-import-')),copied=[];
  try{
    for(const name of ['settings.json','notes.json','notes.json.bak','secure/google-client.sealed','secure/google-token.sealed','secure/mail-reader.sealed']){
      const file=path.join(from,name);let stat;
      try{stat=await fs.lstat(file);}catch(e){if(e.code==='ENOENT')continue;throw e;}
      if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16*1024*1024)continue;
      const dest=path.join(temp,name);await fs.mkdir(path.dirname(dest),{recursive:true,mode:0o700});await fs.copyFile(file,dest,constants.COPYFILE_EXCL);copied.push(name);
    }
    if(!copied.length)return {status:'empty'};
    await fs.writeFile(path.join(temp,'imported-from-test.json'),JSON.stringify({version:1,importedAt:new Date().toISOString(),files:copied}),{mode:0o600});
    await fs.rename(temp,to);return {status:'imported',files:copied};
  }finally{await fs.rm(temp,{recursive:true,force:true});}
}
module.exports={importTestPanel};
