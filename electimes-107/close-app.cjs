/* Exercise real Quit and report which shutdown event stalls, without suppressing errors. */
const fs=require('fs'),path=require('path');
module.exports=async function closeTestApp(application){
 if(!application)return;const child=application.process();if(child.exitCode!==null)return;let timer;
 const log=path.join(__dirname,'startup-quit-'+child.pid+'.txt');
 const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
 try{
  await application.evaluate(({app,BrowserWindow},file)=>{
   const fs=require('node:fs');const mark=s=>fs.appendFileSync(file,String(s)+'\n');
   process.on('uncaughtExceptionMonitor',e=>mark('EXCEPTION '+e.stack));
   for(const name of ['before-quit','will-quit','quit','window-all-closed']){app.prependListener(name,()=>mark(name+':start'));app.on(name,e=>mark(name+':end prevented='+!!e?.defaultPrevented));}
   for(const w of BrowserWindow.getAllWindows()){w.on('close',e=>mark('window-close '+w.id+' prevented='+!!e.defaultPrevented));w.on('closed',()=>mark('window-closed'));}
   setTimeout(()=>{mark('request-quit');app.quit();mark('quit-returned');},100);
  },log);
  const result=await Promise.race([exited,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Packaged app did not quit within 20 seconds')),20000);})]);
  if(result.code!==0)throw Error('Unexpected quit result: '+JSON.stringify(result));
  console.log('PASS: application Quit exits normally');
 }catch(e){if(fs.existsSync(log))console.error(fs.readFileSync(log,'utf8'));child.kill();throw e;}finally{clearTimeout(timer);}
};
