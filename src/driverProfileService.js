import {
  collection,
  doc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { firebaseApp, hasFirebaseConfig } from './firebase';

export const db = hasFirebaseConfig && firebaseApp ? getFirestore(firebaseApp) : null;

function requireDb() {
  if (!db) {
    throw new Error('Firestore is not configured for this app yet.');
  }
  return db;
}

export async function saveDriverProfile({ uid, displayName, email, phone, driverProfile }) {
  if (!uid) {
    throw new Error('A signed-in member is required before saving a driver profile.');
  }

  const activeDb = requireDb();
  const profile = driverProfile || {};
  const profileRef = doc(activeDb, 'driverProfiles', uid);

  await setDoc(profileRef, {
    uid,
    displayName: displayName?.trim() || 'EMD member',
    email: email?.trim() || '',
    phone: phone?.trim() || '',
    vehicleDescription: profile.vehicleDescription?.trim() || '',
    serviceArea: profile.serviceArea?.trim() || '',
    availability: profile.availability?.trim() || '',
    coordinatorNotes: profile.coordinatorNotes?.trim() || '',
    driverLicenseCopyName: profile.driverLicenseCopyName?.trim() || '',
    insuranceCopyName: profile.insuranceCopyName?.trim() || '',
    mapOptIn: Boolean(profile.mapOptIn),
    memberDriver: Boolean(profile.memberDriver),
    memberRole: profile.memberRole || 'member',
    membershipAgreementAccepted: Boolean(profile.membershipAgreementAccepted),
    membershipStatus: profile.membershipStatus || 'pending-admin-approval',
    privateInvitationCode: profile.privateInvitationCode?.trim() || '',
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function loadNeighborhoodDrivers() {
  const activeDb = requireDb();
  const profilesQuery = query(
    collection(activeDb, 'driverProfiles'),
    where('memberDriver', '==', true),
    where('mapOptIn', '==', true),
    where('membershipStatus', '==', 'approved'),
  );
  const snapshot = await getDocs(profilesQuery);

  return snapshot.docs.map((profileDoc) => ({
    id: profileDoc.id,
    ...profileDoc.data(),
  })).sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
}
