import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
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

export async function signInWithGoogle() {
  const activeAuth = requireAuth();
  const provider = new GoogleAuthProvider();

  try {
    const credential = await signInWithPopup(activeAuth, provider);
    return credential.user;
  } catch (error) {
    if (['auth/popup-closed-by-user', 'auth/popup-blocked', 'auth/cancelled-popup-request'].includes(error?.code)) {
      await signInWithRedirect(activeAuth, provider);
      return null;
    }

    throw error;
  }
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
