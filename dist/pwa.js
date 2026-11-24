'use strict';
(() => {
  let promptEvent=null,ready=false,registration=null,reloadPending=false,reloading=false;
  let hadController=!!navigator.serviceWorker?.controller,lastCheck=0;
  const status=text=>document.querySelectorAll('.offline-state').forEach(e=>e.textContent=text);
  const installed=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  function connectivity(){status(ready?(navigator.onLine?'Pronta anche senza internet':'Sei offline · puoi continuare a lavorare'):'Primo avvio: preparazione per l’uso offline…');}
  function applyUpdate(){
    // Never interrupt PIN entry, encryption, a draft or an import in an open session.
    if(document.hidden||reloading||window.PizzaVault?.isUnlocked()||window.PizzaVault?.isBusy()||document.getElementById('pin').value)return;
    if(reloadPending){reloading=true;location.reload();return;}
    registration?.waiting?.postMessage({type:'ACTIVATE_UPDATE'});
  }
  function checkUpdate(){
    applyUpdate();
    if(!registration||!navigator.onLine||document.hidden||Date.now()-lastCheck<60000)return;
    lastCheck=Date.now();void registration.update().catch(()=>{});
  }
  function installLabel(){document.querySelectorAll('.install-trigger').forEach(b=>b.textContent=installed()?'App sul telefono · informazioni':'Aggiungi alla schermata Home');}
  async function install(){
    window.PizzaVault?.externalAction();
    if(promptEvent){const event=promptEvent;promptEvent=null;await event.prompt();await event.userChoice;installLabel();}
    else document.getElementById('installDialog').showModal();
  }
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();promptEvent=event;installLabel();});
  window.addEventListener('appinstalled',()=>{promptEvent=null;installLabel();});
  document.querySelectorAll('.install-trigger').forEach(b=>b.addEventListener('click',install));
  document.getElementById('closeInstall').onclick=()=>document.getElementById('installDialog').close();
  window.addEventListener('online',()=>{connectivity();checkUpdate();});window.addEventListener('offline',connectivity);
  window.addEventListener('focus',checkUpdate);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkUpdate();});
  window.addEventListener('pizza-vault-idle',applyUpdate);
  document.getElementById('pin').addEventListener('input',applyUpdate);
  installLabel();
  if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol)){
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      reloadPending=hadController;hadController=true;applyUpdate();
    });
    navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(async result=>{
      registration=result;
      applyUpdate();
      function watchWorker(){
        const worker=registration.installing;
        worker?.addEventListener('statechange',()=>{
          if(worker.state==='installed')applyUpdate();
          if(worker.state==='redundant'&&!registration.active)status('Preparazione offline non riuscita. Riprova con una connessione internet.');
        });
      }
      watchWorker();registration.addEventListener('updatefound',watchWorker);checkUpdate();
      await navigator.serviceWorker.ready;ready=true;connectivity();
    }).catch(()=>status('Offline non ancora disponibile. Riapri con una connessione internet.'));
  }else status('Per installare l’app e usarla offline, apri il link pubblicato.');
  async function preserveStorage(){try{if(navigator.storage?.persist)await navigator.storage.persist();}catch{/* Backup remains available when persistent storage is not granted. */}}
  document.getElementById('entryForm').addEventListener('submit',()=>void preserveStorage());
  document.getElementById('confirmImport').addEventListener('click',()=>void preserveStorage());
})();
