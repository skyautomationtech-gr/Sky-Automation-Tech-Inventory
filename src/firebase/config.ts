import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  setPersistence, 
  browserLocalPersistence, 
  indexedDBLocalPersistence 
} from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  getFirestore 
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import appletConfig from '../../firebase-applet-config.json';

// Configuration keys for Firebase
// Sourced dynamically from environment variables and firebase-applet-config.json
export const firebaseConfig = {
  apiKey: appletConfig.apiKey,
  authDomain: appletConfig.authDomain,
  projectId: appletConfig.projectId,
  storageBucket: appletConfig.storageBucket,
  messagingSenderId: appletConfig.messagingSenderId,
  appId: appletConfig.appId
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Explicitly ensure robust local session persistence across reloads & iframes
try {
  setPersistence(auth, indexedDBLocalPersistence).catch(() => {
    setPersistence(auth, browserLocalPersistence).catch(err => {
      console.warn("Auth persistence setup error:", err);
    });
  });
} catch (err) {
  try {
    setPersistence(auth, browserLocalPersistence).catch(() => {});
  } catch (e) {}
}

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

