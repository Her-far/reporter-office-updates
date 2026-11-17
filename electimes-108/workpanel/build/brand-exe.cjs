const fs=require('node:fs'),path=require('node:path');
const R=require(process.env.RESEDIT_MODULE || 'resedit');
const file=path.resolve(process.argv[2]),exe=R.NtExecutable.from(fs.readFileSync(file),{ignoreCert:true}),res=R.NtExecutableResource.from(exe);
for(const v of R.Resource.VersionInfo.fromEntries(res.entries)){for(const lang of v.getAllLanguagesForStringValues())v.setStringValues(lang,{CompanyName:'Electimes Office',ProductName:'Electimes Office',FileDescription:'전기신문 Office',InternalName:'Electimes Office',OriginalFilename:'Electimes Office.exe',ProductVersion:'1.0.8.0',FileVersion:'1.0.8.0'});v.setFileVersion(1,0,7,0);v.setProductVersion(1,0,7,0);v.outputToResourceEntries(res.entries);}res.outputResource(exe);fs.writeFileSync(file,Buffer.from(exe.generate()));
