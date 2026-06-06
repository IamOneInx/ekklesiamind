import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = { app: 'auth' };
const userMock = { uid: 'driver-1', email: 'driver@example.com' };
const createUserWithEmailAndPassword = vi.fn();
const signInWithEmailAndPassword = vi.fn();
const signOut = vi.fn();
const updateProfile = vi.fn();

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => authMock),
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
}));

vi.mock('./firebase', () => ({
  firebaseApp: { name: 'ekklesiamind' },
  hasFirebaseConfig: true,
}));

const { registerMember, signInMember, signOutMember } = await import('./authService');

describe('auth service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createUserWithEmailAndPassword.mockResolvedValue({ user: userMock });
    signInWithEmailAndPassword.mockResolvedValue({ user: userMock });
    signOut.mockResolvedValue(undefined);
    updateProfile.mockResolvedValue(undefined);
  });

  it('creates a Firebase Auth user and saves the member display name', async () => {
    const user = await registerMember({
      email: 'driver@example.com',
      password: 'quiet-service-123',
      displayName: 'Isaac Weaver',
    });

    expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(authMock, 'driver@example.com', 'quiet-service-123');
    expect(updateProfile).toHaveBeenCalledWith(userMock, { displayName: 'Isaac Weaver' });
    expect(user).toMatchObject({ email: 'driver@example.com', displayName: 'Isaac Weaver' });
  });

  it('signs an EMD member in and out with Firebase Auth', async () => {
    await signInMember({ email: 'driver@example.com', password: 'quiet-service-123' });
    await signOutMember();

    expect(signInWithEmailAndPassword).toHaveBeenCalledWith(authMock, 'driver@example.com', 'quiet-service-123');
    expect(signOut).toHaveBeenCalledWith(authMock);
  });
});
