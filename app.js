(() => {
  const ACCESS_PASSWORD = '2244';
  const SESSION_KEY = 'musart_access_granted';
  const form = document.getElementById('accessForm');
  const input = document.getElementById('accessPassword');
  const error = document.getElementById('accessError');

  function unlock() {
    document.body.classList.remove('page-locked');
    document.getElementById('accessGate').remove();
  }

  if (sessionStorage.getItem(SESSION_KEY) === '1') unlock();
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (input.value !== ACCESS_PASSWORD) {
      error.hidden = false;
      input.select();
      return;
    }
    sessionStorage.setItem(SESSION_KEY, '1');
    unlock();
  });
})();

const [firebaseAppSdk, firestoreSdk, authSdk] = await Promise.all([
  import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),
  import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js'),
  import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js')
]);
const { initializeApp } = firebaseAppSdk;
const {
  doc,
  collection,
  deleteDoc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  runTransaction
} = firestoreSdk;
const {
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut
} = authSdk;

const firebaseApp = initializeApp({
  apiKey: 'AIzaSyCWBSF491f3qG6F7MNg4Qsiz0B_9h98Ce8',
  authDomain: 'calendario-690a0.firebaseapp.com',
  projectId: 'calendario-690a0',
  messagingSenderId: '510169773023',
  appId: '1:510169773023:web:fd4150eab5afa5960b8a6a'
});
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);
const settingsRef = doc(db, 'apps', 'pulizie');
const blockOverridesRef = collection(db, 'apps', 'pulizieAdmin', 'blocked');
const maintenanceReportsRef = collection(db, 'apps', 'pulizieAdmin', 'maintenanceReports');
const maintenancePhotosRef = collection(db, 'apps', 'pulizieAdmin', 'maintenancePhotos');
const cleaningArchiveRef = collection(db, 'apps', 'pulizieAdmin', 'cleaningArchive');
const stockProductsRef = collection(db, 'apps', 'pulizieAdmin', 'stockProducts');
const stockReportsRef = collection(db, 'apps', 'pulizieAdmin', 'stockReports');
const stockStatesRef = collection(db, 'apps', 'pulizieAdmin', 'stockStates');
const stockHistoryRef = collection(db, 'apps', 'pulizieAdmin', 'stockHistory');

/* ============================================================
   COSTANTI
============================================================ */
const ADMIN_EMAIL = 'docimusa@gmail.com';
const CLEANING_COST = 12;
const AUTO_UPDATE_MS = 60 * 60 * 1000;
const VISIBILITY_THRESHOLD_MS = 30 * 60 * 1000;
const STALE_MS = 90 * 60 * 1000;
const VERY_STALE_MS = 24 * 60 * 60 * 1000;
const DOOR_WORKER_URL = "https://calendario-open-door.docimusa.workers.dev/";

const GIORNI = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
              'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const MESI_BREVI = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
const DEFAULT_STOCK_PRODUCTS = [
  ['acqua', 'Acqua'],
  ['capsule-caffe', 'Capsule caffè'],
  ['carta-igienica', 'Carta igienica'],
  ['sapone-mani', 'Sapone mani'],
  ['shampoo-bagnoschiuma', 'Shampoo / bagnoschiuma'],
  ['detergente-bagno', 'Detergente bagno'],
  ['detergente-pavimenti', 'Detergente pavimenti'],
  ['sacchi-spazzatura', 'Sacchi spazzatura'],
  ['altri-prodotti', 'Altri prodotti']
];

const DEFAULT_ROOM = {
  name: 'Stanza',
  airbnb: '',
  booking: ''
};

const DEFAULT_SETTINGS = {
  rooms: [
    { ...DEFAULT_ROOM, name: 'Stanza 1' },
    { ...DEFAULT_ROOM, name: 'Stanza 2' },
    { ...DEFAULT_ROOM, name: 'Stanza 3' },
    { ...DEFAULT_ROOM, name: 'Stanza 4' }
  ],
  showGuestName: false,
  checkoutTime: '10:00',
  checkinTime: '15:00',
  proxy: 'https://api.allorigins.win/raw?url='
};

/* ============================================================
   STATO
============================================================ */
const state = {
  view: 'home',
  settings: null,
  events: [],
  detectedNames: {},
  blockOverrides: {},
  adminDate: toKey(new Date()),
  adminPeriod: 'week',
  adminTab: 'calendar',
  adminSummaryPeriod: 'week',
  adminSummaryDate: toKey(new Date()),
  adminArchiveRange: null,
  adminArchiveEntries: [],
  adminArchiveLoading: false,
  adminArchiveError: null,
  adminArchiveRequest: null,
  maintenanceFilter: 'open',
  expandedMaintenanceIds: new Set(),
  maintenanceReports: [],
  maintenancePhotoUrls: {},
  maintenancePhotoLoading: {},
  maintenancePhotoErrors: {},
  maintenanceError: null,
  stockProducts: [],
  stockReports: [],
  stockHistory: [],
  stockError: null,
  stockLoading: false,
  stockSelections: {},
  stockNote: '',
  stockCustomName: '',
  stockCustomStatus: 'low',
  stockAdminFilter: 'open',
  stockProductNameDrafts: {},
  staffAuthError: null,
  authError: null,
  isAdmin: false,
  lastUpdate: null,
  fetching: false,
  fetchProgress: { done: 0, total: 0 },
  errorMsg: null,
  lastErrorAt: null,
  cloudError: null,
  adminActionError: null,
  blockError: null
};

/* ============================================================
   PERSISTENZA
============================================================ */
function loadAll() {
  let rawSettings = null;
  try {
    rawSettings = JSON.parse(localStorage.getItem('pulizie_settings_v3') || 'null');
  } catch (e) {
    rawSettings = null;
  }
  const storedRooms = rawSettings && Array.isArray(rawSettings.rooms)
    ? rawSettings.rooms
    : [];
  const legacyGoogleRooms = storedRooms.map(
    r => r.source === 'google' || Boolean(r.google)
  );
  const hasLegacyRoomSettings = storedRooms.some(
    r => r.source !== undefined || r.google !== undefined
  );
  state.settings = normalizeSettings(rawSettings || DEFAULT_SETTINGS);
  if (hasLegacyRoomSettings) saveSettingsLS();

  try { state.events = JSON.parse(localStorage.getItem('pulizie_events') || '[]'); }
  catch (e) { state.events = []; }
  if (!Array.isArray(state.events)) state.events = [];
  const events = state.events.filter(e => e.source !== 'Google');
  if (events.length !== state.events.length) {
    state.events = events;
    localStorage.setItem('pulizie_events', JSON.stringify(state.events));
  }
  try { state.detectedNames = JSON.parse(localStorage.getItem('pulizie_detected') || '{}'); }
  catch (e) { state.detectedNames = {}; }
  if (legacyGoogleRooms.some(Boolean)) {
    legacyGoogleRooms.forEach((wasGoogle, i) => {
      if (wasGoogle) delete state.detectedNames[i];
    });
    saveDetectedLS();
  }

  state.lastUpdate = localStorage.getItem('pulizie_lastupdate') || null;
  state.lastErrorAt = localStorage.getItem('pulizie_lasterror') || null;
  try {
    state.blockOverrides = JSON.parse(localStorage.getItem('pulizie_blocked') || '{}');
  } catch {
    state.blockOverrides = {};
  }
}
function normalizeSettings(settings) {
  const normalized = Object.assign({}, DEFAULT_SETTINGS, settings, {
    rooms: Array.isArray(settings.rooms) ? settings.rooms : []
  });
  normalized.rooms = normalized.rooms.map(r => {
    const base = { ...DEFAULT_ROOM, ...r };
    delete base.source;
    delete base.google;
    if (typeof base.airbnb !== 'string') base.airbnb = '';
    if (typeof base.booking !== 'string') base.booking = '';
    if (!base.name) base.name = 'Stanza';
    return base;
  });
  while (normalized.rooms.length < 4) {
    normalized.rooms.push({ ...DEFAULT_ROOM, name: 'Stanza ' + (normalized.rooms.length + 1) });
  }
  return normalized;
}
async function loadCloudSettings() {
  const snapshot = await getDoc(settingsRef);
  if (snapshot.exists()) {
    const cloudSettings = snapshot.data().settings;
    if (!cloudSettings || typeof cloudSettings !== 'object') {
      throw new Error('Le impostazioni salvate su Firebase non sono valide.');
    }
    state.settings = normalizeSettings(cloudSettings);
  } else if (auth.currentUser && auth.currentUser.email === ADMIN_EMAIL &&
      auth.currentUser.emailVerified) {
    await setDoc(settingsRef, {
      settings: state.settings,
      updatedAt: serverTimestamp()
    });
  }
  saveSettingsLS();
}
async function saveCloudSettings() {
  await setDoc(settingsRef, {
    settings: state.settings,
    updatedAt: serverTimestamp()
  });
  state.cloudError = null;
}
function saveSettingsLS() { localStorage.setItem('pulizie_settings_v3', JSON.stringify(state.settings)); }
function saveDetectedLS() { localStorage.setItem('pulizie_detected', JSON.stringify(state.detectedNames)); }
async function loadBlockOverrides() {
  const snapshot = await getDocs(blockOverridesRef);
  const overrides = {};
  snapshot.forEach(item => {
    const data = item.data();
    if (Number.isInteger(data.roomId) && typeof data.date === 'string') {
      overrides[cleaningKey(data.roomId, data.date)] = data;
    }
  });
  state.blockOverrides = overrides;
  localStorage.setItem('pulizie_blocked', JSON.stringify(overrides));
  state.blockError = null;
}
async function saveBlockOverride(roomId, dateKey, blocked) {
  const id = cleaningKey(roomId, dateKey);
  if (blocked) {
    const data = {
      roomId,
      date: dateKey,
      updatedAt: serverTimestamp(),
      updatedBy: ADMIN_EMAIL
    };
    await setDoc(doc(db, 'apps', 'pulizieAdmin', 'blocked', id), data);
    state.blockOverrides[id] = data;
  } else {
    await deleteDoc(doc(db, 'apps', 'pulizieAdmin', 'blocked', id));
    delete state.blockOverrides[id];
  }
  localStorage.setItem('pulizie_blocked', JSON.stringify(state.blockOverrides));
}
let unsubscribeMaintenanceReports = null;
let unsubscribeStockProducts = null;
let unsubscribeStockReports = null;
let unsubscribeStockHistory = null;

function stopStockSubscriptions() {
  [unsubscribeStockProducts, unsubscribeStockReports, unsubscribeStockHistory]
    .forEach(unsubscribe => { if (unsubscribe) unsubscribe(); });
  unsubscribeStockProducts = null;
  unsubscribeStockReports = null;
  unsubscribeStockHistory = null;
}

function subscribeToStaffStockProducts() {
  stopStockSubscriptions();
  state.stockError = null;
  state.stockLoading = true;
  unsubscribeStockProducts = onSnapshot(
    query(stockProductsRef, where('active', '==', true)),
    snapshot => {
      state.stockProducts = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      })).sort((a, b) => a.name.localeCompare(b.name, 'it'));
      state.stockLoading = false;
      render();
    },
    error => {
      state.stockLoading = false;
      state.stockError = 'Impossibile caricare l’elenco prodotti: ' + error.message;
      render();
    }
  );
}

function subscribeToAdminStock() {
  stopStockSubscriptions();
  state.stockError = null;
  state.stockLoading = true;
  unsubscribeStockProducts = onSnapshot(stockProductsRef, snapshot => {
    state.stockProducts = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    })).sort((a, b) => a.name.localeCompare(b.name, 'it'));
    state.stockLoading = false;
    render();
  }, error => {
    state.stockLoading = false;
    state.stockError = 'Impossibile sincronizzare i prodotti: ' + error.message;
    render();
  });
  unsubscribeStockReports = onSnapshot(stockReportsRef, snapshot => {
    state.stockReports = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    })).sort((a, b) => stockTimestamp(b.updatedAt) - stockTimestamp(a.updatedAt));
    render();
  }, error => {
    state.stockError = 'Impossibile sincronizzare le segnalazioni scorte: ' + error.message;
    render();
  });
  unsubscribeStockHistory = onSnapshot(stockHistoryRef, snapshot => {
    state.stockHistory = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    })).sort((a, b) => stockTimestamp(b.restockedAt) - stockTimestamp(a.restockedAt));
    render();
  }, error => {
    state.stockError = 'Impossibile caricare lo storico rifornimenti: ' + error.message;
    render();
  });
}

function stockTimestamp(value) {
  return value && typeof value.toMillis === 'function' ? value.toMillis() : 0;
}

