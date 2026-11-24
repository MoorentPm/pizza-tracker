'use strict';
(() => {
  const select=document.getElementById('reportPeriod');
  function periods(){
    const current=select.value, dates=Object.keys(PizzaVault.getRecords());
    const year=new Date().getFullYear();const years=new Set([year,...dates.map(d=>Number(d.slice(0,4)))]);
    select.replaceChildren();
    for(const y of [...years].sort((a,b)=>b-a))for(const half of [2,1])select.add(new Option(`${half===1?'Gennaio – giugno':'Luglio – dicembre'} ${y}`,`${y}-${half}`));
    const initial=`${year}-${new Date().getMonth()<6?1:2}`;select.value=[...select.options].some(o=>o.value===current)?current:initial;renderReport();
  }
  function report(){
    const [year,half]=select.value.split('-').map(Number), start=`${year}-${half===1?'01':'07'}-01`,end=`${year}-${half===1?'06-30':'12-31'}`;
    const rows=Object.values(PizzaVault.getRecords()).filter(r=>r.date>=start&&r.date<=end).sort((a,b)=>a.date.localeCompare(b.date));
    const months=Array.from({length:6},(_,i)=>{const month=(half-1)*6+i+1;return {month:`${year}-${String(month).padStart(2,'0')}`,total:rows.filter(r=>Number(r.date.slice(5,7))===month).reduce((s,r)=>s+r.count,0)};});
    return {year,half,start,end,rows,months,...summarize(rows)};
  }
  function renderReport(){if(!select.value)return;const r=report();document.getElementById('reportSummary').textContent=`${fmt.format(r.total)} pizze · ${r.days} giornate registrate · media ${r.avg===null?'—':fmt.format(r.avg)} pizze/giorno`;document.getElementById('reportCoverage').textContent=`Periodo ${r.start.split('-').reverse().join('/')} – ${r.end.split('-').reverse().join('/')}. ${r.end>=today()?'Semestre in corso o futuro: dati parziali.':'Semestre concluso.'} I giorni non registrati non sono conteggiati come zero.`;}
  function exportReport(){
    PizzaVault.externalAction();const r=report(),wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Pizza Tracker','Report semestrale'],['Dal',r.start],['Al',r.end],['Pizze totali',r.total],['Giornate registrate',r.days],['Media per giornata registrata',r.avg??''],[],['Mese','Pizze'],...r.months.map(m=>[m.month,m.total])]),'Riepilogo');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Data','Pizze','Note'],...r.rows.map(d=>[d.date,d.count,d.notes])]),'Giornate');XLSX.writeFile(wb,`pizze-${r.year}-semestre-${r.half}.xlsx`);
  }
  async function shareReport(){
    const r=report();const text=`Pizza Tracker · ${select.selectedOptions[0].text}\n${r.total} pizze in ${r.days} giornate registrate.\nMedia: ${r.avg===null?'—':fmt.format(r.avg)} pizze/giorno.\n${r.months.map(m=>`${m.month}: ${m.total} pizze`).join('\n')}\n${r.end>=today()?'Dati parziali: semestre non concluso.':'Solo giornate registrate.'}`;
    PizzaVault.externalAction();
    try{if(navigator.share)await navigator.share({title:'Report semestrale Pizza Tracker',text});else download(text,`report-pizze-${r.year}-${r.half}.txt`,'text/plain;charset=utf-8');}catch(e){if(e.name!=='AbortError')message('Condivisione non disponibile. Scarica il report Excel.',true);}
  }
  select.onchange=renderReport;document.getElementById('reportExcel').onclick=exportReport;document.getElementById('reportShare').onclick=shareReport;
  window.addEventListener('pizza-records-changed',periods);
})();
