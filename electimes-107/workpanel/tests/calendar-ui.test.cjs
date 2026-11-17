const {chromium}=require(require('node:path').join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'));
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_BINARY||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});try{
 const page=await browser.newPage({viewport:{width:520,height:900},locale:'ko-KR'});
 await page.clock.install({time:new Date('2026-11-17T03:00:00Z')});
 await page.addInitScript(()=>{const state={menu:'calendar',dark:false,prefs:{calendarView:'month',scheduleView:'week',calendarIds:['primary']},calendar:{configured:true,connected:true,permission:'edit',lastSync:'2026-11-17T03:00:00Z'},calendars:[{id:'fixture',summary:'테스트 캘린더',accessRole:'owner',primary:true}],events:[],downloads:[]};window.actions=[];window.workPanel={action:async(action,value)=>{window.actions.push({action,value});return {ok:true,state};},onState:()=>{},overlay:()=>{},mailBounds:()=>{}};});
 await page.goto('file://'+path.resolve(__dirname,'../src/index.html'));
 await page.getByRole('button',{name:'2026-11-20 일정 0개',exact:true}).click();
 await page.getByRole('button',{name:'2026-11-20 일정 추가',exact:true}).click();
 assert.equal(await page.getByLabel('시작',{exact:true}).inputValue(),'2026-11-20T09:00');
 assert.equal(await page.getByLabel('종료',{exact:true}).inputValue(),'2026-11-20T10:00');
 let a=await page.getByLabel('시작',{exact:true}).boundingBox(),b=await page.getByLabel('종료',{exact:true}).boundingBox();assert(Math.abs(a.y-b.y)<1);console.log('PASS: selected-date + pre-fills that date; start/end aligned at 520px');
 await page.getByLabel('제목',{exact:true}).fill('UI 테스트 일정');
 fs.mkdirSync('dist-r4/ui',{recursive:true});await page.screenshot({path:'dist-r4/ui/calendar-event-dialog.png'});
 await page.setViewportSize({width:400,height:900});a=await page.getByLabel('시작',{exact:true}).boundingBox();b=await page.getByLabel('종료',{exact:true}).boundingBox();assert(Math.abs(a.x-b.x)<1&&b.y>a.y&&a.x+a.width<=400);console.log('PASS: narrow 400px form stacks without overflow');
 await page.getByRole('button',{name:'구글 캘린더에 저장',exact:true}).click();
 const call=await page.evaluate(()=>window.actions.find(x=>x.action==='event-create'));assert.equal(call.value.start,'2026-11-20T09:00');assert.equal(call.value.end,'2026-11-20T10:00');assert.equal(call.value.calendarId,'fixture');console.log('PASS: create request preserves clicked date');
 await page.setViewportSize({width:520,height:900});await page.screenshot({path:'dist-r4/ui/calendar-date-add.png'});
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
