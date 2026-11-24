'use strict';
(() => {
  let promptEvent=null,ready=false,updateWaiting=false;
  const status=text=>document.querySelectorAll('.offline-state').forEach(e=>e.textContent=text);
  const installed=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  function connectivity(){status(updateWaiting?'Aggiornamento pronto: tocca “Aggiorna app”.':ready?(navigator.onLine?'Pronta anche senza internet':'Sei offline · puoi continuare a lavorare'):'Primo avvio: preparazione per l’uso offline…');}
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
  window.addEventListener('online',connectivity);window.addEventListener('offline',connectivity);
  installLabel();
  if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol)){
    navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(async registration=>{
      updateWaiting=!!registration.waiting;
      if(updateWaiting)connectivity();
      function watchWorker(){
        const worker=registration.installing;
        worker?.addEventListener('statechange',()=>{
          if(worker.state==='installed'&&navigator.serviceWorker.controller){updateWaiting=true;connectivity();}
          if(worker.state==='redundant'&&!registration.active)status('Preparazione offline non riuscita. Riprova con una connessione internet.');
        });
      }
      watchWorker();registration.addEventListener('updatefound',watchWorker);
      await navigator.serviceWorker.ready;ready=true;connectivity();
    }).catch(()=>status('Offline non ancora disponibile. Riapri con una connessione internet.'));
  }else status('Per installare l’app e usarla offline, apri il link pubblicato.');
  async function preserveStorage(){try{if(navigator.storage?.persist)await navigator.storage.persist();}catch{/* Backup remains available when persistent storage is not granted. */}}
  document.getElementById('entryForm').addEventListener('submit',()=>void preserveStorage());
  document.getElementById('confirmImport').addEventListener('click',()=>void preserveStorage());
})();
