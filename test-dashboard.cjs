const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const pin=process.env.PIZZA_TEST_PIN;if(!/^\d{6}$/.test(pin||''))throw Error('Set PIZZA_TEST_PIN');
let revision=1,failDownload=false;
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(!pathname.startsWith('/pizza-tracker/')){res.writeHead(404);res.end();return;}
  const name=pathname.slice('/pizza-tracker/'.length)||'index.html';
  if(name.includes('..')||(failDownload&&name==='theme.css')){res.writeHead(503);res.end();return;}
  try{let data=fs.readFileSync(path.join('dist',name));
    if(name==='sw.js')data=data.toString().replace("'v9'",`'test-${revision}'`);
    if(name==='index.html')data=data.toString().replace('<body id="home">',`<body id="home" data-build="${revision}">`);
    res.writeHead(200,{'Content-Type':mime[path.extname(name)]||'text/plain','Cache-Control':'no-store'});res.end(data);
  }catch{res.writeHead(404);res.end();}
});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();try{
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'it-IT',reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const url=`http://127.0.0.1:${server.address().port}/pizza-tracker/`;
  async function unlock(){await page.locator('#pin').fill(pin);await page.locator('#unlock').click();await page.locator('#appShell').waitFor({state:'visible'});}
  await page.goto(url);await page.waitForFunction(()=>navigator.serviceWorker.controller);await unlock();
  assert.equal(await page.locator('#status').textContent(),'');assert.equal(await page.locator('#historyCoverage').count(),0);
  await page.locator('#date').fill('2026-11-24');await page.locator('#date').dispatchEvent('change');
  for(const [date,count,state] of [['2026-11-21','150','Giornata salvata'],['2026-11-23','0','Giornata salvata'],['2026-11-27','0','Da registrare']]){
    // Click high above the bar: zero and missing days have the same full-height target.
    await page.locator(`[data-date="${date}"]`).click({position:{x:4,y:10}});
    assert.equal(await page.locator('#date').inputValue(),date);assert.equal(await page.locator('#count').inputValue(),count);assert.equal(await page.locator('#savedState').textContent(),state);
    assert.equal(await page.locator('#dayLabel').evaluate(e=>e===document.activeElement),true);
    assert.equal(await page.locator(`[data-date="${date}"]`).getAttribute('aria-pressed'),'true');
    assert.ok(await page.locator('#dayEntry').evaluate(e=>e.getBoundingClientRect().top>=0&&e.getBoundingClientRect().top<80));
  }
  assert.equal(await page.locator('#notes').inputValue(),'');
  await page.locator('[data-date="2026-11-21"]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#count').inputValue(),'150');assert.match(await page.locator('#notes').inputValue(),/^\[STIMA\]/);
  await page.locator('#count').fill('151');page.once('dialog',d=>d.dismiss());await page.locator('[data-date="2026-11-23"]').click();assert.equal(await page.locator('#date').inputValue(),'2026-11-21');assert.equal(await page.locator('#count').inputValue(),'151');
  // Tapping the selected day preserves a draft without prompting.
  await page.locator('[data-date="2026-11-21"]').click();assert.equal(await page.locator('#count').inputValue(),'151');
  await page.locator('#notes').fill('Totale serata ancora da confermare');
  await page.waitForFunction(()=>PizzaVault.getDraft()?.notes==='Totale serata ancora da confermare');
  revision=2;
  await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
  await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);
  assert.equal(await page.locator('body').getAttribute('data-build'),'1');assert.equal(await page.locator('#count').inputValue(),'151');
  // Lock drains encryption, then installs/reloads automatically. Draft survives.
  await page.locator('#lockApp').click();await page.waitForFunction(()=>document.body.dataset.build==='2');await unlock();
  assert.equal(await page.locator('#count').inputValue(),'151');assert.equal(await page.locator('#notes').inputValue(),'Totale serata ancora da confermare');assert.equal(await page.locator('#savedState').textContent(),'Bozza recuperata');
  await page.locator('#entryForm [type="submit"]').click();await page.waitForFunction(()=>PizzaVault.getRecords()['2026-11-21'].count===151);
  await page.locator('#lockApp').click();await page.waitForFunction(()=>!PizzaVault.isBusy());
  revision=3;await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});await page.waitForFunction(()=>document.body.dataset.build==='3');
  assert.equal(await page.locator('a[href="update.html"]').count(),0);
  // A failed download keeps the previous complete shell and data usable.
  revision=4;failDownload=true;
  await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();const w=r.installing;if(w)await new Promise(resolve=>{w.addEventListener('statechange',()=>{if(w.state==='redundant')resolve();});if(w.state==='redundant')resolve();});});
  await context.setOffline(true);await page.reload();assert.equal(await page.locator('body').getAttribute('data-build'),'3');await unlock();assert.equal(await page.evaluate(()=>PizzaVault.getRecords()['2026-11-21'].count),151);
  await page.screenshot({path:'qa-dashboard-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS dashboard: high/zero/missing days, keyboard, draft cancellation; silent history; automatic locked update, defer while editing, recover draft, failed download and offline archive.');
}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
