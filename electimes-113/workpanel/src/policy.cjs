/* Independent work-panel test edition. Original notices are retained. */
const path = require('node:path');
const MENUS = ['ai', 'aiweb', 'mail', 'calendar', 'notes'];
const AI_WEB_SERVICES = ['chatgpt', 'claude', 'gemini'];
const READ_SCOPES = ['https://www.googleapis.com/auth/calendar.calendarlist.readonly', 'https://www.googleapis.com/auth/calendar.events.readonly'];
const WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const DEFAULTS = Object.freeze({menu:'ai', defaultMenu:'ai', width:400, panelWidthVersion:1, mailDisplay:'reader', mailZoom:1, restoreMenu:true, showOnStart:true, mailEnabled:true, mailUrl:'https://mail.worksmobile.com/', downloadFolder:'', offerOpen:true, autoSync:true, syncMinutes:5, calendarIds:['primary'], calendarView:'month', scheduleView:'week', aiWebEnabled:true, aiWebService:'chatgpt', aiWebZoom:1, aiWebNoticeSeen:false});
function httpsUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port && value.length < 4096 ? u : null; } catch { return null; }
}
function mailUrl(value) {
  const u = httpsUrl(value); if (!u) return null;
  return ['worksmobile.com','works.do','naverworks.com','naver.com','electimes.com'].some(h => u.hostname === h || u.hostname.endsWith('.'+h)) ? u.href : null;
}
function safeFilename(value) {
  let s = String(value || 'attachment').normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '_').replace(/[. ]+$/g, '').trim();
  if (!s || /^\.+$/.test(s)) s = 'attachment';
  if (/^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i.test(s)) s = '_'+s;
  if (s.length > 180) { const ext = path.extname(s).slice(0,20); s = s.slice(0,180-ext.length)+ext; }
  return s;
}
function fileKind(filename) {
  const ext=path.extname(filename).toLowerCase();
  if (/\.(exe|com|scr|msi|msp|bat|cmd|ps1|vbs|vbe|js|jse|wsf|wsh|lnk|url|hta|reg|dll|cpl|jar|appx|msix|scf|pif|chm)$/i.test(filename)) return 'blocked';
  if (['.hwp','.hwpx','.doc','.docx','.xls','.xlsx','.pdf','.txt'].includes(ext)) return 'office';
  if (['.jpg','.jpeg','.png'].includes(ext)) return 'image';
  return 'external';
}
function settingsOf(raw, prev=DEFAULTS) {
  const p=raw && typeof raw === 'object' ? {...raw} : {};for(const k of ['menu','defaultMenu'])if(p[k]==='schedule')p[k]='notes'; const next={...prev};
  for (const k of ['restoreMenu','showOnStart','mailEnabled','offerOpen','autoSync','aiWebEnabled','aiWebNoticeSeen']) if (typeof p[k]==='boolean') next[k]=p[k];
  for (const k of ['menu','defaultMenu']) if (MENUS.includes(p[k])) next[k]=p[k];
  if (['reader','web'].includes(p.mailDisplay)) next.mailDisplay=p.mailDisplay;
  if (AI_WEB_SERVICES.includes(p.aiWebService)) next.aiWebService=p.aiWebService;
  if (Number.isFinite(p.aiWebZoom)) next.aiWebZoom=Math.max(0.65,Math.min(1.5,p.aiWebZoom));
  if (Number.isFinite(p.mailZoom)) next.mailZoom=Math.max(0.65,Math.min(1.5,p.mailZoom));
  if (Number.isFinite(p.width)) next.width=Math.round(Math.max(300,Math.min(1600,p.width)));
  if (typeof p.mailUrl==='string') { const u=mailUrl(p.mailUrl); if (!u) throw Error('invalid-mail-url'); next.mailUrl=u; }
  if (Number.isFinite(p.syncMinutes)) next.syncMinutes=Math.round(Math.max(2,Math.min(60,p.syncMinutes)));
  if (Array.isArray(p.calendarIds)) next.calendarIds=[...new Set(p.calendarIds.filter(x=>typeof x==='string' && x.length<1024))].slice(0,30);
  if (['month','week','day'].includes(p.calendarView)) next.calendarView=p.calendarView;
  if (['today','tomorrow','week','upcoming'].includes(p.scheduleView)) next.scheduleView=p.scheduleView;
  return next;
}
function kstDay(value=new Date()) { const d = new Date(new Date(value).getTime()+9*3600000); return d.toISOString().slice(0,10); }
function eventOf(e, calendar) {
  if (!e || typeof e.id!=='string' || !e.start || !e.end || e.status==='cancelled') return null;
  const start=e.start.date || e.start.dateTime, end=e.end.date || e.end.dateTime;
  if (!start || !end || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end))) return null;
  return {source:'google', id:e.id, calendarId:calendar.id, calendarName:calendar.summary || calendar.id, title:String(e.summary || '').slice(0,1000), start, end, allDay:!!e.start.date, location:String(e.location || '').slice(0,2000), description:String(e.description || '').slice(0,20000), etag:e.etag || '', writable:['owner','writer'].includes(calendar.accessRole), recurring:!!e.recurringEventId, htmlLink:httpsUrl(e.htmlLink)?.href || ''};
}
function eventBody(raw) {
  if (!raw || typeof raw.title!=='string' || !raw.title.trim() || raw.title.length>1000) throw Error('invalid-event');
  const body={summary:raw.title.trim(),location:String(raw.location || '').slice(0,2000),description:String(raw.description || '').slice(0,20000)};
  const date=/^\d{4}-\d{2}-\d{2}$/;
  if (raw.allDay) {
    if (!date.test(raw.start) || !date.test(raw.end) || raw.start >= raw.end || new Date(raw.start).toISOString().slice(0,10)!==raw.start || new Date(raw.end).toISOString().slice(0,10)!==raw.end) throw Error('invalid-time');
    body.start={date:raw.start}; body.end={date:raw.end};
  } else {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(raw.start) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(raw.end)) throw Error('invalid-time');
    const start=new Date(raw.start+'+09:00'),end=new Date(raw.end+'+09:00');
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end<=start) throw Error('invalid-time');
    body.start={dateTime:start.toISOString(),timeZone:'Asia/Seoul'}; body.end={dateTime:end.toISOString(),timeZone:'Asia/Seoul'};
  }
  return body;
}
module.exports={MENUS,AI_WEB_SERVICES,READ_SCOPES,WRITE_SCOPE,DEFAULTS,httpsUrl,mailUrl,safeFilename,fileKind,settingsOf,kstDay,eventOf,eventBody};
