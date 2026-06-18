import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  addDoc: vi.fn(),
  collection: vi.fn((db, path) => ({ db, path })),
  doc: vi.fn((db, path, id) => ({ db, path, id })),
  getDocs: vi.fn(),
  getFirestore: vi.fn(() => ({ name: 'mock-firestore' })),
  query: vi.fn((...parts) => ({ parts })),
  serverTimestamp: vi.fn(() => 'SERVER_TIME'),
  updateDoc: vi.fn(),
  where: vi.fn((field, operator, value) => ({ type: 'where', field, operator, value })),
}));

vi.mock('firebase/firestore', () => firestoreMocks);
vi.mock('./firebase', () => ({
  firebaseApp: { name: 'mock-app' },
  hasFirebaseConfig: true,
}));

const { addDoc, collection, doc, getDocs, query, updateDoc, where } = firestoreMocks;

describe('tripService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addDoc.mockResolvedValue({ id: 'trip-1' });
  });

  it('creates a sanitized Firestore trip record from call intake', async () => {
    const { createTrip } = await import('./tripService');

    const result = await createTrip({
      createdByUid: 'driver-1',
      createdByName: ' Isaac Driver ',
      createdByRole: 'driver',
      trip: {
        callerName: ' Anna Yoder ',
        callerPhone: ' 555-0199 ',
        callerRelationship: 'plain_neighbor',
        urgency: 'immediate',
        neighborName: ' Eli Yoder ',
        purpose: 'Ride home',
        pickupAddress: ' Market Street ',
        appointmentAddress: 'Yoder farm',
        appointmentTime: '',
        reminderMinutes: '15',
        returnNeeded: false,
        status: 'not-a-real-status',
        notes: ' Bring walker ',
        unexpectedField: 'do not save',
      },
    });

    expect(collection).toHaveBeenCalledWith({ name: 'mock-firestore' }, 'trips');
    expect(addDoc).toHaveBeenCalledWith(
      { db: { name: 'mock-firestore' }, path: 'trips' },
      expect.objectContaining({
        callerName: 'Anna Yoder',
        callerPhone: '555-0199',
        callerRelationship: 'plain_neighbor',
        urgency: 'immediate',
        neighborName: 'Eli Yoder',
        pickupAddress: 'Market Street',
        appointmentTime: '',
        reminderMinutes: 15,
        returnNeeded: false,
        status: 'scheduled',
        createdByUid: 'driver-1',
        createdByName: 'Isaac Driver',
        createdByRole: 'driver',
        createdAt: 'SERVER_TIME',
        updatedAt: 'SERVER_TIME',
      }),
    );
    expect(addDoc.mock.calls[0][1]).not.toHaveProperty('unexpectedField');
    expect(result.id).toBe('trip-1');
  });

  it('does not require appointment time for immediate ride validation', async () => {
    const { validateTripForCreate } = await import('./tripService');

    expect(validateTripForCreate({
      urgency: 'immediate',
      neighborName: 'Eli Yoder',
      pickupAddress: 'Market Street',
    })).toEqual(expect.objectContaining({
      urgency: 'immediate',
      appointmentTime: '',
    }));
  });

  it('filters loaded trips for drivers to created or assigned trips only', async () => {
    const { loadTripsForProfile } = await import('./tripService');
    getDocs.mockResolvedValueOnce({
      docs: [
        { id: 'created', data: () => ({ createdByUid: 'driver-1', status: 'scheduled', pickupTime: '2026-06-10T08:00' }) },
      ],
    }).mockResolvedValueOnce({
      docs: [
        { id: 'assigned', data: () => ({ createdByUid: 'dispatcher-1', assignedDriverUid: 'driver-1', status: 'active', pickupTime: '2026-06-11T08:00' }) },
      ],
    });

    const trips = await loadTripsForProfile({
      uid: 'driver-1',
      profile: { role: 'driver', membershipStatus: 'approved' },
    });

    expect(trips.map((trip) => trip.id)).toEqual(['assigned', 'created']);
    expect(where).toHaveBeenCalledWith('createdByUid', '==', 'driver-1');
    expect(where).toHaveBeenCalledWith('assignedDriverUid', '==', 'driver-1');
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('filters dispatcher/admin loads to active open trips', async () => {
    const { loadTripsForProfile } = await import('./tripService');
    getDocs.mockResolvedValue({
      docs: [
        { id: 'open', data: () => ({ status: 'scheduled', pickupTime: '2026-06-10T08:00' }) },
        { id: 'active', data: () => ({ status: 'active', pickupTime: '2026-06-11T08:00' }) },
        { id: 'done', data: () => ({ status: 'completed', pickupTime: '2026-06-12T08:00' }) },
      ],
    });

    const trips = await loadTripsForProfile({
      uid: 'dispatcher-1',
      profile: { role: 'dispatcher', membershipStatus: 'approved' },
    });

    expect(trips.map((trip) => trip.id)).toEqual(['active', 'open']);
  });

  it('preserves mission status vocabulary when updating trip status', async () => {
    const { updateTripStatus } = await import('./tripService');

    await expect(updateTripStatus({ tripId: 'trip-1', status: 'pickup-arrived' })).resolves.toBe('pickup-arrived');
    expect(doc).toHaveBeenCalledWith({ name: 'mock-firestore' }, 'trips', 'trip-1');
    expect(updateDoc).toHaveBeenCalledWith(
      { db: { name: 'mock-firestore' }, path: 'trips', id: 'trip-1' },
      { status: 'pickup-arrived', updatedAt: 'SERVER_TIME' },
    );

    await expect(updateTripStatus({ tripId: 'trip-1', status: 'appointment-arrived' })).resolves.toBe('appointment-arrived');
    expect(updateDoc).toHaveBeenLastCalledWith(
      { db: { name: 'mock-firestore' }, path: 'trips', id: 'trip-1' },
      { status: 'appointment-arrived', updatedAt: 'SERVER_TIME' },
    );
  });
});
