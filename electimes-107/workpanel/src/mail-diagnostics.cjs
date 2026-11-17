// Only hostnames and fixed event/error codes; never paths, queries, cookies or form data.
function createDiagnostics(limit=40){
  const rows=[];
  function record(type,url='',code=''){
    let host='';try{const u=new URL(url);if(['http:','https:'].includes(u.protocol))host=u.hostname;}catch{}
    const safeType=/^[a-z-]{1,32}$/.test(type)?type:'event';
    const safeCode=/^(?:-?\d{1,6}|(?:net::)?ERR_[A-Z0-9_]+)$/.test(String(code))?String(code):'';
    rows.push({time:new Date().toISOString(),type:safeType,host,code:safeCode});
    if(rows.length>limit)rows.splice(0,rows.length-limit);
  }
  return {record,text:()=>rows.map(r=>[r.time,r.type,r.host,r.code].filter(Boolean).join(' ')).join('\n')||'아직 기록이 없습니다.'};
}
module.exports={createDiagnostics};
