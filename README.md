# MusArt — gestione pulizie

https://doci-git.github.io/calendario/

Web app statica per gestire le pulizie delle camere usando i calendari iCal Airbnb e
Booking. Lo staff continua a usare le schermate Pulizie e Calendario e può inviare
segnalazioni di manutenzione; l’area Admin organizza calendario, riepiloghi,
manutenzioni e scorte.

## Area Admin e dati

- All’apertura viene richiesta a Staff e Admin la password condivisa `2244`.
  Dopo lo sblocco resta valida nella scheda corrente fino alla sua chiusura.
  È un blocco semplice dell’interfaccia, non una misura di sicurezza: la password
  è inclusa nel codice pubblico e può essere vista nel sorgente della pagina.
- L’accesso usa Firebase Authentication con l’account amministratore
  `docimusa@gmail.com`; il provider Email/Password deve essere attivo e l’indirizzo
  deve essere verificato.
- Il calendario e il riepilogo settimanale vanno da lunedì a domenica inclusi. Il costo
  settimanale è pulizie previste × 12 €. Le pulizie previste con data precedente a
  oggi sono considerate effettuate automaticamente; il riepilogo mensile calcola il
  costo staff su queste pulizie passate. Non è richiesta una conferma manuale. Nella
  vista settimanale sono mostrati solo i giorni con pulizie; si cambia settimana con
  le frecce.
- L’Admin archivia le pulizie per data in Firestore dopo la sincronizzazione dei
  calendari. Il riepilogo dei mesi passati usa questi dati salvati, anche quando gli
  eventi non sono più presenti nei feed iCal. Le sincronizzazioni successive
  possono aggiungere ai giorni passati pulizie rilevate dai feed, senza cancellare
  voci già archiviate anche se non compaiono più nei feed.
  L’archivio inizia a raccogliere dati dopo la pubblicazione di questa funzione e il
  primo accesso/sincronizzazione Admin; i mesi precedenti senza dati archiviati
  mostrano ancora quanto disponibile dai feed.
- La scheda **Manutenzioni** mostra le segnalazioni aperte, risolte o tutte. L’Admin
  può aprirle, vedere le foto, risolverle e riaprirle; i report risolti rimangono nello
  storico. Il simbolo 🔧 nel calendario apre la relativa segnalazione.
- La scheda **Scorte** raccoglie le segnalazioni di prodotti generali: lo Staff marca
  soltanto ciò che sta finendo o è finito, senza quantità o camere. L’Admin vede
  una segnalazione aperta per prodotto, può segnare il rifornimento e consultare
  lo storico; nella stessa scheda può aggiungere, rinominare o disattivare prodotti.
  I prodotti predefiniti vengono creati al primo accesso Admin dopo la pubblicazione.
- Sotto ogni pulizia lo Staff può segnalare un problema, scegliere camera, categoria
  e priorità e allegare una foto facoltativa. Le immagini vengono ridimensionate e
  compresse nel browser e salvate in una raccolta Firestore separata dai dati della
  segnalazione; l’app non usa Firebase Storage per le foto. Per rispettare il limite
  di Firestore, ogni foto è ridotta a massimo 320 KB e caricata soltanto quando
  l’amministratore apre la segnalazione.
- Le pulizie previste derivano dai check-out. Una camera produce al massimo una
  pulizia per data, anche con check-in nello stesso giorno o eventi duplicati nei
  due calendari. I blocchi riconoscibili dal testo iCal sono esclusi; un evento
  ambiguo può essere escluso dall’area Admin con **Segna blocco**. L’esclusione è
  condivisa con l’area Staff e resta salvata in Firestore.
- Il feed Booking può usare il testo generico “Not available” anche per un
  check-in valido. Per non perdere pulizie con cambio ospite nello stesso giorno,
  gli eventi Booking sono trattati come prenotazioni; eventuali blocchi Booking
  ambigui vanno esclusi dall’Admin.
- Nella schermata Pulizie il riepilogo dei prossimi 7 giorni è sostituito da un
  pulsante per aprire la porta. Il comando usa un Worker Cloudflare; la chiave
  Shelly resta secret del Worker e il pulsante non chiede un PIN.

Le impostazioni iCal restano nel documento `apps/pulizie`, leggibile dall’app per
consentire allo Staff la sincronizzazione. Come ogni applicazione statica che legge
iCal dal browser, i relativi URL non sono segreti rispetto a chi può usare l’app.
La password condivisa iniziale non sostituisce le regole di sicurezza Firebase.
Le segnalazioni sono scrivibili da utenti Firebase anonimi autenticati, mentre
lettura, risoluzione e riapertura sono riservate all’Admin. L’autenticazione anonima
non verifica che l’utente sia davvero un dipendente: chiunque apra l’app può inviare
una segnalazione, ma non può leggerla o modificarne lo stato. Per limitare l’invio
esclusivamente ai dipendenti servirebbero account individuali o un’autorizzazione
attendibile lato server.

