/* Detach the test debugger, then exercise the real Quit command and require exit 0. */
module.exports=async function closeTestApp(application){
 if(!application)return;const child=application.process();if(child.exitCode!==null)return;let timer;
 const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
 try{
  await application.evaluate(({app})=>{setTimeout(()=>{require('node:inspector').close();app.quit();},100);});
  const result=await Promise.race([exited,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Packaged app did not quit within 20 seconds after debugger detach')),20000);})]);
  if(result.code!==0)throw Error('Unexpected quit result: '+JSON.stringify(result));
  console.log('PASS: application Quit exits normally after test debugger detach');
 }catch(e){child.kill();throw e;}finally{clearTimeout(timer);}
};
