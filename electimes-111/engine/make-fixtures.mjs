import fs from 'node:fs';import path from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url)),core=path.resolve(process.argv[2]);
const api=await import(pathToFileURL(path.join(core,'rhwp.js')));api.initSync({module:fs.readFileSync(path.join(core,'rhwp_bg.wasm'))});
const d=api.HwpDocument.createEmpty();d.createBlankDocument();const inner=JSON.parse(d.createTableEx(JSON.stringify({sectionIdx:0,paraIdx:0,charOffset:0,rowCount:1,colCount:2,treatAsChar:true})));const ci=inner.controlIdx;
const source=['복사할 문장입니다. 특별 기호 ▲와 한글을 포함합니다. '.repeat(4),'두 번째 복사 문단입니다. '.repeat(3)];
const target=['첫째 본문 문단을 편집합니다. '.repeat(4),'','아래 문단은 위 문단과 겹치지 않아야 합니다. '.repeat(3),'','마지막 문단입니다. 지워지면 안 됩니다.'];
for(const [cell,texts]of [[0,source],[1,target]])for(let p=0;p<texts.length;p++){
 if(p)d.splitParagraphInCell(0,0,ci,cell,p-1,texts[p-1].length);
 d.insertTextInCell(0,0,ci,cell,p,0,texts[p]);
 d.applyParaFormatInCell(0,0,ci,cell,p,JSON.stringify({lineSpacing:texts[p]?160:100,lineSpacingType:'Percent'}));
}
d.setCellProperties(0,0,ci,1,JSON.stringify({verticalAlign:'center'}));
fs.writeFileSync(path.join(root,'cell-flow-flat.hwp.b64'),Buffer.from(d.exportHwp()).toString('base64')+'\n');
d.copyControl(0,0,'[]',ci);
d.splitParagraph(0,0,d.getParagraphLength(0,0));
const outer=JSON.parse(d.createTable(0,1,0,1,1));
d.pasteInternalInCell(0,outer.paraIdx,outer.controlIdx,0,0,0);
fs.writeFileSync(path.join(root,'cell-flow-nested.hwp.b64'),Buffer.from(d.exportHwp()).toString('base64')+'\n');
console.log(JSON.stringify({flatBytes:Buffer.from(fs.readFileSync(path.join(root,'cell-flow-flat.hwp.b64'),'utf8'),'base64').length,flatControl:ci,nestedParent:outer.paraIdx,nestedPaths:[...new Set(JSON.parse(d.getPageTextLayout(0)).runs.filter(r=>r.cellPath?.length>1).map(r=>JSON.stringify(r.cellPath)))]}));d.free();
