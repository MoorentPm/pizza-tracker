'use strict';
(() => {
  const STORAGE = 'pizza-tracker.secure.v1', LEGACY = 'pizza-tracker.v2';
  const PIN_SALT = '7f4b5a94b2ff461ba23e647a84576ade';
  const PIN_HASH = '320d3a696328d97d1eead42b354f826d959525fd72e8a215eef8a9b139c85be7';
  const rounds = 310000, encoder = new TextEncoder();
  const HISTORY_ID = 'history-2026-11-24-v2';
  let key = null, payload = null, salt = null, snapshot = null, queue = Promise.resolve();
  let externalUntil = 0, failures = 0, busy = false, locking = false;
  const el = id => document.getElementById(id);
  const encode = bytes => btoa(Array.from(new Uint8Array(bytes), b => String.fromCharCode(b)).join(''));
  const decode = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
  async function material(pin) {return crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits','deriveKey']);}
  async function validatePin(pin) {
    const bits = await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(PIN_SALT),iterations:rounds,hash:'SHA-256'},await material(pin),256);
    return Array.from(new Uint8Array(bits), b=>b.toString(16).padStart(2,'0')).join('') === PIN_HASH;
  }
  async function makeKey(pin, saltBytes) {return crypto.subtle.deriveKey({name:'PBKDF2',salt:saltBytes,iterations:rounds,hash:'SHA-256'},await material(pin),{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
  async function mergeIncludedHistory(pin, next) {
    if(next.includedHistory===HISTORY_ID)return {changed:false,added:0};
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    let bundle;
    try{
      const response=await fetch('./history.enc.json',{signal:controller.signal});
      if(!response.ok)throw Error('History unavailable');
      bundle=await response.json();
    }catch{throw Error('Storico iniziale non disponibile. Riapri l’app con una connessione internet; i dati già salvati non sono stati modificati.');}
    finally{clearTimeout(timer);}
    if(bundle.version!==1)throw Error('Formato dello storico iniziale non valido.');
    const historyKey=await makeKey(pin,decode(bundle.salt));
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(bundle.iv)},historyKey,decode(bundle.cipher));
    const history=JSON.parse(new TextDecoder().decode(plain));
    if(history.id!==HISTORY_ID)throw Error('Versione dello storico iniziale non valida.');
    const rows=normalizeRecords(history);
    if(new Set(rows.map(r=>r.date)).size!==rows.length)throw Error('Lo storico iniziale contiene date duplicate.');
    let added=0;
    for(const row of rows)if(!Object.hasOwn(next.records,row.date)){next.records[row.date]=row;added++;}
    next.includedHistory=HISTORY_ID;
    return {changed:true,added};
  }
  function commit(change) {
    const operation = queue.then(async () => {
      if (!key || !payload) throw Error('Sblocca l’app per salvare.');
      if(localStorage.getItem(STORAGE) !== snapshot) throw Error('Archivio cambiato in un’altra finestra. Blocca e riapri l’app prima di salvare.');
      const next = change(structuredClone(payload));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const cipher = await crypto.subtle.encrypt({name:'AES-GCM',iv},key,encoder.encode(JSON.stringify(next)));
      // Check again after asynchronous encryption: never overwrite another tab's save.
      if(localStorage.getItem(STORAGE) !== snapshot) throw Error('Archivio aggiornato in un’altra finestra. Riapri l’app.');
      const raw = JSON.stringify({version:1,salt:encode(salt),iv:encode(iv),cipher:encode(cipher)});
      localStorage.setItem(STORAGE,raw);
      snapshot=raw;payload=next;
    });
    queue = operation.catch(()=>{});
    return operation;
  }
  async function unlock(event) {
    event.preventDefault();if(busy||locking)return;
    const pin=el('pin').value;if(!/^\d{6}$/.test(pin))return;
    busy=true;el('unlock').disabled=true;el('pinError').textContent='';
    let newKey;
    try {
      if(!crypto.subtle)throw Error('Apri l’app dal suo indirizzo HTTPS, in un browser aggiornato.');
      if(!(await validatePin(pin))){failures++;throw Error('PIN non corretto. Riprova.');}
      const raw=localStorage.getItem(STORAGE); let next, nextSalt;
      if(raw){
        const data=JSON.parse(raw);if(data.version!==1)throw Error('Versione archivio non supportata.');
        nextSalt=decode(data.salt);newKey=await makeKey(pin,nextSalt);
        const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(data.iv)},newKey,decode(data.cipher));
        next=JSON.parse(new TextDecoder().decode(plain));
      }else{
        nextSalt=crypto.getRandomValues(new Uint8Array(16));newKey=await makeKey(pin,nextSalt);
        const legacy=localStorage.getItem(LEGACY);next={records:{},draft:null};
        if(legacy){const old=JSON.parse(legacy);if(old.version!==2)throw Error('Archivio precedente non riconosciuto.');next.records=Object.fromEntries(normalizeRecords(old).map(r=>[r.date,r]));}
      }
      if(!next||!next.records||typeof next.records!=='object')throw Error('Archivio non valido.');
      normalizeRecords(next.records);
      // Validates old drafts too; an invalid draft must not prevent access to saved days.
      if(next.draft&&(!validDate(next.draft.date)||typeof next.draft.count!=='string'||typeof next.draft.notes!=='string'))next.draft=null;
      const history=await mergeIncludedHistory(pin,next);
      key=newKey;salt=nextSalt;snapshot=raw;payload=next;
      if(!raw||history.changed)await commit(p=>p);
      localStorage.removeItem(LEGACY); // Only after the encrypted replacement was saved successfully.
      if(document.hidden){key=null;payload=null;el('pin').value='';return;}
      failures=0;el('pin').value='';el('lockScreen').hidden=true;el('appShell').hidden=false;
      window.dispatchEvent(new Event('pizza-unlocked'));
      if(history.added)message(`${history.added} giornate dello storico aggiunte automaticamente. I dati già presenti sono stati mantenuti.${next.draft?' La bozza della serata è stata recuperata.':''}`);
    }catch(error){
      key=null;payload=null;
      el('pinError').textContent=error.name==='OperationError'?'Archivio non leggibile. Conserva i dati del sito e usa una copia di backup.':error instanceof SyntaxError?'Archivio non leggibile. I dati originali non sono stati modificati.':error.message;
      el('pin').value='';el('pin').focus();
    }finally{
      if(failures>=3)await new Promise(resolve=>setTimeout(resolve,5000));
      busy=false;el('unlock').disabled=false;
    }
  }
  async function lock() {
    if(!key||locking)return;locking=true;
    // Hide immediately, then let pending encrypted writes finish before removing the key.
    el('appShell').hidden=true;el('lockScreen').hidden=false;el('unlock').disabled=true;
    document.querySelectorAll('dialog[open]').forEach(d=>d.close());
    await queue;key=null;payload=null;externalUntil=0;
    window.dispatchEvent(new Event('pizza-locked'));
    locking=false;el('unlock').disabled=false;
  }
  window.PizzaVault={
    getRecords:()=>structuredClone(payload?.records??{}),
    getDraft:()=>structuredClone(payload?.draft??null),
    isUnlocked:()=>!!key&&!locking,
    saveRecords:updates=>commit(p=>{p.records={...p.records,...updates};p.draft=null;return p;}),
    saveDraft:draft=>commit(p=>{p.draft=draft;return p;}),
    externalAction:()=>{externalUntil=Date.now()+120000;},
    lock
  };
  el('pinForm').addEventListener('submit',unlock);
  el('lockApp').addEventListener('click',lock);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&Date.now()>externalUntil)void lock();if(!document.hidden)externalUntil=0;});
  window.addEventListener('pagehide',()=>void lock());
  window.addEventListener('storage',e=>{if(e.key===STORAGE&&key) {void lock();el('pinError').textContent='Archivio aggiornato in un’altra finestra. Inserisci il PIN per riaprire.';}});
})();
