const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const pin=process.env.PIZZA_TEST_PIN;if(!/^\d{6}$/.test(pin||''))throw Error('Set PIZZA_TEST_PIN');
const bundle=JSON.parse(fs.readFileSync('dist/history.enc.json','utf8')),cipher=Buffer.from(bundle.cipher,'base64');
const decrypt=crypto.createDecipheriv('aes-256-gcm',crypto.pbkdf2Sync(pin,Buffer.from(bundle.salt,'base64'),310000,32,'sha256'),Buffer.from(bundle.iv,'base64'));decrypt.setAuthTag(cipher.subarray(-16));
const source=JSON.parse(Buffer.concat([decrypt.update(cipher.subarray(0,-16)),decrypt.final()]).toString()).records;
const legacy=Object.fromEntries(Object.entries(source).filter(([,r])=>!r.notes.startsWith('[STIMA]')));
legacy['2025-01-01']={date:'2025-01-01',count:321,notes:'Local correction preserved'};
let serveCurrent=false;const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'},oldAssets=new Map();
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;if(!pathname.startsWith('/pizza-tracker/')){res.writeHead(404);res.end();return;}let name=pathname.slice('/pizza-tracker/'.length)||'index.html';if(name.includes('..')){res.writeHead(404);res.end();return;}let data;try{if(serveCurrent)data=fs.readFileSync(path.join('dist',name));else{if(!oldAssets.has(name))oldAssets.set(name,execFileSync('git',['show',`3438766:dist/${name}`],{stdio:['ignore','pipe','ignore']}));data=oldAssets.get(name);}}catch{res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(name)]||'text/plain','Cache-Control':'no-store'});res.end(data);});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();try{
const url=`http://127.0.0.1:${server.address().port}/pizza-tracker/`,context=await browser.newContext({viewport:{width:390,height:844},locale:'it-IT'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
async function unlock(p){await p.locator('#pin').fill(pin);await p.locator('#unlock').click();await p.locator('#appShell').waitFor({state:'visible'});}
await page.goto(url);await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);await page.evaluate(records=>localStorage.setItem('pizza-tracker.v2',JSON.stringify({version:2,records})),legacy);await unlock(page);assert.equal(await page.evaluate(()=>Object.keys(PizzaVault.getRecords()).length),493);await page.locator('#lockApp').click();
const oldEncrypted=await page.evaluate(()=>localStorage.getItem('pizza-tracker.secure.v1'));
// A second old window keeps the original worker alive, reproducing a stuck PWA update.
const oldWindow=await context.newPage();await oldWindow.goto(url);
serveCurrent=true;
await page.goto(url+'update.html');await page.locator('#update').click();await page.waitForURL('**/?updated=1');
assert.equal(await page.evaluate(()=>localStorage.getItem('pizza-tracker.secure.v1')),oldEncrypted);
await unlock(page);const rows=await page.evaluate(()=>PizzaVault.getRecords());assert.equal(Object.keys(rows).length,559);assert.equal(Object.values(rows).filter(r=>r.notes.startsWith('[STIMA]')).length,66);assert.equal(rows['2025-01-01'].count,321);assert.match(await page.locator('#historyCoverage').textContent(),/66 stimate dal 20\/09\/2026 al 24\/11\/2026/);
await context.setOffline(true);await page.reload();await unlock(page);assert.equal(await page.evaluate(()=>Object.keys(PizzaVault.getRecords()).length),559);assert.deepEqual(errors,[]);
await context.setOffline(false);
// Explicit update is also safe when the installed version is already current.
await page.goto(url+'update.html');await page.locator('#update').click();await page.waitForURL('**/?updated=1');await unlock(page);assert.equal(await page.evaluate(()=>PizzaVault.getRecords()['2025-01-01'].count),321);
// Direct update link works for a fresh browser with no registration yet.
const fresh=await browser.newContext();const freshPage=await fresh.newPage();await freshPage.goto(url+'update.html');await freshPage.locator('#update').click();await freshPage.waitForURL('**/?updated=1');await unlock(freshPage);assert.equal(await freshPage.evaluate(()=>Object.keys(PizzaVault.getRecords()).length),559);
console.log('PASS update: old v5 app/cache plus another open tab -> explicit update -> 66 missing estimates, preserved encrypted archive and local correction, offline reload; current version and fresh install.');
}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
