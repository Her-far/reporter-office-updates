'use strict';
module.exports=function patchHost(source,exact){
 let s=source;
 s=exact(s,'last=\'\',drag=false,sideRevision=0;',"last='',drag=false,sideRevision=0,aiSwitch=null,aiTools=null,aiStatus=null;");
 s=exact(s,'  const names={',`  const aiCss=document.createElement('style');aiCss.textContent=\`
    .wp-ai-switch,.wp-ai-tools,.wp-ai-status{box-sizing:border-box;flex:none;min-width:0}
    .wp-ai-switch{display:flex;align-items:center;gap:4px;padding:8px;border-bottom:1px solid var(--wp-border);font:12px system-ui}
    .wp-ai-switch button,.wp-ai-tools button,.wp-ai-tools select{font:12px system-ui;border:1px solid var(--wp-border);border-radius:6px;background:var(--wp-surface);color:var(--wp-text);padding:6px 8px;cursor:pointer;white-space:nowrap}
    .wp-ai-switch button[aria-pressed="true"]{background:var(--wp-accent);color:white;border-color:var(--wp-accent)}
    .wp-ai-test{margin-left:auto;font-size:10px;color:var(--wp-accent);border:1px solid var(--wp-border);border-radius:4px;padding:2px 4px}
    .wp-ai-tools{display:flex;flex-wrap:wrap;gap:5px;padding:8px 8px 3px}
    .wp-ai-tools button:disabled{opacity:.45;cursor:default}
    .wp-ai-tools select{min-width:100px;flex:1}
    .wp-ai-status{padding:4px 10px 8px;color:var(--muted,#68758b);font:11px/1.5 system-ui;max-height:65px;overflow:auto}
    .wp-dock:not([data-wp-menu="ai"])>.wp-ai-switch,.wp-dock:not([data-wp-menu="ai"])>.wp-ai-tools,.wp-dock:not([data-wp-menu="ai"])>.wp-ai-status,
    .wp-dock[data-wp-ai-mode="document"]>.wp-ai-tools,.wp-dock[data-wp-ai-mode="document"]>.wp-ai-status{display:none!important}
    .wp-dock[data-wp-menu="ai"][data-wp-ai-mode="web"]>:not(.wp-toolbar):not(.wp-ai-switch):not(.wp-ai-tools):not(.wp-ai-status):not(.wp-slot):not(.wp-resize){display:none!important}
    .wp-dock[data-wp-menu="ai"][data-wp-ai-mode="web"]>.wp-slot{display:block!important;min-height:80px}
  \`;document.head?.append(aiCss);
  const names={`);
 const toolbar=`
  function mountAi(){
    if(!aiCss.isConnected)document.head.append(aiCss);
    aiSwitch=document.createElement('div');aiSwitch.className='wp-ai-switch';
    for(const [mode,label]of [['document','문서 도우미'],['web','AI 웹 채팅']]){const b=btn(label,label,()=>action('ai-mode',mode));b.dataset.aiMode=mode;aiSwitch.append(b);}
    const badge=document.createElement('span');badge.className='wp-ai-test';badge.textContent='TEST';aiSwitch.append(badge);
    aiTools=document.createElement('div');aiTools.className='wp-ai-tools';
    const provider=document.createElement('select');provider.setAttribute('aria-label','AI 웹 서비스');provider.className='wp-ai-provider';
    for(const [id,label]of [['chatgpt','ChatGPT'],['claude','Claude'],['gemini','Gemini']]){const option=document.createElement('option');option.value=id;option.textContent=label;provider.append(option);}
    provider.onchange=()=>action('ai-provider',provider.value);aiTools.append(provider);
    for(const [key,label,title]of [['back','←','뒤로'],['forward','→','앞으로'],['reload','↻','새로고침'],['new','새 대화','새 대화'],['external','브라우저에서 열기','기본 브라우저에서 AI 서비스 열기'],['paste-ai','AI에 붙여넣기','AI 입력칸을 먼저 선택한 뒤 복사한 내용을 붙여넣습니다'],['paste-document','문서에 붙여넣기','문서의 마지막 커서 위치에 복사한 답변을 텍스트로 붙여넣습니다'],['reset','로그인 초기화','선택한 서비스의 테스트판 로그인 초기화']]){const b=btn(label,title,()=>action('ai-web',key));b.dataset.aiCommand=key;aiTools.append(b);}
    aiStatus=document.createElement('div');aiStatus.className='wp-ai-status';aiStatus.setAttribute('role','status');
    bar.after(aiSwitch,aiTools,aiStatus);
  }
  function updateAi(){
    const mode=state.prefs.aiMode||'web';target.dataset.wpAiMode=mode;
    if(!aiSwitch?.isConnected)mountAi();
    aiSwitch.querySelectorAll('[data-ai-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.aiMode===mode)));
    const provider=aiTools.querySelector('select');if(provider.value!==state.prefs.aiProvider)provider.value=state.prefs.aiProvider||'chatgpt';
    const web=state.aiWeb||{};aiTools.querySelector('[data-ai-command="back"]').disabled=!web.canBack;aiTools.querySelector('[data-ai-command="forward"]').disabled=!web.canForward;
    aiTools.querySelector('[data-ai-command="paste-document"]').disabled=target.classList.contains('wp-home');
    const message=web.error||(web.loading?'웹 화면을 불러오는 중…':'본인 계정의 구독·무료 한도가 적용됩니다. 문서는 자동으로 보내지지 않습니다.');if(aiStatus.textContent!==message)aiStatus.textContent=message;
  }
`;
 s=exact(s,'  function mount(node){',toolbar+'  function mount(node){');
 s=exact(s,'target.prepend(bar);target.append(slot);','target.prepend(bar);target.append(slot);mountAi();');
 s=exact(s,'target.dataset.wpMenu=state.menu;','target.dataset.wpMenu=state.menu;updateAi();');
 s=exact(s,"state.menu!=='ai',blocked,rect:","(state.menu!=='ai'||state.prefs.aiMode==='web'),blocked,rect:");
 return s;
};