async function ensureDefaultStockProducts() {
  const existing = await Promise.all(DEFAULT_STOCK_PRODUCTS.map(([id]) =>
    getDoc(doc(stockProductsRef, id))
  ));
  const batch = writeBatch(db);
  let added = 0;
  existing.forEach((snapshot, index) => {
    if (snapshot.exists()) return;
    const [id, name] = DEFAULT_STOCK_PRODUCTS[index];
    batch.set(doc(stockProductsRef, id), {
      name,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    added++;
  });
  if (added) await batch.commit();
  await migrateStockStates();
}

async function migrateStockStates() {
  const reports = await getDocs(stockReportsRef);
  await Promise.all(reports.docs.map(reportSnapshot => {
    const reportRef = doc(stockReportsRef, reportSnapshot.id);
    const stateRef = doc(stockStatesRef, reportSnapshot.id);
    return runTransaction(db, async transaction => {
      const [currentReport, currentState] = await Promise.all([
        transaction.get(reportRef),
        transaction.get(stateRef)
      ]);
      if (!currentReport.exists() || currentState.exists()) return;
      const report = currentReport.data();
      if (report.status !== 'low' && report.status !== 'out') return;
      transaction.set(stateRef, {
        productId: report.productId,
        status: report.status,
        createdAt: report.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    });
  }));
}

function stockProductIdFromName(name) {
  const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 80);
  return `custom-${slug}`;
}

function normalizeStockProductName(name) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function submitStockReports(form) {
  if (!auth.currentUser || !auth.currentUser.isAnonymous) {
    throw new Error('Accesso staff non disponibile. Ricarica la pagina e riprova.');
  }
  const selected = state.stockProducts
    .map(product => ({
      product,
      status: state.stockSelections[product.id] || 'ok'
    }))
    .filter(item => item.status === 'low' || item.status === 'out');
  const customName = state.stockCustomName.trim();
  if (customName) {
    if (customName.length > 80) throw new Error('Il nome del prodotto aggiuntivo deve contenere al massimo 80 caratteri.');
    const matchingProduct = state.stockProducts.find(product =>
      normalizeStockProductName(product.name) === normalizeStockProductName(customName)
    );
    selected.push({
      product: matchingProduct
        ? { id: matchingProduct.id, name: matchingProduct.name, custom: false }
        : { id: stockProductIdFromName(customName), name: customName, custom: true },
      status: state.stockCustomStatus
    });
  }
  if (!selected.length) throw new Error('Seleziona almeno un prodotto da segnalare.');

  const note = state.stockNote.trim();
  if (note.length > 500) throw new Error('Le note devono contenere al massimo 500 caratteri.');
  const uniqueSelected = new Map();
  selected.forEach(item => {
    const current = uniqueSelected.get(item.product.id);
    const priority = status => status === 'out' ? 2 : 1;
    if (!current || priority(item.status) > priority(current.status)) {
      uniqueSelected.set(item.product.id, item);
    }
  });
  const reports = Array.from(uniqueSelected.values());
  await runTransaction(db, async transaction => {
    const stateRefs = reports.map(({ product }) => doc(stockStatesRef, product.id));
    const stateSnapshots = await Promise.all(stateRefs.map(stateRef => transaction.get(stateRef)));
    reports.forEach(({ product, status }, index) => {
      const stateSnapshot = stateSnapshots[index];
      const currentState = stateSnapshot.exists() ? stateSnapshot.data() : null;
      const finalStatus = currentState && currentState.status === 'out' && status === 'low'
        ? 'out'
        : status;
      const reportRef = doc(stockReportsRef, product.id);
      const reportedAt = currentState && currentState.status !== 'ok'
        ? currentState.createdAt
        : serverTimestamp();
      transaction.set(stateRefs[index], {
        productId: product.id,
        status: finalStatus,
        createdAt: reportedAt,
        updatedAt: serverTimestamp()
      }, { merge: true });
      transaction.set(reportRef, {
        productId: product.id,
        productName: product.name,
        custom: Boolean(product.custom),
        status: finalStatus,
        note,
        createdAt: reportedAt,
        updatedAt: serverTimestamp(),
        reportedBy: auth.currentUser.uid
      }, { merge: true });
    });
  });
  state.stockSelections = {};
  state.stockNote = '';
  state.stockCustomName = '';
  state.stockCustomStatus = 'low';
  form.reset();
}

async function markStockRestocked(report) {
  if (!state.isAdmin) throw new Error('Solo l’amministratore può segnare un prodotto come rifornito.');
  const reportRef = doc(stockReportsRef, report.id);
  const stateRef = doc(stockStatesRef, report.id);
  const historyRef = doc(stockHistoryRef);
  await runTransaction(db, async transaction => {
    const [currentSnapshot, stateSnapshot] = await Promise.all([
      transaction.get(reportRef),
      transaction.get(stateRef)
    ]);
    if (!currentSnapshot.exists()) throw new Error('La segnalazione non esiste più.');
    const current = currentSnapshot.data();
    if (current.status === 'restocked') return;
    if (!stateSnapshot.exists()) {
      transaction.set(stateRef, {
        productId: current.productId,
        status: 'ok',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      transaction.update(stateRef, {
        status: 'ok',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
    const restockedAt = serverTimestamp();
    transaction.update(reportRef, {
      status: 'restocked',
      restockedAt,
      restockedBy: auth.currentUser.uid,
      updatedAt: restockedAt
    });
    transaction.set(historyRef, {
      productId: current.productId,
      productName: current.productName,
      previousStatus: current.status,
      note: current.note || '',
      reportedAt: current.updatedAt || current.createdAt,
      restockedAt,
      restockedBy: auth.currentUser.uid
    });
  });
}

async function saveStockProduct(productId, name) {
  if (!state.isAdmin) throw new Error('Solo l’amministratore può gestire i prodotti.');
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 80) {
    throw new Error('Inserisci un nome prodotto da 1 a 80 caratteri.');
  }
  const productRef = productId
    ? doc(stockProductsRef, productId)
    : doc(stockProductsRef, stockProductIdFromName(cleanName));
  const knownCustomReport = state.stockReports.find(report =>
    report.custom && normalizeStockProductName(report.productName) === normalizeStockProductName(cleanName)
  );
  const targetRef = !productId && knownCustomReport
    ? doc(stockProductsRef, knownCustomReport.id)
    : productRef;
  await setDoc(targetRef, {
    name: cleanName,
    active: true,
    updatedAt: serverTimestamp()
  }, { merge: true });
  return targetRef.id;
}

async function setStockProductActive(productId, active) {
  if (!state.isAdmin) throw new Error('Solo l’amministratore può gestire i prodotti.');
  await updateDoc(doc(stockProductsRef, productId), {
    active,
    updatedAt: serverTimestamp()
  });
}

function subscribeToMaintenanceReports() {
  if (unsubscribeMaintenanceReports) unsubscribeMaintenanceReports();
  state.maintenanceError = null;
  unsubscribeMaintenanceReports = onSnapshot(maintenanceReportsRef, snapshot => {
    state.maintenanceReports = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    })).sort((a, b) => {
      const aTime = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
      const bTime = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
      return bTime - aTime;
    });
    state.maintenanceError = null;
    render();
  }, error => {
    state.maintenanceError = 'Impossibile aggiornare le segnalazioni: ' + error.message;
    render();
  });
}

async function loadMaintenancePhoto(reportId) {
  if (state.maintenancePhotoUrls[reportId] || state.maintenancePhotoLoading[reportId]) return;
  state.maintenancePhotoLoading[reportId] = true;
  delete state.maintenancePhotoErrors[reportId];
  render();
  try {
    const photoSnapshot = await getDoc(doc(maintenancePhotosRef, reportId));
    if (!photoSnapshot.exists()) throw new Error('La foto non è presente in Firestore.');
    const photoData = photoSnapshot.data().photoData;
    if (typeof photoData !== 'string' || !photoData.startsWith('data:image/jpeg;base64,')) {
      throw new Error('Il formato della foto salvata non è valido.');
    }
    state.maintenancePhotoUrls[reportId] = photoData;
  } catch (err) {
    state.maintenancePhotoErrors[reportId] = 'Impossibile caricare la foto da Firestore: ' + err.message;
  } finally {
    delete state.maintenancePhotoLoading[reportId];
    render();
  }
}

async function setMaintenanceResolved(report, resolved) {
  await updateDoc(doc(maintenanceReportsRef, report.id), {
    status: resolved ? 'resolved' : 'open',
    resolvedAt: resolved ? serverTimestamp() : null
  });
}

async function compressMaintenancePhoto(file) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Seleziona un file immagine valido.');
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error('La foto originale supera il limite di 20 MB.');
  }
  if (typeof createImageBitmap !== 'function') {
    throw new Error('Questo browser non supporta la compressione delle foto. Aggiorna il browser o invia la segnalazione senza foto.');
  }

  let image;
  try {
    image = await createImageBitmap(file);
  } catch {
    throw new Error('Il formato della foto non è supportato dal browser. Scegli una foto JPEG o PNG.');
  }
  try {
    if (image.width * image.height > 50000000) {
      throw new Error('La risoluzione della foto è troppo elevata.');
    }
    const scale = Math.min(1, 1024 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Impossibile preparare la foto su questo dispositivo.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.68, 0.5, 0.35]) {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (!blob) throw new Error('Non è stato possibile comprimere la foto.');
      if (blob.size <= 320 * 1024) return blob;
    }
    throw new Error('Non è stato possibile ridurre la foto sotto 320 KB. Scegli un’altra immagine.');
  } finally {
    image.close();
  }
}

function maintenancePhotoAsDataUrl(photo) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Non è stato possibile preparare la foto per Firestore.'));
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('Il formato della foto compressa non è valido.'));
    reader.readAsDataURL(photo);
  });
}

async function submitMaintenanceReport(form) {
  const submit = form.querySelector('[type="submit"]');
  const feedback = form.querySelector('[data-report-feedback]');
  if (form.dataset.submitting === '1') return;
  form.dataset.submitting = '1';
  submit.disabled = true;
  feedback.hidden = false;
  feedback.className = 'maintenance-upload-status';
  feedback.textContent = 'Invio segnalazione…';

  let photoDocRef = null;
  let photoSaved = false;
  try {
    const user = auth.currentUser;
    if (!user || (!user.isAnonymous &&
        !(user.email === ADMIN_EMAIL && user.emailVerified))) {
      throw new Error('Accesso staff non disponibile. Ricarica la pagina e riprova.');
    }

    const reportRef = doc(maintenanceReportsRef);
    let photoData = null;
    const file = form.elements.photo.files[0];
    if (file) {
      feedback.textContent = 'Riduzione e preparazione foto…';
      const photo = await compressMaintenancePhoto(file);
      photoData = await maintenancePhotoAsDataUrl(photo);
      if (photoData.length > 500000) {
        throw new Error('La foto compressa supera il limite per Firestore. Scegli un’altra immagine.');
      }
      photoDocRef = doc(maintenancePhotosRef, reportRef.id);
      feedback.textContent = 'Salvataggio foto su Firestore…';
      await setDoc(photoDocRef, {
        photoData,
        reportedBy: user.uid,
        createdAt: serverTimestamp()
      });
      photoSaved = true;
    }

    feedback.textContent = 'Salvataggio segnalazione…';
    await setDoc(reportRef, {
      roomId: Number(form.elements.roomId.value),
      category: form.elements.category.value,
      description: form.elements.description.value.trim(),
      priority: form.elements.priority.value,
      status: 'open',
      createdAt: serverTimestamp(),
      resolvedAt: null,
      photoAvailable: Boolean(photoData),
      reportedBy: user.uid
    });
    closeModal();
    toast('Segnalazione inviata');
  } catch (err) {
    let message = err.message || 'Errore imprevisto durante il salvataggio.';
    if (photoDocRef && photoSaved) {
      try {
        await deleteDoc(photoDocRef);
      } catch (cleanupError) {
        message += ` (La foto temporanea non è stata rimossa da Firestore: ${cleanupError.message})`;
      }
    }
    feedback.className = 'error-box';
    feedback.textContent = 'Invio non riuscito: ' + message;
  } finally {
    delete form.dataset.submitting;
    submit.disabled = false;
  }
}

