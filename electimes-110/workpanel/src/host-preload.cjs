/* Bundled inline into trusted editor preloads. No mail or calendar data enters the editor. */
;(()=>{
  const {ipcRenderer}=require('electron');
  let state=null,open=true,target=null,slot=null,bar=null,frame=0,started=false,starting=false,last='',drag=false,sideRevision=0;
  const css=`
    :root{--wp-border:var(--border,#d8dde6);--wp-surface:var(--surface,#fff);--wp-text:var(--text,#243049);--wp-accent:var(--accent,#244b7d)}
    .wp-dock{position:relative;display:flex!important;flex-direction:column!important;order:10!important;transition:none!important;min-width:0!important;flex-shrink:0!important;background:var(--wp-surface);color:var(--wp-text);box-sizing:border-box;border-left:3px solid var(--wp-accent);padding-left:7px}
    .wp-dock:not([data-wp-menu="ai"])>:not(.wp-toolbar):not(.wp-slot):not(.ai-panel-resizer):not(.wp-resize){display:none!important}
    .wp-dock>.ai-panel,.wp-dock>.copilot{flex:1;min-height:0;min-width:0!important;width:100%!important;max-width:100%}
    .wp-toolbar{display:flex!important;flex:0 0 42px;min-height:42px;width:100%;min-width:0;overflow-x:auto;overflow-y:hidden;align-items:center;gap:2px;padding:0 6px 0 10px;border-bottom:1px solid var(--wp-border);background:color-mix(in srgb,var(--wp-accent) 9%,var(--wp-surface));box-sizing:border-box;z-index:20;font-family:inherit}
    .wp-toolbar button{font:inherit;font-size:12px;white-space:nowrap;border:0;border-radius:5px;background:transparent;color:var(--wp-text);padding:7px 8px;cursor:pointer}
    .wp-toolbar button[aria-selected="true"]{background:var(--wp-accent);color:var(--accent-contrast,#fff)}
    .wp-toolbar button:focus-visible,.wp-launch:focus-visible{outline:2px solid var(--wp-accent);outline-offset:1px}
    .wp-toolbar .wp-menu-end{margin-left:auto}
    .wp-slot{flex:1;min-height:80px;display:block}
    [data-wp-menu="ai"]>.wp-slot{display:none}
    .wp-expanded{position:fixed!important;inset:var(--wp-top,0px) 0 0 auto!important;height:calc(100vh - var(--wp-top,0px))!important;max-width:100vw!important;z-index:2147482000;border-left:1px solid var(--wp-border)}
    .wp-toolbar .wp-restore{border:1px solid var(--wp-accent);color:var(--wp-accent);font-weight:600;flex-shrink:0}
    .wp-closed{display:none!important}
    .wp-launch{position:fixed;right:16px;bottom:9px;z-index:2147482001;border:1px solid var(--wp-border);border-radius:7px;background:var(--wp-surface);color:var(--wp-text);padding:5px 9px;font:12px system-ui;cursor:pointer;box-shadow:0 2px 8px #0001}
    .wp-home{position:relative!important;display:flex;align-self:stretch;z-index:10;overflow:hidden}
    .wp-home-layout{display:flex!important;flex-direction:row!important;height:100vh;box-sizing:border-box;overflow:hidden}
    .wp-home-layout>.home{flex:1 1 0!important;min-width:0!important;height:auto!important;overflow:hidden;container-type:inline-size;container-name:wp-home}
    .wp-home-layout>.home>.content{min-width:0!important;padding:24px clamp(12px,2vw,28px) 32px!important}
    .wp-home-layout .quick-cards{grid-template-columns:repeat(auto-fit,minmax(min(160px,100%),1fr))!important}
    .wp-home-layout .recents-toolbar{flex-wrap:wrap!important;gap:10px}
    .wp-home-layout .file-search-group{min-width:0;max-width:100%}
    .wp-home-layout .toolbar-filters{min-width:0;max-width:100%}
    .wp-home-layout .filter-pills{flex-wrap:wrap;height:auto;min-height:40px;max-width:100%;box-sizing:border-box}
    @container wp-home (max-width:650px){.sidebar{width:64px!important;padding-left:6px!important;padding-right:6px!important}.sidebar .nav-label,.sidebar .nav-count,.sidebar-logo,.sidebar-divider,.sidebar .folder-tree{display:none!important}.sidebar .nav-item{justify-content:center!important;padding:12px 6px!important}.content .hero-title{font-size:23px}}
    .wp-home.wp-expanded{position:fixed!important}
    .wp-resize{position:absolute;left:0;top:0;bottom:0;width:7px;cursor:col-resize;z-index:50;touch-action:none;background:color-mix(in srgb,var(--wp-accent) 10%,var(--wp-surface))}
    .wp-resize::after{content:"";position:absolute;left:2px;top:calc(50% - 22px);width:3px;height:44px;border-radius:3px;background:var(--wp-accent);opacity:.55}
    .wp-resize:hover,.wp-resize:focus-visible{background:color-mix(in srgb,var(--wp-accent) 25%,var(--wp-surface))}
    html:not([data-ai-panel-side="right"]) .wp-dock{order:-10!important;border-left:0;border-right:3px solid var(--wp-accent);padding-left:0;padding-right:7px}
    html:not([data-ai-panel-side="right"]) .wp-resize{left:auto;right:0}
    html:not([data-ai-panel-side="right"]) .wp-expanded{inset:var(--wp-top,0px) auto 0 0!important}
    html:not([data-ai-panel-side="right"]) .wp-launch{left:16px;right:auto}
    .wp-home-ai{padding:24px;font:14px/1.7 system-ui}
    .wp-dock:not([data-wp-menu="ai"]) .wp-home-ai{display:none}
  `;
  const names={ko:['AI','메일','캘린더','메모','업무 연동','확장 / 복원','닫기','업무 패널'],en:['AI','Mail','Calendar','Notes','Work settings','Expand / restore','Close','Work panel'],ja:['AI','メール','カレンダー','予定','業務連携','拡大 / 復元','閉じる','業務パネル'],zh:['AI','邮件','日历','日程','工作设置','展开 / 还原','关闭','工作面板'],'zh-TW':['AI','郵件','日曆','行程','工作設定','展開 / 還原','關閉','工作面板'],de:['KI','Mail','Kalender','Termine','Arbeitsoptionen','Erweitern / zurück','Schließen','Arbeitsbereich'],fr:['IA','Mail','Calendrier','Agenda','Réglages','Agrandir / réduire','Fermer','Espace de travail'],es:['IA','Correo','Calendario','Agenda','Ajustes','Ampliar / restaurar','Cerrar','Panel de trabajo'],it:['IA','Posta','Calendario','Agenda','Impostazioni','Espandi / ripristina','Chiudi','Pannello di lavoro'],pt:['IA','Correio','Calendário','Agenda','Configurações','Expandir / restaurar','Fechar','Painel de trabalho'],ru:['ИИ','Почта','Календарь','Планы','Настройки','Развернуть / свернуть','Закрыть','Рабочая панель'],ar:['AI','البريد','التقويم','المواعيد','الإعدادات','توسيع / استعادة','إغلاق','لوحة العمل'],he:['AI','דואר','לוח שנה','יומן','הגדרות','הרחבה / שחזור','סגירה','לוח עבודה'],hi:['AI','मेल','कैलेंडर','कार्यसूची','सेटिंग','विस्तार / बहाल','बंद करें','कार्य पैनल'],vi:['AI','Thư','Lịch','Lịch trình','Cài đặt','Mở rộng / khôi phục','Đóng','Bảng công việc'],th:['AI','อีเมล','ปฏิทิน','กำหนดการ','ตั้งค่า','ขยาย / คืนค่า','ปิด','แผงงาน'],id:['AI','Surat','Kalender','Agenda','Pengaturan','Perluas / pulihkan','Tutup','Panel kerja'],ms:['AI','Mel','Kalendar','Agenda','Tetapan','Kembangkan / pulihkan','Tutup','Panel kerja'],nl:['AI','Mail','Kalender','Agenda','Instellingen','Vergroten / herstellen','Sluiten','Werkpaneel'],pl:['AI','Poczta','Kalendarz','Plan','Ustawienia','Rozwiń / przywróć','Zamknij','Panel pracy'],cs:['AI','Pošta','Kalendář','Program','Nastavení','Rozbalit / obnovit','Zavřít','Pracovní panel']};
  function labels(){const lang=document.documentElement.lang||'ko';return names[lang]||names[lang.split('-')[0]]||names.ko;}
  const savedWidth=()=>state?.prefs.width||400;
  const onLeft=()=>document.documentElement.dataset.aiPanelSide!=='right';
  function applySide(prefs){if(prefs?.side==='left'||prefs?.side==='right'){document.documentElement.dataset.aiPanelSide=prefs.side;schedule();}}
  const action=(action,value)=>ipcRenderer.invoke('wp:host-action',{action,value}).then(s=>{state=s;update();}).catch(()=>{});
  function restore(){if(innerWidth<740){open=false;void action('closed');}void action('expanded',false);}
  function btn(text,title,handler){const b=document.createElement('button');b.type='button';b.textContent=text;b.title=title;b.setAttribute('aria-label',title);b.addEventListener('mousedown',e=>e.preventDefault());b.onclick=handler;return b;}
  function schedule(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;update();});}
  function mount(node){target=node;target.classList.add('wp-dock');bar=document.createElement('div');bar.className='wp-toolbar';bar.setAttribute('role','tablist');const l=labels();
    const backLabel=(document.documentElement.lang||'ko').startsWith('ko')?'패널로 돌아가기':'Return to panel';const back=btn(backLabel,backLabel+' (Esc)',restore);back.className='wp-restore';back.setAttribute('aria-keyshortcuts','Escape');bar.append(back);
    ['ai','mail','calendar','notes'].forEach((key,i)=>{const b=btn(l[i],l[i],()=>{open=true;void action('menu',key);});b.dataset.menu=key;b.setAttribute('role','tab');bar.append(b);});
    const settings=btn('⚙',l[4],()=>{open=true;void action('menu','settings');});settings.className='wp-menu-end';bar.append(settings);
    const expand=btn('↗',l[5],()=>state.expanded?restore():action('expanded',true));expand.className='wp-expand';bar.append(expand,btn('×',l[6],()=>{open=false;void action('closed');update();}));
    slot=document.createElement('div');slot.className='wp-slot';target.prepend(bar);target.append(slot);
    const resize=document.createElement('div');resize.className='wp-resize';resize.role='separator';resize.tabIndex=0;resize.setAttribute('aria-orientation','vertical');resize.setAttribute('aria-label','패널 너비');
    resize.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const increase=onLeft()?e.key==='ArrowRight':e.key==='ArrowLeft';action('width',savedWidth()+(increase?20:-20));}};
    resize.onpointerdown=e=>{e.preventDefault();e.stopPropagation();drag=true;resize.setPointerCapture(e.pointerId);const edge=target.getBoundingClientRect();const move=ev=>{const width=onLeft()?ev.clientX-edge.left:edge.right-ev.clientX;state.prefs.width=Math.max(300,Math.min(innerWidth-320,width));update();};const stop=()=>{drag=false;resize.removeEventListener('pointermove',move);resize.removeEventListener('pointerup',stop);resize.removeEventListener('pointercancel',stop);void action('width',savedWidth());};resize.addEventListener('pointermove',move);resize.addEventListener('pointerup',stop);resize.addEventListener('pointercancel',stop);};target.append(resize);
    new ResizeObserver(schedule).observe(target);new ResizeObserver(schedule).observe(slot);
    // React owns the original dock className and can replace it on collapse/mode changes.
    new MutationObserver(schedule).observe(target,{attributes:true,attributeFilter:['class']});
  }
  function update(){if(!state||!document.body)return;
    const isHome=!document.querySelector('.ai-dock,aside.ai-panel,aside.copilot');
    let node=document.querySelector('.ai-dock')||document.querySelector('aside.ai-panel,aside.copilot');
    if(!node&&isHome){node=document.getElementById('wp-home');if(!node){node=document.createElement('section');node.id='wp-home';node.className='wp-home';const hint=document.createElement('p');hint.className='wp-home-ai';hint.textContent='문서 탭을 열면 기존 AI 대화와 문서 작성 기능을 이용할 수 있습니다.';node.append(hint);(document.querySelector(".home")?.parentElement||document.body).append(node);}}
    const home=document.getElementById('wp-home');if(home&&home!==node)home.remove();
    const homeParent=document.querySelector('.home')?.parentElement;const split=!!home&&open&&!state.expanded&&innerWidth>=740;
    document.querySelectorAll('.wp-home-layout').forEach(n=>{if(n!==homeParent||!split)n.classList.remove('wp-home-layout');});
    if(homeParent){homeParent.classList.toggle('wp-home-layout',split);if(home&&home.parentElement!==homeParent)homeParent.append(home);}
    if(node&&(node!==target||!bar?.isConnected)){mount(node);}
    if(!target)return;
    const top=isHome?Math.max(0,document.querySelector('.tab-bar')?.getBoundingClientRect().bottom||0):0;const topPx=top+'px';if(target.style.getPropertyValue('--wp-top')!==topPx)target.style.setProperty('--wp-top',topPx);
    if(!target.classList.contains('wp-dock'))target.classList.add('wp-dock');
    if(open&&state.menu==='ai'){const rail=target.querySelector('button.ai-rail,button[data-tip]');if(rail?.classList.contains('ai-rail')&&!rail.dataset.wpExpanding){rail.dataset.wpExpanding='1';rail.click();}}
    target.classList.toggle('wp-closed',!open);target.classList.toggle('wp-expanded',!!state.expanded||innerWidth<740);target.dataset.wpMenu=state.menu;
    bar.querySelector('.wp-restore').hidden=!(state.expanded||innerWidth<740);const expand=bar.querySelector('.wp-expand'),glyph=state.expanded?'↙':'↗';if(expand.textContent!==glyph)expand.textContent=glyph;
    const w=(state.expanded||innerWidth<740)?innerWidth:Math.max(300,Math.min(savedWidth(),innerWidth-320));
    const width=w+'px';if(target.style.getPropertyValue('width')!==width)target.style.setProperty('width',width,'important');
    const body=target.closest('.sheet-body');if(body){const size=(open&&!state.expanded&&innerWidth>=740?w:0)+'px';const columns=onLeft()?`${size} minmax(0,1fr)`:`minmax(0,1fr) ${size}`;if(body.style.getPropertyValue('grid-template-columns')!==columns)body.style.setProperty('grid-template-columns',columns,'important');}
    bar.querySelectorAll('[data-menu]').forEach(b=>{const val=String(b.dataset.menu===state.menu);if(b.getAttribute('aria-selected')!==val)b.setAttribute('aria-selected',val);});
    let launch=document.getElementById('wp-launch');if(!launch){launch=btn(labels()[7],labels()[7],()=>{open=!open;update();});launch.id='wp-launch';launch.className='wp-launch';document.body.append(launch);}launch.style.display=open?'none':'';
    const r=slot.getBoundingClientRect();const blocked=!!document.querySelector('[aria-modal="true"],.set-overlay,.modal-backdrop');
    const msg={visible:open&&!blocked&&document.visibilityState!=='hidden'&&state.menu!=='ai',blocked,rect:{x:r.x,y:r.y,width:Math.max(0,r.width),height:r.height}};const s=JSON.stringify(msg);if(s!==last){last=s;ipcRenderer.send('wp:host-layout',msg);}
    const nav=document.querySelector('.set-sidebar,.set-nav');if(nav&&!nav.querySelector('.wp-settings-entry')){const b=btn(labels()[4],labels()[4],()=>{document.querySelector('.set-close')?.click();open=true;action('menu','settings');});b.className='set-nav-item wp-settings-entry';nav.append(b);}
  }
  async function start(){if(started||starting)return;if(!document.body){window.addEventListener('DOMContentLoaded',()=>void start(),{once:true});return;}starting=true;const revision=sideRevision;try{const [host,prefs]=await Promise.all([ipcRenderer.invoke('wp:host-init'),ipcRenderer.invoke('app:get-ai-panel-prefs').catch(()=>null)]);state=host;if(revision===sideRevision)applySide(prefs);}catch{starting=false;return;}started=true;starting=false;open=state.prefs.showOnStart;const style=document.createElement('style');style.textContent=css;document.head.append(style);new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});new MutationObserver(schedule).observe(document.documentElement,{attributes:true,attributeFilter:['data-ai-panel-side']});window.addEventListener('resize',schedule);document.addEventListener('visibilitychange',()=>{last='';schedule();});document.addEventListener('pointerdown',()=>{last='';schedule();},true);
    document.addEventListener('click',e=>{const button=e.target.closest?.('.ai-panel-collapse');if(!button||!target?.contains(button))return;e.preventDefault();e.stopImmediatePropagation();open=false;void action('closed');update();},true);
    update();}
  ipcRenderer.on('wp:host-state',(_e,s)=>{state=s;schedule();});ipcRenderer.on('wp:refresh',()=>{last='';if(!started)void start();else schedule();});
  ipcRenderer.on('app:ai-panel-prefs-changed',(_e,prefs)=>{sideRevision++;applySide(prefs);});
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',()=>void start(),{once:true});else void start();
})();
