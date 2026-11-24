'use strict';
const KEY = 'pizza-tracker.v2';
const $ = id => document.getElementById(id);
const fmt = new Intl.NumberFormat('it-IT', {maximumFractionDigits: 1});
const pad = n => String(n).padStart(2, '0');
const localDate = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today = () => localDate(new Date());
function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || s < '1900-01-01' || s > '9999-12-31') return false;
  const d = new Date(`${s}T12:00:00`);
  return !isNaN(d) && localDate(d) === s;
}
function parseDate(value, date1904 = false) {
  if (value instanceof Date) return validDate(localDate(value)) ? localDate(value) : null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const p = XLSX.SSF.parse_date_code(value, {date1904});
    if (!p) return null;
    const s = `${p.y}-${pad(p.m)}-${pad(p.d)}`;
    return validDate(s) ? s : null;
  }
  const s = String(value ?? '').trim();
  if (validDate(s)) return s;
  const m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  const iso = m && `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return iso && validDate(iso) ? iso : null;
}
function parseCount(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^\d+$/.test(value.trim())) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 && n <= 10000000 ? n : null;
}
function normalizeRecords(source) {
  const root = source.records ?? source.data ?? source;
  const rows = Array.isArray(root) ? root : Object.entries(root).map(([date, val]) => ({date, ...(typeof val === 'number' ? {count: val} : val)}));
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') throw new Error('Riga JSON non valida.');
    const date = parseDate(row.date ?? row.data);
    const count = parseCount(row.count ?? row.pizzas ?? row.pizzaCount ?? row.pizze);
    if (!date || count === null) throw new Error('Il JSON contiene date o conteggi non validi.');
    const notes = String(row.notes ?? row.note ?? '');
    if (notes.length > 10000) throw new Error('Una nota supera 10.000 caratteri.');
    out.push({date, count, notes});
  }
  return out;
}
function summarize(rows) {
  const total = rows.reduce((n, r) => n + r.count, 0);
  return {total, days: rows.length, avg: rows.length ? total / rows.length : null};
}
const isEstimate = row => String(row.notes || '').startsWith('[STIMA]');
let records = {}, selected = today(), dirty = false, page = 0, blocked = false;
let workbook = null, rawJson = null, pending = [], importIssues = [], loadingFile = false;
function message(text, error = false) { $('status').textContent = text; $('status').className = error ? 'error' : ''; }
function load() {
  blocked=false;
  try {
    const raw = JSON.stringify({version:2,records:PizzaVault.getRecords()});
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.version !== 2 || !parsed.records || typeof parsed.records !== 'object') throw new Error();
      records = Object.fromEntries(normalizeRecords(parsed).map(r => [r.date, r]));
    }
  } catch {
    blocked = true;
    message('Archivio non leggibile o memoria del browser non disponibile. I dati originali non sono stati modificati. Salvataggio e importazione sono bloccati: recupera un backup prima di riprovare.', true);
  }
}
async function persist(next) {
  if (blocked) { message('Salvataggio bloccato: archivio locale non disponibile.', true); return false; }
  try {
    // Re-read on every write to preserve changes from other tabs.
    const live = PizzaVault.getRecords();
    if (!live || typeof live !== 'object') throw new Error();
    normalizeRecords(live);
    const merged = {...live, ...next};
    await PizzaVault.saveRecords(next);
    if(PizzaVault.isUnlocked())records = merged;
    return true;
  } catch(error) { message(`Non è stato possibile salvare. ${error.message} Le modifiche restano nel modulo.`, true); return false; }
}
function loadDay() {
  const record = records[selected];
  $('date').value = selected;
  $('count').value = record?.count ?? 0;
  $('notes').value = record?.notes ?? '';
  dirty = false;
  $('savedState').textContent = record ? 'Giornata salvata' : 'Da registrare';
  $('dayLabel').textContent = new Date(`${selected}T12:00:00`).toLocaleDateString('it-IT', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
}
function setDirty() {
  dirty = true; $('savedState').textContent = 'Da salvare';
  void PizzaVault.saveDraft({date:selected,count:$('count').value,notes:$('notes').value}).catch(error=>message(`Bozza non salvata sul telefono: ${error.message}`,true));
}
function leaveDraft() { return !dirty || confirm('Ci sono modifiche non salvate. Vuoi lasciarle e continuare?'); }
function selectDate(next) {
  if (!validDate(next) || !leaveDraft()) { $('date').value = selected; return; }
  if(dirty)void PizzaVault.saveDraft(null).catch(error=>message(error.message,true));
  selected = next; page = 0; loadDay(); render();
}
function moveMonth(delta) {
  const d = new Date(`${selected}T12:00:00`), day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + delta);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth()+1, 0).getDate()));
  selectDate(localDate(d));
}
function render() {
  const month = selected.slice(0,7), year = selected.slice(0,4);
  const rows = Object.values(records), monthRows = rows.filter(r => r.date.startsWith(month)), yearRows = rows.filter(r => r.date.startsWith(year));
  $('monthTitle').textContent = new Date(`${selected}T12:00:00`).toLocaleDateString('it-IT', {month:'long', year:'numeric'});
  $('yearLabel').textContent = year;
  for (const [prefix, list] of [['month',monthRows],['year',yearRows]]) {
    const s = summarize(list);
    $(prefix+'Total').textContent = fmt.format(s.total);
    $(prefix+'Avg').textContent = s.avg === null ? '—' : fmt.format(s.avg);
    const estimated=list.filter(isEstimate).length;
    $(prefix+'Days').textContent = `${s.days} giornat${s.days === 1 ? 'a' : 'e'}${estimated ? ` · ${estimated} stimate` : ''}`;
  }
  const days = new Date(Number(year), Number(month.slice(5)), 0).getDate(), max = Math.max(1, ...monthRows.map(r=>r.count));
  $('chart').replaceChildren();
  for (let day=1; day<=days; day++) {
    const date = `${month}-${pad(day)}`, r = records[date], bar = document.createElement('div');
    bar.className = `bar${date === selected ? ' selected' : ''}${!r ? ' empty' : ''}`;
    bar.style.height = `${r ? Math.max(3, r.count/max*100) : 2}%`;
    bar.title = `${day}: ${r ? r.count+' pizze'+(isEstimate(r)?' (stima)':'') : 'non registrato'}`;
    $('chart').append(bar);
  }
  $('chart').setAttribute('aria-label', `Produzione di ${$('monthTitle').textContent}: ${monthRows.length ? monthRows.map(r=>`${r.date.slice(8)}: ${r.count} pizze`).join(', ') : 'nessuna giornata registrata'}`);
  $('lastDay').textContent = days;
  const visible = ($('allHistory').checked ? rows : monthRows).sort((a,b)=>b.date.localeCompare(a.date));
  page = Math.min(page, Math.max(0, Math.ceil(visible.length/15)-1));
  $('records').replaceChildren();
  for (const r of visible.slice(page*15, page*15+15)) {
    const tr = document.createElement('tr');
    for (const val of [r.date.split('-').reverse().join('/'), fmt.format(r.count), r.notes || '—']) { const td=document.createElement('td'); td.textContent=val; tr.append(td); }
    const td = document.createElement('td'), b = document.createElement('button');
    b.textContent='Modifica'; b.setAttribute('aria-label',`Modifica ${r.date}`); b.onclick=()=>{selectDate(r.date); $('count').focus();}; td.append(b); tr.append(td); $('records').append(tr);
  }
  if (!visible.length) { const tr=document.createElement('tr'), td=document.createElement('td'); td.colSpan=4; td.className='empty-state'; td.textContent='Nessuna giornata registrata. Salva un conteggio o importa il tuo Excel.'; tr.append(td); $('records').append(tr); }
  $('archiveSummary').textContent = `${visible.length} giornate${$('allHistory').checked ? ' in tutto l’archivio' : ' nel mese selezionato'}. Seleziona “Modifica” per correggere un dato.`;
  $('pageInfo').textContent = visible.length ? `${page+1} / ${Math.ceil(visible.length/15)}` : '0 giornate';
  $('older').disabled=page===0; $('newer').disabled=(page+1)*15>=visible.length;
  window.dispatchEvent(new Event('pizza-records-changed'));
}
async function saveDay(e) {
  e.preventDefault(); const count=parseCount($('count').value);
  if(count===null) {message('Inserisci un numero intero tra 0 e 10.000.000.', true); return;}
  const existing = records[selected];
  let live;
  try {live = PizzaVault.getRecords()[selected];} catch {live=null;}
  if (JSON.stringify(existing) !== JSON.stringify(live) && !confirm('Questa giornata è stata modificata in un’altra scheda. Vuoi sostituirla con il valore del modulo?')) return;
  const savedDate=selected;
  $('entryForm').inert=true;
  const ok=await persist({[savedDate]:{date:savedDate,count,notes:$('notes').value}});
  $('entryForm').inert=false;
  if(ok&&PizzaVault.isUnlocked()) { loadDay(); render(); message(`Giornata del ${savedDate.split('-').reverse().join('/')} salvata: ${fmt.format(count)} pizze.`); }
}
function download(content, name, type) {
  PizzaVault.externalAction();
  const url = URL.createObjectURL(new Blob([content],{type})), a=document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function excelExport(template = false) {
  PizzaVault.externalAction();
  if (!window.XLSX) {message('Lettore Excel non disponibile. Ricarica la pagina.',true); return;}
  const rows = template ? [['Data','Pizze','Note']] : [['Data','Pizze','Note'], ...Object.values(records).sort((a,b)=>a.date.localeCompare(b.date)).map(r=>[r.date,r.count,r.notes])];
  const wb=XLSX.utils.book_new(), ws=XLSX.utils.aoa_to_sheet(rows); ws['!cols']=[{wch:14},{wch:12},{wch:60}]; XLSX.utils.book_append_sheet(wb,ws,'Produzione'); XLSX.writeFile(wb,template ? 'modello-pizza-tracker.xlsx' : `pizza-tracker-${today()}.xlsx`);
}
function sheetRows() {return XLSX.utils.sheet_to_json(workbook.Sheets[$('sheet').value],{header:1,defval:'',raw:true,blankrows:true});}
function updateMapping() {
  const rows=sheetRows(), headerIndex=Number($('headerRow').value)-1;
  const header=rows[headerIndex] || [];
  const width=Math.max(header.length, ...rows.slice(headerIndex+1,headerIndex+21).map(r=>r.length),0);
  for (const id of ['dateCol','countCol','notesCol']) {
    $(id).replaceChildren();
    if(id==='notesCol') $(id).add(new Option('Nessuna', '-1'));
    for(let i=0;i<width;i++) $(id).add(new Option(`${XLSX.utils.encode_col(i)} · ${String(header[i]??'').slice(0,80)||'Senza titolo'}`, String(i)));
  }
  const norm=header.map(h=>String(h).toLowerCase().trim());
  const di=norm.findIndex(h=>/^(data|date|giorno)$/.test(h)), ci=norm.findIndex(h=>/^(pizze|count|quantità|quantita|totale|pizze prodotte|pizza|numero pizze)$/.test(h)), ni=norm.findIndex(h=>/^(note|notes|annotazioni)$/.test(h));
  $('dateCol').value=String(di>=0?di:0); $('countCol').value=String(ci>=0?ci:1); $('notesCol').value=String(ni);
  previewImport();
}
function previewImport() {
  pending=[]; importIssues=[];
  const candidates=[];
  if(rawJson) candidates.push(...rawJson);
  else if(workbook) {
    const start=Number($('headerRow').value), di=Number($('dateCol').value), ci=Number($('countCol').value), ni=Number($('notesCol').value);
    if(!Number.isInteger(start)||start<1 || !$('dateCol').value || !$('countCol').value || di===ci || (ni>=0&&(ni===di||ni===ci))) importIssues.push('Scegli una riga intestazioni valida e colonne diverse per data, pizze e note.');
    else {
      const rows=sheetRows();
      for(let i=start;i<rows.length;i++) {
        const row=rows[i]; if(row.every(v=>v===''||v==null)) continue;
        const date=parseDate(row[di],!!workbook.Workbook?.WBProps?.date1904), count=parseCount(row[ci]), notes=ni<0?'':String(row[ni]??'');
        if(!date || count===null || notes.length>10000) {importIssues.push(`Riga ${i+1}: ${!date?'data non valida':count===null?'quantità non valida (serve un intero ≥ 0)':'nota troppo lunga'}.`); continue;}
        candidates.push({date,count,notes});
      }
    }
  }
  const seen=new Set();
  for(const r of candidates) {if(seen.has(r.date)) importIssues.push(`Data duplicata nel file: ${r.date}. Unisci o correggi le righe prima di importare.`); else {seen.add(r.date); pending.push(r);}}
  const conflicts=pending.filter(r=>records[r.date]).length, replace=$('conflict').value==='replace';
  $('importSummary').textContent=`${pending.length} giornate valide · ${conflicts} già presenti · ${replace?pending.length:pending.length-conflicts} da ${replace?'aggiungere o aggiornare':'aggiungere'}. Anteprima delle prime 30.`;
  $('previewRows').replaceChildren();
  for(const r of pending.slice(0,30)) {const tr=document.createElement('tr'); for(const val of [r.date,r.count,r.notes]){const td=document.createElement('td');td.textContent=val;tr.append(td);} $('previewRows').append(tr);}
  $('importErrors').textContent=importIssues.length ? `${importIssues.length} problemi. Nessuna riga verrà importata finché non sono risolti.\n${importIssues.slice(0,8).join('\n')}` : '';
  $('confirmImport').disabled=blocked||!pending.length||!!importIssues.length;
}
async function openImport(file) {
  if(!file||loadingFile||!PizzaVault.isUnlocked()) return;
  if(!leaveDraft()) return;
  if(file.size>20*1024*1024){message('Il file supera 20 MB. Dividilo in file più piccoli.',true);return;}
  workbook=null; rawJson=null; pending=[]; loadingFile=true;
  try {
    if(/\.json$/i.test(file.name)) {rawJson=normalizeRecords(JSON.parse(await file.text()));}
    else {
      if(!window.XLSX) throw new Error('Lettore Excel non disponibile: ricarica la pagina.');
      const csv=/\.csv$/i.test(file.name);
      workbook=XLSX.read(csv?await file.text():await file.arrayBuffer(),{type:csv?'string':'array',cellDates:false,raw:csv});
      if(!workbook.SheetNames.length) throw new Error('Nessun foglio trovato.');
      $('sheet').replaceChildren(...workbook.SheetNames.map(n=>new Option(n,n)));
      $('headerRow').value=1;
    }
    if(!PizzaVault.isUnlocked()){workbook=null;rawJson=null;pending=[];return;}
    $('fileName').textContent=file.name; $('mapping').hidden=!!rawJson; $('conflict').value='keep';
    if(workbook) updateMapping(); else previewImport();
    if(PizzaVault.isUnlocked())$('importDialog').showModal();
  } catch(e) {message(`Impossibile leggere il file. ${e.message}`,true);}
  finally {loadingFile=false; $('file').value='';}
}
async function importNow() {
  if(!pending.length||importIssues.length||blocked)return;
  let live;
  try {live=PizzaVault.getRecords(); normalizeRecords(live);} catch {message('Archivio locale non leggibile. Importazione interrotta.',true);return;}
  const replace=$('conflict').value==='replace', updates=pending.filter(r=>replace||!live[r.date]);
  if(!updates.length){$('importDialog').close();message('Nessuna nuova giornata: tutte le date sono già presenti.');return;}
  if(replace&&updates.some(r=>live[r.date])&&!confirm('Sostituire i conteggi e le note delle date già presenti? Prima dell’importazione verrà scaricato un backup JSON.'))return;
  download(JSON.stringify({version:2,records:live},null,2),`pizza-tracker-prima-importazione-${today()}.json`,'application/json');
  $('confirmImport').disabled=true;
  if(await persist(Object.fromEntries(updates.map(r=>[r.date,r])))&&PizzaVault.isUnlocked()){
    $('importDialog').close(); selected=updates.map(r=>r.date).sort().at(-1); $('allHistory').checked=true;page=0;loadDay();render();message(`${updates.length} giornate importate. È stato scaricato il backup dell’archivio precedente.`);
  }
  $('confirmImport').disabled=false;
}
function init() {
  load(); loadDay(); render();
  const draft=PizzaVault.getDraft();
  if(draft){selected=draft.date;loadDay();$('count').value=draft.count;$('notes').value=draft.notes;dirty=true;$('savedState').textContent='Bozza recuperata';render();message('Bozza recuperata dal telefono. Premi “Salva giornata” per confermarla.');}
  if(window.pizzaInitialized)return;
  window.pizzaInitialized=true;
  const navLinks = [...document.querySelectorAll('.bottom-nav a')];
  function highlightNav() {
    let current = '#home';
    for (const id of ['history','data']) if ($(id).getBoundingClientRect().top < innerHeight * .5) current = '#'+id;
    navLinks.forEach(a => {const active=a.getAttribute('href')===current;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});
  }
  window.addEventListener('scroll',highlightNav,{passive:true});
  $('entryForm').onsubmit=saveDay;
  $('date').onchange=e=>selectDate(e.target.value);
  $('prev').onclick=()=>moveMonth(-1);$('next').onclick=()=>moveMonth(1);$('today').onclick=()=>selectDate(today());
  for(const id of ['count','notes']) $(id).oninput=setDirty;
  function add(n){const value=parseCount($('count').value);if(value===null){message('Correggi il conteggio prima di usare i pulsanti.',true);return;}$('count').value=Math.max(0,Math.min(10000000,value+n));setDirty();}
  $('minus').onclick=()=>add(-1);$('plus').onclick=()=>add(1);document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>add(Number(b.dataset.add)));
  $('allHistory').onchange=()=>{page=0;render();};$('older').onclick=()=>{page--;render();};$('newer').onclick=()=>{page++;render();};
  $('template').onclick=()=>excelExport(true);$('exportExcel').onclick=()=>excelExport();
  $('exportJson').onclick=()=>download(JSON.stringify({version:2,records},null,2),`pizza-tracker-${today()}.json`,'application/json');
  $('file').onclick=()=>PizzaVault.externalAction();$('file').onchange=e=>openImport(e.target.files[0]);$('sheet').onchange=updateMapping;$('headerRow').onchange=updateMapping;
  for(const id of ['dateCol','countCol','notesCol','conflict'])$(id).onchange=previewImport;
  $('closeImport').onclick=()=>$('importDialog').close();$('confirmImport').onclick=importNow;
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
}
if(typeof document!=='undefined'){
  window.addEventListener('pizza-unlocked',init);
  window.addEventListener('pizza-locked',()=>{records={};dirty=false;workbook=null;rawJson=null;pending=[];importIssues=[];selected=today();$('entryForm').reset();$('records').replaceChildren();$('previewRows').replaceChildren();$('chart').replaceChildren();$('reportPeriod').replaceChildren();for(const id of ['status','monthTotal','yearTotal','monthAvg','yearAvg','monthDays','yearDays','archiveSummary','pageInfo','dayLabel','importSummary','fileName','importErrors','reportSummary','reportCoverage'])$(id).textContent='';});
}
if(typeof module!=='undefined')module.exports={validDate,parseDate,parseCount,normalizeRecords,summarize};