/* ============================================================
   DATE
============================================================ */
function toKey(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
function fromKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}
function mondayOfWeek(d) {
  return addDays(d, -((d.getDay() + 6) % 7));
}
function dateRangeLabel(start, end) {
  return `${start.getDate()} ${MESI_BREVI[start.getMonth()]} – ${end.getDate()} ${MESI_BREVI[end.getMonth()]}`;
}
function cleaningKey(roomId, dateKey) { return `${roomId}_${dateKey}`; }
function shortDate(d) { return d.getDate() + ' ' + MESI_BREVI[d.getMonth()]; }
function formatCalendarDay(dateKey) {
  const date = fromKey(dateKey);
  return `${shortDate(date)} ${date.getFullYear()}`;
}
function formatTime(iso) {
  const d = new Date(iso);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function formatDateTime(iso) {
  const d = new Date(iso);
  return d.getDate() + ' ' + MESI_BREVI[d.getMonth()] + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function timeSince(isoString) {
  if (!isoString) return 'mai';
  const diff = Date.now() - new Date(isoString).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'adesso';
  if (min < 60) return min + ' min fa';
  const h = Math.floor(min / 60);
  if (h < 24) return h + 'h fa';
  return Math.floor(h / 24) + 'g fa';
}

/* ============================================================
   ESCAPE
============================================================ */
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
const escapeAttr = escapeHtml;

/* ============================================================
   PARSER iCAL
============================================================ */
function parseICS(text) {
  text = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').replace(/\r/g, '');
  const lines = text.split('\n');
  const events = [];
  let calName = null;
  let cur = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('X-WR-CALNAME:')) {
      calName = line.substring(13).trim();
      continue;
    }
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.substring(0, idx);
    const val = line.substring(idx + 1);
    const name = key.split(';')[0].toUpperCase();
    if (name === 'DTSTART') cur.start = extractDate(val);
    else if (name === 'DTEND') cur.end = extractDate(val);
    else if (name === 'SUMMARY') cur.summary = val.replace(/\\([\\;,])/g, '$1');
    else if (name === 'STATUS') cur.status = val.toUpperCase();
  }
  return {
    events: events.filter(e => e.start && e.end && e.status !== 'CANCELLED'),
    calName
  };
}
function extractDate(val) {
  const m = String(val).trim().match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}
