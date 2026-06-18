import {
  addDoc,
  collection,
  doc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { firebaseApp, hasFirebaseConfig } from './firebase';

export const TRIPS_COLLECTION = 'trips';
export const db = hasFirebaseConfig && firebaseApp ? getFirestore(firebaseApp) : null;

const ACTIVE_STATUSES = ['scheduled', 'active', 'pickup-arrived', 'appointment-arrived', 'returning'];
const ALLOWED_URGENCIES = ['scheduled', 'immediate'];
const ALLOWED_RELATIONSHIPS = ['church_member', 'plain_neighbor', 'other'];
const ALLOWED_STATUSES = [...ACTIVE_STATUSES, 'completed', 'cancelled'];

function requireDb() {
  if (!db) throw new Error('Firestore is not configured.');
  return db;
}

function cleanString(value, maxLength = 500) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function cleanNullableString(value, maxLength = 500) {
  const cleaned = cleanString(value, maxLength);
  return cleaned || null;
}

function normalizeUrgency(value) {
  return ALLOWED_URGENCIES.includes(value) ? value : 'scheduled';
}

function normalizeRelationship(value) {
  return ALLOWED_RELATIONSHIPS.includes(value) ? value : 'other';
}

function normalizeStatus(value) {
  return ALLOWED_STATUSES.includes(value) ? value : 'scheduled';
}

export function sanitizeTrip(trip = {}) {
  const urgency = normalizeUrgency(trip.urgency);
  return {
    callerName: cleanString(trip.callerName, 120),
    callerPhone: cleanString(trip.callerPhone, 40),
    callerRelationship: normalizeRelationship(trip.callerRelationship),
    urgency,
    neighborName: cleanString(trip.neighborName, 120),
    purpose: cleanString(trip.purpose, 160),
    pickupAddress: cleanString(trip.pickupAddress, 240),
    appointmentAddress: cleanString(trip.appointmentAddress, 240),
    pickupTime: cleanString(trip.pickupTime, 40),
    appointmentTime: cleanString(trip.appointmentTime, 40),
    reminderMinutes: Number.isFinite(Number(trip.reminderMinutes)) ? Number(trip.reminderMinutes) : 30,
    returnNeeded: Boolean(trip.returnNeeded),
    notes: cleanString(trip.notes, 1000),
    status: normalizeStatus(trip.status),
    miles: Number.isFinite(Number(trip.miles)) ? Number(trip.miles) : 0,
    minutes: Number.isFinite(Number(trip.minutes)) ? Number(trip.minutes) : 0,
    donationAmount: Number.isFinite(Number(trip.donationAmount)) ? Number(trip.donationAmount) : 0,
    assignedDriverUid: cleanNullableString(trip.assignedDriverUid, 128),
    assignedDriverName: cleanNullableString(trip.assignedDriverName, 120),
    assignedDriverPhone: cleanNullableString(trip.assignedDriverPhone, 40),
    assignedDriverVehicle: cleanNullableString(trip.assignedDriverVehicle, 160),
  };
}

export function validateTripForCreate(trip = {}) {
  const sanitized = sanitizeTrip(trip);
  if (!sanitized.neighborName) throw new Error('Neighbor name is required.');
  if (!sanitized.pickupAddress) throw new Error('Pickup address is required.');
  if (!sanitized.pickupTime && sanitized.urgency !== 'immediate') throw new Error('Pickup time is required.');
  if (!sanitized.appointmentTime && sanitized.urgency !== 'immediate') throw new Error('Appointment time is required for scheduled appointments.');
  return sanitized;
}

export function canLoadDispatchTrips(profile = {}) {
  const status = profile?.membershipStatus || profile?.approvalStatus;
  return ['approved', 'active'].includes(status) && ['dispatcher', 'admin'].includes(profile?.role);
}

export function canLoadDriverTrips(uid, profile = {}) {
  const status = profile?.membershipStatus || profile?.approvalStatus;
  return Boolean(uid) && ['approved', 'active'].includes(status) && profile?.role === 'driver';
}

function sortTripsNewestFirst(trips) {
  return [...trips].sort((a, b) => {
    const aTime = a.createdAt?.toMillis?.() ?? Date.parse(a.createdAt || a.pickupTime || '') ?? 0;
    const bTime = b.createdAt?.toMillis?.() ?? Date.parse(b.createdAt || b.pickupTime || '') ?? 0;
    return bTime - aTime;
  });
}

export async function createTrip({ createdByUid, createdByName, createdByRole, trip }) {
  const activeDb = requireDb();
  const sanitized = validateTripForCreate(trip);
  const creatorUid = cleanString(createdByUid, 128);
  if (!creatorUid) throw new Error('A signed-in driver or dispatcher is required to create a trip.');

  const record = {
    ...sanitized,
    createdByUid: creatorUid,
    createdByName: cleanString(createdByName, 120),
    createdByRole: cleanString(createdByRole || 'driver', 40),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(activeDb, TRIPS_COLLECTION), record);
  return { id: ref.id, ...record };
}

export async function loadTripsForProfile({ uid, profile, isAdmin = false }) {
  const activeDb = requireDb();
  const dispatcher = isAdmin || canLoadDispatchTrips(profile);
  const driver = canLoadDriverTrips(uid, profile);

  if (driver && !dispatcher) {
    const createdSnapshot = await getDocs(query(collection(activeDb, TRIPS_COLLECTION), where('createdByUid', '==', uid)));
    const assignedSnapshot = await getDocs(query(collection(activeDb, TRIPS_COLLECTION), where('assignedDriverUid', '==', uid)));
    const byId = new Map();
    [...createdSnapshot.docs, ...assignedSnapshot.docs].forEach((d) => {
      byId.set(d.id, { id: d.id, ...d.data() });
    });
    return sortTripsNewestFirst([...byId.values()]);
  }

  const snapshot = await getDocs(collection(activeDb, TRIPS_COLLECTION));
  const allTrips = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  const visible = allTrips.filter((trip) => {
    if (dispatcher) return ACTIVE_STATUSES.includes(trip.status || 'scheduled');
    return false;
  });

  return sortTripsNewestFirst(visible);
}

export async function updateTripStatus({ tripId, status }) {
  const activeDb = requireDb();
  const nextStatus = normalizeStatus(status);
  await updateDoc(doc(activeDb, TRIPS_COLLECTION, tripId), {
    status: nextStatus,
    updatedAt: serverTimestamp(),
  });
  return nextStatus;
}

export async function assignTripDriver({ tripId, driver }) {
  const activeDb = requireDb();
  const assignment = {
    assignedDriverUid: cleanNullableString(driver?.uid || driver?.id, 128),
    assignedDriverName: cleanNullableString(driver?.displayName, 120),
    assignedDriverPhone: cleanNullableString(driver?.phone, 40),
    assignedDriverVehicle: cleanNullableString(driver?.vehicleDescription || [driver?.vehicleYear, driver?.vehicleMake, driver?.vehicleModel].filter(Boolean).join(' '), 160),
    updatedAt: serverTimestamp(),
  };
  await updateDoc(doc(activeDb, TRIPS_COLLECTION, tripId), assignment);
  return assignment;
}

export async function unassignTripDriver({ tripId }) {
  const activeDb = requireDb();
  const assignment = {
    assignedDriverUid: null,
    assignedDriverName: null,
    assignedDriverPhone: null,
    assignedDriverVehicle: null,
    updatedAt: serverTimestamp(),
  };
  await updateDoc(doc(activeDb, TRIPS_COLLECTION, tripId), assignment);
  return assignment;
}
