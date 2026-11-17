/* Assert normal shutdown; a timed-out test never silently passes. */
module.exports=async function closeTestApp(app){
 if(!app)return;let timer;
 try{await Promise.race([app.close(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Packaged app did not quit within 20 seconds')),20000);})]);}
 catch(e){app.process()?.kill();throw e;}
 finally{clearTimeout(timer);}
};
