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

const storageMocks = vi.hoisted(() => ({
  getDownloadURL: vi.fn(() => Promise.resolve('https://storage.example/document')),
  getStorage: vi.fn(() => ({ name: 'mock-storage' })),
  ref: vi.fn((storage, path) => ({ storage, path })),
  uploadBytes: vi.fn(() => Promise.resolve()),
}));

vi.mock('firebase/firestore', () => firestoreMocks);
vi.mock('firebase/storage', () => storageMocks);
vi.mock('./firebase', () => ({
  firebaseApp: { name: 'mock-app' },
  hasFirebaseConfig: true,
}));

const { collection, doc, getDoc, getDocs, query, setDoc, where } = firestoreMocks;
const { getDownloadURL, ref, uploadBytes } = storageMocks;

describe('driverProfileService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves a public driver profile as pending with no sensitive document fields', async () => {
    const { saveDriverProfile } = await import('./driverProfileService');

    await saveDriverProfile({
      uid: 'user-1',
      displayName: 'Isaac Weaver',
      email: 'isaac@example.com',
      phone: '(555) 010-1842',
      driverProfile: {
        role: 'driver',
        membershipStatus: 'approved',
        vehicleDescription: 'Blue passenger van',
        serviceArea: 'North Settlement',
        availability: 'Weekday mornings',
        dlNumber: 'DL-123456',
        dlCopyName: 'isaac-license.pdf',
        hasInsurance: true,
        insuranceProvider: 'State Farm',
        insurancePolicyNumber: 'SF-001',
        insuranceCost: '1200',
        insuranceShareForRate: true,
        mapOptIn: true,
      },
    });

    expect(doc).toHaveBeenCalledWith({ name: 'mock-firestore' }, 'driverProfiles', 'user-1');
    expect(setDoc).toHaveBeenCalledWith(
      { db: { name: 'mock-firestore' }, path: 'driverProfiles', id: 'user-1' },
      expect.objectContaining({
        uid: 'user-1',
        displayName: 'Isaac Weaver',
        email: 'isaac@example.com',
        phone: '(555) 010-1842',
        role: 'driver',
        membershipStatus: 'pending',
        vehicleDescription: 'Blue passenger van',
        serviceArea: 'North Settlement',
        availability: 'Weekday mornings',
        hasInsurance: true,
        hasLicenseInfo: true,
        hasLicenseDocument: true,
        insuranceShareForRate: true,
        mapOptIn: true,
        updatedAt: 'SERVER_TIME',
      }),
      { merge: true },
    );
    const publicProfile = setDoc.mock.calls[0][1];
    expect(publicProfile).not.toHaveProperty('dlNumber');
    expect(publicProfile).not.toHaveProperty('dlCopyUrl');
    expect(publicProfile).not.toHaveProperty('dlCopyPath');
    expect(publicProfile).not.toHaveProperty('insurancePolicyNumber');
    expect(publicProfile).not.toHaveProperty('insuranceCopyUrl');
    expect(publicProfile).not.toHaveProperty('insuranceCopyPath');
    expect(uploadBytes).not.toHaveBeenCalled();
  });

  it('does not let non-admin profile saves self-assign dispatcher/admin or approved status', async () => {
    const { saveDriverProfile } = await import('./driverProfileService');

    await saveDriverProfile({
      uid: 'user-1',
      displayName: 'Escalator',
      email: 'user@example.com',
      phone: '',
      driverProfile: { role: 'admin', membershipStatus: 'approved' },
    });

    expect(setDoc.mock.calls[0][1]).toEqual(expect.objectContaining({
      role: 'member',
      membershipStatus: 'pending',
    }));
  });

  it('uploads optional driver documents and saves URLs/paths only in private documents', async () => {
    const { saveDriverProfile } = await import('./driverProfileService');
    const licenseFile = { name: 'my license.pdf', type: 'application/pdf' };
    const insuranceFile = { name: 'insurance card.png', type: 'image/png' };
    getDownloadURL
      .mockResolvedValueOnce('https://storage.example/license.pdf')
      .mockResolvedValueOnce('https://storage.example/insurance.png');

    await saveDriverProfile({
      uid: 'user-1',
      displayName: 'Isaac Weaver',
      email: 'isaac@example.com',
      phone: '555-0100',
      driverProfile: {
        role: 'driver',
        dlCopyFile: licenseFile,
        hasInsurance: true,
        insuranceCopyFile: insuranceFile,
        mapOptIn: true,
      },
    });

    expect(ref).toHaveBeenCalledWith(
      { name: 'mock-storage' },
      expect.stringMatching(/^driverDocuments\/user-1\/license\/\d+-my_license\.pdf$/),
    );
    expect(ref).toHaveBeenCalledWith(
      { name: 'mock-storage' },
      expect.stringMatching(/^driverDocuments\/user-1\/insurance\/\d+-insurance_card\.png$/),
    );
    expect(uploadBytes).toHaveBeenCalledTimes(2);
    expect(setDoc).toHaveBeenCalledWith(
      { db: { name: 'mock-firestore' }, path: 'driverProfiles', id: 'user-1' },
      expect.objectContaining({
        hasLicenseDocument: true,
        hasInsuranceDocument: true,
      }),
      { merge: true },
    );
    expect(setDoc).toHaveBeenCalledWith(
      { db: { name: 'mock-firestore' }, path: 'driverPrivateDocuments', id: 'user-1' },
      expect.objectContaining({
        dlCopyName: 'my license.pdf',
        dlCopyUrl: 'https://storage.example/license.pdf',
        dlCopyPath: expect.stringContaining('driverDocuments/user-1/license/'),
        dlCopyUploadedAt: 'SERVER_TIME',
        insuranceCopyName: 'insurance card.png',
        insuranceCopyUrl: 'https://storage.example/insurance.png',
        insuranceCopyPath: expect.stringContaining('driverDocuments/user-1/insurance/'),
        insuranceCopyUploadedAt: 'SERVER_TIME',
      }),
      { merge: true },
    );
    const savedProfile = setDoc.mock.calls[0][1];
    expect(savedProfile.dlCopyFile).toBeUndefined();
    expect(savedProfile.insuranceCopyFile).toBeUndefined();
    expect(savedProfile.dlCopyUrl).toBeUndefined();
    expect(savedProfile.insuranceCopyUrl).toBeUndefined();
  });

  it('loads map-opted drivers filtered by role=driver and explicit approved status', async () => {
    const { loadNeighborhoodDrivers } = await import('./driverProfileService');
    getDocs.mockResolvedValue({
      docs: [
        { id: 'user-1', data: () => ({ displayName: 'Isaac Weaver', serviceArea: 'North Settlement', membershipStatus: 'approved' }) },
        { id: 'user-2', data: () => ({ displayName: 'Pending Driver', serviceArea: 'South', membershipStatus: 'pending' }) },
        { id: 'user-3', data: () => ({ displayName: 'Legacy Driver', serviceArea: 'East' }) },
        { id: 'user-4', data: () => ({ displayName: 'Suspended Driver', serviceArea: 'West', membershipStatus: 'suspended' }) },
      ],
    });

    const drivers = await loadNeighborhoodDrivers();

    expect(collection).toHaveBeenCalledWith({ name: 'mock-firestore' }, 'driverProfiles');
    expect(where).toHaveBeenCalledWith('role', '==', 'driver');
    expect(where).toHaveBeenCalledWith('mapOptIn', '==', true);
    expect(query).toHaveBeenCalled();
    expect(drivers).toEqual([
      { id: 'user-1', displayName: 'Isaac Weaver', serviceArea: 'North Settlement', membershipStatus: 'approved' },
    ]);
  });

  it('returns null from getDriverProfile when no document exists', async () => {
    const { getDriverProfile } = await import('./driverProfileService');
    getDoc.mockResolvedValue({ exists: () => false });

    const result = await getDriverProfile('user-1');
    expect(result).toBeNull();
  });

  it('returns public data from getDriverProfile when private document is absent', async () => {
    const { getDriverProfile } = await import('./driverProfileService');
    getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ role: 'driver', displayName: 'Isaac Weaver' }) })
      .mockResolvedValueOnce({ exists: () => false });

    const result = await getDriverProfile('user-1');
    expect(result).toEqual({ role: 'driver', displayName: 'Isaac Weaver' });
  });

  it('merges private documents for the owner profile only through private document read', async () => {
    const { getDriverProfile } = await import('./driverProfileService');
    getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ role: 'driver', displayName: 'Isaac Weaver' }) })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ dlCopyUrl: 'https://private.example/license.pdf' }) });

    const result = await getDriverProfile('user-1');

    expect(doc).toHaveBeenCalledWith({ name: 'mock-firestore' }, 'driverPrivateDocuments', 'user-1');
    expect(result).toEqual({ role: 'driver', displayName: 'Isaac Weaver', dlCopyUrl: 'https://private.example/license.pdf' });
  });
});
