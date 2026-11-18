'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{Readable}=require('node:stream');
const {saveLinkedAttachment,publicUrl,publicAddress}=require('../src/linked-attachment.cjs'),{bodyOf}=require('../src/mail-reader.cjs');
const response=(body,headers={},statusCode=200)=>Object.assign(Readable.from([Buffer.from(body)]),{headers,statusCode});
test('HTML file links stay actionable without href, scripts or remote images',()=>{
 const b=bodyOf({html:'<a href="https://example.com/download?id=1" onclick="alert(1)">보도자료.hwp</a><a href="https://example.com/download?id=1">다시 받기</a><a href="javascript:alert(1)">bad</a><img src="https://tracker.invalid/pixel">'});
 assert.equal(b.links.length,1);assert.equal((b.html.match(/data-reader-link="0"/g)||[]).length,2);assert(!/href=|onclick|javascript|tracker/.test(b.html));
});
test('redirected linked file saves to chosen folder and preserves existing file',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'linked-attachment-'));const calls=[];
 try{fs.writeFileSync(path.join(root,'자료.pdf'),'original');const result=await saveLinkedAttachment({root,url:'https://example.com/link',name:'fallback.pdf',requester:async url=>{calls.push(url);return calls.length===1?response('',{location:'https://cdn.example.com/file'},302):response('%PDF-fixture',{'content-type':'application/pdf','content-disposition':"attachment; filename*=UTF-8''%EC%9E%90%EB%A3%8C.pdf"})}});assert.equal(result.name,'자료 (1).pdf');assert.equal(fs.readFileSync(result.file,'utf8'),'%PDF-fixture');assert.equal(fs.readFileSync(path.join(root,'자료.pdf'),'utf8'),'original');assert.equal(calls.length,2);}finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('login pages, expired links, oversized files and private-network redirects fail cleanly',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'linked-errors-'));try{
 for(const [r,error] of [[response('<html>login</html>',{'content-type':'text/html'}),'reader-link-web'],[response('',{},403),'reader-link-expired'],[response('123456',{}),'reader-link-large'],[response('',{location:'https://127.0.0.1/file'},302),'reader-link-web']]){
  await assert.rejects(saveLinkedAttachment({root,url:'https://example.com/file',name:'report.pdf',maxBytes:5,requester:async()=>r}),new RegExp(error));assert.deepEqual(fs.readdirSync(root),[]);
 }
 for(const value of ['https://localhost/x','https://127.0.0.1/x','https://[::1]/x','https://[::ffff:127.0.0.1]/x','file:///x','https://user:password@example.com/x'])assert.throws(()=>publicUrl(value));
 assert.equal(publicAddress('192.168.1.1'),false);assert.equal(publicAddress('8.8.8.8'),true);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
