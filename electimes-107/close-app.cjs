/* Exercise the application's real Quit command and assert process exit. */
module.exports=async function closeTestApp(application){
 if(!application)return;const child=application.process();if(child.exitCode!==null)return;let timer;
 const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
 try{
  await application.evaluate(({app})=>{globalThis.__quitTrace=[];for(const name of ['before-quit','will-quit','window-all-closed'])app.on(name,e=>globalThis.__quitTrace.push({name,prevented:!!e?.defaultPrevented}));setImmediate(()=>app.quit());});
  const result=await Promise.race([exited,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Packaged app did not quit within 20 seconds')),20000);})]);
  if(result.code!==0)throw Error('Unexpected quit result: '+JSON.stringify(result));
  console.log('PASS: application Quit exits normally');
 }catch(e){
  try{console.error('Quit diagnostics:',await application.evaluate(({BrowserWindow})=>({events:globalThis.__quitTrace,windows:BrowserWindow.getAllWindows().map(w=>({id:w.id,title:w.getTitle(),visible:w.isVisible()}))})));}catch{}
  child.kill();throw e;
 }finally{clearTimeout(timer);}
};