Le segnalazioni scorte vengono salvate in `apps/pulizieAdmin/stockReports` con un
documento per ID prodotto, così non si creano doppioni; `Finito` prevale su
`Sta finendo`. I rifornimenti sono conservati in `stockHistory`. Lo stato condiviso
minimo per le transazioni è salvato in `stockStates`: lo Staff può leggere solo
questo stato essenziale e non note o dettagli delle segnalazioni. Catalogo, report
completi, storico e rifornimenti restano riservati all’Admin secondo i permessi
definiti in `firestore.rules`.

## Configurazione Firebase (necessaria prima della pubblicazione)

1. In Firebase Console, apri il progetto esistente `calendario-690a0` (non crearne
   uno nuovo: l’app è già collegata a questo progetto).
2. In **Authentication → Sign-in method**, attiva **Email/Password** e **Anonymous**.
   Crea l’utente `docimusa@gmail.com` e verifica l’indirizzo email. In
   **Authentication → Settings → Authorized domains**, controlla che
   `doci-git.github.io` sia autorizzato.
3. Verifica che Firestore sia attivo. Nella cartella del progetto, accedi a Firebase
   CLI e pubblica le regole:

   ```powershell
   npm install -g firebase-tools
   firebase login
   firebase deploy --only firestore:rules --project calendario-690a0
   ```

   Se Firebase CLI è già installata, non occorre reinstallarla.

   Il file `firestore.rules` permette la lettura delle impostazioni necessarie allo
   Staff, ma consente di modificarle solo all’account Admin. I report possono essere
   creati da utenti anonimi autenticati; solo l’Admin può leggerli o cambiarne lo
   stato. Per le scorte, lo Staff legge i prodotti attivi e lo stato minimo per
   inviare o aggiornare segnalazioni senza leggerne i dettagli o chiuderle;
   catalogo, report completi, rifornimenti e storico restano riservati all’Admin.
   Le foto sono salvate in una raccolta Firestore dedicata: lo Staff può
   crearle e rimuovere un allegato rimasto orfano in caso di errore, mentre solo
   l’Admin può leggerle. Anche lo storico pulizie è leggibile e modificabile solo
   dall’Admin. Non condividere l’app prima di aver pubblicato le regole: le vecchie
   regole permissive potrebbero lasciare i dati accessibili.
4. In Firestore, verifica che esista il documento `apps/pulizie` con i link iCal.
   Se non esiste, accedi come admin, configura le camere in **Impostazioni** e salva.

## Apertura porta con Cloudflare Worker (piano Firebase Spark)

Puoi configurare il Worker direttamente dalla dashboard Cloudflare, senza
installare Node.js o usare Wrangler. È consigliato creare un Worker separato da
quello dei calendari: il proxy iCal inoltra richieste di lettura, mentre il Worker
della porta invia un comando Shelly senza chiedere un PIN.

**Attenzione:** senza PIN o altro login, chiunque trovi l’indirizzo del Worker può
richiamarlo e aprire la porta. L’indirizzo del Worker è presente nel codice pubblico
dell’app, quindi non è segreto. Il controllo dell’origine limita le pagine web, ma
non protegge da chiamate dirette. Ruota la chiave Shelly se sospetti che sia stata
esposta.

1. Revoca la chiave Shelly condivisa in precedenza e generane una nuova.
2. Accedi a Cloudflare e apri **Workers & Pages → Create → Create Worker**.
   Chiamalo `calendario-open-door`, crea/deploya il Worker predefinito, poi apri
   **Edit code**.
3. In questa cartella del progetto apri `door-worker/src/index.js`, copia tutto il
   contenuto e sostituisci il codice iniziale nell’editor Cloudflare. Premi **Deploy**.
4. Nel Worker apri **Settings → Variables and Secrets**. Aggiungi:
   - `ALLOWED_ORIGIN` come variabile di testo con valore `https://doci-git.github.io`
   - `SHELLY_AUTH_KEY` come **Secret**, inserendo la nuova chiave Shelly

   Non aggiungere la chiave al codice del sito. Se in precedenza avevi creato il
   secret `DOOR_PIN`, puoi rimuoverlo: non serve più. Il Worker autorizza anche
   `http://127.0.0.1:5500` e `http://localhost:5500` per il test locale. Premi
   **Deploy** per applicare il codice e le variabili.
5. Verifica che l’indirizzo `workers.dev` mostrato da Cloudflare corrisponda a
   quello impostato come `DOOR_WORKER_URL` in `app.js`. Se è diverso, aggiorna
   `DOOR_WORKER_URL` con l’indirizzo corretto.
6. Fai push delle modifiche a GitHub Pages. Apri l’app, premi **Apri la porta** e
   il comando viene inviato subito, senza PIN. Firebase rimane sul piano Spark.

## Pubblicazione su GitHub Pages

1. Pubblica prima le regole Firestore come descritto sopra.
2. Fai push su GitHub delle modifiche a `index.html`, `style.css`, `app.js`,
   `README.md`, `firebase.json`, `firestore.rules` e `door-worker`.
3. In GitHub, apri **Settings → Pages** e seleziona il branch e la cartella usati
   dal repository per Pages. Se Pages è già configurato, il push pubblica
   automaticamente la nuova versione.
4. Apri la URL GitHub Pages e accedi all’area Admin. Usa **Aggiorna** per controllare
   la sincronizzazione Airbnb/Booking e verifica il calendario e i riepiloghi.
