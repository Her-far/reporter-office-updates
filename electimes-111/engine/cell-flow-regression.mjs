import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL,fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const core=path.resolve(process.argv[2]);
const api=await import(pathToFileURL(path.join(core,'rhwp.js')));
api.initSync({module:fs.readFileSync(path.join(core,'rhwp_bg.wasm'))});
const report={version:'1.0.11',cases:[],failures:[]};
const observe=process.argv.includes('--observe');
const sourceText='복사할 문장입니다. 특별 기호 ▲와 한글을 포함합니다. '.repeat(4);
const sourceSecond='두 번째 복사 문단입니다. '.repeat(3);

function context(kind){
  const parent=kind==='nested'?2:0;
  const ci=kind==='nested'?0:2;
  const prefix=kind==='nested'?[{controlIndex:0,cellIndex:0,cellParaIndex:0}]:[];
  const cellPath=(cell,p=0)=>JSON.stringify([...prefix,{controlIndex:ci,cellIndex:cell,cellParaIndex:p}]);
  return {parent,ci,cellPath};
}
function contents(d,c,cell=1){
  return Array.from({length:d.getCellParagraphCountByPath(0,c.parent,c.cellPath(cell))},(_,p)=>
    d.getTextInCellByPath(0,c.parent,c.cellPath(cell,p),0,d.getCellParagraphLengthByPath(0,c.parent,c.cellPath(cell,p))));
}
function layout(d,c){
  const text=contents(d,c);
  return text.map((t,p)=>({text:t,start:JSON.parse(d.getCursorRectByPath(0,c.parent,c.cellPath(1,p),0)),end:JSON.parse(d.getCursorRectByPath(0,c.parent,c.cellPath(1,p),t.length))}));
}
function noOverlap(d,c,label){
  const paragraphs=layout(d,c);
  for(let p=1;p<paragraphs.length;p++){
    const prev=paragraphs[p-1].end,next=paragraphs[p].start;
    if(prev.pageIndex!==next.pageIndex){assert(next.pageIndex>prev.pageIndex,label+': backwards page');continue;}
    const gap=next.y-prev.y-prev.height;
    assert(gap>=-0.2,`${label}: paragraph ${p} overlaps predecessor by ${(-gap).toFixed(1)}px`);
    // The synthetic fixtures have no paragraph before/after spacing. Removing
    // lines must close their old space, not merely leave a non-overlapping gap.
    assert(gap<=Math.max(prev.height,next.height)+0.4,`${label}: stale vertical gap ${gap.toFixed(1)}px before ${p}`);
  }
  return paragraphs;
}
function invoke(d,c,kind,name,p,...args){
  return kind==='flat'?d[name+'InCell'](0,c.parent,c.ci,1,p,...args):d[name+'InCellByPath'](0,c.parent,c.cellPath(1,p),...args);
}

