/* Reporter Office .34 DOC Fix 1. Original copyright and license notices retained. */
// Electron's own Node runtime runs this updater with RunAsNode. Read ASAR as raw bytes.
process.noAsar = true;
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), cp = require('child_process');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const modulePath = 'out/main/legacy-doc-open.cjs';
const oldModuleSha = '80521956a6426e33ae5b3dfc73fe38ecdf6ce6fe1438b73ba56a2586c114a556';
function parseArchive(b) {
  if(b.length<16 || b.readUInt32LE(0)!==4) throw Error('Invalid ASAR header');
  const headerSize=b.readUInt32LE(4), jsonSize=b.readUInt32LE(12), start=8+headerSize;
  if(jsonSize>headerSize-8 || start>b.length) throw Error('Invalid ASAR header size');
  return {header:JSON.parse(b.subarray(16,16+jsonSize).toString()),start,b};
}
function entry(a,name) { let n=a.header; for(const p of name.split('/')) n=n.files?.[p]; if(!n || n.unpacked || n.link || !('offset' in n)) throw Error('Missing packed file: '+name); return n; }
function content(a,name) {const n=entry(a,name);return a.b.subarray(a.start+Number(n.offset),a.start+Number(n.offset)+n.size);}
function filesOf(header) {const out=[];function walk(n,p){for(const [name,node]of Object.entries(n.files||{})){const rel=p?`${p}/${name}`:name;if(node.files)walk(node,rel);else if(!node.unpacked&&!node.link&&'offset'in node)out.push([rel,node]);}}walk(header,'');return out.sort((a,b)=>Number(a[1].offset)-Number(b[1].offset));}
function rewriteArchive(original,replacements) {
  const a=parseArchive(original), prior=parseArchive(original), blobs=[];let offset=0;
  for (const [name] of replacements) {
    const parts=name.split('/'); if(parts.some(p=>!p||p==='..'||p==='.'||p.includes('\\')))throw Error('Invalid ASAR path');
    let node=a.header; for(const p of parts.slice(0,-1)){node.files??={};node.files[p]??={files:{}};node=node.files[p];}
    node.files??={};node.files[parts.at(-1)]??={size:0,offset:String(original.length)};
  }
  for(const [name,node]of filesOf(a.header)) {
    const next=replacements.get(name) ?? content(prior,name);
    if(replacements.has(name)) {
      const blockSize=node.integrity?.blockSize || 4194304, blocks=[];
      for(let i=0;i<next.length;i+=blockSize)blocks.push(sha(next.subarray(i,i+blockSize)));
      node.integrity={algorithm:'SHA256',hash:sha(next),blockSize,blocks};
    }
    node.size=next.length;node.offset=String(offset);offset+=next.length;blobs.push(next);
  }
  const json=Buffer.from(JSON.stringify(a.header)), padded=(json.length+3)&~3;
  const header=Buffer.alloc(16+padded);header.writeUInt32LE(4,0);header.writeUInt32LE(8+padded,4);header.writeUInt32LE(4+padded,8);header.writeUInt32LE(json.length,12);json.copy(header,16);
  const out=Buffer.concat([header,...blobs]); const check=parseArchive(out);
  for(const [name]of filesOf(prior.header)) if(!content(check,name).equals(replacements.get(name)??content(prior,name))) throw Error('ASAR verification failed: '+name);
  for(const [name,b]of replacements)if(!content(check,name).equals(b))throw Error('New ASAR verification failed');
  return out;
}
module.exports={rewriteArchive,parseArchive,content,filesOf};
