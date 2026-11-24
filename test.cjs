const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const crypto = require('node:crypto');
const {chromium} = require('playwright');
const XLSX = require('./dist/vendor/xlsx.full.min.js');
global.XLSX = XLSX;
const core = require('./dist/app.js');
const pin = process.env.PIZZA_TEST_PIN;
if (!/^\d{6}$/.test(pin || '')) throw Error('Set PIZZA_TEST_PIN to the configured app PIN before running tests.');
for(const [value,expected] of [['2024-02-29',true],['2025-02-29',false],['2026-13-01',false],['2026-11-14',true]])assert.equal(core.validDate(value),expected);
assert.equal(core.parseDate('31/12/2024'),'2024-12-31');
assert.equal(core.parseDate('31/02/2024'),null);
assert.equal(core.parseDate(1,true),'1904-01-02');
for(const bad of ['',null,-1,1.5,'1abc',true,'1e3'])assert.equal(core.parseCount(bad),null);
assert.deepEqual(core.summarize([{count:0},{count:100}]),{total:100,days:2,avg:50});
// Core regression suite serves an empty encrypted history fixture; test-history.cjs
// separately verifies the actual bundled history and existing-device migration.
const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12);
const fixtureCipher=crypto.createCipheriv('aes-256-gcm',crypto.pbkdf2Sync(pin,salt,310000,32,'sha256'),iv);
const fixtureBytes=Buffer.concat([fixtureCipher.update(JSON.stringify({id:'history-2026-11-24-v2',records:{}})),fixtureCipher.final(),fixtureCipher.getAuthTag()]);
const fixture=JSON.stringify({version:1,salt:salt.toString('base64'),iv:iv.toString('base64'),cipher:fixtureBytes.toString('base64')});
const root=path.resolve('dist'),requests=[];
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.webmanifest':'application/manifest+json','.png':'image/png'};
const server=http.createServer((req,res)=>{requests.push({method:req.method,url:req.url});const pathname=new URL(req.url,'http://localhost').pathname;if(!pathname.startsWith('/pizza-tracker/')){res.writeHead(404);res.end();return;}const name=pathname.slice('/pizza-tracker'.length);if(name==='/history.enc.json'){res.writeHead(200,{'Content-Type':'application/json'});res.end(fixture);return;}if(name==='/index.html'){res.writeHead(302,{Location:'/pizza-tracker/'});res.end();return;}const filename=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!filename.startsWith(root+path.sep)||!fs.existsSync(filename)){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'text/plain','Cache-Control':'no-cache'});fs.createReadStream(filename).pipe(res);});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}/pizza-tracker/`;
 const browser=await chromium.launch({headless:true});
 try {
 const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Europe/Rome',locale:'it-IT',acceptDownloads:true});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 async function unlock(p=page){await p.locator('#pin').fill(pin);await p.locator('#unlock').click();await p.locator('#appShell').waitFor({state:'visible'});}
 async function day(date){await page.locator('#date').fill(date);await page.locator('#date').dispatchEvent('change');}
 async function save(count){await page.locator('#count').fill(String(count));await page.locator('.save').click();await page.waitForFunction(()=>!document.querySelector('#entryForm').inert&&document.querySelector('#savedState').textContent==='Giornata salvata');}
 await page.goto(url);await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
 assert.equal(await page.locator('#appShell').isVisible(),false);
 await page.locator('#pin').fill('000000');await page.locator('#unlock').click();await page.waitForFunction(()=>document.querySelector('#pinError').textContent.includes('PIN non corretto'));
 assert.equal(await page.evaluate(()=>localStorage.getItem('pizza-tracker.secure.v1')),null);
 // Migrates existing 2024 data atomically after successful PIN unlock.
 await page.evaluate(()=>localStorage.setItem('pizza-tracker.v2',JSON.stringify({version:2,records:{'2024-02-29':{date:'2024-02-29',count:120,notes:'Nota privata migrata'}}})));
 await unlock();assert.equal(await page.evaluate(()=>localStorage.getItem('pizza-tracker.v2')),null);
 const encrypted=await page.evaluate(()=>localStorage.getItem('pizza-tracker.secure.v1'));assert(!encrypted.includes('Nota privata'));assert(!encrypted.includes('2024-02-29'));
 await day('2024-01-31');await page.locator('#next').click();assert.equal(await page.locator('#date').inputValue(),'2024-02-29');assert.equal(await page.locator('#monthTotal').textContent(),'120');
 await day('2024-12-31');await page.locator('#next').click();assert.equal(await page.locator('#date').inputValue(),'2025-01-31');
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Data','Pizze','Note'],['29/02/2024',999,'Duplicato esistente'],['01/03/2024',80,'<img src=x onerror=alert(1)>'],['02/03/2024',0,'Chiuso']]),'Storico');
 await page.locator('#file').setInputFiles({name:'storico.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(XLSX.write(wb,{bookType:'xlsx',type:'buffer'}))});
 await page.locator('#importDialog').waitFor({state:'visible'});assert.match(await page.locator('#importSummary').textContent(),/3 giornate valide · 1 già presenti · 2 da aggiungere/);
 await page.locator('#confirmImport').click();await page.locator('#importDialog').waitFor({state:'hidden'});
 assert.equal(await page.locator('#monthTotal').textContent(),'80');assert.equal(await page.locator('#monthAvg').textContent(),'40');assert.equal(await page.locator('#records img').count(),0);
 await page.locator('#file').setInputFiles({name:'invalid.csv',mimeType:'text/csv',buffer:Buffer.from('Data;Pizze;Note\n31/02/2024;42;errata\n01/03/2024;80;duplicata\n01/03/2024;20;duplicata')});
 await page.locator('#importDialog').waitFor({state:'visible'});assert.equal(await page.locator('#confirmImport').isDisabled(),true);assert.match(await page.locator('#importErrors').textContent(),/Data duplicata/);await page.locator('#closeImport').click();
 await day('2024-03-01');await save(95);
 await page.locator('#reportPeriod').selectOption('2024-1');assert.match(await page.locator('#reportSummary').textContent(),/215 pizze · 3 giornate/);
 const reportDownload=page.waitForEvent('download');await page.locator('#reportExcel').click();const reportFile=await reportDownload;const report=XLSX.read(fs.readFileSync(await reportFile.path()),{type:'buffer'});assert.equal(report.SheetNames.length,2);assert.equal(XLSX.utils.sheet_to_json(report.Sheets.Giornate).length,3);
 // Draft survives lock/unlock, including an interrupted phone session.
 await day('2024-03-03');await page.locator('#count').fill('47');await page.locator('#notes').fill('Bozza privata');await page.locator('#lockApp').click();await page.locator('#lockScreen').waitFor({state:'visible'});await unlock();assert.equal(await page.locator('#count').inputValue(),'47');assert.equal(await page.locator('#notes').inputValue(),'Bozza privata');await save(47);
 // Failure to persist must leave the last saved encrypted data intact.
 const before=await page.evaluate(()=>localStorage.getItem('pizza-tracker.secure.v1'));
 await page.evaluate(()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw Error('Quota esaurita');};});
 await page.locator('#count').fill('48');await page.locator('.save').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Non è stato possibile salvare'));
 assert.equal(await page.evaluate(()=>localStorage.getItem('pizza-tracker.secure.v1')),before);await page.evaluate(()=>Storage.prototype.setItem=window.originalSetItem);await save(48);
 // Reload with network disabled: shell, PIN, saved data, counter and XLSX all still work.
 await context.setOffline(true);await page.goto(url+'index.html');await unlock();await day('2024-03-03');assert.equal(await page.locator('#count').inputValue(),'48');await save(49);assert.equal(await page.evaluate(()=>fetch('/uncached-network-check').then(()=>false,()=>true)),true);
 const excelDownload=page.waitForEvent('download');await page.locator('#exportExcel').click();const exported=await excelDownload;const output=XLSX.read(fs.readFileSync(await exported.path()),{type:'buffer'});assert.equal(XLSX.utils.sheet_to_json(output.Sheets.Produzione).length,4);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'qa-mobile.png',fullPage:true});
 await page.locator('#lockApp').click();await page.locator('#lockScreen').waitFor({state:'visible'});await page.screenshot({path:'qa-lock.png',fullPage:true});
 assert.equal(await page.locator('#records tr').count(),0);
 // Independent phone/browser has no shared archive.
 await context.setOffline(false);const second=await browser.newContext();const other=await second.newPage();await other.goto(url);await unlock(other);assert.equal(await other.evaluate(()=>Object.keys(PizzaVault.getRecords()).length),0);await second.close();
 // Corruption must never cause a silent reset.
 await page.evaluate(()=>localStorage.setItem('pizza-tracker.secure.v1','broken'));await page.reload();await page.locator('#pin').fill(pin);await page.locator('#unlock').click();await page.waitForFunction(()=>document.querySelector('#pinError').textContent.includes('Archivio non leggibile'));assert.equal(await page.evaluate(()=>localStorage.getItem('pizza-tracker.secure.v1')),'broken');
 assert.deepEqual(errors,[]);assert(requests.every(r=>r.method==='GET'));
 console.log('PASS: PIN, migration, encryption, calendar, XLSX/CSV validation, counts, reports, draft recovery, storage failure, offline reload + saves + Excel, mobile layout, isolated devices, corrupt archive preservation, no data upload.');
 } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
