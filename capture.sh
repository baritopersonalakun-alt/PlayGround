#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"
: "${CAPTURE_URL:?Set CAPTURE_URL to the exact preview URL}"
: "${CAPTURE_DIR:?Set CAPTURE_DIR to the evidence directory}"
mkdir -p "$CAPTURE_DIR"
export PROJECT_DIR
/usr/bin/time -p node --input-type=module - <<'NODE'
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {mkdirSync} from 'node:fs';
const runtime=join(process.env.HOME,'.local/share/omgithub-playwright');
const require=createRequire(join(runtime,'package.json'));
let chromium,config;
try {
  ({chromium}=require('playwright'));
  const {readFileSync}=await import('node:fs');
  config=JSON.parse(readFileSync(join(runtime,process.platform==='darwin'?'metal.json':'linux.json'),'utf8'));
  if(process.platform==='linux') process.env.DISPLAY ||= ':'+readFileSync(join(runtime,'display'),'utf8').trim();
} catch(e) { console.error(e); process.exit(75); }
mkdirSync(process.env.CAPTURE_DIR,{recursive:true});
let browser;
const transient=e=>{e.captureExit=75;throw e};
try {
  browser=await chromium.launch({...config.browser.launchOptions,timeout:30000}).catch(transient);
  for(const [name,width,height] of [['desktop',1440,900],['mobile',390,844]]) {
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1}).catch(transient);
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    let response;
    try { response=await page.goto(process.env.CAPTURE_URL,{waitUntil:'domcontentloaded',timeout:45000}); }
    catch(e) { await page.close().catch(()=>{}); transient(e); }
    if(!response?.ok()) { const status=response?.status(); await page.close(); if(!status||[408,429,500,502,503,504].includes(status)) transient(new Error(`Temporary HTTP ${status||'navigation'} failure`)); throw new Error(`Preview returned HTTP ${status}`); }
    try {
      await page.waitForFunction(()=>{const c=document.querySelector('#world');return document.visibilityState==='visible'&&c?.getBoundingClientRect().width>0&&c?.getBoundingClientRect().height>0},{},{timeout:20000});
      await page.waitForFunction(()=>{const c=document.querySelector('#world');try{return !!c&&c.getContext('2d')?.getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data[3]>0}catch{return false}},{},{timeout:10000});
      await page.waitForTimeout(1200);
      if(errors.length) throw new Error(`App JavaScript error: ${errors.join('; ')}`);
      await page.screenshot({path:join(process.env.CAPTURE_DIR,`final-${name}.png`),timeout:30000});
      console.log(`Captured rendered ${name} view: ${width}x${height}`);
    } catch(e) { await page.close().catch(()=>{}); throw e; }
    await page.close();
  }
} catch(e) { console.error(e); process.exitCode=e.captureExit||1; }
finally { if(browser) await browser.close().catch(e=>{console.error(e);process.exitCode ||= 75}); }
NODE
