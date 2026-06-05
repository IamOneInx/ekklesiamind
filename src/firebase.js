import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const requiredConfigFields = ['apiKey', 'authDomain', 'projectId', 'appId'];
export const hasFirebaseConfig = requiredConfigFields.every((field) => Boolean(firebaseConfig[field]));

export const firebaseApp = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;

export async function initializeAnalytics() {
  if (!firebaseApp || typeof window === 'undefined') {
    return null;
  }

  const supported = await isSupported();
  return supported ? getAnalytics(firebaseApp) : null;
}