function isBlockedEvent(event) {
  if (event.source === 'Booking') return false;

  const summary = String(event.summary || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  return /\b(not available|unavailable|blocked|not bookable|unbookable|closed|non disponibile|non prenotabile|bloccato|bloccata|date bloccate|chiuso|chiusa)\b/.test(summary);
}
function isReservationEvent(event) {
  return event.status !== 'CANCELLED' && !isBlockedEvent(event);
}
function deduplicateEvents(events) {
  const byStay = new Map();
  for (const event of events) {
    const key = `${event.roomId}|${event.start}|${event.end}`;
    const current = byStay.get(key);
    if (!current || (!isReservationEvent(current) && isReservationEvent(event))) {
      byStay.set(key, event);
    }
  }
  return Array.from(byStay.values());
}
function retainEventsFromFailedFeeds(events, cachedEvents, failedTasks) {
  const failedFeeds = new Set(failedTasks.map(task => `${task.roomId}|${task.sourceTag}`));
  return [
    ...events,
    ...cachedEvents.filter(event => failedFeeds.has(`${event.roomId}|${event.source}`))
  ];
}

/* ============================================================
   FETCH iCal (con timeout)
============================================================ */
async function fetchICS(url) {
  const proxy = (state.settings.proxy || '').trim();

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 20000);

  try {
    let target = url;
    if (proxy) {
      let proxyUrl;
      try {
        proxyUrl = new URL(proxy);
      } catch {
        throw new Error('URL del proxy non valido');
      }
      proxyUrl.searchParams.set('url', url);
      target = proxyUrl.toString();
    }

    const res = await fetch(target, { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      const responseText = await res.text();
      if (/invalid token/i.test(responseText)) {
        throw new Error('Token Booking non valido o scaduto: rigenera il link iCal in Booking e aggiornalo nelle impostazioni.');
      }
      throw new Error('HTTP ' + res.status);
    }
    const text = await res.text();
    if (!text.includes('BEGIN:VCALENDAR')) {
      if (text.includes('<html') || text.includes('<!DOCTYPE')) {
        throw new Error('Il server ha restituito una pagina HTML (URL non valido o protetto?)');
      }
      throw new Error('Risposta non valida (non è un iCal)');
    }
    return text;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('Timeout (20s)');
    if (/Failed to fetch/i.test(err.message)) {
      throw new Error('Errore di rete / CORS bloccato');
    }
    throw err;
  }
}

/* ============================================================
   COSTRUZIONE TASK PER STANZA
============================================================ */
function buildTasksForRoom(room, roomId) {
  const tasks = [];

  if (room.airbnb && room.airbnb.trim()) {
    tasks.push({
      roomId,
      url: room.airbnb.trim(),
      label: room.name + ' · Airbnb',
      sourceTag: 'Airbnb'
    });
  }
  if (room.booking && room.booking.trim()) {
    tasks.push({
      roomId,
      url: room.booking.trim(),
      label: room.name + ' · Booking',
      sourceTag: 'Booking'
    });
  }

  return tasks;
}

/* ============================================================
   REFRESH
============================================================ */
async function refreshAll() {
  if (state.fetching) return;

  try {
    await loadBlockOverrides();
  } catch (err) {
    state.blockError = 'Impossibile aggiornare i blocchi salvati su Firebase: ' + err.message;
  }

  if (state.view === 'settings' && state.isAdmin) {
    try {
      await saveSettingsFromForm();
    } catch (err) {
      state.cloudError = 'Impossibile salvare le impostazioni su Firebase: ' + err.message;
      render();
      return;
    }
  }

  const rooms = state.settings.rooms;
  const tasks = [];
  rooms.forEach((room, i) => {
    tasks.push(...buildTasksForRoom(room, i));
  });

  if (tasks.length === 0) {
    state.errorMsg = null;
    state.fetching = false;
    render();
    return;
  }

  state.fetching = true;
  state.fetchProgress = { done: 0, total: tasks.length };
  state.errorMsg = null;
  render();

  const collected = [];
  const errors = [];
  const failedTasks = [];
  const cachedEvents = state.events;
  const newDetected = {};

  for (const task of tasks) {
    try {
      const text = await fetchICS(task.url);
      const parsed = parseICS(text);
      for (const e of parsed.events) {
        collected.push({
          roomId: task.roomId,
          start: e.start,
          end: e.end,
          summary: e.summary || '',
          status: e.status || '',
          source: task.sourceTag
        });
      }
      if (parsed.calName) {
        newDetected[task.roomId] = parsed.calName;
      }
    } catch (err) {
      errors.push(`${task.label}: ${err.message}`);
      failedTasks.push(task);
    }
    state.fetchProgress.done++;
    render();
  }

  state.events = deduplicateEvents(
    retainEventsFromFailedFeeds(collected, cachedEvents, failedTasks)
  );

  Object.assign(state.detectedNames, newDetected);
  saveDetectedLS();

  state.lastUpdate = new Date().toISOString();
  localStorage.setItem('pulizie_events', JSON.stringify(state.events));
  localStorage.setItem('pulizie_lastupdate', state.lastUpdate);

  if (errors.length) {
    state.errorMsg = errors.join('\n');
    state.lastErrorAt = new Date().toISOString();
    localStorage.setItem('pulizie_lasterror', state.lastErrorAt);
  } else {
    state.errorMsg = null;
    state.lastErrorAt = null;
    localStorage.removeItem('pulizie_lasterror');
  }

  if (state.isAdmin) {
    try {
      await persistCleaningArchive(failedTasks);
    } catch (err) {
      state.adminArchiveError = 'Impossibile salvare lo storico delle pulizie: ' + err.message;
    }
  }

  state.fetching = false;
  render();
}

/* ============================================================
   LOGICA PULIZIE
============================================================ */
function getCleaningsForDate(dateKey) {
  const res = [];
  const n = state.settings.rooms.length;
  for (let r = 0; r < n; r++) {
    if (state.blockOverrides[cleaningKey(r, dateKey)]) continue;
    const evs = state.events.filter(e => e.roomId === r);
    const outEv = getCheckoutEvent(evs, dateKey);
    if (!outEv) continue;
    const inEv = evs.find(e => e.start === dateKey && isReservationEvent(e));
    res.push({
      roomId: r,
      hasCheckin: !!inEv,
      guestOut: outEv.summary || '',
      guestIn: inEv ? (inEv.summary || '') : '',
      source: outEv.source || ''
    });
  }
  return res;
}

function getCheckoutEvent(events, dateKey) {
  const checkout = events.find(e => e.end === dateKey && isReservationEvent(e));
  if (checkout) return checkout;

  const hasBookingCheckin = events.some(
    e => e.source === 'Booking' && e.start === dateKey && isReservationEvent(e)
  );
  if (!hasBookingCheckin) return undefined;

  return events.find(
    e => e.source === 'Airbnb' && e.end === dateKey && isBlockedEvent(e)
  );
}

function getRoomStatus(roomId, dateKey) {
  const evs = state.events.filter(e => e.roomId === roomId);
  const reservations = evs.filter(isReservationEvent);
  const checkin  = reservations.some(e => e.start === dateKey);
  const checkout = !state.blockOverrides[cleaningKey(roomId, dateKey)] &&
    Boolean(getCheckoutEvent(evs, dateKey));
  const occupied = evs.some(e => e.start <= dateKey && dateKey < e.end);
  if (checkout && checkin) return 'both';
  if (checkout) return 'checkout';
  if (occupied) return 'occupied';
  return 'free';
}

function statusIcon(s) {
  if (s === 'both') return '⚠️';
  if (s === 'checkout') return '🧹';
  if (s === 'occupied') return '🟢';
  return '○';
}
function statusClass(s) {
  if (s === 'both') return 'both';
  if (s === 'checkout') return 'checkout';
  if (s === 'occupied') return 'occupied';
  return 'free';
}
function statusLabel(s) {
  if (s === 'both') return 'Check-out + Nuovo check-in';
  if (s === 'checkout') return 'Check-out / Pulizia';
  if (s === 'occupied') return 'Occupata';
  return 'Libera';
}
function cleanGuestName(summary) {
  if (!summary) return null;
  const s = summary.trim();
  if (!s) return null;
  if (/^(reserved|not available|blocked|closed|unavailable|airbnb|booking\.?com?|n\/a)$/i.test(s)) return null;
  if (/not available|blocked|reserved|closed/i.test(s)) return null;
  return s;
}
function shortName(name) {
  const m = String(name).match(/\d+/);
  if (m) return m[0];
  return String(name).substring(0, 3);
}

/* ============================================================
   SYNC STATUS
============================================================ */
function computeSyncStatus() {
  if (state.fetching) return { dot: 'loading', text: `⟳ ${state.fetchProgress.done}/${state.fetchProgress.total}` };
  if (state.errorMsg && state.lastErrorAt) return { dot: 'err', text: '⚠️ errore' };
  if (!state.lastUpdate) return { dot: '', text: '' };
  const age = Date.now() - new Date(state.lastUpdate).getTime();
  if (age < STALE_MS) return { dot: 'ok', text: '✓ sincronizzato' };
  if (age < VERY_STALE_MS) return { dot: 'stale', text: '⏱ ' + timeSince(state.lastUpdate) };
  return { dot: 'err', text: '⏱ ' + timeSince(state.lastUpdate) };
}

/* ============================================================
   RENDER
============================================================ */
function render() {
  if (!state.isAdmin && (state.view === 'admin' || state.view === 'settings')) {
    state.view = 'home';
  }
  const sync = computeSyncStatus();
  document.getElementById('syncDot').className = 'sync-dot ' + sync.dot;

  const lu = document.getElementById('lastUpdate');
  if (state.fetching) {
    lu.textContent = `Aggiornamento in corso… (${state.fetchProgress.done}/${state.fetchProgress.total})`;
  } else {
    lu.textContent = 'Ultimo aggiornamento: ' +
      (state.lastUpdate ? formatTime(state.lastUpdate) : '—');
  }
  document.getElementById('syncStatus').textContent = sync.text;

  document.getElementById('refreshIcon').className = state.fetching ? 'spin' : '';
  document.getElementById('lockBtn').textContent = state.isAdmin ? '🔓' : '🔒';

  renderNav();

  const main = document.getElementById('main');
  if (state.view === 'home') main.innerHTML = viewHome();
  else if (state.view === 'calendar') main.innerHTML = viewCalendar();
  else if (state.view === 'stock') main.innerHTML = viewStaffStock();
  else if (state.view === 'admin') main.innerHTML = viewAdmin();
  else if (state.view === 'settings') main.innerHTML = viewSettings();
  if (state.cloudError) {
    main.insertAdjacentHTML('afterbegin',
      `<div class="error-box">⚠️ <strong>Sincronizzazione Firebase</strong><br>${escapeHtml(state.cloudError)}</div>`);
  }
  if (state.blockError) {
    main.insertAdjacentHTML('afterbegin',
      `<div class="error-box">⚠️ <strong>Blocchi calendario</strong><br>${escapeHtml(state.blockError)}</div>`);
  }
}

function renderNav() {
  const items = [
    { id:'home',     icon:'🏠', label:'Pulizie' },
    { id:'calendar', icon:'📅', label:'Calendario' }
  ];
  if (state.isAdmin) {
    items.push({ id:'admin', icon:'📋', label:'Admin' });
    items.push({ id:'settings', icon:'⚙️', label:'Impostazioni' });
  } else {
    items.push({ id:'stock', icon:'📦', label:'Scorte' });
  }

  document.getElementById('nav').innerHTML = items.map(it => `
    <button class="nav-btn ${state.view === it.id ? 'active' : ''}" data-view="${it.id}">
      <span class="nav-icon">${it.icon}</span>
      <span class="nav-label">${it.label}</span>
    </button>
  `).join('');
}

/* ============================================================
   HOME
============================================================ */
function viewHome() {
  const today = new Date();
  const days = [];
  for (let i = 0; i < 3; i++) days.push(addDays(today, i));

  const cToday = getCleaningsForDate(toKey(days[0]));
  const cTom   = getCleaningsForDate(toKey(days[1]));
  const cAfter = getCleaningsForDate(toKey(days[2]));

  let html = '';

  html += `<div class="dashboard">
    <div class="stat">
      <div class="stat-num">${cToday.length}</div>
      <div class="stat-lbl">Pulizie oggi</div>
      <div class="stat-date">${shortDate(days[0])}</div>
    </div>
    <div class="stat">
      <div class="stat-num">${cTom.length}</div>
      <div class="stat-lbl">Pulizie domani</div>
      <div class="stat-date">${shortDate(days[1])}</div>
    </div>
    <div class="stat">
      <div class="stat-num">${cAfter.length}</div>
      <div class="stat-lbl">Dopodomani</div>
      <div class="stat-date">${shortDate(days[2])}</div>
    </div>
    <button class="stat wide door-open-btn" type="button" data-action="openDoor">
      <span class="door-open-icon" aria-hidden="true">🚪</span>
      <span class="door-open-label">Apri la porta</span>
    </button>
  </div>`;

  if (state.fetching && state.fetchProgress.total > 0) {
    html += `<div class="empty">⏳ Aggiornamento calendari… (${state.fetchProgress.done}/${state.fetchProgress.total})</div>`;
  }

  if (state.errorMsg) {
    html += `<div class="error-box">⚠️ <strong>Errori recupero calendari</strong><br>${
      escapeHtml(state.errorMsg).replace(/\n/g, '<br>')}
      <br><br><em>Se vedi "CORS bloccato" o "Errore di rete", prova a impostare un proxy diverso in Impostazioni o configura un Cloudflare Worker personale.</em>
    </div>`;
  }

  const noUrls = state.settings.rooms.every(r => {
    return !r.airbnb && !r.booking;
  });

  if (noUrls) {
    html += `<div class="empty">
      Nessun calendario configurato.<br><br>
      ${state.isAdmin
        ? 'Vai su <strong>⚙️ Impostazioni</strong> per configurare le fonti dei calendari.'
        : 'Contatta l\'amministratore per configurare i calendari.'}
    </div>`;
    return html;
  }

  days.forEach((d, idx) => {
    const dk = toKey(d);
    const cleanings = getCleaningsForDate(dk);

    html += `<div class="day-block">`;
    html += `<div class="day-header">${dayLabel(d, idx)}</div>`;

    if (cleanings.length === 0) {
      html += `<div class="no-clean">Nessuna pulizia prevista</div>`;
    } else {
      cleanings.forEach(c => { html += renderCleaningCard(dk, c); });
    }
    html += `</div>`;
  });

  return html;
}

function dayLabel(d, idx) {
  const base =
    idx === 0 ? 'OGGI' :
    idx === 1 ? 'DOMANI' :
    idx === 2 ? 'DOPODOMANI' :
    GIORNI[d.getDay()].toUpperCase();
  return `${base} — ${d.getDate()} ${MESI[d.getMonth()].toUpperCase()}`;
}

function renderCleaningCard(dk, c) {
  const room = state.settings.rooms[c.roomId];
  const both = c.hasCheckin;

  let cls = 'clean-card';
  if (both) cls += ' both';

  const guest = state.settings.showGuestName ? cleanGuestName(c.guestOut) : null;
  const srcBadge = c.source
    ? `<span class="src-badge direct">${escapeHtml(c.source)}</span>`
    : '';

  return `
  <div class="${cls} staff-cleaning-row">
    <div class="staff-cleaning-content">
      <div class="cc-top">
        <div class="cc-room">🧹 ${escapeHtml(room.name.toUpperCase())}${srcBadge}</div>
      </div>
      <div class="cc-info">Check-out: ${escapeHtml(state.settings.checkoutTime)}</div>
      ${both ? `<div class="cc-both">⚠️ CHECK-OUT + NUOVO CHECK-IN (${escapeHtml(state.settings.checkinTime)})</div>` : ''}
      ${guest ? `<div class="cc-guest">👤 ${escapeHtml(guest)}</div>` : ''}
    </div>
    <button class="report-issue-btn" data-action="newMaintenanceReport"
      data-room="${c.roomId}">🔧 Segnala problema</button>
  </div>`;
}

/* ============================================================
   CALENDARIO
============================================================ */
function viewCalendar() {
  const today = new Date();
  const days = [];
  for (let i = 0; i < 15; i++) days.push(addDays(today, i));

  let html = `<div class="view-title">📅 Prossimi 15 giorni</div>`;
  html += `<div class="cal-wrap"><div class="cal-grid">`;

  html += `<div class="cal-cell cal-head">Data</div>`;
  state.settings.rooms.forEach(r => {
    html += `<div class="cal-cell cal-head">${escapeHtml(shortName(r.name))}</div>`;
  });

  days.forEach((d, idx) => {
    const dk = toKey(d);
    const isToday = idx === 0;
    html += `<div class="cal-cell cal-date ${isToday ? 'today' : ''}">
      ${d.getDate()} ${MESI_BREVI[d.getMonth()]}
    </div>`;

    for (let r = 0; r < state.settings.rooms.length; r++) {
      const st = getRoomStatus(r, dk);
      const needsCleaning = st === 'checkout' || st === 'both';
      html += `<div class="cal-cell cal-status ${needsCleaning ? 'needs-cleaning' : 'no-cleaning'} ${isToday ? 'today' : ''}"
        data-action="detail" data-room="${r}" data-date="${dk}">${needsCleaning ? '🧹' : ''}</div>`;
    }
  });

  html += `</div></div>`;

  html += `<div class="legend">
    <div><span class="lg">🟩</span> Da pulire</div>
    <div><span class="lg">⬜</span> Nessuna pulizia</div>
  </div>`;

  html += `<div class="footer-note">Tocca una casella per vedere il dettaglio della giornata.</div>`;

  return html;
}

function viewStaffStock() {
  const statusLabels = { ok: 'OK', low: 'Sta finendo', out: 'Finito' };
  let html = '<div class="view-title">📦 Segnala prodotti</div>';
  if (state.stockError) {
    html += `<div class="error-box">${escapeHtml(state.stockError)}</div>`;
  }
  if (state.stockLoading && !state.stockProducts.length) {
    return html + '<div class="empty">Caricamento prodotti…</div>';
  }
  if (!state.stockProducts.length) {
    return html + `<div class="empty">${state.isAdmin
      ? 'Nessun prodotto attivo. Aggiungi i prodotti dalla scheda Scorte dell’Admin.'
      : 'Elenco prodotti non ancora disponibile. Riprova tra poco o avvisa l’amministratore.'}</div>`;
  }

  html += `<form class="card" data-stock-report-form>
    <div class="card-sub">Seleziona solo i prodotti da acquistare. Non inserire quantità o camere.</div>
    ${state.stockProducts.map(product => {
      const selected = state.stockSelections[product.id] || 'ok';
      return `<div class="stock-product-card">
        <div class="stock-report-name">${escapeHtml(product.name)}</div>
        <div class="stock-choice-row">
          ${['ok', 'low', 'out'].map(status => `<button type="button"
            class="stock-choice ${selected === status ? `selected-${status}` : ''}"
            data-action="stockSelect" data-product-id="${escapeAttr(product.id)}"
            data-stock-status="${status}" aria-pressed="${selected === status}">
            ${statusLabels[status]}
          </button>`).join('')}
        </div>
      </div>`;
    }).join('')}
    <div class="section-title">Prodotto non presente?</div>
    <div class="stock-custom-fields">
      <input class="inp" name="stockCustomName" type="text" maxlength="80"
        placeholder="Nome prodotto (facoltativo)" value="${escapeAttr(state.stockCustomName)}">
      <select class="inp" name="stockCustomStatus" aria-label="Stato prodotto aggiuntivo">
        <option value="low" ${state.stockCustomStatus === 'low' ? 'selected' : ''}>Sta finendo</option>
        <option value="out" ${state.stockCustomStatus === 'out' ? 'selected' : ''}>Finito</option>
      </select>
    </div>
    <label class="lbl" for="stockStaffNote">Note (facoltative)</label>
    <textarea class="inp stock-form-note" id="stockStaffNote" name="stockNote"
      maxlength="500" placeholder="Aggiungi una nota per l’amministratore">${escapeHtml(state.stockNote)}</textarea>
    <div class="maintenance-upload-status" data-stock-feedback hidden></div>
    <button class="btn btn-primary" type="submit" ${state.stockLoading ? 'disabled' : ''}>
      ${state.stockLoading ? 'Invio in corso…' : 'Invia segnalazione'}
    </button>
  </form>`;
  return html;
}

/* ============================================================
   AREA ADMIN
============================================================ */
function getAdminEntriesForDate(dateKey) {
  const completed = dateKey < toKey(new Date());
  const entries = getCleaningsForDate(dateKey).map(cleaning => ({
      ...cleaning,
      completed,
      blocked: false
    }));

  Object.values(state.blockOverrides).forEach(override => {
    if (override.date !== dateKey || entries.some(entry => entry.roomId === override.roomId)) return;
    const hasCheckout = state.events.some(
      event => event.roomId === override.roomId && event.end === dateKey
    );
    if (hasCheckout) {
      entries.push({
        roomId: override.roomId,
        completed: false,
        blocked: true
      });
    }
  });
  return entries.sort((a, b) => a.roomId - b.roomId);
}

function getAdminSummary(start, end) {
  const summary = { planned: 0, completed: 0 };
  for (let date = new Date(start); date < end; date = addDays(date, 1)) {
    getAdminEntriesForDate(toKey(date)).forEach(entry => {
      if (entry.blocked && !entry.completed) return;
      summary.planned++;
      if (entry.completed) summary.completed++;
    });
  }
  return summary;
}

async function commitCleaningArchive(writes) {
  for (let offset = 0; offset < writes.length; offset += 400) {
    const batch = writeBatch(db);
    writes.slice(offset, offset + 400).forEach(write => {
      if (write.delete) batch.delete(write.ref);
      else batch.set(write.ref, write.data);
    });
    await batch.commit();
  }
}

function sameArchivedEntries(a, b) {
  return Array.isArray(a) && a.length === b.length &&
    a.every((entry, index) => entry.roomId === b[index].roomId);
}

function mergeArchivedEntries(archivedEntries, liveEntries, syncedRooms) {
  const entriesByRoom = new Map();
  (Array.isArray(archivedEntries) ? archivedEntries : []).forEach(entry => {
    if (Number.isInteger(entry.roomId) && !syncedRooms.has(entry.roomId)) {
      entriesByRoom.set(entry.roomId, { roomId: entry.roomId });
    }
  });
  liveEntries.forEach(entry => {
    if (syncedRooms.has(entry.roomId)) entriesByRoom.set(entry.roomId, entry);
  });
  return Array.from(entriesByRoom.values()).sort((a, b) => a.roomId - b.roomId);
}

function mergeHistoricalEntries(archivedEntries, liveEntries) {
  const entriesByRoom = new Map();
  [...(Array.isArray(archivedEntries) ? archivedEntries : []), ...liveEntries]
    .forEach(entry => {
      if (Number.isInteger(entry.roomId)) {
        entriesByRoom.set(entry.roomId, { roomId: entry.roomId });
      }
    });
  return Array.from(entriesByRoom.values()).sort((a, b) => a.roomId - b.roomId);
}

async function persistCleaningArchive(failedTasks) {
  if (!state.isAdmin) return;

  const today = toKey(new Date());
  const yesterday = toKey(addDays(fromKey(today), -1));
  const failedFeeds = new Set(failedTasks.map(task => `${task.roomId}|${task.sourceTag}`));
  const syncedRooms = new Set();
  state.settings.rooms.forEach((room, roomId) => {
    const tasks = buildTasksForRoom(room, roomId);
    if (tasks.length && tasks.every(task => !failedFeeds.has(`${roomId}|${task.sourceTag}`))) {
      syncedRooms.add(roomId);
    }
  });

  const liveEntriesByDate = new Map();
  const eventDates = new Set(state.events.map(event => event.end));
  for (const date of eventDates) {
    const entries = getCleaningsForDate(date)
      .map(entry => ({ roomId: entry.roomId }))
      .sort((a, b) => a.roomId - b.roomId);
    if (entries.length) liveEntriesByDate.set(date, entries);
  }

  const futureSnapshot = await getDocs(query(cleaningArchiveRef, where('date', '>=', yesterday)));
  const archivedByDate = new Map(futureSnapshot.docs.map(item => [item.id, item.data()]));
  const writes = [];

  const pastDates = new Set([
    ...Array.from(eventDates).filter(date => date < today),
    ...Array.from(archivedByDate.keys()).filter(date => date >= yesterday && date < today)
  ]);
  const pastWrites = await Promise.all(Array.from(pastDates)
    .map(async date => {
      const archiveRef = doc(cleaningArchiveRef, date);
      let existing = archivedByDate.get(date);
      if (!existing) {
        const snapshot = await getDoc(archiveRef);
        if (snapshot.exists()) existing = snapshot.data();
      }
      const entries = mergeHistoricalEntries(
        existing && existing.entries,
        liveEntriesByDate.get(date) || []
      );
      if (!entries.length) {
        if (!existing || existing.completed === true) return null;
      }
      if (existing && existing.completed === true &&
          sameArchivedEntries(existing.entries, entries)) return null;
      return {
        ref: archiveRef,
        data: {
          date,
          entries,
          completed: true,
          updatedAt: serverTimestamp()
        }
      };
    }));
  writes.push(...pastWrites.filter(Boolean));

  const futureDates = new Set([
    ...Array.from(archivedByDate.keys()),
    ...Array.from(liveEntriesByDate.keys()).filter(date => date >= today)
  ]);
  for (const date of futureDates) {
    const existing = archivedByDate.get(date);
    if (date < today) continue;

    const priorEntries = existing && Array.isArray(existing.entries) ? existing.entries : [];
    const entries = mergeArchivedEntries(
      priorEntries,
      liveEntriesByDate.get(date) || [],
      syncedRooms
    );
    const archiveRef = doc(cleaningArchiveRef, date);
    if (!entries.length) {
      if (existing) writes.push({ ref: archiveRef, delete: true });
    } else if (!existing || existing.completed !== false ||
        !sameArchivedEntries(existing.entries, entries)) {
      writes.push({
        ref: archiveRef,
        data: { date, entries, completed: false, updatedAt: serverTimestamp() }
      });
    }
  }

  await commitCleaningArchive(writes);
  if (writes.length) {
    state.adminArchiveRange = null;
    state.adminArchiveEntries = [];
    state.adminArchiveLoading = false;
    state.adminArchiveRequest = null;
  }
  state.adminArchiveError = null;
}

function ensureAdminArchiveLoaded(start, end) {
  const startKey = toKey(start);
  const today = toKey(new Date());
  const archiveEnd = end < fromKey(today) ? end : fromKey(today);
  if (start >= archiveEnd) return null;

  const endKey = toKey(archiveEnd);
  const key = `${startKey}|${endKey}`;
  if (state.adminArchiveRange === key || state.adminArchiveRequest === key) return;

  state.adminArchiveRequest = key;
  state.adminArchiveLoading = true;
  state.adminArchiveError = null;
  getDocs(query(
    cleaningArchiveRef,
    where('date', '>=', startKey),
    where('date', '<', endKey)
  )).then(snapshot => {
    if (state.adminArchiveRequest !== key) return;
    state.adminArchiveEntries = snapshot.docs.map(item => item.data());
    state.adminArchiveRange = key;
    state.adminArchiveLoading = false;
    state.adminArchiveRequest = null;
    render();
  }).catch(error => {
    if (state.adminArchiveRequest !== key) return;
    state.adminArchiveLoading = false;
    state.adminArchiveRequest = null;
    state.adminArchiveError = 'Impossibile caricare lo storico delle pulizie: ' + error.message;
    render();
  });
  return key;
}

function renderAdminStats(summary, monthly) {
  const tiles = monthly
    ? [
      ['Pulizie previste', summary.planned],
      ['Pulizie effettuate', summary.completed],
      ['Costo staff', formatCurrency(summary.completed * CLEANING_COST)],
      ['Cambi biancheria', summary.planned]
    ]
    : [
      ['Pulizie previste', summary.planned],
      ['Costo pulizie', formatCurrency(summary.planned * CLEANING_COST)],
      ['Cambi biancheria', summary.planned]
    ];
  return `<div class="admin-summary ${monthly ? 'monthly' : ''}">
    ${tiles.map(([label, value]) => `<div class="stat">
      <div class="stat-num">${value}</div>
      <div class="stat-lbl">${label}</div>
    </div>`).join('')}
  </div>`;
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(amount);
}

function adminControls(date, monthly, target) {
  const monthInput = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  return `<div class="admin-calendar-nav">
    <button class="btn btn-outline" data-action="adminPrevious" data-period-target="${target}"
      aria-label="Periodo precedente">‹</button>
    <div class="admin-period">
      ${monthly
        ? `<input class="inp admin-month-input" type="month" value="${monthInput}"
            data-admin-month="${target}">`
        : ''}
      <div class="admin-note">${monthly
        ? `${MESI[date.getMonth()]} ${date.getFullYear()}`
        : `Settimana ${dateRangeLabel(mondayOfWeek(date), addDays(mondayOfWeek(date), 6))}`}</div>
    </div>
    <button class="btn btn-outline" data-action="adminNext" data-period-target="${target}"
      aria-label="Periodo successivo">›</button>
  </div>`;
}

function getOpenMaintenanceForRoom(roomId) {
  return state.maintenanceReports.find(report =>
    report.roomId === roomId && report.status === 'open'
  );
}

function renderMaintenanceIndicator(roomId) {
  const report = getOpenMaintenanceForRoom(roomId);
  if (!report) return '';
  return `<button class="maintenance-indicator" data-action="openMaintenance"
    data-report-id="${escapeAttr(report.id)}" aria-label="Apri manutenzione aperta">🔧</button>`;
}

function renderAdminCleaning(dateKey, entry) {
  const room = state.settings.rooms[entry.roomId];
  if (!room) return '';
  const classes = ['admin-cleaning'];
  if (entry.completed) classes.push('done');
  else if (entry.blocked) classes.push('blocked');

  let actionButtons = '';
  if (entry.blocked) {
    actionButtons += `<button class="btn btn-block" data-action="toggleBlock"
      data-room="${entry.roomId}" data-date="${dateKey}">Ripristina pulizia</button>`;
  } else {
    actionButtons += `<button class="btn btn-block" data-action="toggleBlock"
        data-room="${entry.roomId}" data-date="${dateKey}">Segna blocco</button>`;
  }

  const status = entry.completed ? '✅ Effettuata' :
    entry.blocked ? '⛔ Blocco escluso' : 'Da effettuare';
  return `<div class="${classes.join(' ')}">
    <div class="admin-cleaning-top">
      <span>🧹 ${escapeHtml(room.name)} ${renderMaintenanceIndicator(entry.roomId)}</span>
      <span class="admin-cleaning-state">${status}</span>
    </div>
    <div class="admin-cleaning-actions">${actionButtons}</div>
  </div>`;
}

function renderAdminDay(dateKey) {
  const entries = getAdminEntriesForDate(dateKey);
  if (!entries.length) return '<div class="no-clean">Nessuna pulizia prevista</div>';
  return entries.map(entry => renderAdminCleaning(dateKey, entry)).join('');
}

function renderAdminWeekDay(dateKey, entries) {
  const date = fromKey(dateKey);
  const roomLabel = entries.length === 1 ? '1 camera' : `${entries.length} camere`;
  const rooms = entries.map(entry => {
    const room = state.settings.rooms[entry.roomId];
    if (!room) return '';
    const status = entry.blocked ? 'Blocco escluso' :
      entry.completed ? 'Effettuata' : 'Da effettuare';
    const action = entry.blocked ? 'Ripristina pulizia' : 'Segna blocco';
    const rowClass = entry.blocked ? 'blocked' : entry.completed ? 'done' : '';
    return `<div class="admin-week-room ${rowClass}">
      <span class="admin-week-room-name">🧹 ${escapeHtml(room.name)} ${renderMaintenanceIndicator(entry.roomId)}</span>
      <span class="admin-week-room-state">${status}</span>
      <button class="btn btn-block" data-action="toggleBlock"
        data-room="${entry.roomId}" data-date="${dateKey}">${action}</button>
    </div>`;
  }).join('');

  return `<div class="admin-week-day">
    <div class="admin-week-heading">
      <span>${GIORNI[date.getDay()].toUpperCase()} — ${formatCalendarDay(dateKey)}</span>
      <span class="admin-week-count">${roomLabel}</span>
    </div>
    ${rooms}
  </div>`;
}

function viewAdmin() {
  if (!state.isAdmin) return '<div class="empty">🔒 Accesso riservato all’amministratore.</div>';

  const openMaintenanceCount = state.maintenanceReports.filter(report => report.status === 'open').length;
  const openStockCount = state.stockReports.filter(report =>
    report.status === 'low' || report.status === 'out'
  ).length;
  const tabs = [
    ['calendar', 'Calendario'],
    ['summary', 'Riepilogo'],
    ['maintenance', 'Manutenzioni', openMaintenanceCount],
    ['stock', 'Scorte', openStockCount]
  ];
  let html = `<div class="view-title">📋 Area Admin</div>
    <div class="maintenance-tabs" role="tablist" aria-label="Sezioni amministratore">
      ${tabs.map(([id, label, count]) => `<button class="maintenance-tab ${state.adminTab === id ? 'active' : ''} ${count ? 'has-open' : ''}"
        role="tab" aria-selected="${state.adminTab === id}" data-action="adminTab"
        data-tab="${id}" ${count ? `aria-label="${label}: ${count} elementi aperti"` : ''}>
        ${label}${count ? `<span class="maintenance-tab-count" aria-hidden="true">${count}</span>` : ''}
      </button>`).join('')}
    </div>
    ${state.adminActionError
      ? `<div class="error-box">${escapeHtml(state.adminActionError)}</div>`
      : ''}`;

  if (state.adminTab === 'maintenance') return html + renderAdminMaintenance();
  if (state.adminTab === 'summary') return html + renderAdminSummary();
  if (state.adminTab === 'stock') return html + renderAdminStock();
  return html + renderAdminCalendar();
}

function renderAdminCalendar() {
  const date = fromKey(state.adminDate);
  const monthly = state.adminPeriod === 'month';
  let html = `<div class="admin-controls">
    <button class="btn ${!monthly ? 'btn-primary' : 'btn-outline'}"
      data-action="adminPeriod" data-target="calendar" data-period="week">Settimana</button>
    <button class="btn ${monthly ? 'btn-primary' : 'btn-outline'}"
      data-action="adminPeriod" data-target="calendar" data-period="month">Mese</button>
  </div>`;

  if (monthly) {
    html += adminControls(date, true, 'calendar');
    html += renderAdminMonth(date);
    html += `<div class="admin-day-title">${formatCalendarDay(state.adminDate)}</div>
      ${renderAdminDay(state.adminDate)}`;
  } else {
    const start = mondayOfWeek(date);
    html += adminControls(date, false, 'calendar');
    html += '<div class="admin-day-list">';
    let daysWithCleanings = 0;
    for (let offset = 0; offset < 7; offset++) {
      const day = addDays(start, offset);
      const key = toKey(day);
      const entries = getAdminEntriesForDate(key);
      if (!entries.length) continue;
      html += renderAdminWeekDay(key, entries);
      daysWithCleanings++;
    }
    if (!daysWithCleanings) html += '<div class="empty">Nessuna pulizia prevista questa settimana.</div>';
    html += '</div>';
  }
  html += `<div class="admin-note">Le pulizie previste derivano dai check-out iCal. Le camere con 🔧 hanno manutenzioni aperte. Puoi escludere un blocco calendario.</div>`;
  return html;
}

function renderAdminSummary() {
  const date = fromKey(state.adminSummaryDate);
  const monthly = state.adminSummaryPeriod === 'month';
  const start = monthly
    ? new Date(date.getFullYear(), date.getMonth(), 1)
    : mondayOfWeek(date);
  const end = monthly
    ? new Date(date.getFullYear(), date.getMonth() + 1, 1)
    : addDays(start, 7);
  const today = toKey(new Date());
  const archiveEnd = end < fromKey(today) ? end : fromKey(today);
  const archiveKey = start < archiveEnd
    ? `${toKey(start)}|${toKey(archiveEnd)}`
    : null;
  if (archiveKey) ensureAdminArchiveLoaded(start, archiveEnd);
  const archiveLoaded = archiveKey !== null && state.adminArchiveRange === archiveKey;
  const archivedByDate = archiveLoaded
    ? new Map(state.adminArchiveEntries.map(day => [day.date, day]))
    : new Map();
  const hasArchivedEntries = archivedByDate.size > 0;
  const summary = { planned: 0, completed: 0 };
  for (let day = new Date(start); day < end; day = addDays(day, 1)) {
    const dayKey = toKey(day);
    const archivedDay = dayKey < today ? archivedByDate.get(dayKey) : null;
    if (archivedDay) {
      const count = Array.isArray(archivedDay.entries) ? archivedDay.entries.length : 0;
      summary.planned += count;
      if (archivedDay.completed) summary.completed += count;
    } else {
      const liveSummary = getAdminSummary(day, addDays(day, 1));
      summary.planned += liveSummary.planned;
      summary.completed += liveSummary.completed;
    }
  }
  const waitingForArchive = archiveKey !== null &&
    state.adminArchiveRequest === archiveKey && !archiveLoaded;
  let html = `<div class="admin-controls">
    <button class="btn ${!monthly ? 'btn-primary' : 'btn-outline'}"
      data-action="adminPeriod" data-target="summary" data-period="week">Settimana</button>
    <button class="btn ${monthly ? 'btn-primary' : 'btn-outline'}"
      data-action="adminPeriod" data-target="summary" data-period="month">Mese</button>
  </div>
  ${renderAdminStats(summary, monthly)}
  ${adminControls(date, monthly, 'summary')}
  ${state.adminArchiveError
    ? `<div class="error-box">${escapeHtml(state.adminArchiveError)}</div>`
    : ''}
  <div class="admin-note">${hasArchivedEntries
    ? 'I giorni passati con uno storico salvato usano i dati Firestore; gli altri usano i dati iCal disponibili.'
    : waitingForArchive
      ? 'Caricamento dei dati storici…'
      : '1 checkout = 1 cambio completo di biancheria. Il costo mensile considera le pulizie dei giorni passati.'}</div>`;
  return html;
}

function renderAdminMaintenance() {
  if (state.maintenanceError) {
    return `<div class="error-box">${escapeHtml(state.maintenanceError)}</div>`;
  }
  const filters = [
    ['open', 'Aperte'],
    ['resolved', 'Risolte'],
    ['all', 'Tutte']
  ];
  const reports = state.maintenanceReports.filter(report =>
    state.maintenanceFilter === 'all' || report.status === state.maintenanceFilter
  );
  let html = `<div class="maintenance-filters" role="group" aria-label="Filtra segnalazioni">
    ${filters.map(([id, label]) => `<button class="maintenance-filter ${state.maintenanceFilter === id ? 'active' : ''}"
      data-action="maintenanceFilter" data-filter="${id}">${label}</button>`).join('')}
  </div>`;
  if (!reports.length) {
    html += `<div class="empty">Nessuna segnalazione ${state.maintenanceFilter === 'open' ? 'aperta' : 'trovata'}.</div>`;
  } else {
    html += reports.map(renderMaintenanceReport).join('');
  }
  return html;
}

function formatStockDate(value) {
  if (!value) return 'Data non disponibile';
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data non disponibile' : date.toLocaleString('it-IT');
}

function renderAdminStock() {
  if (state.stockError) {
    return `<div class="error-box">${escapeHtml(state.stockError)}</div>`;
  }
  const openReports = state.stockReports.filter(report =>
    report.status === 'low' || report.status === 'out'
  );
  const history = state.stockHistory;
  const rows = state.stockAdminFilter === 'open' ? openReports : history;
  let html = `<div class="stock-filter-row" role="group" aria-label="Filtra scorte">
    <button class="stock-filter ${state.stockAdminFilter === 'open' ? 'active' : ''}"
      data-action="stockAdminFilter" data-filter="open">Da acquistare (${openReports.length})</button>
    <button class="stock-filter ${state.stockAdminFilter === 'history' ? 'active' : ''}"
      data-action="stockAdminFilter" data-filter="history">Storico (${history.length})</button>
  </div>`;
  if (!rows.length) {
    html += `<div class="empty">${state.stockAdminFilter === 'open'
      ? 'Nessun prodotto da acquistare.'
      : 'Nessun rifornimento registrato.'}</div>`;
  } else if (state.stockAdminFilter === 'open') {
    html += openReports.map(report => {
      const product = state.stockProducts.find(item => item.id === report.productId);
      const name = product ? product.name : report.productName;
      const label = report.status === 'out' ? 'Finito' : 'Sta finendo';
      return `<article class="stock-report-card ${report.status}">
        <div class="stock-report-content">
          <div class="stock-report-top">
            <div class="stock-report-name">${escapeHtml(name || 'Prodotto')}</div>
            <span class="stock-report-state ${report.status}">${label}</span>
          </div>
          <div class="stock-report-meta">Ultima segnalazione: ${escapeHtml(formatStockDate(report.updatedAt))}</div>
          ${report.note ? `<div class="stock-report-note"><strong>Nota:</strong> ${escapeHtml(report.note)}</div>` : ''}
        </div>
        <button class="btn btn-primary" data-action="stockRestocked"
          data-report-id="${escapeAttr(report.id)}">✓ Rifornito</button>
      </article>`;
    }).join('');
  } else {
    html += history.map(entry => `<article class="stock-report-card">
      <div class="stock-report-name">${escapeHtml(entry.productName || 'Prodotto')}</div>
      <span class="stock-report-state ${entry.previousStatus}">
        ${entry.previousStatus === 'out' ? 'Finito' : 'Sta finendo'}
      </span>
      <div class="stock-report-meta">
        Segnalato: ${escapeHtml(formatStockDate(entry.reportedAt))}<br>
        Rifornito: ${escapeHtml(formatStockDate(entry.restockedAt))}
      </div>
      ${entry.note ? `<div class="stock-report-note"><strong>Nota:</strong> ${escapeHtml(entry.note)}</div>` : ''}
    </article>`).join('');
  }

  html += `<details class="card">
    <summary class="card-title">Gestisci elenco prodotti</summary>
    <div class="card-sub">I prodotti attivi sono visibili allo Staff. Disattiva quelli non più usati.</div>
    <form data-stock-product-form>
      <label class="lbl" for="newStockProduct">Aggiungi prodotto</label>
      <input class="inp" id="newStockProduct" name="productName" maxlength="80"
        placeholder="Nome prodotto" required>
      <button class="btn btn-primary" type="submit">Aggiungi all’elenco</button>
    </form>
    ${state.stockProducts.map(product => {
      const draft = state.stockProductNameDrafts[product.id];
      const name = draft === undefined ? product.name : draft;
      return `<div class="stock-product-card ${product.active ? '' : 'stock-product-inactive'}">
        <div class="stock-product-row">
          <input class="inp" type="text" maxlength="80"
            data-stock-product-name="${escapeAttr(product.id)}"
            value="${escapeAttr(name)}" aria-label="Nome prodotto">
          <div class="stock-product-actions">
            <button class="btn btn-outline" data-action="saveStockProduct"
              data-product-id="${escapeAttr(product.id)}">Salva</button>
            <button class="btn ${product.active ? 'btn-danger' : 'btn-primary'}"
              data-action="toggleStockProduct" data-product-id="${escapeAttr(product.id)}"
              data-active="${product.active ? 'false' : 'true'}">
              ${product.active ? 'Disattiva' : 'Riattiva'}
            </button>
          </div>
        </div>
        ${product.active ? '' : '<div class="stock-report-meta">Prodotto disattivato: nascosto allo Staff.</div>'}
      </div>`;
    }).join('')}
  </details>`;
  return html;
}

function renderMaintenanceReport(report) {
  const room = state.settings.rooms[report.roomId];
  const roomName = room ? room.name : `Camera ${report.roomId + 1}`;
  const created = report.createdAt && report.createdAt.toDate
    ? report.createdAt.toDate().toLocaleString('it-IT')
    : 'Data non disponibile';
  const categoryLabels = {
    bathroom: 'Bagno / idraulica',
    electrical: 'Elettricità',
    climate: 'Climatizzazione',
    furniture: 'Mobili / porte',
    cleaning: 'Pulizia / danni',
    other: 'Altro'
  };
  const photoUrl = state.maintenancePhotoUrls[report.id];
  const photoLoading = state.maintenancePhotoLoading[report.id];
  const photoError = state.maintenancePhotoErrors[report.id];
  const expanded = state.expandedMaintenanceIds.has(report.id);
  const urgent = report.priority === 'urgent';
  const resolved = report.status === 'resolved';
  return `<div class="maintenance-report-row">
    <details class="maintenance-card ${urgent ? 'urgent' : ''} ${resolved ? 'resolved' : ''}"
      ${expanded ? 'open' : ''} data-maintenance-card="${escapeAttr(report.id)}">
      <summary class="maintenance-summary">
        ${photoUrl ? `<img class="maintenance-thumb" src="${escapeAttr(photoUrl)}" alt="">` : ''}
        <span class="maintenance-summary-main">
          <span class="maintenance-summary-room">${escapeHtml(roomName)}</span>
          <span class="maintenance-summary-description">${escapeHtml(report.description || categoryLabels[report.category] || 'Segnalazione senza descrizione')}</span>
          <span class="maintenance-summary-meta">${created}</span>
        </span>
        <span class="maintenance-priority ${urgent ? 'urgent' : ''}">${urgent ? 'URGENTE' : 'Normale'}</span>
      </summary>
      <div class="maintenance-details">
        <div class="maintenance-detail-row"><strong>Categoria:</strong> ${escapeHtml(categoryLabels[report.category] || report.category || 'Altro')}</div>
        <div class="maintenance-detail-row"><strong>Camera:</strong> ${escapeHtml(roomName)}</div>
        <div class="maintenance-detail-row"><strong>Segnalata:</strong> ${escapeHtml(created)}</div>
        <div class="maintenance-detail-row"><strong>Priorità:</strong> ${urgent ? '<span class="urgent-indicator">Urgente</span>' : 'Normale'}</div>
        <div class="maintenance-detail-row"><strong>Stato:</strong> ${resolved ? 'Risolto' : 'Da fare'}</div>
        <div class="maintenance-detail-row"><strong>Descrizione:</strong> ${escapeHtml(report.description || 'Nessuna descrizione')}</div>
        ${photoUrl ? `<button class="maintenance-photo-open" data-action="viewMaintenancePhoto"
          data-photo-url="${escapeAttr(photoUrl)}" data-photo-alt="${escapeAttr(roomName)}">
          <img class="maintenance-photo" src="${escapeAttr(photoUrl)}" alt="Foto segnalazione manutenzione">
        </button>` : report.photoAvailable
          ? `<div class="maintenance-upload-status">${photoLoading ? 'Caricamento foto da Firestore…' : 'La foto verrà caricata aprendo la segnalazione.'}</div>`
          : ''}
        ${photoError ? `<div class="error-box">${escapeHtml(photoError)}</div>` : ''}
        ${report.resolvedAt && report.resolvedAt.toDate
          ? `<div class="maintenance-detail-row"><strong>Risolta:</strong> ${escapeHtml(report.resolvedAt.toDate().toLocaleString('it-IT'))}</div>`
          : ''}
      </div>
    </details>
    <button class="maintenance-row-action ${resolved ? 'maintenance-reopen' : 'maintenance-resolve'}"
      data-action="setMaintenanceStatus" data-report-id="${escapeAttr(report.id)}"
      data-resolved="${resolved ? 'false' : 'true'}">${resolved ? 'Riapri' : '✓ Risolto'}</button>
  </div>`;
}

function renderAdminMonth(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const cellCount = Math.ceil((offset + daysInMonth) / 7) * 7;
  let html = '<div class="card"><div class="admin-calendar">';
  ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].forEach(day => {
    html += `<div class="admin-calendar-head">${day}</div>`;
  });
  for (let cell = 0; cell < cellCount; cell++) {
    const day = addDays(first, cell - offset);
    const key = toKey(day);
    const inMonth = day.getMonth() === date.getMonth();
    const entries = inMonth ? getAdminEntriesForDate(key) : [];
    const active = entries.filter(entry => !entry.blocked || entry.completed);
    const completed = active.filter(entry => entry.completed).length;
    const classes = ['admin-day'];
    if (!inMonth) classes.push('outside');
    if (key === state.adminDate) classes.push('selected');
    if (active.length && completed === active.length) classes.push('all-done');
    else if (active.length) classes.push('has-pending');
    const maintenanceRooms = active.filter(entry => getOpenMaintenanceForRoom(entry.roomId));
    html += `<button class="${classes.join(' ')}" ${inMonth
      ? `data-action="selectAdminDate" data-date="${key}"`
      : 'disabled'} aria-label="${inMonth
        ? `${day.getDate()} ${MESI[day.getMonth()]}, ${active.length} pulizie${maintenanceRooms.length ? ', manutenzione aperta' : ''}`
        : ''}">
      ${day.getDate()}
      ${active.length ? `<span class="admin-day-count">${completed}/${active.length}</span>` : ''}
      ${maintenanceRooms.length ? '<span class="maintenance-calendar-indicator" aria-hidden="true">🔧</span>' : ''}
    </button>`;
  }
  return `${html}</div></div>`;
}

