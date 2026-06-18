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
import { firebaseApp, hasFirebaseConfig } from './firebase';

export const db = hasFirebaseConfig && firebaseApp ? getFirestore(firebaseApp) : null;

function requireDb() {
  if (!db) throw new Error('Firestore is not configured.');
  return db;
}

export async function updateDriverLocation({ uid, lat, lng, isOnDuty, displayName, serviceArea, vehicleDescription }) {
  const activeDb = requireDb();
  await setDoc(doc(activeDb, 'driverLocations', uid), {
    uid,
    lat,
    lng,
    isOnDuty: Boolean(isOnDuty),
    displayName: displayName || '',
    serviceArea: serviceArea || '',
    vehicleDescription: vehicleDescription || '',
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

function isApprovedDriverProfile(profile) {
  const status = profile?.membershipStatus || profile?.approvalStatus;
  return profile?.role === 'driver' && profile?.mapOptIn === true && ['approved', 'active'].includes(status);
}

export async function loadOnDutyDrivers() {
  const activeDb = requireDb();
  const snapshot = await getDocs(
    query(collection(activeDb, 'driverLocations'), where('isOnDuty', '==', true))
  );
  const candidates = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  const filtered = await Promise.all(candidates.map(async (location) => {
    const uid = location.uid || location.id;
    const profileSnapshot = await getDoc(doc(activeDb, 'driverProfiles', uid)).catch(() => null);
    if (!profileSnapshot?.exists?.()) return null;
    const profile = { id: uid, ...profileSnapshot.data() };
    if (!isApprovedDriverProfile(profile)) return null;
    return { ...location, ...profile, lat: location.lat, lng: location.lng, isOnDuty: location.isOnDuty };
  }));
  return filtered.filter(Boolean);
}

export function watchDriverLocation(onUpdate, onError) {
  if (!navigator.geolocation) {
    onError('Geolocation is not supported by your browser.');
    return () => {};
  }
  const watchId = navigator.geolocation.watchPosition(
    (position) => onUpdate({ lat: position.coords.latitude, lng: position.coords.longitude }),
    (err) => onError(err.message),
    { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 }
  );
  return () => navigator.geolocation.clearWatch(watchId);
}

export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function mapsUrl(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
