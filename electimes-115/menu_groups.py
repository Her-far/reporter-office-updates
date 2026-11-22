"""Integrate the shared panel toolbar in the home shell and all editor preloads."""
from pathlib import PurePosixPath


def once(source, old, new):
    if source.count(old) != 1:
        raise ValueError('Unexpected source for ' + old[:100])
    return source.replace(old, new)


def toolbar(s):
    start = s.index("    [['ai',l[0]],['aiweb',webAiLabel()],['cms','기사입력']")
    s = s[:start] + '''    function group(name, label) {
      const wrap=document.createElement('span');
      wrap.className='wp-group';wrap.dataset.group=name;
      const primary=btn(label,label,()=>{open=true;void action('menu',primary.dataset.choice);});
      primary.setAttribute('role','tab');
      const arrow=btn('▾',label+' 메뉴',async()=>{
        const bounds=wrap.getBoundingClientRect();
        arrow.setAttribute('aria-expanded','true');
        try{await action('choose-group',{group:name,x:bounds.left,y:bounds.bottom});}
        finally{arrow.setAttribute('aria-expanded','false');}
      });
      arrow.className='wp-caret';arrow.setAttribute('aria-haspopup','menu');
      arrow.setAttribute('aria-expanded','false');
      wrap.append(primary,arrow);bar.append(wrap);
    }
    group('ai',l[0]);group('cms','기사입력');
    [['mail',l[1]],''' + s[s.index("['calendar',l[2]]", start):]
    start = s.index("    const web=bar.querySelector('[data-menu=")
    end = s.index("    bar.querySelectorAll('[data-menu]')", start)
    s=s[:start]+'''    for(const wrap of bar.querySelectorAll('.wp-group')){
      const ai=wrap.dataset.group==='ai', choices=ai?['ai','aiweb']:['cms','desk'];
      const selected=choices.includes(state.menu);
      const remembered=ai?(state.prefs.lastWebAi?'aiweb':'ai'):(state.prefs.lastDesk?'desk':'cms');
      const key=selected?state.menu:(ai&&state.prefs.aiWebEnabled===false?'ai':remembered);
      const primary=wrap.firstElementChild, arrow=wrap.lastElementChild;
      const label=ai?labels()[0]:(key==='desk'?'기사관리':'기사입력');
      const title=ai?(key==='aiweb'?webAiLabel():'문서 AI'):label;
      primary.dataset.choice=key;
      primary.setAttribute('aria-selected',String(selected));
      primary.title=title;primary.setAttribute('aria-label',title);
      if(primary.textContent!==label)primary.textContent=label;
      arrow.hidden=ai&&state.prefs.aiWebEnabled===false&&state.menu!=='aiweb';
    }
''' + s[end:]
    return once(s,'    .wp-toolbar .wp-menu-end{','''    .wp-group{display:inline-flex;align-items:stretch;flex:none}
    .wp-group button:first-child{padding-right:3px;border-radius:5px 0 0 5px}
    .wp-group .wp-caret{padding:5px 4px;border-radius:0 5px 5px 0}
    .wp-group [aria-selected="true"]+.wp-caret{background:var(--wp-accent);color:var(--accent-contrast,#fff)}
    .wp-toolbar .wp-menu-end{''')


