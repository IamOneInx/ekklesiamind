import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { firebaseApp, hasFirebaseConfig } from './firebase';

export const auth = hasFirebaseConfig && firebaseApp ? getAuth(firebaseApp) : null;

function requireAuth() {
  if (!auth) {
    throw new Error('Firebase Auth is not configured for this app yet.');
  }
  return auth;
}

export async function registerMember({ email, password, displayName }) {
  const credential = await createUserWithEmailAndPassword(requireAuth(), email.trim(), password);
  const safeDisplayName = displayName.trim();

  if (safeDisplayName) {
    await updateProfile(credential.user, { displayName: safeDisplayName });
  }

  return { ...credential.user, displayName: safeDisplayName || credential.user.displayName };
}

export async function signInMember({ email, password }) {
  const credential = await signInWithEmailAndPassword(requireAuth(), email.trim(), password);
  return credential.user;
}

export async function signOutMember() {
  await signOut(requireAuth());
}

export function subscribeAuthState(callback) {
  if (!auth) {
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, callback);
}
