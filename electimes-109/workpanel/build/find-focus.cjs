'use strict';
const fs=require('node:fs'),path=require('node:path');
// Return keyboard input to the actual editor, preserving the current search hit.
module.exports=function restoreFindFocus(modules,exact){
 const changed=[];
 const hwp='hide(){this._open=!1,this.queryComposing=!1,this.pendingSearchDirection=null,this.searchedQuery=null,this.currentHit=null,this.removeKeyCaptureHandler(),this.historyJumpOff?.(),this.historyJumpOff=null,this.documentMutationOff?.(),this.documentMutationOff=null,this.wrap?.remove()}focusInput()';
 for(const name of ['index-Bk_t2nzj.js','index-CY3NA5qC.js']){
  const relative='hwp/renderer/studio/assets/'+name,file=path.join(modules,relative);
  fs.writeFileSync(file,exact(fs.readFileSync(file,'utf8'),hwp,hwp.replace('this.wrap?.remove()}','this.wrap?.remove(),this.services.getInputHandler()?.focus()}')));
  changed.push('resources/modules/'+relative);
 }
 const docs=`    highlight([], 0);
    onClose();
  }, [highlight, onClose]);`;
 const focused=`    const hit = tab !== "goto" ? matchesRef.current[indexRef.current] : null;
    if (hit) editor.commands.setTextSelection({ from: hit.from, to: hit.to });
    highlight([], 0);
    onClose();
    requestAnimationFrame(() => { if (!editor.isDestroyed) editor.view.focus(); });
  }, [editor, tab, highlight, onClose]);`;
 for(const name of ['index-COLjHxtq.js','index-DE45kMEV.js']){
  const relative='docs/renderer/assets/'+name,file=path.join(modules,relative);
  fs.writeFileSync(file,exact(fs.readFileSync(file,'utf8'),docs,focused));
  changed.push('resources/modules/'+relative);
 }
 return changed;
};
