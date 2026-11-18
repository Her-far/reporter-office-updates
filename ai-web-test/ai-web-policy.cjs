'use strict';
const providers=Object.freeze({
 chatgpt:{name:'ChatGPT',url:'https://chatgpt.com/',hosts:['chatgpt.com','auth.openai.com','auth0.openai.com','platform.openai.com']},
 claude:{name:'Claude',url:'https://claude.ai/new',hosts:['claude.ai','auth.anthropic.com','console.anthropic.com','platform.claude.com']},
 gemini:{name:'Gemini',url:'https://gemini.google.com/app',hosts:['gemini.google.com','consent.google.com']}
});
function https(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&value.length<8192?u:null;}catch{return null}}
function allowed(id,value){const u=https(value);return !!u&&!!providers[id]?.hosts.includes(u.hostname);}
function googleLogin(value){const u=https(value);return !!u&&u.hostname==='accounts.google.com';}
function preferences(raw,previous={mode:'web',provider:'chatgpt'}){return {mode:['document','web'].includes(raw?.aiMode)?raw.aiMode:previous.mode,provider:Object.hasOwn(providers,raw?.aiProvider)?raw.aiProvider:previous.provider};}
module.exports={providers,https,allowed,googleLogin,preferences};
