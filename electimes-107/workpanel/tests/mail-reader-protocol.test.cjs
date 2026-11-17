const {test}=require('node:test'),assert=require('node:assert/strict'),net=require('node:net');
const {ImapFlow}=require('imapflow'),{MailReader}=require('../src/mail-reader.cjs');
test('real ImapFlow reads local protocol fixture using EXAMINE and BODY.PEEK, and closes sockets', {timeout:15000},async()=>{
 const raw=Buffer.from('From: Press <press@example.com>\r\nTo: test@electimes.com\r\nSubject: Protocol fixture\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nLocal test body.\r\n');
 const commands=[],sockets=new Set();
 const server=net.createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});socket.write('* OK [CAPABILITY IMAP4rev1 AUTH=PLAIN SASL-IR] Local fixture\r\n');let input='';socket.on('data',b=>{input+=b;let at;while((at=input.indexOf('\r\n'))>=0){const line=input.slice(0,at);input=input.slice(at+2);const [tag]=line.split(' '),cmd=line.slice(tag.length+1);commands.push(cmd.replace(/AUTHENTICATE .*/, 'AUTHENTICATE [redacted]'));const done=()=>socket.write(tag+' OK done\r\n');
 if(cmd.startsWith('CAPABILITY')){socket.write('* CAPABILITY IMAP4rev1 AUTH=PLAIN SASL-IR\r\n');done();}
 else if(cmd.startsWith('AUTHENTICATE')||cmd.startsWith('LOGIN'))done();
 else if(cmd.startsWith('LIST')){socket.write('* LIST (\\Inbox) "/" "INBOX"\r\n');done();}
 else if(cmd.startsWith('EXAMINE')){socket.write('* FLAGS (\\Seen \\Flagged)\r\n* 1 EXISTS\r\n* OK [UIDVALIDITY 7] valid\r\n* OK [UIDNEXT 2] next\r\n');socket.write(tag+' OK [READ-ONLY] done\r\n');}
 else if(cmd.startsWith('UID SEARCH')){socket.write('* SEARCH 1\r\n');done();}
 else if(cmd.startsWith('UID FETCH')&&cmd.includes('BODY.PEEK')){socket.write('* 1 FETCH (UID 1 BODY[]<0> {'+raw.length+'}\r\n');socket.write(raw);socket.write(')\r\n');done();}
 else if(cmd.startsWith('UID FETCH')&&cmd.includes('RFC822.SIZE')){socket.write('* 1 FETCH (UID 1 RFC822.SIZE '+raw.length+')\r\n');done();}
 else if(cmd.startsWith('UID FETCH')){socket.write('* 1 FETCH (UID 1 FLAGS () INTERNALDATE "17-Nov-2026 01:00:00 +0000" ENVELOPE ("Tue, 17 Nov 2026 01:00:00 +0000" "Protocol fixture" (("Press" NIL "press" "example.com")) NIL NIL ((NIL NIL "test" "electimes.com")) NIL NIL NIL "<fixture@example.com>") BODYSTRUCTURE ("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "7BIT" 16 1))\r\n');done();}
 else if(cmd.startsWith('LOGOUT')){socket.write('* BYE\r\n');done();socket.end();}else if(cmd.startsWith('NOOP'))done();else socket.write(tag+' BAD unsupported fixture command\r\n');
 }});});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const saved=new Map(),reader=new MailReader({vault:{available:async()=>true,write:async(k,v)=>saved.set(k,v),read:async k=>saved.get(k),remove:async k=>saved.delete(k)},clientFactory:options=>new ImapFlow({...options,host:'127.0.0.1',port:server.address().port,secure:false,doSTARTTLS:false})});
 try{const connected=await reader.connect({email:'test@electimes.com',password:'local-fixture-password'});assert.equal(connected.folders[0].path,'INBOX');const list=await reader.list({folder:'INBOX'});assert.equal(list.items[0].subject,'Protocol fixture');const mail=await reader.read(list.items[0]);assert(mail.text.includes('Local test body'));assert(commands.some(c=>c.startsWith('EXAMINE')));assert(commands.some(c=>c.includes('BODY.PEEK')));assert(!commands.some(c=>/^(SELECT|UID STORE|UID EXPUNGE|DELETE|APPEND)/.test(c)));}finally{reader.close();for(const socket of sockets)socket.destroy();await new Promise(r=>server.close(r));}
});
