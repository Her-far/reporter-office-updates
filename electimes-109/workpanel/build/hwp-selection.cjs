'use strict';
const fs=require('node:fs'),path=require('node:path');
// These methods run on the existing editor input handler. Cell selections stay
// in their own cell; body selections traverse tables and section boundaries.
const methods={
 bodyDragHit(hit){
  const anchor=this.cursor.getSelection()?.anchor;
  if(!hit||!anchor||anchor.parentParaIndex!==undefined||hit.parentParaIndex===undefined)return hit;
  const ci=hit.cellPath?.[0]?.controlIndex??hit.controlIndex;
  const table=this.bodyTableAnchors().find(t=>t.sec===hit.sectionIndex&&t.para===hit.parentParaIndex&&t.ci===ci);
  if(!table)return null;
  const after=table.sec>anchor.sectionIndex||(table.sec===anchor.sectionIndex&&(table.para>anchor.paragraphIndex||(table.para===anchor.paragraphIndex&&table.off>=anchor.charOffset)));
  // Include the table's anchor character when dragging forwards. No cell path
  // may survive here: that would turn a body range into an invalid mixed range.
  return{sectionIndex:table.sec,paragraphIndex:table.para,charOffset:table.off+(after?1:0)};
 },
 bodySelectionRanges(start,end){
  const ranges=[];
  for(let sec=start.sectionIndex;sec<=end.sectionIndex;sec++){
   const count=this.wasm.getParagraphCount(sec);if(!count)continue;
   const from=sec===start.sectionIndex?start:{paragraphIndex:0,charOffset:0};
   const to=sec===end.sectionIndex?end:{paragraphIndex:count-1,charOffset:this.wasm.getParagraphLength(sec,count-1)};
   ranges.push([sec,from.paragraphIndex,from.charOffset,to.paragraphIndex,to.charOffset]);
  }
  return ranges;
 },
 bodySelectionRects(start,end){
  return this.bodySelectionRanges(start,end).flatMap(args=>this.wasm.getSelectionRects(...args)).concat(this.bodyTableRectsInRange(start,end));
 },
 bodyHtmlFragment(html){
  const start=html.indexOf('<!--StartFragment-->'),end=html.indexOf('<!--EndFragment-->');
  return start>=0&&end>start?html.slice(start+20,end):html;
 },
 bodySelectionHtml(sec,fromPara,fromChar,toPara,toChar){
  const tables=this.bodyTableAnchors().filter(t=>t.sec===sec&&(t.para>fromPara||t.para===fromPara&&t.off>=fromChar)&&(t.para<toPara||t.para===toPara&&t.off<toChar)).sort((a,b)=>a.para-b.para||a.off-b.off);
  if(!tables.length)return this.wasm.exportSelectionHtml(sec,fromPara,fromChar,toPara,toChar);
  const fragment=html=>this.bodyHtmlFragment(html);
  const parts=[];let para=fromPara,char=fromChar;
  for(const table of tables){
   if(table.para>para||table.off>char)parts.push(fragment(this.wasm.exportSelectionHtml(sec,para,char,table.para,table.off)));
   parts.push(fragment(this.wasm.exportControlHtml(sec,table.para,table.ci,'')));
   para=table.para;char=table.off+1;
  }
  if(toPara>para||toChar>char)parts.push(fragment(this.wasm.exportSelectionHtml(sec,para,char,toPara,toChar)));
  return '<html><body>\n<!--StartFragment-->\n'+parts.join('\n')+'\n<!--EndFragment-->\n</body></html>';
 },
 copyBodySections(event,start,end){
  const text=[],html=[];
  for(const args of this.bodySelectionRanges(start,end)){
   this.wasm.copySelection(...args);text.push(this.wasm.getClipboardText());
   html.push(this.bodyHtmlFragment(this.bodySelectionHtml(...args)));
  }
  // Do not mark this as a single-section internal clipboard: its last section
  // alone is in the engine clipboard. HTML retains tables and formatting.
  event.clipboardData?.setData('text/plain',text.join('\n'));
  event.clipboardData?.setData('text/html','<html><body>\n<!--StartFragment-->\n'+html.join('\n')+'\n<!--EndFragment-->\n</body></html>');
 }
};
function patch(modules,exact){
 const changed=[];
 for(const name of ['index-Bk_t2nzj.js','index-CY3NA5qC.js']){
  const relative='hwp/renderer/studio/assets/'+name,file=path.join(modules,relative);let s=fs.readFileSync(file,'utf8');
  s=exact(s,'bodyTableAnchors(){',Object.values(methods).map(f=>f.toString()).join('\n')+'bodyTableAnchors(){');
  s=exact(s,'const e=this.hitTestFromClientPoint(this.dragLastClientX,this.dragLastClientY);if(e&&e.paragraphIndex<4294967040)',`const box=this.container.getBoundingClientRect();const e=this.bodyDragHit(this.hitTestFromClientPoint(this.dragLastClientX,Math.max(box.top+1,Math.min(box.top+this.container.clientHeight-1,this.dragLastClientY))));if(e&&e.paragraphIndex<4294967040)`);
  s=exact(s,'this.container.scrollTop!==t&&(this.updateTextSelectionDragFromPointer(),this.dragAutoScrollRafId=requestAnimationFrame(()=>this.runTextSelectionDragAutoScroll()))','this.updateTextSelectionDragFromPointer(),this.dragAutoScrollRafId=requestAnimationFrame(()=>this.runTextSelectionDragAutoScroll())');
  s=exact(s,'s=this.wasm.getSelectionRects(i.sectionIndex,i.paragraphIndex,i.charOffset,o.paragraphIndex,o.charOffset),s=s.concat(this.bodyTableRectsInRange(i,o))','s=this.bodySelectionRects(i,o)');
  s=exact(s,'o=this.wasm.exportSelectionHtml(t.sectionIndex,t.paragraphIndex,t.charOffset,n.paragraphIndex,n.charOffset)','o=this.bodySelectionHtml(t.sectionIndex,t.paragraphIndex,t.charOffset,n.paragraphIndex,n.charOffset)');
  const copy='const{start:t,end:n}=e;try{';
  const call='this.wasm.copySelection(t.sectionIndex,t.paragraphIndex,t.charOffset,n.paragraphIndex,n.charOffset)';
  const callIndex=s.indexOf(call),start=s.lastIndexOf(copy,callIndex);if(start<0||callIndex-start>600)throw Error('Copy handler changed');
  s=s.slice(0,start)+s.slice(start).replace(copy,copy+'if(t.parentParaIndex===void 0&&n.parentParaIndex===void 0&&t.sectionIndex!==n.sectionIndex){this.copyBodySections(a,t,n);return}');
  fs.writeFileSync(file,s);changed.push('resources/modules/'+relative);
 }
 return changed;
}
module.exports=patch;module.exports.methods=methods;
