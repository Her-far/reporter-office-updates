'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {allowed,https,googleLogin,preferences}=require('./ai-web-policy.cjs');
test('only the selected provider can navigate inside the Office panel',()=>{
 for(const url of ['http://chatgpt.com','file:///C:/secret.txt','javascript:alert(1)','https://chatgpt.com.evil.test/','https://chatgpt.com@evil.test/','https://evil.test@chatgpt.com/','https://chatgpt.com:8443/','https://claude.ai/','https://accounts.google.com/'])assert.equal(allowed('chatgpt',url),false,url);
 assert(allowed('chatgpt','https://chatgpt.com/c/fixture'));assert(allowed('chatgpt','https://auth.openai.com/authorize'));
 assert(allowed('claude','https://claude.ai/new'));assert(allowed('gemini','https://gemini.google.com/app'));
 assert.equal(https('mailto:user@example.test'),null);assert(googleLogin('https://accounts.google.com/signin'));
});
test('invalid persisted choices cannot create an arbitrary web view',()=>{
 assert.deepEqual(preferences({aiMode:'web',aiProvider:'constructor'}),{mode:'web',provider:'chatgpt'});
 assert.deepEqual(preferences({aiMode:'arbitrary',aiProvider:'https://evil.test'},{mode:'document',provider:'claude'}),{mode:'document',provider:'claude'});
});
