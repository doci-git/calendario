# calendario

## Sincronizzazione Firebase

Le impostazioni delle stanze e i link iCal vengono salvati su Cloud Firestore nel
documento `apps/pulizie`. L'accesso alle impostazioni nell'interfaccia usa il PIN
`1234`; non viene usato Firebase Authentication.

1. Crea il database Cloud Firestore.
2. Nelle regole Firestore consenti lettura e scrittura del solo documento usato dall'app:

   ```text
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /apps/pulizie {
         allow read, write: if true;
       }
     }
   }
   ```

3. Pubblica `index.html` su un hosting HTTPS, ad esempio Firebase Hosting.

**Attenzione:** il PIN `1234` è nel codice dell'app e protegge solo la schermata;
non protegge Firestore. Con queste regole chiunque conosca l'indirizzo del progetto
può leggere o modificare i link iCal nel documento `apps/pulizie`. Non usare questa
configurazione per dati che devono restare riservati.
