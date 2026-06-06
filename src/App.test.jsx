import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

const authServiceMocks = vi.hoisted(() => ({
  registerMember: vi.fn(),
  signInMember: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOutMember: vi.fn(),
  subscribeAuthState: vi.fn(() => () => {}),
}));

vi.mock('./authService', () => authServiceMocks);

const { registerMember, signInMember, signInWithGoogle, signOutMember } = authServiceMocks;

describe('App trip workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerMember.mockResolvedValue({ displayName: 'Isaac Weaver', email: 'isaac@example.com' });
    signInMember.mockResolvedValue({ displayName: '', email: 'isaac@example.com' });
    signInWithGoogle.mockResolvedValue({ displayName: 'Isaac Weaver', email: 'isaac@gmail.com' });
    signOutMember.mockResolvedValue(undefined);
  });
  it('advances a scheduled trip when Start Trip is clicked', async () => {
    const user = userEvent.setup();
    render(<App />);

    const activePanel = screen.getByRole('region', { name: /active trip/i });
    await user.click(within(activePanel).getByRole('button', { name: /^Start Trip$/i }));

    expect(within(activePanel).getByRole('button', { name: /Arrived at Pickup/i })).toBeInTheDocument();
    expect(within(activePanel).getByText('Active')).toBeInTheDocument();
  });

  it('adds a newly scheduled trip to the trip list', async () => {
    const user = userEvent.setup();
    render(<App />);

    const intakeForm = screen.getByRole('form', { name: /schedule apt$/i });
    await user.type(within(intakeForm).getByRole('textbox', { name: /Neighbor name/i }), 'Mary Beiler');
    await user.type(within(intakeForm).getByRole('textbox', { name: /Purpose/i }), 'Dentist appointment');
    await user.type(within(intakeForm).getByRole('textbox', { name: /Pickup address/i }), 'Beiler farm');
    await user.type(within(intakeForm).getByRole('textbox', { name: /Appointment address/i }), 'Town dental office');
    fireEvent.change(within(intakeForm).getByLabelText(/Pickup time/i), { target: { value: '2026-06-05T08:30' } });
    fireEvent.change(within(intakeForm).getByLabelText(/Appointment time/i), { target: { value: '2026-06-05T09:15' } });
    await user.click(within(intakeForm).getByRole('button', { name: /Add to Schedule/i }));

    expect(screen.getByRole('button', { name: /Schedule Apt$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Schedule Apt$/i })).toBeInTheDocument();
    expect(screen.getAllByText('Mary Beiler').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Dentist appointment').length).toBeGreaterThanOrEqual(2);
  });

  it('wires Sign Up, Sign In, and Sign Out buttons to Firebase Auth', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.clear(screen.getByRole('textbox', { name: /EMD member name/i }));
    await user.type(screen.getByRole('textbox', { name: /EMD member name/i }), 'Isaac Weaver');
    await user.type(screen.getByRole('textbox', { name: /Email/i }), 'isaac@example.com');
    await user.type(screen.getByLabelText(/Password/i), 'quiet-service-123');
    await user.type(screen.getByRole('textbox', { name: /Vehicle description/i }), 'Blue passenger van');
    await user.type(screen.getByRole('textbox', { name: /Neighborhood\/service area/i }), 'North Settlement');
    await user.type(screen.getByRole('textbox', { name: /Availability/i }), 'Weekday mornings');
    await user.type(screen.getByRole('textbox', { name: /Coordinator notes/i }), 'Can handle wheelchair trips');

    await user.click(screen.getByRole('button', { name: /Sign In with Google/i }));
    expect(signInWithGoogle).toHaveBeenCalled();
    expect(await screen.findByText(/Signed in as Isaac Weaver/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Sign Up/i }));

    expect(registerMember).toHaveBeenCalledWith({
      displayName: 'Isaac Weaver',
      email: 'isaac@example.com',
      password: 'quiet-service-123',
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
    expect(await screen.findByText(/Signed in as Isaac Weaver/i)).toBeInTheDocument();
    expect(screen.getByText(/Driver portfolio captured for neighborhood map/i)).toBeInTheDocument();
    expect(screen.getByText(/North Settlement/i)).toBeInTheDocument();
    expect(screen.getByText(/Blue passenger van/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Sign Out/i }));
    expect(signOutMember).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^Sign In$/i }));
    expect(signInMember).toHaveBeenCalledWith({
      email: 'isaac@example.com',
      password: 'quiet-service-123',
    });
    expect(await screen.findByText(/Signed in as isaac@example.com/i)).toBeInTheDocument();
  });

  it('shows EMD member sign-up, member-only driver map option, donation settings, and receipt printing', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /EMD Member Sign-Up/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign Up/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Sign In$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign In with Google/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Complete Driver Portfolio/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Vehicle description/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Neighborhood\/service area/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Availability/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Coordinator notes/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Add me to the member-only neighborhood driver map/i)).toBeInTheDocument();
    expect(screen.getByText(/Only available to EMD members/i)).toBeInTheDocument();
    expect(screen.getByText(/Dispatchers can use this map opt-in/i)).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: /Suggested Donation Settings/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Mileage rate$/i)).toHaveValue(0.7);
    expect(screen.getByLabelText(/1 hour waiting\/service time/i)).toHaveValue(10);
    expect(screen.queryByLabelText(/Taxi base fare/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Taxi base fare is fixed by the app/i)).toBeInTheDocument();
    expect(screen.getByText(/Basic taxi-style formula/i)).toBeInTheDocument();
    expect(screen.getByText(/Airport pickup/i)).toBeInTheDocument();
    expect(screen.getByText(/Night service/i)).toBeInTheDocument();
    expect(screen.getByText(/Extra passengers/i)).toBeInTheDocument();
    expect(screen.getByText(/Luggage/i)).toBeInTheDocument();
    expect(screen.getByText(/Tolls/i)).toBeInTheDocument();
    expect(screen.getByText(/Cleaning/i)).toBeInTheDocument();
    expect(screen.getByText(/Booking\/dispatch fee/i)).toBeInTheDocument();
    expect(screen.getByText(/Credit card fee/i)).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: /Trip Receipt/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Print Trip Receipt/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Suggested donation/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Estimated taxi fare/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Neighbor savings/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Estimated savings/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Donations are voluntary/i).length).toBeGreaterThanOrEqual(1);
  });
});