def main(s):
    start=s.index('  const cmsLogin=')
    end=s.index('  function aiSession',start)
    cms=s[start:end]
    cms=once(cms,'  const cmsLogin=',"  const cmsLogin=desk?'https://www.electimes.com/admin/adminLoginForm.html':")
    cms=once(cms,'trackCms(win.webContents,false,false);','if(!desk)trackCms(win.webContents,false,false);')
    cms=once(cms,"session.fromPartition('persist:electimes-cms')","session.fromPartition(desk?'persist:electimes-cms-desk':'persist:electimes-cms')")
    cms=once(cms,'const resume=!!prefs.cmsTryHome;', 'const resume=!desk&&!!prefs.cmsTryHome;')
    cms=once(cms,'    trackCms(wc,resume,true);','    if(!desk)trackCms(wc,resume,true);')
    cms=once(cms,"()=>{fail();cmsView=null;}","()=>{if(cmsView===view)fail();}")
    cms += '''  return {
    ensure:ensureCms,
    get view(){return cmsView;},
    get error(){return cmsError;},
    reset(){const old=cmsView;cmsView=null;cmsError='';if(old&&!old.webContents.isDestroyed())old.webContents.close();}
  };
'''
    s=s[:start]+'''  const cmsPages={cms:createCmsPage(false),desk:createCmsPage(true)};
  function createCmsPage(desk){
'''+''.join('  '+line for line in cms.splitlines(keepends=True))+'''  }
'''+s[end:]
    s=once(s,'...hostState(),cmsError,','...hostState(),cmsError:cmsPages[panelMode]?.error,')
    s=once(s,'wc===cmsView?.webContents','Object.values(cmsPages).some(page=>wc===page.view?.webContents)')
    s=once(s,'function hide(){cmsView?.setVisible(false);','function hide(){for(const page of Object.values(cmsPages))page.view?.setVisible(false);')
    s=once(s,"    if(panelMode==='cms'&&!cmsError){const view=ensureCms();win.contentView.addChildView(view);view.setBounds(r);view.setVisible(true);}\n    else cmsView?.setVisible(false);",'''    for(const [key,page] of Object.entries(cmsPages)){
      if(key!==panelMode||page.error){page.view?.setVisible(false);continue;}
      const view=page.ensure();win.contentView.addChildView(view);view.setBounds(r);view.setVisible(true);
    }''')
    s=s.replace('[panel,mail,cmsView,...aiViews.values()]','[panel,mail,...Object.values(cmsPages).map(page=>page.view),...aiViews.values()]')
    s=once(s,"a==='cms-retry'&&panelMode==='cms'&&cmsError","a==='cms-retry'&&cmsPages[panelMode]?.error")
    s=once(s,"const old=cmsView;cmsView=null;cmsError='';if(old&&!old.webContents.isDestroyed())old.webContents.close();layout();emit();return {ok:true};","cmsPages[panelMode].reset();layout();emit();return {ok:true};")
    s=once(s,"owner=e.sender;if(p?.action==='menu'&&",'''owner=e.sender;
    if(p?.action==='choose-group'){
      const v=p.value||{}, ai=v.group==='ai', win=deps.window(), origin=hostOrigin();
      if((!ai&&v.group!=='cms')||!origin||![v.x,v.y].every(Number.isFinite))return hostState();
      const entries=ai?[['ai','문서 AI'],['aiweb','웹 AI']]:[['cms','기사입력'],['desk','기사관리']];
      const remembered=ai?(prefs.lastWebAi?'aiweb':'ai'):(prefs.lastDesk?'desk':'cms');
      const selected=entries.some(([key])=>key===panelMode)?panelMode:remembered;
      const scale=owner.getZoomFactor();
      const choice=await new Promise(resolve=>{
        const menu=Menu.buildFromTemplate(entries.map(([key,label])=>({
          label,type:'radio',checked:key===selected,enabled:key!=='aiweb'||prefs.aiWebEnabled,
          click:()=>resolve(key)
        })));
        menu.popup({window:win,x:Math.round(origin.x+v.x*scale),y:Math.round(origin.y+v.y*scale),
          callback:()=>setImmediate(()=>resolve(null))});
      });
      if(!choice||!activeHost(e.sender))return hostState();
      p={action:'menu',value:choice};
    }
    if(p?.action==='menu'&&''')
    s=once(s,"'cms','settings'].includes(p.value)","'cms','desk','settings'].includes(p.value)")
    return once(s,"panelMode=p.value;if(panelMode!=='settings')","""panelMode=p.value;
      if(panelMode==='ai'||panelMode==='aiweb')prefs.lastWebAi=panelMode==='aiweb';
      if(panelMode==='cms'||panelMode==='desk')prefs.lastDesk=panelMode==='desk';
      if(panelMode!=='settings')""")


def integrate(name, data):
    path=PurePosixPath(name.lstrip('@'))
    if path.parts[-2:]==('preload','index.js'):
        return toolbar(data.decode()).encode()
    if name=='@out/main/work-panel/main.cjs':
        return main(data.decode()).encode()
    if name=='@out/main/work-panel/panel.js':
        s=once(data.decode(),"if(state.menu==='cms'){","if(state.menu==='cms'||state.menu==='desk'){")
        return once(s,"['cms','기사입력'],","['cms','기사입력'],['desk','기사관리'],").encode()
    if name=='@out/main/work-panel/policy.cjs':
        s=once(data.decode(),"'notes', 'cms'];","'notes', 'cms', 'desk'];")
        return once(s,"['cmsTryHome','restoreMenu'","['lastWebAi','lastDesk','cmsTryHome','restoreMenu'").encode()
    return data
