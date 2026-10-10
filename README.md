# MusArt — gestione pulizie

https://doci-git.github.io/calendario/

Web app statica per gestire le pulizie delle camere usando i calendari iCal Airbnb e
Booking. Lo staff continua a usare le schermate Pulizie e Calendario; l’area Admin,
disponibile dopo l’accesso, mostra calendario e riepiloghi.

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
- Le pulizie previste derivano dai check-out. Una camera produce al massimo una
  pulizia per data, anche con check-in nello stesso giorno o eventi duplicati nei
  due calendari. I blocchi riconoscibili dal testo iCal sono esclusi; un evento
  ambiguo può essere escluso dall’area Admin con **Segna blocco**. L’esclusione è
  condivisa con l’area Staff e resta salvata in Firestore.
- Il feed Booking può usare il testo generico “Not available” anche per un
  check-in valido. Per non perdere pulizie con cambio ospite nello stesso giorno,
  gli eventi Booking sono trattati come prenotazioni; eventuali blocchi Booking
  ambigui vanno esclusi dall’Admin.

Le impostazioni iCal restano nel documento `apps/pulizie`, leggibile dall’app per
consentire allo Staff la sincronizzazione. Come ogni applicazione statica che legge
iCal dal browser, i relativi URL non sono segreti rispetto a chi può usare l’app.
La password condivisa iniziale non sostituisce le regole di sicurezza Firebase.
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
   la sincronizzazione Airbnb/Booking e verifica il calendario e i riepiloghi.