/* ============================================================
   IMPOSTAZIONI
============================================================ */
function viewSettings() {
  if (!state.isAdmin) {
    return `<div class="empty">🔒 Accesso riservato all'amministratore.</div>`;
  }

  let html = `<div class="view-title">⚙️ Impostazioni</div>`;

  html += `<div class="card">
    <div class="card-title">Aggiornamento calendari</div>
    <div class="card-sub">Ultimo aggiornamento: ${
      state.lastUpdate ? formatDateTime(state.lastUpdate) : '—'}
      ${state.lastUpdate ? ' · ' + timeSince(state.lastUpdate) : ''}</div>
    <div class="hint">Aggiornamento automatico ogni <strong>60 minuti</strong> e al ritorno
      in primo piano dopo 30 minuti di inattività.</div>
    <button class="btn btn-primary" data-action="refresh" ${state.fetching ? 'disabled' : ''}>
      ${state.fetching ? `⟳ Aggiornamento… (${state.fetchProgress.done}/${state.fetchProgress.total})` : '⟳ Aggiorna ora'}
    </button>
  </div>`;

  html += `<details class="room-section">
    <summary class="room-section-summary">
      <span>Stanze</span>
      <span class="room-chevron" aria-hidden="true">⌄</span>
    </summary>
    <div class="room-section-content">`;

  state.settings.rooms.forEach((room, i) => {
    const detected = state.detectedNames[i];
    html += `<details class="card room-settings">
      <summary class="room-summary">
        <span class="room-title">🏠 ${escapeHtml(room.name)}</span>
        <span class="room-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div class="room-fields">
        <label class="lbl">Nome stanza ${i + 1}</label>
        <input class="inp" type="text" value="${escapeAttr(room.name)}"
          data-room-name="${i}" placeholder="Stanza ${i + 1}">

        <label class="lbl">URL iCal Airbnb</label>
        <input class="inp" type="url" value="${escapeAttr(room.airbnb)}"
          data-room-airbnb="${i}"
          placeholder="https://www.airbnb.it/calendar/ical/....ics">
        <label class="lbl">URL iCal Booking.com</label>
        <input class="inp" type="url" value="${escapeAttr(room.booking)}"
          data-room-booking="${i}"
          placeholder="https://ical.booking.com/v1/export?t=....">`;

    if (detected) {
      html += `<div class="detected">📅 Nome calendario rilevato: ${escapeHtml(detected)}</div>`;
    }

    html += `</div></details>`;
  });
  html += `</div></details>`;

  html += `<div class="section-title">Opzioni</div>`;
  html += `<div class="card">
    <label class="row-toggle">
      <span>Mostra nome ospite (se disponibile)</span>
      <input type="checkbox" ${state.settings.showGuestName ? 'checked' : ''}
        data-toggle="showGuestName">
    </label>
    <label class="lbl">Orario check-out</label>
    <input class="inp" type="time" value="${escapeAttr(state.settings.checkoutTime)}"
      data-toggle="checkoutTime">
    <label class="lbl">Orario check-in</label>
    <input class="inp" type="time" value="${escapeAttr(state.settings.checkinTime)}"
      data-toggle="checkinTime">
  </div>`;

  html += `<div class="card">
    <label class="lbl">Proxy CORS</label>
    <input class="inp" type="text" value="${escapeAttr(state.settings.proxy)}"
      data-toggle="proxy" placeholder="https://nome-worker.nome-account.workers.dev/">
    <div class="hint">
      <strong>Consigliato</strong>: crea un Cloudflare Worker personale e incolla qui il suo URL.
      L'app aggiunge automaticamente il parametro <code>?url=</code> alla richiesta.<br>
      Il proxy pubblico predefinito può avere limitazioni con Airbnb/Booking.
    </div>
  </div>`;

  html += `<div class="card">
    <button class="btn btn-primary" data-action="saveSettings">💾 Salva impostazioni</button>
    <button class="btn btn-outline" data-action="logout">🔒 Esci da amministratore</button>
  </div>`;

  html += `<div class="footer-note">
    Per ogni stanza puoi configurare i calendari Airbnb e Booking, letti separatamente.
  </div>`;

  return html;
}

