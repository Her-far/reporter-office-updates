'use strict';
// Exercise the update-selection functions shipped in each supported client.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const asar=require('../electimes-109/workpanel/build/asar-tools.cjs');
const root=__dirname,feed=JSON.parse(fs.readFileSync(path.join(root,'electimes-latest.json'),'utf8'));
const cases=[];
for(let build=106;build<=111;build++){
 const archive=asar.parseArchive(fs.readFileSync(path.join(root,`client-archives/${build}.asar`)));
 const source=asar.content(archive,'out/main/reporter-updater.cjs').toString();
 const start=source.indexOf('var MAX_PATCH_BYTES ='),end=source.indexOf('\n}',source.indexOf('function releaseStatus(',start))+2;
 assert(start>=0&&end>start,'Missing production updater anchors');
 const api=vm.runInNewContext(source.slice(start,end)+';({parseRelease,selectRelease,releaseStatus})',{URL});
 const release=api.parseRelease(feed),selected=api.selectRelease(build,release);
 assert.equal(selected.downloadType,'patch');assert.equal(selected.installer.url,feed.installer.url);
 assert.equal(api.releaseStatus(build,release),'available');
 assert.equal(api.selectRelease(105,release).downloadType,'full');
 assert.equal(api.releaseStatus(112,release),'current');
 cases.push({build,type:selected.downloadType,size:selected.installer.size,fullFallbackBefore106:true});
}
const report={cases,productionClientSelectionPassed:true};
fs.writeFileSync(path.join(root,'cumulative-selection-windows.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
