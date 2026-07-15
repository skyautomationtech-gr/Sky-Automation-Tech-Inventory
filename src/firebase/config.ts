import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
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
export const db = getFirestore(app, "ai-studio-6630a5d3-18da-424e-ba5b-db65e1dcfa41");

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
