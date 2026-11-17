/* Add horizontal navigation to the original HWP menu without replacing its commands. */
(()=>{
 function start(){
  const menu=document.getElementById('menu-bar');if(!menu||menu.parentElement?.classList.contains('wp-menu-scroll'))return;
  const wrap=document.createElement('div');wrap.className='wp-menu-scroll';menu.before(wrap);
  const arrow=(direction,label)=>{const b=document.createElement('button');b.type='button';b.className='wp-menu-arrow';b.textContent=direction<0?'«':'»';b.title=label;b.setAttribute('aria-label',label);b.setAttribute('aria-controls','menu-bar');b.hidden=true;b.addEventListener('mousedown',e=>e.preventDefault());b.onclick=()=>{menu.scrollBy({left:direction*Math.max(120,menu.clientWidth*0.65),behavior:'smooth'});};return b;};
  const prev=arrow(-1,'이전 상단 메뉴'),next=arrow(1,'다음 상단 메뉴');wrap.append(prev,menu,next);menu.tabIndex=0;
  let pending=false;
  const close=()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  function place(){for(const item of menu.querySelectorAll('.menu-item.open')){
    const drop=item.querySelector(':scope > .menu-dropdown');if(!drop)continue;const rect=item.getBoundingClientRect(),viewport=menu.getBoundingClientRect();
    if(rect.right<=viewport.left||rect.left>=viewport.right){close();continue;}
    drop.style.top=rect.bottom+'px';drop.style.left=Math.max(4,Math.min(rect.left,innerWidth-drop.offsetWidth-4))+'px';
  }}
  function refresh(){pending=false;const total=[...menu.children].reduce((n,c)=>n+c.getBoundingClientRect().width,0),style=getComputedStyle(menu),padding=parseFloat(style.paddingLeft)+parseFloat(style.paddingRight);
    const reserved=wrap.querySelector('.wp-autosave-slot')?.getBoundingClientRect().width||0;
    const needs=total+padding>wrap.clientWidth-reserved+1;prev.hidden=next.hidden=!needs;
    prev.disabled=menu.scrollLeft<1;next.disabled=menu.scrollLeft+menu.clientWidth>=menu.scrollWidth-1;place();
  }
  const schedule=()=>{if(!pending){pending=true;requestAnimationFrame(refresh);}};
  menu.addEventListener('scroll',schedule,{passive:true});
  menu.addEventListener('wheel',e=>{if(e.ctrlKey||e.target.closest('.menu-dropdown')||menu.scrollWidth<=menu.clientWidth+1)return;const delta=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;if(!delta)return;const can=delta>0?menu.scrollLeft+menu.clientWidth<menu.scrollWidth-1:menu.scrollLeft>0;if(can){e.preventDefault();menu.scrollLeft+=delta*(e.deltaMode===1?16:1);}},{passive:false});
  menu.addEventListener('keydown',e=>{if(e.target!==menu)return;let left;if(e.key==='ArrowRight')left=menu.scrollLeft+120;else if(e.key==='ArrowLeft')left=menu.scrollLeft-120;else if(e.key==='Home')left=0;else if(e.key==='End')left=menu.scrollWidth;else return;e.preventDefault();menu.scrollTo({left,behavior:'smooth'});});
  menu.addEventListener('mouseover',e=>{const sub=e.target.closest('.md-sub:not(.disabled)'),panel=sub?.querySelector(':scope > .md-sub-panel');if(!panel)return;requestAnimationFrame(()=>{const r=sub.getBoundingClientRect(),w=panel.offsetWidth;panel.style.left=Math.max(4,r.right+w<=innerWidth-4?r.right:r.left-w)+'px';panel.style.top=Math.max(4,Math.min(r.top,innerHeight-panel.offsetHeight-4))+'px';});});
  new MutationObserver(schedule).observe(menu,{attributes:true,attributeFilter:['class'],childList:true,characterData:true,subtree:true});
  const resize=new ResizeObserver(schedule);resize.observe(wrap);resize.observe(menu);window.addEventListener('resize',schedule);schedule();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
