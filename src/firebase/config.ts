import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  setPersistence, 
  browserLocalPersistence, 
  indexedDBLocalPersistence,
  browserSessionPersistence
} from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  getFirestore 
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import appletConfig from '../../firebase-applet-config.json';

export const isFirebaseConfigured = Boolean(
  appletConfig.apiKey && 
  appletConfig.projectId && 
  appletConfig.projectId !== 'remixed-project-id'
);

// Configuration keys for Firebase
// Sourced dynamically from environment variables and firebase-applet-config.json
export const firebaseConfig = {
  apiKey: appletConfig.apiKey || "AIzaSyDummyKeyForLocalSandbox123456",
  authDomain: appletConfig.authDomain || "local-sandbox.firebaseapp.com",
  projectId: appletConfig.projectId || "local-sandbox",
  storageBucket: appletConfig.storageBucket || "local-sandbox.appspot.com",
  messagingSenderId: appletConfig.messagingSenderId || "1234567890",
  appId: appletConfig.appId || "1:1234567890:web:local-sandbox"
};

// Initialize Firebase safely
let appInstance: any;
try {
  appInstance = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
} catch (initErr) {
  console.warn("Firebase initializeApp caught fallback:", initErr);
  appInstance = getApps()[0] || null;
}
const app = appInstance;
export const auth = app ? getAuth(app) : ({} as any);

// Explicitly ensure robust session persistence: browserLocalPersistence primary,
// falling back to indexedDBLocalPersistence then browserSessionPersistence if blocked.
const configureAuthPersistence = async (): Promise<void> => {
  if (!isFirebaseConfigured || !app || !auth || typeof window === 'undefined') return;
  const persistenceChain = [
    { name: 'browserLocalPersistence', persistence: browserLocalPersistence },
    { name: 'indexedDBLocalPersistence', persistence: indexedDBLocalPersistence },
    { name: 'browserSessionPersistence', persistence: browserSessionPersistence },
  ];
  for (const entry of persistenceChain) {
    try {
      await setPersistence(auth, entry.persistence);
      return;
    } catch (err) {
      console.warn(`Auth ${entry.name} unavailable, trying next fallback:`, err);
    }
  }
  console.warn('All persistent Firebase Auth storage mechanisms were blocked; using in-memory auth state.');
};

export const authPersistenceReady: Promise<void> = configureAuthPersistence().catch((err) => {
  console.warn('Auth persistence setup error:', err);
});

const DB_NAME = (appletConfig as any).firestoreDatabaseId || "ai-studio-6630a5d3-18da-424e-ba5b-db65e1dcfa41";

// Initialize Firestore with Persistent IndexedDB multi-tab cache
// This dramatically reduces billable read costs by serving cached data locally and only fetching changed documents.
let firestoreDb: any;
try {
  firestoreDb = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  }, DB_NAME);
} catch (e) {
  try {
    firestoreDb = getFirestore(app, DB_NAME);
  } catch (err2) {
    console.warn("Firestore initialization fallback:", err2);
    firestoreDb = getFirestore(app);
  }
}

export const db = firestoreDb;

// Safe Storage initialization
let storageInstance: any = null;
try {
  storageInstance = getStorage(app);
} catch (error) {
  console.warn("Firebase Storage service is not available in this environment:", error);
}

export const storage = storageInstance;

// Note: If Firebase Storage is unavailable or lacks permission, 
// we will fallback gracefully to base64 images to avoid runtime blocking.
export default app;