/* ============================================================
   MODAL DETTAGLIO
============================================================ */
function showDetail(roomId, dk) {
  const room = state.settings.rooms[roomId];
  const st = getRoomStatus(roomId, dk);
  const evs = state.events.filter(e => e.roomId === roomId);
  const dayEvents = evs.filter(e => e.start <= dk && dk <= e.end);
  const outEv = getCheckoutEvent(evs, dk);
  const inEv  = evs.find(e => e.start === dk && isReservationEvent(e));
  const d = fromKey(dk);

  const guest = state.settings.showGuestName && outEv ? cleanGuestName(outEv.summary) : null;
  const srcBadge = outEv && outEv.source
    ? `<span class="src-badge direct">${escapeHtml(outEv.source)}</span>`
    : '';

  let html = `<div class="modal-bg" data-modal-bg>
    <div class="modal">
      <div class="modal-title">${escapeHtml(room.name)} ${srcBadge}</div>
      <div class="modal-date">${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]} ${d.getFullYear()}</div>
      <div class="modal-status ${statusClass(st)}">${statusIcon(st)} ${statusLabel(st)}</div>

      ${outEv ? `<div class="modal-row">🚪 Check-out: ${escapeHtml(state.settings.checkoutTime)}</div>` : ''}
      ${inEv  ? `<div class="modal-row">🛎️ Nuovo check-in: ${escapeHtml(state.settings.checkinTime)}</div>` : ''}
      ${guest ? `<div class="modal-row">👤 ${escapeHtml(guest)}</div>` : ''}
      ${dayEvents.map(e => `
        <div class="modal-row">Calendario ${escapeHtml(e.source || '')}: ${escapeHtml(formatCalendarDay(e.start))}
          → DTEND ${escapeHtml(formatCalendarDay(e.end))}</div>`).join('')}

      <button class="btn btn-close" data-action="closeModal">Chiudi</button>
    </div>
  </div>`;

  document.getElementById('modal').innerHTML = html;
}

