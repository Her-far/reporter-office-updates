'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=function(out){
 const core=process.env.ELECTIMES_HWP_CORE;
 if(!core)throw Error('A verified rebuilt HWP engine is required');
 const bytes=fs.readFileSync(path.join(core,'rhwp_bg.wasm')),manifest=JSON.parse(fs.readFileSync(path.join(core,'build-manifest.json'),'utf8'));
 if(crypto.createHash('sha256').update(bytes).digest('hex')!==manifest.sha256)throw Error('HWP engine checksum mismatch');
 const relative='resources/modules/hwp/renderer/studio/assets/rhwp_bg-BmBlhBaD.wasm',old=fs.readFileSync(path.join(out,relative));
 const a=new WebAssembly.Module(old),b=new WebAssembly.Module(bytes);
 for(const type of ['imports','exports'])if(JSON.stringify(WebAssembly.Module[type](a))!==JSON.stringify(WebAssembly.Module[type](b)))throw Error('HWP engine '+type+' changed');
 fs.writeFileSync(path.join(out,relative),bytes);
 // Preserve the existing text-extraction engine. This correction applies to
 // the editing renderer; ship its pinned source patches and licenses alongside.
 const source=path.join(out,'resources/electimes-hwp-engine');fs.mkdirSync(source,{recursive:true});
 for(const file of ['LICENSE','THIRD_PARTY_LICENSES.md','build-manifest.json'])fs.copyFileSync(path.join(core,file),path.join(source,file));
 fs.cpSync(path.join(core,'source-patches'),path.join(source,'source-patches'),{recursive:true});
 return relative;
};
