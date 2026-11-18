'use strict';
const https=require('node:https'),dns=require('node:dns'),net=require('node:net'),fs=require('node:fs');
const {httpsUrl,safeFilename}=require('./policy.cjs'),{reserveDownload}=require('./downloads.cjs');
const blocked=new net.BlockList();
for(const [ip,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['224.0.0.0',4],['240.0.0.0',4]])blocked.addSubnet(ip,bits,'ipv4');
for(const [ip,bits] of [['::',128],['::1',128],['fc00::',7],['fe80::',10],['ff00::',8]])blocked.addSubnet(ip,bits,'ipv6');
function publicAddress(address){const family=net.isIP(address);return !!family&&!blocked.check(address,family===4?'ipv4':'ipv6')}
function publicUrl(value){const u=httpsUrl(value);if(!u||u.hostname==='localhost'||u.hostname.endsWith('.localhost'))throw Error('reader-link-web');const host=u.hostname.replace(/^\[|\]$/g,'');if(net.isIP(host)&&!publicAddress(host))throw Error('reader-link-web');return u}
function lookup(host,options,callback){dns.lookup(host,{all:true},(error,addresses)=>{if(error)return callback(error);if(!addresses.length||addresses.some(v=>!publicAddress(v.address)))return callback(Error('reader-link-web'));callback(null,...(options.all?[addresses]:[addresses[0].address,addresses[0].family]));})}
function request(url){return new Promise((resolve,reject)=>{const req=https.get(publicUrl(url),{lookup,headers:{'User-Agent':'ElectimesOffice/1.0.9','Accept':'*/*'},signal:AbortSignal.timeout(120000)},resolve);req.on('error',reject)})}
function filename(header,fallback){let value;const encoded=/filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header||'');if(encoded)try{value=decodeURIComponent(encoded[1].trim())}catch{}if(!value)value=/filename\s*=\s*"([^"]+)"/i.exec(header||'')?.[1]||/filename\s*=\s*([^;]+)/i.exec(header||'')?.[1];return safeFilename(value||fallback||'attachment')}
async function saveLinkedAttachment({url,name,root,requester=request,maxBytes=200*1024*1024}){
 let response,target,closed=false;
 try{
  for(let hop=0;hop<=5;hop++){
   publicUrl(url);response=await requester(url);
   if([301,302,303,307,308].includes(response.statusCode)){
    const location=response.headers.location;response.destroy();if(!location||hop===5)throw Error('reader-link-web');url=new URL(location,url).href;continue;
   }
   break;
  }
  if([401,403,404,410].includes(response.statusCode))throw Error('reader-link-expired');
  if(response.statusCode!==200)throw Error('reader-link-network');
  if(/text\/html|application\/xhtml/i.test(response.headers['content-type']||''))throw Error('reader-link-web');
  if(Number(response.headers['content-length'])>maxBytes)throw Error('reader-link-large');
  target=reserveDownload(root,filename(response.headers['content-disposition'],name));let bytes=0;
  for await(const chunk of response){bytes+=chunk.length;if(bytes>maxBytes)throw Error('reader-link-large');fs.writeFileSync(target.fd,chunk);}
  if(!bytes)throw Error('reader-link-network');
  fs.closeSync(target.fd);closed=true;
  if(process.platform==='win32')await fs.promises.writeFile(target.file+':Zone.Identifier','[ZoneTransfer]\r\nZoneId=3\r\n').catch(()=>{});
  return {name:target.name,file:target.file,bytes};
 }catch(error){if(target){if(!closed)try{fs.closeSync(target.fd)}catch{}await fs.promises.rm(target.file,{force:true}).catch(()=>{});}if(/^reader-link-|download-folder/.test(error.message))throw error;throw Error('reader-link-network');}
 finally{response?.destroy();}
}
module.exports={saveLinkedAttachment,publicUrl,publicAddress,filename};
