import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { firebaseApp, hasFirebaseConfig } from './firebase';

export const ADMIN_EMAILS = ['iamoneinx@gmail.com', 'jspeters38@gmail.com', 'kbeal0007@gmail.com'];

// keep single-email export for backward compat
export const ADMIN_EMAIL = ADMIN_EMAILS[0];

export const db = hasFirebaseConfig && firebaseApp ? getFirestore(firebaseApp) : null;
export const storage = hasFirebaseConfig && firebaseApp ? getStorage(firebaseApp) : null;

function requireDb() {
  if (!db) throw new Error('Firestore is not configured for this app yet.');
  return db;
}

function requireStorage() {
  if (!storage) throw new Error('Firebase Storage is not configured for this app yet.');
  return storage;
}

function cleanFileName(fileName) {
  return (fileName || 'document')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120) || 'document';
}

async function uploadDriverDocument(uid, kind, file) {
  if (!file) return null;
  const activeStorage = requireStorage();
  const fileName = cleanFileName(file.name);
  const storagePath = `driverDocuments/${uid}/${kind}/${Date.now()}-${fileName}`;
  const storageRef = ref(activeStorage, storagePath);
  await uploadBytes(storageRef, file, {
    contentType: file.type || undefined,
    customMetadata: { uid, documentKind: kind, originalName: file.name || fileName },
  });
  const url = await getDownloadURL(storageRef);
  return { fileName: file.name || fileName, storagePath, url, uploadedAt: serverTimestamp() };
}

function requestedPublicRole(profile) {
  return profile?.role === 'driver' ? 'driver' : 'member';
}

function publicRoleForEmail(email, profile) {
  return ADMIN_EMAILS.includes(email) ? 'admin' : requestedPublicRole(profile);
}

function membershipStatusForEmail(email) {
  return ADMIN_EMAILS.includes(email) ? 'approved' : 'pending';
}

function buildPrivateDocumentData(p, licenseUpload, insuranceUpload) {
  const privateData = {
    dlNumber: p.dlNumber?.trim() || '',
    dlExpiry: p.dlExpiry?.trim() || '',
    dlCopyName: licenseUpload?.fileName || p.dlCopyName?.trim() || '',
    dlCopyUrl: licenseUpload?.url || p.dlCopyUrl || '',
    dlCopyPath: licenseUpload?.storagePath || p.dlCopyPath || '',
    hasInsurance: Boolean(p.hasInsurance),
    insuranceProvider: p.insuranceProvider?.trim() || '',
    insurancePolicyNumber: p.insurancePolicyNumber?.trim() || '',
    insuranceCost: p.insuranceCost?.toString().trim() || '',
    insuranceCopyName: insuranceUpload?.fileName || p.insuranceCopyName?.trim() || '',
    insuranceCopyUrl: insuranceUpload?.url || p.insuranceCopyUrl || '',
    insuranceCopyPath: insuranceUpload?.storagePath || p.insuranceCopyPath || '',
    insuranceShareForRate: Boolean(p.insuranceShareForRate),
    updatedAt: serverTimestamp(),
  };
  if (licenseUpload) privateData.dlCopyUploadedAt = licenseUpload.uploadedAt;
  if (insuranceUpload) privateData.insuranceCopyUploadedAt = insuranceUpload.uploadedAt;
  return privateData;
}

export async function getDriverProfile(uid) {
  if (!uid || !db) return null;
  const snapshot = await getDoc(doc(db, 'driverProfiles', uid));
  if (!snapshot.exists()) return null;

  const privateSnapshot = await getDoc(doc(db, 'driverPrivateDocuments', uid)).catch(() => null);
  return privateSnapshot?.exists?.()
    ? { ...snapshot.data(), ...privateSnapshot.data() }
    : snapshot.data();
}

export async function saveDriverProfile({ uid, displayName, email, phone, driverProfile }) {
  if (!uid) throw new Error('A signed-in user is required before saving a driver profile.');

  const activeDb = requireDb();
  const p = driverProfile || {};
  const trimmedEmail = email?.trim() || '';
  const licenseUpload = await uploadDriverDocument(uid, 'license', p.dlCopyFile);
  const insuranceUpload = await uploadDriverDocument(uid, 'insurance', p.insuranceCopyFile);

  const profileData = {
    uid,
    displayName: displayName?.trim() || 'Neighborhood driver',
    email: trimmedEmail,
    phone: phone?.trim() || '',

    // Users may request member/driver only. Privileged roles and approvals are
    // admin-only, except known admin emails which the rules also allow.
    role: publicRoleForEmail(trimmedEmail, p),
    membershipStatus: membershipStatusForEmail(trimmedEmail),

    // Emergency contact
    emergencyContactName: p.emergencyContactName?.trim() || '',
    emergencyContactPhone: p.emergencyContactPhone?.trim() || '',

    // Vehicle
    vehicleYear: p.vehicleYear?.trim() || '',
    vehicleMake: p.vehicleMake?.trim() || '',
    vehicleModel: p.vehicleModel?.trim() || '',
    vehicleColor: p.vehicleColor?.trim() || '',
    vehiclePlate: p.vehiclePlate?.trim() || '',
    vehicleSeats: p.vehicleSeats?.toString().trim() || '',
    wheelchairAccessible: Boolean(p.wheelchairAccessible),
    vehicleDescription: p.vehicleDescription?.trim() || '',

    // Service
    serviceArea: p.serviceArea?.trim() || '',
    availability: p.availability?.trim() || '',
    languagesSpoken: p.languagesSpoken?.trim() || '',
    specialCapabilities: p.specialCapabilities?.trim() || '',

    // Public booleans only; sensitive DL/insurance details live in driverPrivateDocuments/{uid}.
    hasInsurance: Boolean(p.hasInsurance),
    hasLicenseInfo: Boolean(p.dlNumber || p.dlExpiry || p.dlCopyName || licenseUpload),
    hasLicenseDocument: Boolean(p.dlCopyName || licenseUpload),
    hasInsuranceDocument: Boolean(p.insuranceCopyName || insuranceUpload),
    insuranceShareForRate: Boolean(p.insuranceShareForRate),

    // Map
    mapOptIn: Boolean(p.mapOptIn),

    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(activeDb, 'driverProfiles', uid), profileData, { merge: true });
  await setDoc(doc(activeDb, 'driverPrivateDocuments', uid), buildPrivateDocumentData(p, licenseUpload, insuranceUpload), { merge: true });
}

export async function getAllProfiles() {
  const activeDb = requireDb();
  const snapshot = await getDocs(collection(activeDb, 'driverProfiles'));
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
}

export async function updateUserRole(uid, role) {
  const activeDb = requireDb();
  await setDoc(doc(activeDb, 'driverProfiles', uid), { role, updatedAt: serverTimestamp() }, { merge: true });
}

export async function updateUserStatus(uid, membershipStatus) {
  const activeDb = requireDb();
  await setDoc(doc(activeDb, 'driverProfiles', uid), { membershipStatus, updatedAt: serverTimestamp() }, { merge: true });
}

function isApprovedProfile(profile) {
  const status = profile.membershipStatus || profile.approvalStatus;
  return ['approved', 'active'].includes(status);
}

export async function loadNeighborhoodDrivers() {
  const activeDb = requireDb();
  const snapshot = await getDocs(
    query(
      collection(activeDb, 'driverProfiles'),
      where('role', '==', 'driver'),
      where('mapOptIn', '==', true),
    )
  );
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter(isApprovedProfile)
    .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
}
