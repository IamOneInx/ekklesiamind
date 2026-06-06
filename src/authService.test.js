import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = { app: 'auth' };
const userMock = { uid: 'driver-1', email: 'driver@example.com' };
const createUserWithEmailAndPassword = vi.fn();
const signInWithEmailAndPassword = vi.fn();
const signOut = vi.fn();
const signInWithRedirect = vi.fn();
const signInWithPopup = vi.fn();
const updateProfile = vi.fn();
const googleProviderMock = { providerId: 'google.com' };
const GoogleAuthProvider = vi.fn(function GoogleAuthProvider() {
  return googleProviderMock;
});

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => authMock),
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  GoogleAuthProvider,
}));

vi.mock('./firebase', () => ({
  firebaseApp: { name: 'ekklesiamind' },
  hasFirebaseConfig: true,
}));

const { registerMember, signInMember, signInWithGoogle, signOutMember } = await import('./authService');

describe('auth service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createUserWithEmailAndPassword.mockResolvedValue({ user: userMock });
    signInWithEmailAndPassword.mockResolvedValue({ user: userMock });
    signInWithPopup.mockResolvedValue({ user: userMock });
    signInWithRedirect.mockResolvedValue(undefined);
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

  it('signs an EMD member in with Google popup auth', async () => {
    const user = await signInWithGoogle();

    expect(GoogleAuthProvider).toHaveBeenCalledWith();
    expect(signInWithPopup).toHaveBeenCalledWith(authMock, googleProviderMock);
    expect(user).toBe(userMock);
  });

  it('falls back to Google redirect when popup sign-in is cancelled or blocked', async () => {
    signInWithPopup.mockRejectedValueOnce({ code: 'auth/popup-closed-by-user' });

    const user = await signInWithGoogle();

    expect(user).toBeNull();
    expect(signInWithRedirect).toHaveBeenCalledWith(authMock, googleProviderMock);
  });

  it('signs an EMD member in and out with Firebase Auth', async () => {
    await signInMember({ email: 'driver@example.com', password: 'quiet-service-123' });
    await signOutMember();

    expect(signInWithEmailAndPassword).toHaveBeenCalledWith(authMock, 'driver@example.com', 'quiet-service-123');
    expect(signOut).toHaveBeenCalledWith(authMock);
  });
});