for(const kind of ['flat','path','nested'])for(const mode of ['internal-one','internal-many','html-one','html-many'])for(const at of [0,2]){
  const name=`${kind}/${mode}/paragraph-${at}`;
  const d=new api.HwpDocument(Buffer.from(fs.readFileSync(path.join(root,`cell-flow-${kind==='nested'?'nested':'flat'}.hwp.b64`),'utf8'),'base64'));
  const c=context(kind);
  try{
    const before=noOverlap(d,c,name+'/before'),original=contents(d,c),snapshot=d.saveSnapshot();
    const many=mode.endsWith('many'),last=many?1:0,lastLength=many?sourceSecond.length:sourceText.length;
    d.copySelectionInCellByPath(0,c.parent,c.cellPath(0),0,0,last,lastLength);
    let result;
    if(mode.startsWith('internal'))result=invoke(d,c,kind,'pasteInternal',at,2);
    else{
      const html=d.exportSelectionInCellHtmlByPath(0,c.parent,c.cellPath(0),0,0,last,lastLength).replace(/>\s+</g,'><');
      result=invoke(d,c,kind,'pasteHtml',at,2,html);
    }
    assert.equal(JSON.parse(result).ok,true);
    const pasted=noOverlap(d,c,name+'/paste');
    const expected=original.slice();
    expected.splice(at,1,...(many?[original[at].slice(0,2)+sourceText,sourceSecond+original[at].slice(2)]:[original[at].slice(0,2)+sourceText+original[at].slice(2)]));
    assert.deepEqual(contents(d,c),expected,name+': text preservation');
    for(const format of ['Hwp','Hwpx']){
      const reopened=new api.HwpDocument(d['export'+format]());
      assert.deepEqual(contents(reopened,c),expected,name+': '+format+' roundtrip text');
      noOverlap(reopened,c,name+'/'+format+' reopen');reopened.free();
    }
    const edited=d.saveSnapshot();
    d.restoreSnapshot(snapshot);assert.deepEqual(layout(d,c),before,name+': undo restores geometry and text');
    d.restoreSnapshot(edited);assert.deepEqual(layout(d,c),pasted,name+': redo restores geometry and text');
    invoke(d,c,kind,'splitParagraph',at,2+sourceText.length);
    noOverlap(d,c,name+'/Enter');
    invoke(d,c,kind,'insertText',at+1,0,'▲');
    noOverlap(d,c,name+'/symbol');
    const merged=JSON.parse(invoke(d,c,kind,'mergeParagraph',at+1));
    noOverlap(d,c,name+'/Backspace');
    invoke(d,c,kind,'splitParagraph',at,merged.charOffset,JSON.stringify(merged.removedParaMeta));
    noOverlap(d,c,name+'/undo Backspace');
    report.cases.push({name,textPreserved:true,noOverlap:true,saveReopen:['HWP','HWPX'],undoRedo:true,enterSymbolBackspace:true});
  }catch(e){report.failures.push({name,error:String(e)});}finally{d.free();}
}
for(const kind of ['flat','path','nested'])for(const end of [0,2]){
  const name=`${kind}/delete-range-${end===0?'one':'many'}`;
  const d=new api.HwpDocument(Buffer.from(fs.readFileSync(path.join(root,`cell-flow-${kind==='nested'?'nested':'flat'}.hwp.b64`),'utf8'),'base64')),c=context(kind);
  try{
    noOverlap(d,c,name+'/before');const original=contents(d,c),last=end?32:50;
    if(kind==='flat')d.deleteRangeInCell(0,c.parent,c.ci,1,0,5,end,last);
    else d.deleteRangeInCellByPath(0,c.parent,c.cellPath(1),0,5,end,last);
    const expected=original.slice();expected.splice(0,end+1,original[0].slice(0,5)+original[end].slice(last));
    assert.deepEqual(contents(d,c),expected);noOverlap(d,c,name+'/delete');
    report.cases.push({name,textPreserved:true,spaceReclaimed:true});
  }catch(e){report.failures.push({name,error:String(e)});}finally{d.free();}
}
for(const kind of ['flat','path','nested']){
  const name=`${kind}/delete-blank-preserves-body-format`;
  const d=new api.HwpDocument(Buffer.from(fs.readFileSync(path.join(root,`cell-flow-${kind==='nested'?'nested':'flat'}.hwp.b64`),'utf8'),'base64')),c=context(kind);
  try{
    const before=layout(d,c),span=p=>p.end.y-p.start.y;
    const merged=JSON.parse(invoke(d,c,kind,'mergeParagraph',2));
    const after=noOverlap(d,c,name);
    assert.equal(after[1].text,before[2].text);
    assert(Math.abs(span(after[1])-span(before[2]))<0.2,'Deleting a blank line must retain the body line spacing');
    assert(merged.removedParaMeta.empty_prefix_format,'Undo must remember the blank line formatting');
    if(kind!=='nested')assert.equal(JSON.parse(d.getCellParaPropertiesAt(0,0,2,1,1)).lineSpacing,160);
    invoke(d,c,kind,'splitParagraph',1,0,JSON.stringify(merged.removedParaMeta));
    const undone=layout(d,c);
    assert.deepEqual(undone.map(p=>p.text),before.map(p=>p.text));
    for(let i=0;i<before.length;i++)assert(Math.abs(span(undone[i])-span(before[i]))<0.2,'Undo restores each paragraph spacing');
    if(kind!=='nested'){
      assert.equal(JSON.parse(d.getCellParaPropertiesAt(0,0,2,1,1)).lineSpacing,100);
      assert.equal(JSON.parse(d.getCellParaPropertiesAt(0,0,2,1,2)).lineSpacing,160);
    }
    invoke(d,c,kind,'mergeParagraph',2);
    assert(Math.abs(span(layout(d,c)[1])-span(before[2]))<0.2,'Redo retains body spacing');
    const reopened=new api.HwpDocument(d.exportHwp());
    assert(Math.abs(span(layout(reopened,c)[1])-span(before[2]))<0.2,'Saved merge retains body spacing');reopened.free();
    report.cases.push({name,bodySpacingPreserved:true,blankFormattingUndo:true,redo:true,saveReopen:true});
  }catch(e){report.failures.push({name,error:String(e)});}finally{d.free();}
}
for(const kind of ['flat','path','nested']){
  const name=`${kind}/upper-lower-blank-deletion`,outcomes=[];
  try{
    for(const mergeAt of [1,2]){
      const d=new api.HwpDocument(Buffer.from(fs.readFileSync(path.join(root,`cell-flow-${kind==='nested'?'nested':'flat'}.hwp.b64`),'utf8'),'base64')),c=context(kind);
      try{
        invoke(d,c,kind,'insertText',2,0,'▲');
        invoke(d,c,kind,'splitParagraph',2,0);
        const before=layout(d,c);
        const removed=JSON.parse(invoke(d,c,kind,'mergeParagraph',mergeAt));
        outcomes.push(noOverlap(d,c,name));
        const undoAt=mergeAt-1;
        invoke(d,c,kind,'splitParagraph',undoAt,removed.charOffset,JSON.stringify(removed.removedParaMeta));
        assert.deepEqual(layout(d,c),before,'Undo restores both differently formatted empty lines');
      }finally{d.free();}
    }
    assert.deepEqual(outcomes[0],outcomes[1],'Deleting either blank must leave the same one-line space');
    report.cases.push({name,sameRemainingBlank:true,sameBodyPosition:true,undoBothFormats:true});
  }catch(e){report.failures.push({name,error:String(e)});}
}
{
  const name='stored-frame-reset';
  const d=new api.HwpDocument(Buffer.from(fs.readFileSync(path.join(root,'cell-flow-reset.hwpx.b64'),'utf8'),'base64'));
  try{
    const before=Buffer.from(d.exportHwpx()).toString('base64');
    d.copySelectionInCell(0,0,2,0,0,0,1,sourceSecond.length);
    d.pasteInternalInCell(0,0,2,1,0,2);
    const after=Buffer.from(d.exportHwpx()).toString('base64');
    const result=JSON.parse(execFileSync('python',[path.join(root,'check-stored-reset.py')],{input:JSON.stringify({before,after}),encoding:'utf8'}));
    report.cases.push({name,...result});
  }catch(e){report.failures.push({name,error:String(e)});}finally{d.free();}
}
fs.writeFileSync(path.join(root,observe?'baseline-cell-flow.json':'cell-flow-results.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.cases.length,failed:report.failures.length,failures:report.failures.slice(0,8)}));
if(report.failures.length&&!observe)process.exitCode=1;