function showMaintenanceForm(roomId) {
  const room = state.settings.rooms[roomId];
  if (!room) return;
  document.getElementById('modal').innerHTML = `<div class="modal-bg" data-modal-bg>
    <form class="modal maintenance-form" data-maintenance-form>
      <div class="modal-title">🔧 Segnala un problema</div>
      <div class="modal-row"><strong>Camera:</strong> ${escapeHtml(room.name)}</div>
      <input type="hidden" name="roomId" value="${roomId}">
      <label class="lbl" for="maintenanceCategory">Categoria</label>
      <select class="inp" id="maintenanceCategory" name="category" required>
        <option value="bathroom">Bagno / idraulica</option>
        <option value="electrical">Elettricità</option>
        <option value="climate">Climatizzazione</option>
        <option value="furniture">Mobili / porte</option>
        <option value="cleaning">Pulizia / danni</option>
        <option value="other">Altro</option>
      </select>
      <label class="lbl" for="maintenanceDescription">Descrizione (facoltativa)</label>
      <textarea class="inp" id="maintenanceDescription" name="description"
        maxlength="1000" placeholder="Descrivi brevemente il problema"></textarea>
      <label class="lbl" for="maintenancePriority">Priorità</label>
      <select class="inp" id="maintenancePriority" name="priority" required>
        <option value="normal">Normale</option>
        <option value="urgent">Urgente</option>
      </select>
      <label class="lbl" for="maintenancePhoto">Fotografia (facoltativa)</label>
      <input class="inp" id="maintenancePhoto" name="photo" type="file"
        accept="image/*" capture="environment">
      ${state.staffAuthError ? `<div class="error-box">${escapeHtml(state.staffAuthError)}</div>` : ''}
      <div class="maintenance-upload-status" data-report-feedback hidden></div>
      <button class="btn btn-primary" type="submit">Invia segnalazione</button>
      <button class="btn btn-close" type="button" data-action="closeModal">Annulla</button>
    </form>
  </div>`;
}

function showMaintenancePhoto(url, alt) {
  document.getElementById('modal').innerHTML = `<div class="modal-bg" data-modal-bg>
    <div class="modal maintenance-photo-modal">
      <div class="modal-title">${escapeHtml(alt || 'Foto segnalazione')}</div>
      <img src="${escapeAttr(url)}" alt="${escapeAttr(alt || 'Foto segnalazione')}">
      <button class="btn btn-close" data-action="closeModal">Chiudi</button>
    </div>
  </div>`;
}
function closeModal() { document.getElementById('modal').innerHTML = ''; }

/* ============================================================
   SALVATAGGIO IMPOSTAZIONI
============================================================ */
function updateRoomSettingsFromForm() {
  document.querySelectorAll('[data-room-name]').forEach(name => {
    const i = +name.dataset.roomName;
    state.settings.rooms[i].name = name.value.trim() || ('Stanza ' + (i + 1));
  });
  document.querySelectorAll('[data-room-airbnb]').forEach(input => {
    state.settings.rooms[+input.dataset.roomAirbnb].airbnb = input.value.trim();
  });
  document.querySelectorAll('[data-room-booking]').forEach(input => {
    state.settings.rooms[+input.dataset.roomBooking].booking = input.value.trim();
  });
}

async function saveSettingsFromForm() {
  updateRoomSettingsFromForm();
  const gs = document.querySelector('[data-toggle="showGuestName"]');
  if (gs) state.settings.showGuestName = gs.checked;

  const co = document.querySelector('[data-toggle="checkoutTime"]');
  if (co && co.value) state.settings.checkoutTime = co.value;

  const ci = document.querySelector('[data-toggle="checkinTime"]');
  if (ci && ci.value) state.settings.checkinTime = ci.value;

  const px = document.querySelector('[data-toggle="proxy"]');
  if (px) state.settings.proxy = px.value.trim();

  saveSettingsLS();
  await saveCloudSettings();
}

/* ============================================================
   TOAST
============================================================ */
let toastTimer;
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ============================================================
   EVENTI
============================================================ */
document.getElementById('nav').addEventListener('click', e => {
  const btn = e.target.closest('[data-view]');
  if (!btn) return;
  state.view = btn.dataset.view;
  render();
  window.scrollTo(0, 0);
});

