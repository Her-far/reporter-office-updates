'use strict';
// Starts the built application from a stage directory in a stock Electron 43.7.6,
// with a fresh throw-away profile (same harness as electimes-109/workpanel/tests/electron-bootstrap.cjs,
// using the shipped profile name "Electimes Office").
const fs = require('node:fs'), path = require('node:path');
function prepare(out) {
  const harness = path.join(out, 'harness'), profileRoot = path.join(out, 'appdata');
  fs.mkdirSync(harness, { recursive: true });
  fs.writeFileSync(path.join(harness, 'bootstrap.cjs'), `const {app}=require('electron');const fs=require('node:fs'),path=require('node:path');
const payload=path.resolve(process.env.WORKPANEL_PAYLOAD);
Object.defineProperty(app,'isPackaged',{get:()=>true});Object.defineProperty(process,'resourcesPath',{value:path.join(payload,'resources')});
if(process.platform==='linux')app.requestSingleInstanceLock=()=>true;
const data=${JSON.stringify(profileRoot)};fs.rmSync(data,{recursive:true,force:true});app.setPath('appData',data);
const profile=path.join(data,'Electimes Office');fs.mkdirSync(profile,{recursive:true});
fs.writeFileSync(path.join(profile,'app-settings.json'),JSON.stringify({language:'ko',onboardingSeen:true,aiPanelSide:'right'}));
fs.writeFileSync(path.join(profile,'ai-settings.json'),JSON.stringify({providers:{},subscriptionNoticeSeen:true}));
require(path.join(payload,'resources/app.asar/out/main/index.js'));`);
  fs.writeFileSync(path.join(harness, 'package.json'), JSON.stringify({ name: 'workpanel-aiweb-harness', version: '1.0.13', main: 'bootstrap.cjs' }));
  return harness;
}
function launchOptions(harness) {
  if (!process.env.ELECTRON_BINARY || !process.env.WORKPANEL_PAYLOAD) throw Error('Set ELECTRON_BINARY and WORKPANEL_PAYLOAD');
  return { executablePath: process.env.ELECTRON_BINARY, timeout: 60000, env: { ...process.env },
    args: [...(process.platform === 'linux' ? ['--no-sandbox', '--disable-gpu', ...(process.env.DISPLAY ? [] : ['--ozone-platform=headless'])] : []), '--lang=ko', harness] };
}
const wait = async (fn, label, ms = 15000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw Error('Timed out: ' + label); await new Promise(r => setTimeout(r, 100)); } };
module.exports = { prepare, launchOptions, wait };
