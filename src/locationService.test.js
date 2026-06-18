import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  collection: vi.fn((db, path) => ({ db, path })),
  doc: vi.fn((db, path, id) => ({ db, path, id })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  getFirestore: vi.fn(() => ({ name: 'mock-firestore' })),
  query: vi.fn((...parts) => ({ parts })),
  serverTimestamp: vi.fn(() => 'SERVER_TIME'),
  setDoc: vi.fn(),
  where: vi.fn((field, operator, value) => ({ type: 'where', field, operator, value })),
}));

vi.mock('firebase/firestore', () => firestoreMocks);
vi.mock('./firebase', () => ({
  firebaseApp: { name: 'mock-app' },
  hasFirebaseConfig: true,
}));

const { collection, doc, getDoc, getDocs, query, where } = firestoreMocks;

describe('locationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads on-duty drivers only when profile is approved active driver and map opted in', async () => {
    const { loadOnDutyDrivers } = await import('./locationService');
    getDocs.mockResolvedValue({
      docs: [
        { id: 'approved', data: () => ({ uid: 'approved', lat: 1, lng: 2, isOnDuty: true, displayName: 'Location Name' }) },
        { id: 'pending', data: () => ({ uid: 'pending', lat: 3, lng: 4, isOnDuty: true }) },
        { id: 'missing', data: () => ({ uid: 'missing', lat: 5, lng: 6, isOnDuty: true }) },
        { id: 'dispatcher', data: () => ({ uid: 'dispatcher', lat: 7, lng: 8, isOnDuty: true }) },
        { id: 'optout', data: () => ({ uid: 'optout', lat: 9, lng: 10, isOnDuty: true }) },
      ],
    });
    getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ uid: 'approved', role: 'driver', mapOptIn: true, membershipStatus: 'approved', displayName: 'Approved Driver' }) })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ uid: 'pending', role: 'driver', mapOptIn: true, membershipStatus: 'pending', displayName: 'Pending Driver' }) })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ uid: 'missing', role: 'driver', mapOptIn: true, displayName: 'Missing Status' }) })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ uid: 'dispatcher', role: 'dispatcher', mapOptIn: true, membershipStatus: 'approved', displayName: 'Dispatcher' }) })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ uid: 'optout', role: 'driver', mapOptIn: false, membershipStatus: 'approved', displayName: 'Opt Out' }) });

    const drivers = await loadOnDutyDrivers();

    expect(collection).toHaveBeenCalledWith({ name: 'mock-firestore' }, 'driverLocations');
    expect(where).toHaveBeenCalledWith('isOnDuty', '==', true);
    expect(query).toHaveBeenCalled();
    expect(doc).toHaveBeenCalledWith({ name: 'mock-firestore' }, 'driverProfiles', 'approved');
    expect(drivers).toEqual([
      {
        id: 'approved',
        uid: 'approved',
        lat: 1,
        lng: 2,
        isOnDuty: true,
        role: 'driver',
        mapOptIn: true,
        membershipStatus: 'approved',
        displayName: 'Approved Driver',
      },
    ]);
  });
});
