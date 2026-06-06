import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  collection: vi.fn((db, path) => ({ db, path })),
  doc: vi.fn((db, path, id) => ({ db, path, id })),
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

const { collection, doc, getDocs, query, setDoc, where } = firestoreMocks;

describe('driverProfileService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves an EMD member driver portfolio to a shared Firestore profile document', async () => {
    const { saveDriverProfile } = await import('./driverProfileService');

    await saveDriverProfile({
      uid: 'member-123',
      displayName: 'Isaac Weaver',
      email: 'isaac@example.com',
      phone: '(555) 010-1842',
      driverProfile: {
        vehicleDescription: 'Blue passenger van',
        serviceArea: 'North Settlement',
        availability: 'Weekday mornings',
        coordinatorNotes: 'Can handle wheelchair trips',
        mapOptIn: true,
        memberDriver: true,
      },
    });

    expect(doc).toHaveBeenCalledWith({ name: 'mock-firestore' }, 'driverProfiles', 'member-123');
    expect(setDoc).toHaveBeenCalledWith(
      { db: { name: 'mock-firestore' }, path: 'driverProfiles', id: 'member-123' },
      expect.objectContaining({
        uid: 'member-123',
        displayName: 'Isaac Weaver',
        email: 'isaac@example.com',
        phone: '(555) 010-1842',
        vehicleDescription: 'Blue passenger van',
        serviceArea: 'North Settlement',
        availability: 'Weekday mornings',
        coordinatorNotes: 'Can handle wheelchair trips',
        mapOptIn: true,
        memberDriver: true,
      }),
      { merge: true },
    );
  });

  it('loads map-opted member drivers for dispatcher map lookup', async () => {
    const { loadNeighborhoodDrivers } = await import('./driverProfileService');
    getDocs.mockResolvedValue({
      docs: [
        { id: 'member-123', data: () => ({ displayName: 'Isaac Weaver', serviceArea: 'North Settlement' }) },
      ],
    });

    const drivers = await loadNeighborhoodDrivers();

    expect(collection).toHaveBeenCalledWith({ name: 'mock-firestore' }, 'driverProfiles');
    expect(where).toHaveBeenCalledWith('memberDriver', '==', true);
    expect(where).toHaveBeenCalledWith('mapOptIn', '==', true);
    expect(query).toHaveBeenCalled();
    expect(drivers).toEqual([
      { id: 'member-123', displayName: 'Isaac Weaver', serviceArea: 'North Settlement' },
    ]);
  });
});
