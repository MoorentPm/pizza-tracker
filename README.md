# Pizza Tracker

Codice e pubblicazione gestiti su GitHub. Il contenuto di `dist/` è l'app completa, senza server o dipendenze da installare per il suo utilizzo.

## Modificare e pubblicare

Modifica i file in `dist/` e salva le modifiche nel branch `main`: il workflow **Publish Pizza Tracker** pubblica automaticamente su GitHub Pages. Controlla lo stato nella scheda **Actions**. In **Settings → Pages**, la sorgente deve essere **GitHub Actions**.

- `dist/index.html`: testi e struttura.
- `dist/theme.css`: aspetto grafico.
- `dist/app.js`: conteggio e importazione.
- `dist/vault.js`: blocco con PIN e archivio cifrato.
- `dist/reports.js`: riepiloghi semestrali.
- `dist/sw.js`: risorse disponibili offline; incrementare la versione cache quando cambia l'app.

La cache è separata per percorso, per non interferire con altre applicazioni GitHub Pages sullo stesso dominio. Percorsi di script, icone e manifest sono relativi e funzionano anche sotto `/pizza-tracker/`.

## Trasferire i dati dal vecchio indirizzo

1. Apri la vecchia app nello stesso browser/dispositivo usato per registrare le giornate.
2. Sblocca il registro e scegli **I tuoi dati → Backup JSON**.
3. Apri il nuovo indirizzo GitHub Pages in Chrome e aggiungilo alla schermata Home.
4. Apri la nuova icona, sblocca il registro e scegli **I tuoi dati → Importa un file**.
5. Seleziona il backup, controlla l'anteprima e conferma. Confronta totale e numero di giornate prima di rimuovere la vecchia icona.

I dati sono legati all'indirizzo del sito: non passano automaticamente da un dominio all'altro. Il vecchio sito resta disponibile per esportarli. Non caricare backup, file Excel o conteggi personali nel repository pubblico.

Web app italiana per il totale delle pizze a fine serata, note, statistiche mensili/annuali e archivio multianno. Usare il link HTTPS pubblicato per installazione e offline. Nessun anno è fissato nel codice; la data iniziale usa il calendario locale del dispositivo.

## Dati storici

Il file Excel reale dell'utente non è ancora disponibile. L'archivio iniziale è vuoto: nessun conteggio dimostrativo è inserito nell'app.

Importazione `.xlsx`, `.xls`, `.csv` o backup `.json`. Per Excel scegliere un foglio alla volta, la riga delle intestazioni e le colonne data, quantità e note. Il modello scaricabile contiene `Data`, `Pizze`, `Note`. Date in formato Excel, `GG/MM/AAAA` o `AAAA-MM-GG`; quantità intere non negative. Eventuali righe di totale vanno rimosse prima dell'importazione. Non vengono ricostruiti conteggi giornalieri a partire da totali mensili.

L'anteprima blocca l'importazione in presenza di righe non valide o date duplicate nel file. Le date già salvate vengono mantenute per impostazione predefinita; la sostituzione richiede una scelta esplicita. Prima di ogni importazione viene avviato il download di un backup JSON. Le medie includono esclusivamente le giornate registrate, anche quelle a zero.

## Conservazione

I conteggi e le bozze sono cifrati con AES-GCM sul dispositivo; la chiave viene derivata dal PIN concordato mediante PBKDF2-SHA256 (310.000 iterazioni, salt casuale per dispositivo) e resta solo in memoria. Il controllo iniziale del PIN contiene un verificatore derivato e non il PIN in chiaro. Un PIN a sei cifre è una protezione locale contro accessi casuali, non un'identità utente verificata dal server. Il sito ospita soltanto il codice e gli asset: non riceve i conteggi e non identifica il pizzaiolo.

La chiave localStorage è `pizza-tracker.secure.v1`. L'archivio della versione precedente `pizza-tracker.v2` viene validato e cifrato solo dopo lo sblocco; il dato originale è rimosso esclusivamente dopo il salvataggio riuscito. Le bozze sono accodate e cifrate a ogni modifica. L'app si blocca quando passa in secondo piano, salvo una breve finestra per il selettore file e le operazioni di esportazione/condivisione. Il pulsante Blocca è sempre disponibile.

Un cambio di dominio/browser o la cancellazione dei dati del sito richiede un backup. I download JSON/Excel sono volutamente leggibili, senza PIN, e vanno conservati personalmente. Il browser può comunque eliminare lo storage: `navigator.storage.persist()` viene richiesto dopo salvataggio/importazione, ma non è una garanzia. Installa l'app prima di importare lo storico e usa sempre la stessa app. Nessuna sincronizzazione tra telefoni è attiva.

## Installazione e offline

Manifest, icone 192/512/maskable e apple-touch-icon inclusi. Android/Chrome: menu → Installa app o Aggiungi a schermata Home. Aprire l'icona e attendere “Pronta anche senza internet”. Il service worker memorizza solo gli asset, lasciando i conteggi nel deposito cifrato. Aggiornamenti dell'app in attesa fino alla chiusura delle finestre, senza ricaricare bozze in corso. Incrementare il nome cache in `dist/sw.js` a ogni modifica degli asset.

## Report semestrale

Report gennaio–giugno e luglio–dicembre, con totale, giornate registrate, media e dettaglio mensile; download Excel e condivisione nativa Android quando disponibile. I semestri non conclusi sono segnalati come parziali.

L'invio automatico via email **non è attivo**. Il destinatario è stato indicato nella conversazione ma non è incluso nel codice pubblico. Prima di attivarlo servono un account/servizio di invio autorizzato e un canale autenticato per sincronizzare solo i riepiloghi necessari. Un'attività cloud non può accedere al localStorage cifrato del telefono. Nessuna pianificazione è stata creata senza questo collegamento. Non simulare invii con un timer della pagina o un link mailto.

Il widget sulla schermata di blocco è stato escluso su richiesta dell'utente.

## Dipendenze e verifiche

SheetJS CE 0.20.3 è inclusa localmente con licenza Apache 2.0 in `dist/vendor/`. Fonte: https://docs.sheetjs.com/docs/getting-started/installation/standalone/ . La pagina non carica librerie, font o CSS da CDN durante l'uso.

Per verificare in locale: `npm ci`, poi `npx playwright install chromium`. Esegui `npm test` con il PIN nella variabile d'ambiente `PIZZA_TEST_PIN`, mai nel repository.

`test.cjs` usa un server locale sotto `/pizza-tracker/` e verifica PIN errato/corretto, migrazione cifrata, calendario, XLSX/CSV, duplicati, report, recupero bozze, errori di scrittura, riapertura offline con salvataggio ed esportazione, isolamento dei dispositivi e conservazione di archivi corrotti. I dati di prova sono generati in una sessione browser isolata e non fanno parte dell'app distribuita. `npm run icons` produce le icone PNG dall'SVG del progetto.
