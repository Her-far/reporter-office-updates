'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {methods}=require('../build/hwp-selection.cjs');
test('a body drag through a table remains a body range in both directions',()=>{
 const table={sec:1,para:4,ci:0,off:0};let anchor={sectionIndex:1,paragraphIndex:2,charOffset:0};
 const h={...methods,cursor:{getSelection:()=>({anchor})},bodyTableAnchors:()=>[table]};
 const cell={sectionIndex:1,paragraphIndex:4,parentParaIndex:4,controlIndex:0,cellIndex:2,cellParaIndex:0,charOffset:5};
 assert.deepEqual(h.bodyDragHit(cell),{sectionIndex:1,paragraphIndex:4,charOffset:1});
 anchor={sectionIndex:1,paragraphIndex:6,charOffset:0};assert.deepEqual(h.bodyDragHit(cell),{sectionIndex:1,paragraphIndex:4,charOffset:0});
 anchor={...cell};assert.equal(h.bodyDragHit(cell),cell);
});
test('cross-section highlighting and copying cover every section exactly once',()=>{
 const calls=[],data={};const h={...methods,wasm:{getParagraphCount:s=>[3,4,2][s],getParagraphLength:()=>12,getSelectionRects:(...a)=>[{pageIndex:a[0]}],copySelection:(...a)=>calls.push(a),getClipboardText:()=>`section${calls.at(-1)[0]}`,exportSelectionHtml:s=>`<p>section${s}</p>`},bodyTableAnchors:()=>[],bodyTableRectsInRange:()=>[{table:true}]};
 const from={sectionIndex:0,paragraphIndex:1,charOffset:3},to={sectionIndex:2,paragraphIndex:1,charOffset:7};
 assert.deepEqual(h.bodySelectionRects(from,to),[{pageIndex:0},{pageIndex:1},{pageIndex:2},{table:true}]);
 h.copyBodySections({clipboardData:{setData:(k,v)=>data[k]=v}},from,to);
 assert.deepEqual(calls,[[0,1,3,2,12],[1,0,0,3,12],[2,0,0,1,7]]);
 assert.equal(data['text/plain'],'section0\nsection1\nsection2');assert.equal(h.bodyHtmlFragment(data['text/html']).trim(),'<p>section0</p>\n<p>section1</p>\n<p>section2</p>');
});
test('body HTML keeps selected tables in order and excludes tables outside the range',()=>{
 const wrap=s=>'<html><body><!--StartFragment-->'+s+'<!--EndFragment--></body></html>';
 const h={...methods,bodyTableAnchors:()=>[{sec:0,para:1,ci:0,off:0},{sec:0,para:3,ci:0,off:2},{sec:1,para:1,ci:0,off:0}],wasm:{exportSelectionHtml:(_s,p,c,q,d)=>wrap(`<p>${p}:${c}-${q}:${d}</p>`),exportControlHtml:(s,p)=>wrap(`<table><tr><td>${s}:${p}</td></tr></table>`)}};
 const html=h.bodySelectionHtml(0,0,0,4,8);
 assert.equal(h.bodyHtmlFragment(html).trim(),'<p>0:0-1:0</p>\n<table><tr><td>0:1</td></tr></table>\n<p>1:1-3:2</p>\n<table><tr><td>0:3</td></tr></table>\n<p>3:3-4:8</p>');
 assert(!h.bodySelectionHtml(0,1,1,3,2).includes('<table>'));
 assert.equal((html.match(/<html>/g)||[]).length,1);
});
