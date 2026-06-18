import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

const authServiceMocks = vi.hoisted(() => ({
  checkRedirectResult: vi.fn(() => Promise.resolve(null)),
  registerMember: vi.fn(),
  signInMember: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOutMember: vi.fn(),
  subscribeAuthState: vi.fn(() => () => {}),
}));

const driverProfileServiceMocks = vi.hoisted(() => ({
  ADMIN_EMAILS: ['admin@example.com'],
  getAllProfiles: vi.fn(),
  getDriverProfile: vi.fn(),
  loadNeighborhoodDrivers: vi.fn(),
  saveDriverProfile: vi.fn(),
  updateUserRole: vi.fn(),
  updateUserStatus: vi.fn(),
}));

const locationServiceMocks = vi.hoisted(() => ({
  loadOnDutyDrivers: vi.fn(),
  updateDriverLocation: vi.fn(),
  watchDriverLocation: vi.fn(() => () => {}),
  mapsUrl: vi.fn((lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`),
}));

vi.mock('./authService', () => authServiceMocks);
vi.mock('./driverProfileService', () => driverProfileServiceMocks);
vi.mock('./locationService', () => locationServiceMocks);

const { registerMember, signInMember, signInWithGoogle, signOutMember } = authServiceMocks;
const { getDriverProfile, saveDriverProfile } = driverProfileServiceMocks;
const { loadOnDutyDrivers } = locationServiceMocks;

const mockUser = { uid: 'user-1', displayName: 'Isaac Weaver', email: 'isaac@example.com' };
const mockProfile = { role: 'driver', displayName: 'Isaac Weaver', vehicleDescription: 'Blue van', serviceArea: 'North Settlement', availability: 'Weekday mornings', mapOptIn: true };

describe('App — landing and auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerMember.mockResolvedValue(mockUser);
    signInMember.mockResolvedValue(mockUser);
    signInWithGoogle.mockResolvedValue(mockUser);
    signOutMember.mockResolvedValue(undefined);
    getDriverProfile.mockResolvedValue(mockProfile);
    saveDriverProfile.mockResolvedValue(undefined);
    loadOnDutyDrivers.mockResolvedValue([]);
  });

  it('shows the landing page by default with Sign In and Join buttons', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /Neighbors helping/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Sign In/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /Join/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('shows the sign-up page with role selector when Join is clicked', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getAllByRole('button', { name: /Join the Network/i })[0]);
    expect(screen.getByRole('heading', { name: /Join the neighborhood/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Account type/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue with Google/i })).toBeInTheDocument();
  });

  it('shows the sign-in page when Sign In is clicked', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getAllByRole('button', { name: /^Sign In$/i })[0]);
    expect(screen.getByRole('heading', { name: /Welcome back/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign in with Google/i })).toBeInTheDocument();
  });

  it('reveals driver fields when Driver role is selected in sign-up', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getAllByRole('button', { name: /Join the Network/i })[0]);
    await user.click(screen.getByRole('button', { name: /🚗 Driver/i }));
    expect(screen.getByRole('heading', { name: /Driver details/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/License number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/I carry personal auto insurance/i)).toBeInTheDocument();
  });

  it('reveals insurance fields when insurance checkbox is checked', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getAllByRole('button', { name: /Join the Network/i })[0]);
    await user.click(screen.getByRole('button', { name: /🚗 Driver/i }));
    await user.click(screen.getByLabelText(/I carry personal auto insurance/i));
    expect(screen.getByLabelText(/Insurance provider/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Policy number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Annual premium/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Share my insurance info/i)).toBeInTheDocument();
  });

  it('signs in with Google and goes to the main app when profile exists', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getAllByRole('button', { name: /^Sign In$/i })[0]);
    await user.click(screen.getByRole('button', { name: /Sign in with Google/i }));
    expect(signInWithGoogle).toHaveBeenCalled();
    expect(await screen.findByRole('navigation', { name: /Main navigation/i })).toBeInTheDocument();
  });

  it('goes to profile setup when Google user has no profile', async () => {
    getDriverProfile.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getAllByRole('button', { name: /^Sign In$/i })[0]);
    await user.click(screen.getByRole('button', { name: /Sign in with Google/i }));
    expect(await screen.findByRole('heading', { name: /Complete your profile/i })).toBeInTheDocument();
  });

  it('creates an account and saves driver profile', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getAllByRole('button', { name: /Join the Network/i })[0]);
    await user.click(screen.getByRole('button', { name: /🚗 Driver/i }));
    await user.type(screen.getByLabelText(/Full name/i), 'Isaac Weaver');
    await user.type(screen.getByLabelText(/^Phone$/i), '555-0100');
    await user.type(screen.getByLabelText(/^Email$/i), 'isaac@example.com');
    await user.type(screen.getByLabelText(/Password/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /Create Account/i }));
    expect(registerMember).toHaveBeenCalledWith(expect.objectContaining({ email: 'isaac@example.com' }));
    expect(saveDriverProfile).toHaveBeenCalledWith(expect.objectContaining({ uid: 'user-1' }));
    expect(await screen.findByRole('navigation', { name: /Main navigation/i })).toBeInTheDocument();
  });
});

describe('App — main app trip workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInWithGoogle.mockResolvedValue(mockUser);
    getDriverProfile.mockResolvedValue(mockProfile);
    saveDriverProfile.mockResolvedValue(undefined);
    loadOnDutyDrivers.mockResolvedValue([]);
    authServiceMocks.subscribeAuthState.mockImplementation((cb) => {
      cb(mockUser);
      return () => {};
    });
  });

  async function renderSignedIn() {
    render(<App />);
    await screen.findByRole('navigation', { name: /Main navigation/i });
  }

  it('advances a scheduled trip when the action button is clicked', async () => {
    const user = userEvent.setup();
    await renderSignedIn();
    await user.click(screen.getByRole('button', { name: 'Trip' }));
    const activePanel = screen.getByRole('region', { name: /active trip/i });
    await user.click(within(activePanel).getByRole('button', { name: /^Start Trip$/i }));
    expect(within(activePanel).getByRole('button', { name: /Arrived at Pickup/i })).toBeInTheDocument();
    expect(within(activePanel).getByText('Active')).toBeInTheDocument();
  });

  it('adds a new trip and switches to the Trip tab', async () => {
    const user = userEvent.setup();
    await renderSignedIn();
    await user.click(screen.getByRole('button', { name: 'Schedule' }));
    const form = screen.getByRole('form', { name: /Schedule Apt/i });
    await user.type(within(form).getByRole('textbox', { name: /Neighbor name/i }), 'Mary Beiler');
    await user.type(within(form).getByRole('textbox', { name: /Purpose/i }), 'Dentist appointment');
    await user.type(within(form).getByRole('textbox', { name: /Pickup address/i }), 'Beiler farm');
    await user.type(within(form).getByRole('textbox', { name: /Appointment address/i }), 'Town dental office');
    fireEvent.change(within(form).getByLabelText(/Pickup time/i), { target: { value: '2026-06-10T08:30' } });
    fireEvent.change(within(form).getByLabelText(/Appointment time/i), { target: { value: '2026-06-10T09:15' } });
    await user.click(within(form).getByRole('button', { name: /Add to Schedule/i }));
    const activePanel = screen.getByRole('region', { name: /active trip/i });
    expect(within(activePanel).getByText('Mary Beiler')).toBeInTheDocument();
  });

  it('shows donation settings and receipt in the Trip tab', async () => {
    await renderSignedIn();
    fireEvent.click(screen.getByRole('button', { name: 'Trip' }));
    expect(screen.getByRole('heading', { name: /Suggested Donation Settings/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Trip Receipt/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Print Trip Receipt/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Donations are voluntary/i).length).toBeGreaterThanOrEqual(1);
  });
});
