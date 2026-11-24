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

Lo storico originale comprende 493 giornate (45.244 pizze). La versione preparata aggiunge 66 giornate stimate dal 20/09/2026 al 24/11/2026, per 5.511 pizze: totale misto 50.755. I conteggi stimati sono identificati dal prefisso `[STIMA]` nelle note, evidenziati nei riepiloghi e nei report. Media 50% per giorno della settimana in autunno 2025 e 50% nel 2026 fino al 19 settembre; lunedì a zero per chiusura ipotizzata. Le stime non sono conteggi osservati; ferie, eventi e festività non sono modellati. Per sostituire una stima con un dato reale, correggere quantità e rimuovere la nota `[STIMA]`.

Lo storico fornito dal titolare è incluso in `dist/history.enc.json`, cifrato con AES-GCM e una chiave derivata dal PIN tramite PBKDF2-SHA256. Al primo sblocco viene aggiunto automaticamente al deposito locale. Anche chi aveva già utilizzato l'app riceve le date mancanti: dati e note già salvati, giornate a zero e bozze sono mantenuti. Un marcatore dentro l'archivio cifrato impedisce di reimportarlo a ogni apertura.

Il file cifrato è scaricabile dal sito pubblico: chi conosce il PIN può leggere lo storico incluso. Un PIN numerico breve non protegge contro tentativi sistematici offline. I CSV/JSON originali in chiaro e il PIN non sono inclusi nel repository. I nuovi conteggi restano sul dispositivo e non modificano lo storico distribuito.

Il service worker conserva anche lo storico cifrato per il primo sblocco offline dopo il caricamento completo. Se il file non è disponibile o non è valido, nessun archivio esistente viene sovrascritto. Dopo l'importazione iniziale le successive aperture usano solo l'archivio locale.

Importazione `.xlsx`, `.xls`, `.csv` o backup `.json`. Per Excel scegliere un foglio alla volta, la riga delle intestazioni e le colonne data, quantità e note. Il modello scaricabile contiene `Data`, `Pizze`, `Note`. Date in formato Excel, `GG/MM/AAAA` o `AAAA-MM-GG`; quantità intere non negative. Eventuali righe di totale vanno rimosse prima dell'importazione. Non vengono ricostruiti conteggi giornalieri a partire da totali mensili.

L'anteprima blocca l'importazione in presenza di righe non valide o date duplicate nel file. Le date già salvate vengono mantenute per impostazione predefinita; la sostituzione richiede una scelta esplicita. Prima di ogni importazione viene avviato il download di un backup JSON. Le medie includono esclusivamente le giornate registrate, anche quelle a zero.

## Conservazione

I conteggi e le bozze sono cifrati con AES-GCM sul dispositivo; la chiave viene derivata dal PIN concordato mediante PBKDF2-SHA256 (310.000 iterazioni, salt casuale per dispositivo) e resta solo in memoria. Il controllo iniziale del PIN contiene un verificatore derivato e non il PIN in chiaro. Un PIN a sei cifre è una protezione locale contro accessi casuali, non un'identità utente verificata dal server. Il sito ospita soltanto il codice e gli asset: non riceve i conteggi e non identifica il pizzaiolo.

La chiave localStorage è `pizza-tracker.secure.v1`. L'archivio della versione precedente `pizza-tracker.v2` viene validato e cifrato solo dopo lo sblocco; il dato originale è rimosso esclusivamente dopo il salvataggio riuscito. Le bozze sono accodate e cifrate a ogni modifica. L'app si blocca quando passa in secondo piano, salvo una breve finestra per il selettore file e le operazioni di esportazione/condivisione. Il pulsante Blocca è sempre disponibile.

Un cambio di dominio/browser o la cancellazione dei dati del sito richiede un backup. I download JSON/Excel sono volutamente leggibili, senza PIN, e vanno conservati personalmente. Il browser può comunque eliminare lo storage: `navigator.storage.persist()` viene richiesto dopo salvataggio/importazione, ma non è una garanzia. Installa l'app prima di importare lo storico e usa sempre la stessa app. Nessuna sincronizzazione tra telefoni è attiva.

## Installazione e offline

L'app controlla gli aggiornamenti all'apertura, al ritorno in primo piano e al ripristino della connessione. Li applica automaticamente sulla schermata del PIN, quando non ci sono operazioni in corso. Durante una sessione aperta attende il blocco del registro: conteggi, note e bozze restano nel deposito cifrato. Se il download fallisce o il telefono è offline, resta disponibile l'ultima versione completa.

I vecchi collegamenti a `https://moorentpm.github.io/pizza-tracker/update.html` aggiornano e aprono direttamente il registro, senza un riquadro o pulsanti di conferma. Non cancellare i dati del sito per aggiornare.

Manifest, icone 192/512/maskable e apple-touch-icon inclusi. Android/Chrome: menu → Installa app o Aggiungi a schermata Home. Aprire l'icona e attendere “Pronta anche senza internet”. Il service worker memorizza solo gli asset, lasciando i conteggi nel deposito cifrato. Incrementare il nome cache in `dist/sw.js` a ogni modifica degli asset.

Nel grafico mensile ogni colonna apre il giorno corrispondente con conteggio e note, comprese le giornate a zero e quelle non registrate. L'importazione iniziale dello storico avviene senza notifiche; le stime rimangono riconoscibili nelle note, nelle statistiche e nei report.

## Report semestrale

Report gennaio–giugno e luglio–dicembre, con totale, giornate registrate, media e dettaglio mensile; download Excel e condivisione nativa Android quando disponibile. I semestri non conclusi sono segnalati come parziali.

L'invio automatico via email **non è attivo**. Il destinatario è stato indicato nella conversazione ma non è incluso nel codice pubblico. Prima di attivarlo servono un account/servizio di invio autorizzato e un canale autenticato per sincronizzare solo i riepiloghi necessari. Un'attività cloud non può accedere al localStorage cifrato del telefono. Nessuna pianificazione è stata creata senza questo collegamento. Non simulare invii con un timer della pagina o un link mailto.

Il widget sulla schermata di blocco è stato escluso su richiesta dell'utente.

## Dipendenze e verifiche

SheetJS CE 0.20.3 è inclusa localmente con licenza Apache 2.0 in `dist/vendor/`. Fonte: https://docs.sheetjs.com/docs/getting-started/installation/standalone/ . La pagina non carica librerie, font o CSS da CDN durante l'uso.

Per verificare in locale: `npm ci`, poi `npx playwright install chromium`. Esegui `npm test` con il PIN nella variabile d'ambiente `PIZZA_TEST_PIN`, mai nel repository.

`test.cjs` usa un server locale sotto `/pizza-tracker/` e verifica PIN errato/corretto, migrazione cifrata, calendario, XLSX/CSV, duplicati, report, recupero bozze, errori di scrittura, riapertura offline con salvataggio ed esportazione, isolamento dei dispositivi e conservazione di archivi corrotti. `test-history.cjs` verifica lo storico incluso e le stime; `test-update.cjs` riproduce una vecchia versione ancora attiva con più schede aperte, quindi verifica l'aggiornamento e la conservazione dei conteggi. `test-dashboard.cjs` verifica i giorni cliccabili, le bozze, l'aggiornamento automatico a registro bloccato, gli aggiornamenti rimandati durante l'inserimento e i download falliti. `test-update.cjs` richiede la cronologia Git (commit `3438766`). I dati di prova sono generati in una sessione browser isolata e non fanno parte dell'app distribuita. `npm run icons` produce le icone PNG dall'SVG del progetto.
