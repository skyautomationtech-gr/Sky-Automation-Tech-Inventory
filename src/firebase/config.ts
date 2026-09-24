import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  getFirestore 
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Configuration keys for Firebase
// These are sourced from /firebase-applet-config.json
const firebaseConfig = {
  apiKey: "AIzaSyC6-JTG8zI6cwBsJC9sT5BJHCtafBPNPpA",
  authDomain: "gen-lang-client-0634961568.firebaseapp.com",
  projectId: "gen-lang-client-0634961568",
  storageBucket: "gen-lang-client-0634961568.firebasestorage.app",
  messagingSenderId: "1012947381625",
  appId: "1:1012947381625:web:621c645c6e6de3f37ed3a8"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

const DB_NAME = "ai-studio-6630a5d3-18da-424e-ba5b-db65e1dcfa41";

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