document.getElementById('main').addEventListener('click', async e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;

  if (action === 'detail') {
    showDetail(+btn.dataset.room, btn.dataset.date);
  }
  else if (action === 'openDoor') {
    btn.disabled = true;
    try {
      if (DOOR_WORKER_URL.includes('<')) {
        throw new Error('Completa prima la configurazione del Worker Cloudflare.');
      }
      const response = await fetch(DOOR_WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Comando rifiutato.');
      toast('Comando di apertura inviato');
    } catch (err) {
      toast(err.message === 'Failed to fetch'
        ? 'Worker non raggiungibile. Controlla URL e connessione.'
        : err.message);
    } finally {
      btn.disabled = false;
    }
  }
  else if (action === 'saveSettings') {
    try {
      await saveSettingsFromForm();
      toast('Impostazioni salvate su Firebase 💾');
      refreshAll();
    } catch (err) {
      state.cloudError = 'Impossibile salvare le impostazioni su Firebase: ' + err.message;
      render();
    }
  }
  else if (action === 'refresh') {
    refreshAll();
  }
  else if (action === 'adminPeriod') {
    if (btn.dataset.target === 'summary') state.adminSummaryPeriod = btn.dataset.period;
    else state.adminPeriod = btn.dataset.period;
    render();
  }
  else if (action === 'adminTab') {
    state.adminTab = btn.dataset.tab;
    render();
  }
  else if (action === 'maintenanceFilter') {
    state.maintenanceFilter = btn.dataset.filter;
    render();
  }
  else if (action === 'stockSelect') {
    state.stockSelections[btn.dataset.productId] = btn.dataset.stockStatus;
    render();
  }
  else if (action === 'stockAdminFilter') {
    state.stockAdminFilter = btn.dataset.filter;
    render();
  }
  else if (action === 'stockRestocked') {
    const report = state.stockReports.find(item => item.id === btn.dataset.reportId);
    if (!report) return;
    btn.disabled = true;
    try {
      await markStockRestocked(report);
      state.adminActionError = null;
      toast('Prodotto segnato come rifornito');
    } catch (err) {
      state.adminActionError = 'Impossibile aggiornare la scorta: ' + err.message;
      render();
    }
  }
  else if (action === 'saveStockProduct') {
    const productId = btn.dataset.productId;
    btn.disabled = true;
    try {
      await saveStockProduct(productId, state.stockProductNameDrafts[productId] || '');
      delete state.stockProductNameDrafts[productId];
      state.adminActionError = null;
      toast('Nome prodotto salvato');
    } catch (err) {
      state.adminActionError = 'Impossibile salvare il prodotto: ' + err.message;
      render();
    }
  }
  else if (action === 'toggleStockProduct') {
    try {
      await setStockProductActive(btn.dataset.productId, btn.dataset.active === 'true');
      state.adminActionError = null;
      toast(btn.dataset.active === 'true' ? 'Prodotto riattivato' : 'Prodotto disattivato');
    } catch (err) {
      state.adminActionError = 'Impossibile aggiornare il prodotto: ' + err.message;
      render();
    }
  }
  else if (action === 'newMaintenanceReport') {
    showMaintenanceForm(Number(btn.dataset.room));
  }
  else if (action === 'openMaintenance') {
    state.view = 'admin';
    state.adminTab = 'maintenance';
    state.maintenanceFilter = 'all';
    state.expandedMaintenanceIds.add(btn.dataset.reportId);
    render();
    const report = state.maintenanceReports.find(item => item.id === btn.dataset.reportId);
    if (report && report.photoAvailable) loadMaintenancePhoto(report.id);
    window.scrollTo(0, 0);
  }
  else if (action === 'viewMaintenancePhoto') {
    showMaintenancePhoto(btn.dataset.photoUrl, btn.dataset.photoAlt);
  }
  else if (action === 'setMaintenanceStatus') {
    const report = state.maintenanceReports.find(item => item.id === btn.dataset.reportId);
    if (!report) return;
    try {
      await setMaintenanceResolved(report, btn.dataset.resolved === 'true');
      state.adminActionError = null;
      toast(btn.dataset.resolved === 'true' ? 'Segnalazione risolta' : 'Segnalazione riaperta');
    } catch (err) {
      state.adminActionError = 'Impossibile aggiornare la segnalazione: ' + err.message;
      render();
    }
  }
  else if (action === 'adminPrevious' || action === 'adminNext') {
    const direction = action === 'adminPrevious' ? -1 : 1;
    const summary = btn.dataset.periodTarget === 'summary';
    const period = summary ? state.adminSummaryPeriod : state.adminPeriod;
    const date = fromKey(summary ? state.adminSummaryDate : state.adminDate);
    const newDate = period === 'month'
      ? toKey(new Date(date.getFullYear(), date.getMonth() + direction, 1))
      : toKey(addDays(date, direction * 7));
    if (summary) {
      state.adminSummaryDate = newDate;
    } else {
      state.adminDate = newDate;
    }
    render();
  }
  else if (action === 'selectAdminDate') {
    state.adminDate = btn.dataset.date;
    render();
  }
  else if (action === 'toggleBlock') {
    const roomId = +btn.dataset.room;
    const dateKey = btn.dataset.date;
    try {
      const blocked = !state.blockOverrides[cleaningKey(roomId, dateKey)];
      await saveBlockOverride(roomId, dateKey, blocked);
      state.adminActionError = null;
      render();
      toast(blocked ? 'Blocco escluso dalle pulizie' : 'Pulizia ripristinata');
    } catch (err) {
      state.adminActionError = 'Impossibile salvare il blocco: ' + err.message;
      render();
    }
  }
  else if (action === 'logout') {
    try {
      await signOut(auth);
      state.view = 'home';
      render();
      toast('Modalità amministratore disattivata');
    } catch (err) {
      state.adminActionError = 'Impossibile terminare la sessione: ' + err.message;
      render();
    }
  }
});

document.getElementById('main').addEventListener('input', e => {
  if (e.target.matches('[data-room-name]')) {
    const title = e.target.closest('.room-settings').querySelector('.room-title');
    title.textContent = '🏠 ' + (e.target.value.trim() || e.target.placeholder);
  } else if (e.target.matches('[data-stock-product-name]')) {
    state.stockProductNameDrafts[e.target.dataset.stockProductName] = e.target.value;
  } else if (e.target.matches('[name="stockNote"]')) {
    state.stockNote = e.target.value;
  } else if (e.target.matches('[name="stockCustomName"]')) {
    state.stockCustomName = e.target.value;
  }
});

document.getElementById('main').addEventListener('toggle', e => {
  const card = e.target.closest('[data-maintenance-card]');
  if (!card) return;
  if (card.open) {
    const reportId = card.dataset.maintenanceCard;
    state.expandedMaintenanceIds.add(reportId);
    const report = state.maintenanceReports.find(item => item.id === reportId);
    if (report && report.photoAvailable) loadMaintenancePhoto(reportId);
  } else {
    state.expandedMaintenanceIds.delete(card.dataset.maintenanceCard);
  }
}, true);

document.getElementById('main').addEventListener('change', e => {
  if (e.target.matches('[data-admin-month]') && e.target.value) {
    if (e.target.dataset.adminMonth === 'summary') {
      state.adminSummaryDate = `${e.target.value}-01`;
    } else {
      state.adminDate = `${e.target.value}-01`;
    }
    render();
  } else if (e.target.matches('[name="stockCustomStatus"]')) {
    state.stockCustomStatus = e.target.value;
  }
});

document.getElementById('main').addEventListener('submit', async e => {
  const reportForm = e.target.closest('[data-stock-report-form]');
  if (reportForm) {
    e.preventDefault();
    if (reportForm.dataset.submitting === '1') return;
    reportForm.dataset.submitting = '1';
    const submit = reportForm.querySelector('[type="submit"]');
    const feedback = reportForm.querySelector('[data-stock-feedback]');
    submit.disabled = true;
    feedback.hidden = false;
    feedback.className = 'maintenance-upload-status';
    feedback.textContent = 'Invio segnalazione…';
    try {
      await submitStockReports(reportForm);
      toast('Segnalazione scorte inviata');
      render();
    } catch (err) {
      feedback.className = 'error-box';
      feedback.textContent = 'Invio non riuscito: ' + err.message;
      delete reportForm.dataset.submitting;
      submit.disabled = false;
    }
    return;
  }

  const productForm = e.target.closest('[data-stock-product-form]');
  if (!productForm) return;
  e.preventDefault();
  const submit = productForm.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    await saveStockProduct(null, productForm.elements.productName.value);
    state.adminActionError = null;
    toast('Prodotto aggiunto all’elenco');
    render();
  } catch (err) {
    state.adminActionError = 'Impossibile aggiungere il prodotto: ' + err.message;
    render();
  } finally {
    submit.disabled = false;
  }
});

document.getElementById('modal').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (btn) {
    const action = btn.dataset.action;
    if (action === 'closeModal') { closeModal(); return; }
    return;
  }
  if (e.target.hasAttribute('data-modal-bg')) closeModal();
});

document.getElementById('modal').addEventListener('submit', async e => {
  const reportForm = e.target.closest('[data-maintenance-form]');
  if (reportForm) {
    e.preventDefault();
    await submitMaintenanceReport(reportForm);
    return;
  }
  const form = e.target.closest('[data-admin-login]');
  if (!form) return;
  e.preventDefault();

  const submit = form.querySelector('[type="submit"]');
  const error = form.querySelector('[data-auth-error]');
  submit.disabled = true;
  error.textContent = '';
  error.hidden = false;
  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      form.elements.email.value.trim(),
      form.elements.password.value
    );
    if (credential.user.email !== ADMIN_EMAIL) {
      await signOut(auth);
      throw new Error('Questo account non è autorizzato come amministratore.');
    }
    if (!credential.user.emailVerified) {
      await sendEmailVerification(credential.user);
      await signOut(auth);
      error.textContent = 'Account non verificato: ti abbiamo inviato un link di verifica via email. Aprilo (controlla anche la cartella Spam), poi torna qui e accedi di nuovo.';
      submit.disabled = false;
      return;
    }
    state.view = 'admin';
    closeModal();
    toast('Accesso amministratore attivo');
  } catch (err) {
    const unverifiedUser = auth.currentUser &&
      auth.currentUser.email === ADMIN_EMAIL && !auth.currentUser.emailVerified;
    if (unverifiedUser) {
      await signOut(auth);
    }
    error.textContent = err.code === 'auth/invalid-credential' ||
      err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found'
      ? 'Email o password non corretti.'
      : err.code === 'auth/too-many-requests'
        ? 'Troppi tentativi. Attendi qualche minuto e riprova.'
        : `Accesso non completato: ${err.message}`;
    submit.disabled = false;
  }
});

document.getElementById('refreshBtn').addEventListener('click', () => {
  if (!state.fetching) refreshAll();
});

document.getElementById('lockBtn').addEventListener('click', async () => {
  if (state.isAdmin) {
    try {
      await signOut(auth);
      state.view = 'home';
      render();
      toast('Modalità amministratore disattivata');
    } catch (err) {
      state.adminActionError = 'Impossibile terminare la sessione: ' + err.message;
      render();
    }
  } else {
    document.getElementById('modal').innerHTML = `
      <div class="modal-bg" data-modal-bg>
        <form class="modal" data-admin-login>
          <div class="modal-title">Accesso amministratore</div>
          <label class="lbl" for="adminEmail">Email</label>
          <input class="inp" id="adminEmail" name="email" type="email"
            autocomplete="username" required>
          <label class="lbl" for="adminPassword">Password</label>
          <input class="inp" id="adminPassword" name="password" type="password"
            autocomplete="current-password" required>
          <div class="error-box" data-auth-error hidden></div>
          <button class="btn btn-primary" type="submit">Sblocca</button>
          <button class="btn btn-close" type="button" data-action="closeModal">Annulla</button>
          <div class="admin-login-note">Accesso disponibile solo all’account amministratore verificato.</div>
        </form>
      </div>`;
  }
});

onAuthStateChanged(auth, async user => {
  const wasAdmin = state.isAdmin;
  state.isAdmin = Boolean(
    user && user.email === ADMIN_EMAIL && user.emailVerified
  );
  if (state.isAdmin) {
    if (!wasAdmin && (state.view === 'home' || state.view === 'stock')) state.view = 'admin';
    if (!wasAdmin) {
      subscribeToMaintenanceReports();
      subscribeToAdminStock();
      ensureDefaultStockProducts().catch(error => {
        state.stockError = 'Impossibile preparare l’elenco prodotti: ' + error.message;
        render();
      });
    }
    try {
      await loadBlockOverrides();
    } catch (err) {
      state.blockError = 'Impossibile caricare i blocchi salvati su Firebase: ' + err.message;
    }
  } else {
    state.adminActionError = null;
    if (wasAdmin) stopStockSubscriptions();
    if (unsubscribeMaintenanceReports) {
      unsubscribeMaintenanceReports();
      unsubscribeMaintenanceReports = null;
      state.maintenanceReports = [];
      state.maintenancePhotoUrls = {};
      state.maintenancePhotoLoading = {};
      state.maintenancePhotoErrors = {};
    }
    if (!user) {
      try {
        await signInAnonymously(auth);
        state.staffAuthError = null;
      } catch (err) {
        state.staffAuthError = 'Invio segnalazioni non disponibile. Attiva l’accesso anonimo in Firebase Authentication: ' + err.message;
      }
    } else if (user.isAnonymous) {
      state.staffAuthError = null;
      if (!unsubscribeStockProducts) subscribeToStaffStockProducts();
    }
  }
  render();
  if (state.isAdmin && !wasAdmin) refreshAll();
});

/* ============================================================
   AVVIO
============================================================ */
loadAll();
render();
(async () => {
  try {
    await loadCloudSettings();
  } catch (err) {
    state.cloudError = 'Impossibile caricare le impostazioni da Firebase: ' + err.message;
  }
  try {
    await loadBlockOverrides();
  } catch (err) {
    state.blockError = 'Impossibile caricare i blocchi salvati su Firebase: ' + err.message;
  }
  render();
  refreshAll();
})();

setInterval(() => { refreshAll(); }, AUTO_UPDATE_MS);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    const lu = state.lastUpdate ? new Date(state.lastUpdate).getTime() : 0;
    if (Date.now() - lu > VISIBILITY_THRESHOLD_MS) refreshAll();
  }
});
