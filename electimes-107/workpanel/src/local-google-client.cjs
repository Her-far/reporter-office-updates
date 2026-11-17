/* Keep app credentials on the user's PC; never download them from a public host. */
const fs=require('node:fs/promises'),path=require('node:path');
const {clientOf}=require('./oauth.cjs');
async function importLocalGoogleClient({vault,resourcesPath,localAppData}){
  const backup=path.join(resourcesPath,'workpanel-upgrade.asar');
  const candidates=[backup];
  if(localAppData)candidates.push(path.join(localAppData,'Programs','ElectimesOffice-WorkPanel-Test','resources','app.asar'));
  let cleanup=false;
  try{
    if(await vault.read('google-client')){cleanup=true;return {status:'existing'};}
    for(const archive of candidates){
      const file=path.join(archive,'out','main','work-panel','google-client.json');
      let text;
      try{const stat=await fs.stat(file);if(stat.size>100000)continue;text=await fs.readFile(file,'utf8');}
      catch(e){if(['ENOENT','ENOTDIR'].includes(e.code))continue;throw e;}
      let client;try{client=clientOf(JSON.parse(text));}catch{continue;}
      await vault.write('google-client',client);
      cleanup=true;return {status:'imported'};
    }
    cleanup=true;return {status:'missing'};
  }finally{if(cleanup)await fs.rm(backup,{force:true}).catch(()=>{});}
}
module.exports={importLocalGoogleClient};
