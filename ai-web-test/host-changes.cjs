'use strict';
module.exports=function patchHost(source,exact){
 let s=source;
 s=exact(s,"last='',drag=false,sideRevision=0;","last='',drag=false,sideRevision=0,aiSwitch=null,aiTools=null,aiStatus=null,aiLanding=null;");
 s=exact(s,'  const names={',`  const aiCss=document.createElement('style');aiCss.textContent=\`
  .wp-ai-switch,.wp-ai-tools,.wp-ai-status{box-sizing:border-box;flex:none;min-width:0}
  .wp-ai-switch{display:flex;align-items:center;gap:4px;padding:7px;border-bottom:1px solid var(--wp-border);font:12px system-ui}
  .wp-ai-switch button,.wp-ai-tools button,.wp-ai-tools select,.wp-ai-landing button{font:12px system-ui;border:1px solid var(--wp-border);border-radius:6px;background:var(--wp-surface);color:var(--wp-text);padding:6px 8px;cursor:pointer;white-space:nowrap}
  .wp-ai-switch button[aria-pressed="true"],.wp-ai-landing button{background:var(--wp-accent);color:white;border-color:var(--wp-accent)}
  .wp-ai-test{margin-left:auto;font-size:10px;color:var(--wp-accent);border:1px solid var(--wp-border);border-radius:4px;padding:2px 4px}
  .wp-ai-tools{display:flex;flex-wrap:wrap;gap:5px;padding:7px 7px 3px}
  .wp-ai-tools button:disabled,.wp-ai-landing button:disabled{opacity:.45;cursor:default}
  .wp-ai-tools select{min-width:85px;flex:1}
  .wp-ai-status{padding:3px 9px 6px;color:var(--muted,#68758b);font:11px/1.4 system-ui;max-height:48px;overflow:auto}
  .wp-ai-landing{padding:24px 18px;font:14px/1.65 system-ui;color:var(--wp-text);overflow:auto;height:100%;box-sizing:border-box}
  .wp-ai-landing h2{font-size:20px;margin:0 0 6px}.wp-ai-landing p{margin:10px 0}.wp-ai-landing small{font-size:12px;opacity:.8}.wp-ai-landing button{font-size:14px;padding:10px 18px;margin:8px 0}
  .wp-dock:not([data-wp-menu="ai"])>.wp-ai-switch,.wp-dock:not([data-wp-menu="ai"])>.wp-ai-tools,.wp-dock:not([data-wp-menu="ai"])>.wp-ai-status,
  .wp-dock[data-wp-ai-mode="document"]>.wp-ai-tools,.wp-dock[data-wp-ai-mode="document"]>.wp-ai-status{display:none!important}
  .wp-dock[data-wp-menu="ai"][data-wp-ai-mode="web"]>:not(.wp-toolbar):not(.wp-ai-switch):not(.wp-ai-tools):not(.wp-ai-status):not(.wp-slot):not(.wp-resize){display:none!important}
  .wp-dock[data-wp-menu="ai"][data-wp-ai-mode="web"]>.wp-slot{display:block!important;min-height:100px}
  .wp-dock:not([data-wp-menu="ai"]) .wp-ai-landing,.wp-dock[data-wp-ai-mode="document"] .wp-ai-landing{display:none!important}
  \`;document.head?.append(aiCss);
  const names={`);
 const toolbar=`
  function mountAi(){
   if(!aiCss.isConnected)document.head.append(aiCss);
   aiSwitch=document.createElement('div');aiSwitch.className='wp-ai-switch';
   for(const [mode,label]of [['document','문서 도우미'],['web','AI 웹 브라우저']]){const b=btn(label,label,()=>action('ai-mode',mode));b.dataset.aiMode=mode;aiSwitch.append(b);}
   const badge=document.createElement('span');badge.className='wp-ai-test';badge.textContent='TEST 3';aiSwitch.append(badge);
   aiTools=document.createElement('div');aiTools.className='wp-ai-tools';
   const provider=document.createElement('select');provider.setAttribute('aria-label','AI 서비스');provider.className='wp-ai-provider';
   for(const [id,label]of [['chatgpt','ChatGPT'],['claude','Claude'],['gemini','Gemini']]){const o=document.createElement('option');o.value=id;o.textContent=label;provider.append(o);}provider.onchange=()=>action('ai-provider',provider.value);aiTools.append(provider);
   const browser=document.createElement('select');browser.className='wp-ai-browser';browser.setAttribute('aria-label','브라우저');for(const [id,label]of [['chrome','Chrome'],['edge','Edge']]){const o=document.createElement('option');o.value=id;o.textContent=label;browser.append(o);}browser.onchange=()=>action('ai-web','browser:'+browser.value);aiTools.append(browser);
   for(const [key,label,title]of [['open','열기','선택한 AI 웹사이트를 실제 브라우저에서 엽니다'],['detach','창 분리','오피스와의 위치 연결을 풀고 일반 브라우저 창으로 사용합니다'],['paste-document','문서에 붙여넣기','웹사이트에서 복사한 답변을 문서에 붙여넣습니다']]){const b=btn(label,title,()=>action('ai-web',key));b.dataset.aiCommand=key;aiTools.append(b);}
   aiStatus=document.createElement('div');aiStatus.className='wp-ai-status';aiStatus.setAttribute('role','status');bar.after(aiSwitch,aiTools,aiStatus);
   aiLanding=document.createElement('div');aiLanding.className='wp-ai-landing';
   const title=document.createElement('h2');title.className='wp-ai-web-title';aiLanding.append(title);
   const url=document.createElement('small');url.className='wp-ai-web-url';aiLanding.append(url);
   const lead=document.createElement('p');lead.textContent='평소 사용하던 웹사이트에서 로그인하고 대화하세요. 선택한 브라우저의 계정과 대화 목록을 그대로 사용할 수 있습니다.';aiLanding.append(lead);
   const launch=btn('웹사이트 열기','브라우저에서 웹사이트 열기',()=>action('ai-web','open'));launch.className='wp-ai-web-launch';aiLanding.append(launch);
   const help=document.createElement('p');help.textContent='브라우저 창이 패널 위치를 따라 움직입니다. 넓게 보려면 위 확대 버튼을, 일반 창으로 쓰려면 창 분리를 누르세요.';aiLanding.append(help);
   const foot=document.createElement('small');foot.textContent='문서 내용을 질문하려면 문서에서 복사한 뒤 웹사이트 입력칸에 붙여넣으세요. 답변을 복사하면 위 문서에 붙여넣기를 사용할 수 있습니다.';aiLanding.append(foot);slot.append(aiLanding);
  }
  function aiText(node,value){if(node.textContent!==value)node.textContent=value;}
  function updateAi(){
   const mode=state.prefs.aiMode||'web';target.dataset.wpAiMode=mode;if(!aiSwitch?.isConnected)mountAi();
   const web=state.aiWeb||{},id=state.prefs.aiProvider||'chatgpt',names={chatgpt:'ChatGPT',claude:'Claude',gemini:'Gemini'},urls={chatgpt:'https://chatgpt.com/',claude:'https://claude.ai/',gemini:'https://gemini.google.com/'};
   aiSwitch.querySelectorAll('[data-ai-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.aiMode===mode)));
   aiTools.querySelector('.wp-ai-provider').value=id;aiTools.querySelector('.wp-ai-provider').disabled=!!web.busy;
   const browser=aiTools.querySelector('.wp-ai-browser');browser.value=web.browser||'chrome';browser.disabled=!!web.busy;for(const option of browser.options)option.disabled=!(web.browsers||[]).includes(option.value);
   const active=web.windows?.[id],open=aiTools.querySelector('[data-ai-command="open"]');open.disabled=!!web.busy;aiText(open,web.busy?'여는 중…':active?'창 보기':'열기');
   aiTools.querySelector('[data-ai-command="detach"]').disabled=!active||!!web.busy;
   aiTools.querySelector('[data-ai-command="paste-document"]').disabled=target.classList.contains('wp-home');
   aiText(aiLanding.querySelector('.wp-ai-web-title'),names[id]+' 웹');aiText(aiLanding.querySelector('.wp-ai-web-url'),urls[id]);const launch=aiLanding.querySelector('.wp-ai-web-launch');launch.disabled=!!web.busy;aiText(launch,web.busy?'브라우저를 여는 중…':names[id]+' 웹 열기');
   aiText(aiStatus,web.error||(active?'웹사이트에서 평소처럼 로그인하고 질문하세요.':'Chrome·Edge의 실제 웹사이트를 사용합니다.'));
  }
`;
 s=exact(s,'  function mount(node){',toolbar+'  function mount(node){');
 s=exact(s,'target.prepend(bar);target.append(slot);','target.prepend(bar);target.append(slot);mountAi();');
 s=exact(s,'target.dataset.wpMenu=state.menu;','target.dataset.wpMenu=state.menu;updateAi();');
 s=exact(s,"state.menu!=='ai',blocked,rect:","(state.menu!=='ai'||state.prefs.aiMode==='web'),blocked,rect:");
 return s;
};
