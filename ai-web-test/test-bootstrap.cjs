'use strict';
const {app}=require('electron'),fs=require('node:fs'),path=require('node:path');
const profile=app.getPath('userData');fs.mkdirSync(profile,{recursive:true});
for(const [name,value] of [['app-settings.json',{language:'ko',onboardingSeen:true,aiPanelSide:'right'}],['ai-settings.json',{providers:{},subscriptionNoticeSeen:true}]]){
 const file=path.join(profile,name);if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify(value));
}
app.on('browser-window-created',(_event,win)=>{
 const setTitle=win.setTitle.bind(win);
 win.setTitle=title=>setTitle(String(title).includes('AI 웹 테스트')?title:String(title)+' — AI 웹 테스트');
 win.on('page-title-updated',(event,title)=>{event.preventDefault();win.setTitle(title);});
 win.setTitle(win.getTitle());
});
