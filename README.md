# MusArt — gestione pulizie

Web app statica per gestire le pulizie delle camere usando i calendari iCal Airbnb e
Booking. Lo staff continua a usare le schermate Pulizie e Calendario; l’area Admin,
disponibile dopo l’accesso, aggiunge riepiloghi e conferme persistenti.

## Area Admin e dati

- L’accesso usa Firebase Authentication con l’account amministratore
  `docimusa@gmail.com`; il provider Email/Password deve essere attivo e l’indirizzo
  deve essere verificato.
- Il calendario settimanale va da lunedì a lunedì (estremo finale escluso). Il costo
  settimanale è pulizie previste × 12 €. Il riepilogo mensile calcola il costo solo
  dalle pulizie confermate come effettuate.
- Le conferme sono salvate in Cloud Firestore e restano disponibili anche se una
  prenotazione scompare dal feed. Nell’area Admin si può correggere una conferma.
- Le pulizie previste derivano dai check-out. Una camera produce al massimo una
  pulizia per data, anche con check-in nello stesso giorno o eventi duplicati nei
  due calendari. I blocchi riconoscibili dal testo iCal sono esclusi; un evento
  ambiguo può essere escluso dall’area Admin con **Segna blocco**. L’esclusione è
  condivisa con l’area Staff e resta salvata in Firestore.

Le impostazioni iCal restano nel documento `apps/pulizie`, leggibile dall’app per
consentire allo Staff la sincronizzazione. Come ogni applicazione statica che legge
iCal dal browser, i relativi URL non sono segreti rispetto a chi può usare l’app.
Le conferme e i costi non sono esposti allo Staff: le regole Firestore li riservano
all’account amministratore.

## Configurazione Firebase (necessaria prima della pubblicazione)

1. In Firebase Console, apri il progetto esistente `calendario-690a0` (non crearne
   uno nuovo: l’app è già collegata a questo progetto).
2. In **Authentication → Sign-in method**, attiva **Email/Password**. Crea l’utente
   `docimusa@gmail.com` e verifica l’indirizzo email. In **Authentication →
   Settings → Authorized domains**, controlla che `doci-git.github.io` sia
   autorizzato.
3. Se Firestore non è ancora stato creato, crealo dalla Firebase Console. Nella
   cartella del progetto, accedi a Firebase CLI e pubblica le regole:

   ```powershell
   npm install -g firebase-tools
   firebase login
   firebase deploy --only firestore:rules --project calendario-690a0
   ```

   Se Firebase CLI è già installata, non occorre reinstallarla.

   Il file `firestore.rules` permette la lettura pubblica delle impostazioni
   necessarie allo Staff, ma consente di modificarle solo all’account admin.
   Conferme e dati amministrativi sono leggibili e modificabili solo dall’admin;
   gli override dei blocchi sono leggibili dallo Staff e scrivibili solo dall’admin.
   Non condividere l’app prima di aver pubblicato queste regole: le vecchie regole
   permissive potrebbero lasciare i dati accessibili.
4. In Firestore, verifica che esista il documento `apps/pulizie` con i link iCal.
   Se non esiste, accedi come admin, configura le camere in **Impostazioni** e salva.

## Pubblicazione su GitHub Pages

1. Pubblica prima le regole Firestore come descritto sopra.
2. Fai push su GitHub delle modifiche a `index.html`, `README.md`, `firebase.json`
   e `firestore.rules`.
3. In GitHub, apri **Settings → Pages** e seleziona il branch e la cartella usati
   dal repository per Pages. Se Pages è già configurato, il push pubblica
   automaticamente la nuova versione.
4. Apri la URL GitHub Pages e accedi all’area Admin. Usa **Aggiorna** per controllare
   la sincronizzazione Airbnb/Booking; verifica il calendario e i riepiloghi senza
   confermare pulizie di prova.
