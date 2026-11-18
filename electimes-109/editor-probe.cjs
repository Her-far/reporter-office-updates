'use strict';
// Read-only diagnostic hook used only by Windows validation. Restore the exact
// shipped bundle before packaging; no probe is part of the released payload.
const fs=require('node:fs'),path=require('node:path');
module.exports=function(){
 const file=path.join(__dirname,'stage/resources/modules/hwp/renderer/studio/assets/index-Bk_t2nzj.js'),original=fs.readFileSync(file);
 const read=`\nwindow.__electimesInspect=()=>{const d=z.doc;return {position:U?.cursor.getPosition(),selection:U?.cursor.getSelectionOrdered(),dragging:U?.isDragging,drag:{x:U?.dragLastClientX,y:U?.dragLastClientY,delta:U?.getTextSelectionDragScrollDeltaY(),raf:U?.dragAutoScrollRafId},scroll:{top:U?.container.scrollTop,height:U?.container.scrollHeight,client:U?.container.clientHeight},pages:z.pageCount,paragraphs:d?Array.from({length:Math.min(12,d.getParagraphCount(0))},(_,i)=>({index:i,length:d.getParagraphLength(0,i),rect:JSON.parse(d.getCursorRect(0,i,0))})):[],runs:d?JSON.parse(d.getPageTextLayout(0)).runs:[]}};\n`;
 if(!original.toString().includes('window.rhwpStudio={notifySaved:a=>Zw(a),fonts:'))throw Error('Unexpected diagnostic anchor');
 fs.writeFileSync(file,Buffer.concat([original,Buffer.from(read)]));
 return()=>fs.writeFileSync(file,original);
};
