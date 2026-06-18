import { useEffect, useMemo, useRef, useState } from 'react';
import {
  calculateMissionMiles,
  calculateMissionMinutes,
  calculateSuggestedDonation,
  calculateTaxiFare,
  formatTripReceipt,
  getNextMissionAction,
  summarizeMissions,
} from './missionLogic';
import { hasFirebaseConfig } from './firebase';
import { checkRedirectResult, registerMember, signInMember, signInWithGoogle, signOutMember, subscribeAuthState } from './authService';
import { ADMIN_EMAILS, getAllProfiles, getDriverProfile, loadNeighborhoodDrivers, saveDriverProfile, updateUserRole, updateUserStatus } from './driverProfileService';
import { loadOnDutyDrivers, mapsUrl, updateDriverLocation, watchDriverLocation } from './locationService';
import './App.css';

// ─── Sample data ──────────────────────────────────────────────────────────────

const sampleTrips = [
  {
    id: 1,
    neighborName: 'Sarah Miller',
    purpose: 'Clinic appointment',
    pickupAddress: 'Miller home, County Road 14',
    appointmentAddress: 'Plainview Family Clinic',
    pickupTime: '2026-06-03T08:30',
    appointmentTime: '2026-06-03T09:15',
    reminderMinutes: 30,
    returnNeeded: true,
    status: 'scheduled',
    miles: 0,
    minutes: 0,
    donationAmount: 0,
    notes: 'Bring folded wheelchair from porch.',
  },
  {
    id: 2,
    neighborName: 'John Troyer',
    purpose: 'Feed store pickup',
    pickupAddress: 'North settlement lane',
    appointmentAddress: 'Mill Creek Feed',
    pickupTime: '2026-06-03T13:00',
    appointmentTime: '2026-06-03T13:40',
    reminderMinutes: 15,
    returnNeeded: false,
    status: 'scheduled',
    miles: 0,
    minutes: 0,
    donationAmount: 0,
    notes: 'Call when leaving town.',
  },
  {
    id: 3,
    neighborName: 'Rebecca Yoder',
    purpose: 'Therapy visit',
    pickupAddress: 'Yoder farm',
    appointmentAddress: 'County Health Center',
    pickupTime: '2026-06-01T10:00',
    appointmentTime: '2026-06-01T11:00',
    reminderMinutes: 45,
    returnNeeded: true,
    status: 'completed',
    miles: 42.4,
    minutes: 190,
    donationAmount: 35,
    notes: 'Waited during appointment and returned home.',
  },
];

const blankTrip = {
  neighborName: '', purpose: '', pickupAddress: '', appointmentAddress: '',
  pickupTime: '', appointmentTime: '', reminderMinutes: 30, returnNeeded: true, notes: '',
};

const defaultDonationSettings = {
  mileageRate: 0.7,
  hourlyServiceRate: 10,
  waitingHours: 1,
  taxiMileageRate: 3.25,
  taxiHourlyWaitRate: 30,
  extraFees: {
    airportPickup: 0, nightService: 0, extraPassengers: 0, luggage: 0,
    tolls: 0, cleaning: 0, bookingDispatch: 0, creditCard: 0,
  },
};

const extraFeeLabels = {
  airportPickup: 'Airport pickup', nightService: 'Night service',
  extraPassengers: 'Extra passengers', luggage: 'Luggage', tolls: 'Tolls',
  cleaning: 'Cleaning', bookingDispatch: 'Booking/dispatch fee', creditCard: 'Credit card fee',
};

const TABS = [
  { id: 'home',     icon: '⌂', label: 'Home'     },
  { id: 'schedule', icon: '≡', label: 'Schedule' },
  { id: 'trip',     icon: '▶', label: 'Trip'     },
  { id: 'dispatch', icon: '◎', label: 'Dispatch' },
  { id: 'account',  icon: '○', label: 'Account'  },
];


const blankSignUp = {
  role: 'member',
  displayName: '', phone: '', email: '', password: '',
  // Emergency contact
  emergencyContactName: '', emergencyContactPhone: '',
  // Vehicle
  vehicleYear: '', vehicleMake: '', vehicleModel: '', vehicleColor: '',
  vehiclePlate: '', vehicleSeats: '', wheelchairAccessible: false,
  vehicleDescription: '',
  // Service
  serviceArea: '', availability: '', languagesSpoken: '', specialCapabilities: '',
  // License
  dlNumber: '', dlExpiry: '', dlCopyName: '', dlCopyFile: null, dlCopyUrl: '',
  // Insurance
  hasInsurance: false,
  insuranceProvider: '', insurancePolicyNumber: '', insuranceCost: '', insuranceCopyName: '', insuranceCopyFile: null, insuranceCopyUrl: '',
  insuranceShareForRate: false,
  mapOptIn: true,
};

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  // page: 'landing' | 'signup' | 'signin' | 'setup' | 'app'
  const [page, setPage]           = useState('landing');
  const [signUpForm, setSignUpForm] = useState(blankSignUp);
  const [signInForm, setSignInForm] = useState({ email: '', password: '' });
  const [setupForm, setSetupForm]   = useState({ ...blankSignUp });

  const [authUser, setAuthUser]     = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authError, setAuthError]     = useState('');
  const [googleStatus, setGoogleStatus] = useState('');
  const [authBusy, setAuthBusy]     = useState(false);

  // Main app state
  const [activeTab, setActiveTab]   = useState('home');
  const [trips, setTrips]           = useState(sampleTrips);
  const [selectedId, setSelectedId] = useState(sampleTrips[0].id);
  const [newTrip, setNewTrip]       = useState(blankTrip);
  const [tripLog, setTripLog]       = useState({ startTime: '', endTime: '', startOdometer: '', endOdometer: '', donationAmount: '' });
  const [donationSettings, setDonationSettings] = useState(defaultDonationSettings);
  const [neighborhoodDrivers, setNeighborhoodDrivers] = useState([]);
  const [onDutyDrivers, setOnDutyDrivers]   = useState([]);
  const [dispatchStatus, setDispatchStatus] = useState('');
  const [allProfiles, setAllProfiles]       = useState([]);
  const [adminBusy, setAdminBusy]           = useState(false);

  // Location / on-duty
  const [isOnDuty, setIsOnDuty]       = useState(false);
  const [driverLocation, setDriverLocation] = useState(null);
  const [locationError, setLocationError]   = useState('');
  const stopWatchRef = useRef(null);

  // ── Role helpers ───────────────────────────────────────────────────────────
  const isAdmin = ADMIN_EMAILS.includes(authUser?.email);
  const profileStatus = userProfile?.membershipStatus || userProfile?.approvalStatus;
  const isApprovedMember = ['approved', 'active'].includes(profileStatus);
  const isDispatcher = isAdmin || (isApprovedMember && ['dispatcher', 'admin'].includes(userProfile?.role));
  const isApprovedDriver = isApprovedMember && userProfile?.role === 'driver';

  // ── Auth listener ──────────────────────────────────────────────────────────
  useEffect(() => subscribeAuthState(async (user) => {
    setAuthUser(user);
    if (user) {
      const profile = await getDriverProfile(user.uid).catch(() => null);
      if (profile) {
        setUserProfile(profile);
        setPage('app');
      } else {
        setSetupForm((f) => ({
          ...f,
          displayName: user.displayName || '',
          email: user.email || '',
        }));
        setPage('setup');
      }
    }
  }), []);

  // ── Handle Google redirect result on load ───────────────────────────────────
  useEffect(() => {
    checkRedirectResult().then(async (user) => {
      if (!user) return;
      setAuthUser(user);
      setGoogleStatus('');
      const profile = await getDriverProfile(user.uid).catch(() => null);
      if (profile) {
        setUserProfile(profile);
        setPage('app');
      } else {
        setSetupForm((f) => ({ ...f, displayName: user.displayName || '', email: user.email || '' }));
        setPage('setup');
      }
    }).catch((error) => {
      setAuthError(getAuthErrorMessage(error));
    });
  }, []);

  // ── Location watcher ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOnDuty || !authUser || !isApprovedDriver) return;

    const stop = watchDriverLocation(
      async ({ lat, lng }) => {
        setDriverLocation({ lat, lng });
        setLocationError('');
        try {
          await updateDriverLocation({
            uid: authUser.uid,
            lat, lng,
            isOnDuty: true,
            displayName: userProfile?.displayName || authUser.displayName || '',
            serviceArea: userProfile?.serviceArea || '',
            vehicleDescription: userProfile?.vehicleDescription || '',
          });
        } catch { /* non-fatal */ }
      },
      (err) => setLocationError(err),
    );

    stopWatchRef.current = stop;
    return () => {
      stop();
      if (authUser) {
        updateDriverLocation({
          uid: authUser.uid, lat: 0, lng: 0, isOnDuty: false,
          displayName: '', serviceArea: '', vehicleDescription: '',
        }).catch(() => {});
      }
    };
  }, [isOnDuty, authUser, userProfile, isApprovedDriver]);

  // ── Computed values ────────────────────────────────────────────────────────
  const selectedTrip = trips.find((t) => t.id === selectedId) ?? trips[0];
  const action = selectedTrip ? getNextMissionAction(selectedTrip.status, selectedTrip.returnNeeded) : null;
  const report = useMemo(() => summarizeMissions(trips), [trips]);
  const previewMiles = selectedTrip?.miles || 20;
  const suggestedDonation = calculateSuggestedDonation({
    miles: previewMiles, waitingHours: donationSettings.waitingHours,
    mileageRate: donationSettings.mileageRate, hourlyServiceRate: donationSettings.hourlyServiceRate,
    extraFees: donationSettings.extraFees,
  });
  const estimatedTaxiFare = calculateTaxiFare({
    miles: previewMiles, waitingHours: donationSettings.waitingHours,
    mileageRate: donationSettings.taxiMileageRate, hourlyWaitRate: donationSettings.taxiHourlyWaitRate,
    extraFees: donationSettings.extraFees,
  });
  const receiptText = formatTripReceipt({
    neighborName: selectedTrip?.neighborName, purpose: selectedTrip?.purpose,
    miles: previewMiles, waitingHours: donationSettings.waitingHours,
    donationAmount: suggestedDonation.total, extraFees: donationSettings.extraFees,
    taxiFare: estimatedTaxiFare.total,
  });

  // ── Trip handlers ──────────────────────────────────────────────────────────
  function addTrip(event) {
    event.preventDefault();
    if (!newTrip.neighborName || !newTrip.pickupTime || !newTrip.appointmentTime) return;
    const trip = { ...newTrip, id: Date.now(), status: 'scheduled', miles: 0, minutes: 0, donationAmount: 0 };
    setTrips((current) => [trip, ...current]);
    setSelectedId(trip.id);
    setNewTrip(blankTrip);
    setActiveTab('trip');
  }

  function advanceTrip() {
    if (!selectedTrip || !action) return;
    setTrips((current) => current.map((t) => {
      if (t.id !== selectedTrip.id) return t;
      if (action.nextStatus === 'active') return { ...t, status: 'active', actualStartTime: new Date().toISOString() };
      return { ...t, status: action.nextStatus };
    }));
  }

  function completeWithTripLog(event) {
    event.preventDefault();
    if (!selectedTrip) return;
    const miles = calculateMissionMiles(tripLog.startOdometer, tripLog.endOdometer);
    const minutes = calculateMissionMinutes(tripLog.startTime, tripLog.endTime);
    setTrips((current) => current.map((t) =>
      t.id === selectedTrip.id
        ? { ...t, status: 'completed', miles, minutes, donationAmount: Number(tripLog.donationAmount) || 0, actualStartTime: tripLog.startTime, actualEndTime: tripLog.endTime }
        : t
    ));
    setTripLog({ startTime: '', endTime: '', startOdometer: '', endOdometer: '', donationAmount: '' });
  }

  function updateExtraFee(key, value) {
    setDonationSettings({ ...donationSettings, extraFees: { ...donationSettings.extraFees, [key]: Number(value) } });
  }

  async function loadDispatchDrivers() {
    try {
      const drivers = await loadOnDutyDrivers();
      setOnDutyDrivers(drivers);
      setDispatchStatus(drivers.length === 0 ? 'No drivers are on duty right now.' : '');
    } catch {
      setDispatchStatus('Could not load driver locations. Sign in and try again.');
    }
  }

  async function loadNeighborhoodMap() {
    try {
      const drivers = await loadNeighborhoodDrivers();
      setNeighborhoodDrivers(drivers);
    } catch { /* non-fatal */ }
  }

  // ── Admin handlers ─────────────────────────────────────────────────────────
  async function handleLoadAllProfiles() {
    setAdminBusy(true);
    try {
      const profiles = await getAllProfiles();
      setAllProfiles(profiles);
    } catch { /* non-fatal */ }
    finally { setAdminBusy(false); }
  }

  async function handleUpdateRole(uid, role) {
    try {
      await updateUserRole(uid, role);
      setAllProfiles((current) => current.map((p) => p.uid === uid ? { ...p, role } : p));
    } catch { /* non-fatal */ }
  }

  async function handleUpdateStatus(uid, membershipStatus) {
    try {
      await updateUserStatus(uid, membershipStatus);
      setAllProfiles((current) => current.map((p) => (p.uid || p.id) === uid ? { ...p, membershipStatus } : p));
    } catch { /* non-fatal */ }
  }

  // ── Trip assignment ─────────────────────────────────────────────────────────
  function handleAssignDriver(tripId, driver) {
    setTrips((current) => current.map((t) =>
      t.id === tripId
        ? { ...t, assignedDriverUid: driver.uid, assignedDriverName: driver.displayName, assignedDriverPhone: driver.phone, assignedDriverVehicle: driver.vehicleDescription || `${driver.vehicleYear || ''} ${driver.vehicleMake || ''} ${driver.vehicleModel || ''}`.trim() }
        : t
    ));
  }

  function handleUnassignDriver(tripId) {
    setTrips((current) => current.map((t) =>
      t.id === tripId ? { ...t, assignedDriverUid: null, assignedDriverName: null, assignedDriverPhone: null, assignedDriverVehicle: null } : t
    ));
  }

  // ── Auth handlers ──────────────────────────────────────────────────────────
  async function handleGoogleSignIn() {
    setAuthBusy(true);
    setAuthError('');
    setGoogleStatus('Opening Google sign-in…');
    try {
      const user = await signInWithGoogle();
      if (!user) {
        setGoogleStatus('Redirecting to Google… please wait.');
        return;
      }
      setGoogleStatus('');
      setAuthUser(user);
      const profile = await getDriverProfile(user.uid).catch(() => null);
      if (profile) {
        setUserProfile(profile);
        setPage('app');
      } else {
        setSetupForm((f) => ({ ...f, displayName: user.displayName || '', email: user.email || '' }));
        setPage('setup');
      }
    } catch (error) {
      setGoogleStatus('');
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleEmailSignUp() {
    if (!signUpForm.email || !signUpForm.password) {
      setAuthError('Enter your email and a password to continue.');
      return;
    }
    setAuthBusy(true);
    setAuthError('');

    // Step 1: Create Firebase Auth account
    let user;
    try {
      user = await registerMember({
        displayName: signUpForm.displayName,
        email: signUpForm.email,
        password: signUpForm.password,
        phone: signUpForm.phone,
      });
      setAuthUser(user);
    } catch (error) {
      setAuthError(getAuthErrorMessage(error));
      setAuthBusy(false);
      return;
    }

    // Step 2: Save profile to Firestore (non-blocking — user is already signed in)
    try {
      const profile = formToProfile(signUpForm);
      await saveDriverProfile({
        uid: user.uid,
        displayName: signUpForm.displayName,
        email: signUpForm.email,
        phone: signUpForm.phone,
        driverProfile: profile,
      });
      setUserProfile({ ...profile, displayName: signUpForm.displayName, email: signUpForm.email, phone: signUpForm.phone });
    } catch {
      // Auth succeeded — let the user in and they can update profile later
      setUserProfile({ role: signUpForm.role, displayName: signUpForm.displayName, email: signUpForm.email });
    }

    setPage('app');
    setAuthBusy(false);
  }

  async function handleEmailSignIn() {
    setAuthBusy(true);
    setAuthError('');
    try {
      const user = await signInMember({ email: signInForm.email, password: signInForm.password });
      setAuthUser(user);
      const profile = await getDriverProfile(user.uid).catch(() => null);
      if (profile) {
        setUserProfile(profile);
        setPage('app');
      } else {
        setSetupForm((f) => ({ ...f, displayName: user.displayName || '', email: user.email || '' }));
        setPage('setup');
      }
    } catch (error) {
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleProfileSetup() {
    setAuthBusy(true);
    setAuthError('');
    try {
      const profile = formToProfile(setupForm);
      await saveDriverProfile({
        uid: authUser.uid,
        displayName: setupForm.displayName || authUser.displayName,
        email: setupForm.email || authUser.email,
        phone: setupForm.phone,
        driverProfile: profile,
      });
      setUserProfile({ ...profile, displayName: setupForm.displayName, email: setupForm.email, phone: setupForm.phone });
      setPage('app');
    } catch (error) {
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    if (isOnDuty) setIsOnDuty(false);
    await signOutMember().catch(() => {});
    setAuthUser(null);
    setUserProfile(null);
    setOnDutyDrivers([]);
    setIsOnDuty(false);
    setDriverLocation(null);
    setPage('landing');
  }

  async function handleOnDutyToggle() {
    const nextOnDuty = !isOnDuty;
    if (nextOnDuty && !isApprovedDriver) {
      setLocationError('Only approved active drivers can go on duty.');
      return;
    }
    setIsOnDuty(nextOnDuty);
    if (!nextOnDuty && authUser) {
      stopWatchRef.current?.();
      await updateDriverLocation({
        uid: authUser.uid, lat: 0, lng: 0, isOnDuty: false,
        displayName: '', serviceArea: '', vehicleDescription: '',
      }).catch(() => {});
      setDriverLocation(null);
    }
  }

  // ── Routing ────────────────────────────────────────────────────────────────
  if (page === 'landing') {
    return (
      <LandingPage
        onSignUp={() => setPage('signup')}
        onSignIn={() => setPage('signin')}
        hasFirebaseConfig={hasFirebaseConfig}
      />
    );
  }

  if (page === 'signup') {
    return (
      <SignUpPage
        form={signUpForm}
        setForm={setSignUpForm}
        authError={authError}
        googleStatus={googleStatus}
        authBusy={authBusy}
        hasFirebaseConfig={hasFirebaseConfig}
        onSubmit={handleEmailSignUp}
        onGoogle={handleGoogleSignIn}
        onBack={() => { setAuthError(''); setGoogleStatus(''); setPage('landing'); }}
      />
    );
  }

  if (page === 'signin') {
    return (
      <SignInPage
        form={signInForm}
        setForm={setSignInForm}
        authError={authError}
        googleStatus={googleStatus}
        authBusy={authBusy}
        hasFirebaseConfig={hasFirebaseConfig}
        onSubmit={handleEmailSignIn}
        onGoogle={handleGoogleSignIn}
        onBack={() => { setAuthError(''); setGoogleStatus(''); setPage('landing'); }}
        onSignUp={() => { setAuthError(''); setGoogleStatus(''); setPage('signup'); }}
      />
    );
  }

  if (page === 'setup') {
    return (
      <ProfileSetupPage
        form={setupForm}
        setForm={setSetupForm}
        authError={authError}
        authBusy={authBusy}
        onSubmit={handleProfileSetup}
        onSignOut={handleSignOut}
      />
    );
  }

  // ── Main app ───────────────────────────────────────────────────────────────
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <span className="brand-greek">ἐκκλησία</span>
          <span className="brand-name">ekklēsia MinD</span>
        </div>
        <div className="header-right">
          {isOnDuty && <span className="on-duty-badge">● On Duty</span>}
          {authUser && <span className="app-user">{userProfile?.displayName || authUser.displayName || authUser.email}</span>}
        </div>
      </header>

      <main className="tab-content">
        {activeTab === 'home' && (
          <HomeTab
            report={report}
            trips={trips}
            setActiveTab={setActiveTab}
            setSelectedId={setSelectedId}
            hasFirebaseConfig={hasFirebaseConfig}
          />
        )}
        {activeTab === 'schedule' && (
          <ScheduleTab
            trips={trips}
            selectedId={selectedId}
            setSelectedId={(id) => { setSelectedId(id); setActiveTab('trip'); }}
            newTrip={newTrip}
            setNewTrip={setNewTrip}
            addTrip={addTrip}
          />
        )}
        {activeTab === 'trip' && (
          <TripTab
            trips={trips}
            selectedTrip={selectedTrip}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            action={action}
            advanceTrip={advanceTrip}
            tripLog={tripLog}
            setTripLog={setTripLog}
            completeWithTripLog={completeWithTripLog}
            donationSettings={donationSettings}
            setDonationSettings={setDonationSettings}
            updateExtraFee={updateExtraFee}
            suggestedDonation={suggestedDonation}
            estimatedTaxiFare={estimatedTaxiFare}
            receiptText={receiptText}
          />
        )}
        {activeTab === 'dispatch' && (
          <DispatchTab
            authUser={authUser}
            isDispatcher={isDispatcher}
            trips={trips}
            onDutyDrivers={onDutyDrivers}
            neighborhoodDrivers={neighborhoodDrivers}
            dispatchStatus={dispatchStatus}
            loadDispatchDrivers={loadDispatchDrivers}
            loadNeighborhoodMap={loadNeighborhoodMap}
            onAssignDriver={handleAssignDriver}
            onUnassignDriver={handleUnassignDriver}
          />
        )}
        {activeTab === 'admin' && isAdmin && (
          <AdminTab
            allProfiles={allProfiles}
            adminBusy={adminBusy}
            onLoad={handleLoadAllProfiles}
            onUpdateRole={handleUpdateRole}
            onUpdateStatus={handleUpdateStatus}
          />
        )}
        {activeTab === 'account' && (
          <AccountTab
            authUser={authUser}
            userProfile={userProfile}
            isApprovedDriver={isApprovedDriver}
            isOnDuty={isOnDuty}
            driverLocation={driverLocation}
            locationError={locationError}
            onDutyToggle={handleOnDutyToggle}
            onSignOut={handleSignOut}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="Main navigation">
        {[...TABS, ...(isAdmin ? [{ id: 'admin', icon: '★', label: 'Admin' }] : [])].map((tab) => (
          <button
            key={tab.id}
            className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon" aria-hidden="true">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

// ─── Landing page ─────────────────────────────────────────────────────────────

function LandingPage({ onSignUp, onSignIn, hasFirebaseConfig }) {
  return (
    <div className="landing-shell">
      <header className="landing-header">
        <div className="app-brand">
          <span className="brand-greek">ἐκκλησία</span>
          <span className="brand-name">ekklēsia MinD</span>
        </div>
        <button className="secondary sm" onClick={onSignIn} disabled={!hasFirebaseConfig}>Sign In</button>
      </header>

      <section className="landing-hero">
        <p className="eyebrow">Ministry Driver Network</p>
        <h1>Neighbors helping<br />neighbors get there.</h1>
        <p className="hero-copy">
          A private neighborhood transportation ministry. Volunteer drivers, suggested donations, and care for every neighbor — all in one place.
        </p>
        <div className="landing-cta">
          <button className="lg" onClick={onSignUp} disabled={!hasFirebaseConfig}>Join the Network</button>
          <button className="secondary lg" onClick={onSignIn} disabled={!hasFirebaseConfig}>Already a member? Sign In</button>
        </div>
        {!hasFirebaseConfig && <p className="notes" style={{ marginTop: 16 }}>Local demo mode — Firebase not connected.</p>}
      </section>

      <section className="landing-features">
        <FeatureCard icon="🚗" title="Volunteer Drivers" body="Neighborhood drivers track miles, log trips, and share their location so dispatchers can route quickly." />
        <FeatureCard icon="🗓" title="Trip Scheduling" body="Schedule appointments and errands for neighbors who need a hand getting around." />
        <FeatureCard icon="📍" title="Live Dispatch" body="Dispatchers see which drivers are on duty and can route the closest one to any trip." />
        <FeatureCard icon="🙏" title="Ministry Giving" body="Suggested donations based on national taxi rates — always voluntary, always gracious." />
      </section>

      <section className="landing-paths">
        <div className="path-card">
          <p className="path-icon">🏡</p>
          <h3>I Need a Ride</h3>
          <p>Sign up as a neighbor member. Dispatchers will connect you with a volunteer driver.</p>
          <button onClick={onSignUp} disabled={!hasFirebaseConfig}>Sign Up as Member</button>
        </div>
        <div className="path-card driver">
          <p className="path-icon">🚗</p>
          <h3>I Want to Drive</h3>
          <p>Join as a ministry driver. Share your route availability and help your neighbors get where they need to go.</p>
          <button onClick={onSignUp} disabled={!hasFirebaseConfig}>Sign Up as Driver</button>
        </div>
      </section>

      <footer className="landing-footer">
        <p>ekklēsia Ministry Driver · ἐκκλησία · called-out assembly</p>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, body }) {
  return (
    <div className="feature-card">
      <span className="feature-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

// ─── Sign Up page ─────────────────────────────────────────────────────────────

function SignUpPage({ form, setForm, authError, googleStatus, authBusy, hasFirebaseConfig, onSubmit, onGoogle, onBack }) {
  const isDriver = form.role === 'driver';

  return (
    <div className="auth-shell">
      <header className="auth-header">
        <button className="ghost" onClick={onBack}>← Back</button>
        <div className="app-brand">
          <span className="brand-greek">ἐκκλησία</span>
          <span className="brand-name">ekklēsia MinD</span>
        </div>
      </header>

      <div className="auth-card">
        <h2>Join the neighborhood</h2>
        <p className="notes">Open to everyone in the community.</p>

        <div className="role-selector" role="group" aria-label="Account type">
          <button
            type="button"
            className={`role-btn ${form.role === 'member' ? 'active' : ''}`}
            onClick={() => setForm({ ...form, role: 'member' })}
          >
            🏡 Member
            <small>I need rides</small>
          </button>
          <button
            type="button"
            className={`role-btn ${isDriver ? 'active' : ''}`}
            onClick={() => setForm({ ...form, role: 'driver' })}
          >
            🚗 Driver
            <small>I want to drive</small>
          </button>
        </div>

        <button
          type="button"
          className="google-btn"
          onClick={onGoogle}
          disabled={authBusy || !hasFirebaseConfig}
        >
          <GoogleIcon />
          {googleStatus || 'Continue with Google'}
        </button>
        {googleStatus && <p className="notes" style={{ textAlign: 'center', marginTop: 8 }}>{googleStatus}</p>}

        <div className="auth-divider"><span>or</span></div>

        <div className="form-grid two">
          <Input label="Full name" value={form.displayName} onChange={(v) => setForm({ ...form, displayName: v })} />
          <Input label="Phone" type="tel" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <Input label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
          <Input label="Password" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
        </div>

        {isDriver && <DriverFields form={form} setForm={setForm} />}

        {authError && <p className="notes error" role="alert">{authError}</p>}

        <button type="button" className="full-btn" onClick={onSubmit} disabled={authBusy || !hasFirebaseConfig}>
          {authBusy ? 'Creating account…' : 'Create Account'}
        </button>
      </div>
    </div>
  );
}

// ─── Driver fields (shared between SignUp and ProfileSetup) ───────────────────

function DriverFields({ form, setForm }) {
  const f = form;
  const s = (patch) => setForm({ ...f, ...patch });

  return (
    <div className="driver-section">
      <h3>Driver details</h3>

      <div className="field-group">
        <h4>Emergency contact</h4>
        <div className="form-grid two">
          <Input label="Contact name" value={f.emergencyContactName || ''} onChange={(v) => s({ emergencyContactName: v })} placeholder="Full name" />
          <Input label="Contact phone" type="tel" value={f.emergencyContactPhone || ''} onChange={(v) => s({ emergencyContactPhone: v })} placeholder="(555) 000-0000" />
        </div>
      </div>

      <div className="field-group">
        <h4>Vehicle</h4>
        <div className="form-grid two">
          <Input label="Year" value={f.vehicleYear || ''} onChange={(v) => s({ vehicleYear: v })} placeholder="2019" />
          <Input label="Make" value={f.vehicleMake || ''} onChange={(v) => s({ vehicleMake: v })} placeholder="Toyota" />
          <Input label="Model" value={f.vehicleModel || ''} onChange={(v) => s({ vehicleModel: v })} placeholder="Sienna" />
          <Input label="Color" value={f.vehicleColor || ''} onChange={(v) => s({ vehicleColor: v })} placeholder="Blue" />
          <Input label="Plate number" value={f.vehiclePlate || ''} onChange={(v) => s({ vehiclePlate: v })} placeholder="Optional" />
          <Input label="Passenger seats" type="number" value={f.vehicleSeats || ''} onChange={(v) => s({ vehicleSeats: v })} placeholder="4" />
        </div>
        <label className="checkbox-row" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={Boolean(f.wheelchairAccessible)} onChange={(e) => s({ wheelchairAccessible: e.target.checked })} />
          Wheelchair accessible
        </label>
        <div style={{ marginTop: 10 }}>
          <Input label="Additional vehicle notes" value={f.vehicleDescription || ''} onChange={(v) => s({ vehicleDescription: v })} placeholder="Ramp, cargo space, child seats available…" />
        </div>
      </div>

      <div className="field-group">
        <h4>Service</h4>
        <div className="form-grid two">
          <Input label="Neighborhood / service area" value={f.serviceArea || ''} onChange={(v) => s({ serviceArea: v })} placeholder="North Settlement, Plainview…" />
          <Input label="Availability" value={f.availability || ''} onChange={(v) => s({ availability: v })} placeholder="Weekday mornings, evenings…" />
          <Input label="Languages spoken" value={f.languagesSpoken || ''} onChange={(v) => s({ languagesSpoken: v })} placeholder="English, Spanish…" />
          <Input label="Special capabilities" value={f.specialCapabilities || ''} onChange={(v) => s({ specialCapabilities: v })} placeholder="Medical transport, airport runs…" />
        </div>
      </div>

      <div className="field-group">
        <h4>Driver's License <span className="optional-tag">optional</span></h4>
        <div className="form-grid two">
          <Input label="License number" value={f.dlNumber || ''} onChange={(v) => s({ dlNumber: v })} placeholder="DL number" />
          <Input label="Expiry date" type="date" value={f.dlExpiry || ''} onChange={(v) => s({ dlExpiry: v })} />
          <label>
            License copy
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                s({ dlCopyFile: file, dlCopyName: file?.name || '', dlCopyUrl: file ? '' : f.dlCopyUrl });
              }}
            />
            {f.dlCopyName && <small className="file-name">{f.dlCopyName}</small>}
          </label>
        </div>
      </div>

      <div className="field-group">
        <h4>Insurance <span className="optional-tag">optional</span></h4>
        <label className="checkbox-row">
          <input type="checkbox" checked={Boolean(f.hasInsurance)} onChange={(e) => s({ hasInsurance: e.target.checked })} />
          I carry personal auto insurance
        </label>
        {f.hasInsurance && (
          <>
            <div className="form-grid two" style={{ marginTop: 12 }}>
              <Input label="Insurance provider" value={f.insuranceProvider || ''} onChange={(v) => s({ insuranceProvider: v })} placeholder="State Farm, Progressive…" />
              <Input label="Policy number" value={f.insurancePolicyNumber || ''} onChange={(v) => s({ insurancePolicyNumber: v })} />
              <Input label="Annual premium / cost" type="number" value={f.insuranceCost || ''} onChange={(v) => s({ insuranceCost: v })} placeholder="0.00" />
              <label>
                Insurance copy
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    s({ insuranceCopyFile: file, insuranceCopyName: file?.name || '', insuranceCopyUrl: file ? '' : f.insuranceCopyUrl });
                  }}
                />
                {f.insuranceCopyName && <small className="file-name">{f.insuranceCopyName}</small>}
              </label>
            </div>
            <label className="checkbox-row rate-check">
              <input type="checkbox" checked={Boolean(f.insuranceShareForRate)} onChange={(e) => s({ insuranceShareForRate: e.target.checked })} />
              Share my insurance info to qualify for a lower suggested donation rate
            </label>
          </>
        )}
      </div>

      <label className="checkbox-row">
        <input type="checkbox" checked={Boolean(f.mapOptIn)} onChange={(e) => s({ mapOptIn: e.target.checked })} />
        Add me to the neighborhood driver map
      </label>
    </div>
  );
}

// ─── Sign In page ─────────────────────────────────────────────────────────────

function SignInPage({ form, setForm, authError, googleStatus, authBusy, hasFirebaseConfig, onSubmit, onGoogle, onBack, onSignUp }) {
  return (
    <div className="auth-shell">
      <header className="auth-header">
        <button className="ghost" onClick={onBack}>← Back</button>
        <div className="app-brand">
          <span className="brand-greek">ἐκκλησία</span>
          <span className="brand-name">ekklēsia MinD</span>
        </div>
      </header>

      <div className="auth-card">
        <h2>Welcome back</h2>
        <p className="notes">Sign in to your neighborhood account.</p>

        <button
          type="button"
          className="google-btn"
          onClick={onGoogle}
          disabled={authBusy || !hasFirebaseConfig}
        >
          <GoogleIcon />
          {googleStatus || 'Sign in with Google'}
        </button>
        {googleStatus && <p className="notes" style={{ textAlign: 'center', marginTop: 8 }}>{googleStatus}</p>}

        <div className="auth-divider"><span>or</span></div>

        <div className="form-grid two">
          <Input label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
          <Input label="Password" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
        </div>

        {authError && <p className="notes error" role="alert">{authError}</p>}

        <button type="button" className="full-btn" onClick={onSubmit} disabled={authBusy || !hasFirebaseConfig}>
          {authBusy ? 'Signing in…' : 'Sign In'}
        </button>

        <p className="auth-switch">
          Don't have an account?{' '}
          <button type="button" className="link-btn" onClick={onSignUp}>Join the neighborhood</button>
        </p>
      </div>
    </div>
  );
}

// ─── Profile setup (after Google sign-in for new users) ───────────────────────

function ProfileSetupPage({ form, setForm, authError, authBusy, onSubmit, onSignOut }) {
  const isDriver = form.role === 'driver';

  return (
    <div className="auth-shell">
      <header className="auth-header">
        <div className="app-brand">
          <span className="brand-greek">ἐκκλησία</span>
          <span className="brand-name">ekklēsia MinD</span>
        </div>
        <button className="ghost" onClick={onSignOut}>Sign out</button>
      </header>

      <div className="auth-card">
        <h2>Complete your profile</h2>
        <p className="notes">Tell us a little about yourself so we can connect you with the right trips.</p>

        <div className="role-selector" role="group" aria-label="Account type">
          <button
            type="button"
            className={`role-btn ${form.role === 'member' ? 'active' : ''}`}
            onClick={() => setForm({ ...form, role: 'member' })}
          >
            🏡 Member
            <small>I need rides</small>
          </button>
          <button
            type="button"
            className={`role-btn ${isDriver ? 'active' : ''}`}
            onClick={() => setForm({ ...form, role: 'driver' })}
          >
            🚗 Driver
            <small>I want to drive</small>
          </button>
        </div>

        <div className="form-grid two">
          <Input label="Full name" value={form.displayName} onChange={(v) => setForm({ ...form, displayName: v })} />
          <Input label="Phone" type="tel" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        </div>

        {isDriver && <DriverFields form={form} setForm={setForm} />}

        {authError && <p className="notes error" role="alert">{authError}</p>}

        <button type="button" className="full-btn" onClick={onSubmit} disabled={authBusy}>
          {authBusy ? 'Saving…' : 'Save and Continue'}
        </button>
      </div>
    </div>
  );
}

// ─── Main app tab views ───────────────────────────────────────────────────────

function HomeTab({ report, trips, setActiveTab, setSelectedId }) {
  const nextTrip = trips.find((t) => t.status === 'scheduled' || t.status === 'active');

  return (
    <div className="tab-view">
      <section className="hero-card">
        <div>
          <p className="eyebrow">ἐκκλησία • neighborhood care</p>
          <h1>ekklēsia Ministry Driver</h1>
          <p className="hero-copy">Connecting neighbors who need rides with drivers who care.</p>
        </div>
        <div className="hero-actions">
          <button onClick={() => setActiveTab('schedule')}>Schedule Apt</button>
          <button className="secondary" onClick={() => setActiveTab('trip')}>Start Trip</button>
        </div>
      </section>

      {nextTrip && (
        <div className="upcoming-card">
          <p className="eyebrow">Up next</p>
          <div className="upcoming-row">
            <div className="upcoming-info">
              <h3>{nextTrip.neighborName}</h3>
              <p>{nextTrip.purpose || 'Neighbor transport'}</p>
              <span className={`status ${nextTrip.status}`}>{formatStatus(nextTrip.status)}</span>
            </div>
            <div className="upcoming-meta">
              <small>Pickup {formatDateTime(nextTrip.pickupTime)}</small>
              <small>{nextTrip.pickupAddress}</small>
              <button
                className="secondary"
                style={{ marginTop: 8, fontSize: '0.8rem', padding: '8px 16px' }}
                onClick={() => { setSelectedId(nextTrip.id); setActiveTab('trip'); }}
              >
                Open Trip
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="stats-grid" aria-label="Monthly report">
        <Stat label="Completed Trips" value={report.completed} />
        <Stat label="Service Miles" value={report.miles} />
        <Stat label="Service Hours" value={report.hours} />
        <Stat label="Donations Recorded" value={`$${report.donations}`} />
      </section>
    </div>
  );
}

function ScheduleTab({ trips, selectedId, setSelectedId, newTrip, setNewTrip, addTrip }) {
  return (
    <div className="tab-view">
      <section className="panel">
        <div className="panel-heading">
          <p className="eyebrow">Today</p>
          <h2>Trip Schedule</h2>
        </div>
        <div className="mission-list">
          {trips.map((trip) => (
            <button
              key={trip.id}
              className={`mission-card ${trip.id === selectedId ? 'selected' : ''}`}
              onClick={() => setSelectedId(trip.id)}
            >
              <span className={`status ${trip.status}`}>{formatStatus(trip.status)}</span>
              <strong>{trip.neighborName}</strong>
              <span>{trip.purpose || 'Neighbor transport'}</span>
              <small>{formatDateTime(trip.pickupTime)} pickup</small>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <p className="eyebrow">Intake</p>
          <h2>Schedule Apt</h2>
        </div>
        <form onSubmit={addTrip} className="form-grid" aria-label="Schedule Apt">
          <Input label="Neighbor name" value={newTrip.neighborName} onChange={(v) => setNewTrip({ ...newTrip, neighborName: v })} />
          <Input label="Purpose" value={newTrip.purpose} placeholder="Clinic appointment, store pickup…" onChange={(v) => setNewTrip({ ...newTrip, purpose: v })} />
          <Input label="Pickup address" value={newTrip.pickupAddress} onChange={(v) => setNewTrip({ ...newTrip, pickupAddress: v })} />
          <Input label="Appointment address" value={newTrip.appointmentAddress} onChange={(v) => setNewTrip({ ...newTrip, appointmentAddress: v })} />
          <Input label="Pickup time" type="datetime-local" value={newTrip.pickupTime} onChange={(v) => setNewTrip({ ...newTrip, pickupTime: v })} />
          <Input label="Appointment time" type="datetime-local" value={newTrip.appointmentTime} onChange={(v) => setNewTrip({ ...newTrip, appointmentTime: v })} />
          <Input label="Reminder minutes" type="number" value={newTrip.reminderMinutes} onChange={(v) => setNewTrip({ ...newTrip, reminderMinutes: Number(v) })} />
          <label className="checkbox-row">
            <input type="checkbox" checked={newTrip.returnNeeded} onChange={(e) => setNewTrip({ ...newTrip, returnNeeded: e.target.checked })} />
            Return trip needed
          </label>
          <label className="wide-field">
            Notes
            <textarea value={newTrip.notes} onChange={(e) => setNewTrip({ ...newTrip, notes: e.target.value })} placeholder="Wheelchair, wait during appointment, call ahead…" />
          </label>
          <button type="submit" className="full">Add to Schedule</button>
        </form>
      </section>
    </div>
  );
}

function TripTab({
  trips, selectedTrip, selectedId, setSelectedId, action, advanceTrip,
  tripLog, setTripLog, completeWithTripLog,
  donationSettings, setDonationSettings, updateExtraFee,
  suggestedDonation, estimatedTaxiFare, receiptText,
}) {
  return (
    <div className="tab-view">
      {trips.length > 1 && (
        <section className="panel">
          <label>
            Select trip
            <select value={selectedId} onChange={(e) => setSelectedId(Number(e.target.value))}>
              {trips.map((t) => (
                <option key={t.id} value={t.id}>{t.neighborName} — {formatStatus(t.status)}</option>
              ))}
            </select>
          </label>
        </section>
      )}

      <section className="panel active-panel" role="region" aria-label="Active trip">
        <div className="panel-heading">
          <p className="eyebrow">Current</p>
          <h2>Active Trip</h2>
        </div>
        {selectedTrip && (
          <>
            <div className="route-card">
              <span className={`status ${selectedTrip.status}`}>{formatStatus(selectedTrip.status)}</span>
              <h3>{selectedTrip.neighborName}</h3>
              <p>{selectedTrip.purpose}</p>
              <div className="route-line">
                <span>Pickup</span>
                <strong>{selectedTrip.pickupAddress}</strong>
                <small>{formatDateTime(selectedTrip.pickupTime)}</small>
              </div>
              <div className="route-line">
                <span>Appointment</span>
                <strong>{selectedTrip.appointmentAddress}</strong>
                <small>{formatDateTime(selectedTrip.appointmentTime)}</small>
              </div>
              <p className="notes">Reminder: {selectedTrip.reminderMinutes} minutes before pickup</p>
              <p className="notes">Notes: {selectedTrip.notes || 'No notes.'}</p>
            </div>
            {selectedTrip.status !== 'completed' && (
              <button className="primary-action" onClick={advanceTrip}>{action?.label}</button>
            )}
            <form className="trip-log" onSubmit={completeWithTripLog}>
              <h3>Complete Trip Record</h3>
              <div className="form-grid two">
                <Input label="Start time" type="datetime-local" value={tripLog.startTime} onChange={(v) => setTripLog({ ...tripLog, startTime: v })} />
                <Input label="End time" type="datetime-local" value={tripLog.endTime} onChange={(v) => setTripLog({ ...tripLog, endTime: v })} />
                <Input label="Start odometer" type="number" value={tripLog.startOdometer} onChange={(v) => setTripLog({ ...tripLog, startOdometer: v })} />
                <Input label="End odometer" type="number" value={tripLog.endOdometer} onChange={(v) => setTripLog({ ...tripLog, endOdometer: v })} />
                <Input label="Donation / gift" type="number" value={tripLog.donationAmount} onChange={(v) => setTripLog({ ...tripLog, donationAmount: v })} />
              </div>
              <button className="secondary full" type="submit">Save Completed Trip</button>
            </form>
          </>
        )}
      </section>

      <div className="layout-grid">
        <section className="panel">
          <div className="panel-heading">
            <p className="eyebrow">Driver dashboard</p>
            <h2>Suggested Donation Settings</h2>
          </div>
          <p className="notes">Suggested defaults filled in. Each driver may set their own amounts. Donations are voluntary.</p>
          <div className="form-grid two">
            <Input label="Mileage rate" type="number" value={donationSettings.mileageRate} onChange={(v) => setDonationSettings({ ...donationSettings, mileageRate: Number(v) })} />
            <Input label="Hourly service rate" type="number" value={donationSettings.hourlyServiceRate} onChange={(v) => setDonationSettings({ ...donationSettings, hourlyServiceRate: Number(v) })} />
            <Input label="Waiting/service hours" type="number" value={donationSettings.waitingHours} onChange={(v) => setDonationSettings({ ...donationSettings, waitingHours: Number(v) })} />
            <Input label="Taxi mileage rate" type="number" value={donationSettings.taxiMileageRate} onChange={(v) => setDonationSettings({ ...donationSettings, taxiMileageRate: Number(v) })} />
            <Input label="Taxi hourly wait rate" type="number" value={donationSettings.taxiHourlyWaitRate} onChange={(v) => setDonationSettings({ ...donationSettings, taxiHourlyWaitRate: Number(v) })} />
          </div>
          <h3>Optional extra fees</h3>
          <div className="fee-grid">
            {Object.entries(extraFeeLabels).map(([key, label]) => (
              <Input key={key} label={label} type="number" value={donationSettings.extraFees[key]} onChange={(v) => updateExtraFee(key, v)} />
            ))}
          </div>
        </section>

        <section className="panel receipt-panel">
          <div className="panel-heading">
            <p className="eyebrow">Neighbor copy</p>
            <h2>Trip Receipt</h2>
          </div>
          <div className="receipt-total">
            <span>Suggested donation</span>
            <strong>${suggestedDonation.total.toFixed(2)}</strong>
          </div>
          <div className="savings-card" aria-label="Estimated taxi fare">
            <span>Estimated taxi fare</span>
            <strong>${estimatedTaxiFare.total.toFixed(2)}</strong>
          </div>
          <p className="notes">Taxi: base ${estimatedTaxiFare.baseAmount.toFixed(2)} • mileage ${estimatedTaxiFare.mileageAmount.toFixed(2)} • waiting ${estimatedTaxiFare.waitingAmount.toFixed(2)} • extras ${estimatedTaxiFare.extraFeeAmount.toFixed(2)}</p>
          <p className="notes">Donation: mileage ${suggestedDonation.mileageAmount.toFixed(2)} • service ${suggestedDonation.serviceAmount.toFixed(2)} • extras ${suggestedDonation.extraFeeAmount.toFixed(2)}</p>
          <pre className="receipt-preview">{receiptText}</pre>
          <button type="button" className="secondary full" onClick={() => window.print()}>Print Trip Receipt</button>
        </section>
      </div>
    </div>
  );
}

function DispatchTab({ authUser, isDispatcher, trips, onDutyDrivers, neighborhoodDrivers, dispatchStatus, loadDispatchDrivers, loadNeighborhoodMap, onAssignDriver, onUnassignDriver }) {
  const [selectedTripId, setSelectedTripId] = useState(null);
  const needsDriver = trips.filter((t) => t.status === 'scheduled' && !t.assignedDriverUid);
  const selectedTrip = trips.find((t) => t.id === selectedTripId);

  return (
    <div className="tab-view">
      {!authUser && <p className="notes error" style={{ padding: '12px 16px' }}>Sign in to use the dispatch tools.</p>}

      {isDispatcher && (
        <section className="panel dispatch-match" aria-label="Assign a Driver">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Dispatcher</p>
              <h2>Assign a Driver</h2>
            </div>
            <button type="button" className="secondary" onClick={loadDispatchDrivers} disabled={!authUser}>
              Refresh locations
            </button>
          </div>
          <p className="notes">Select a trip, then tap a driver to assign them.</p>

          <h3 className="dispatch-section-label">Trips needing a driver</h3>
          {needsDriver.length === 0
            ? <p className="notes">All scheduled trips have been assigned.</p>
            : (
              <div className="dispatch-trip-list">
                {needsDriver.map((trip) => (
                  <button
                    key={trip.id}
                    type="button"
                    className={`dispatch-trip-card ${selectedTripId === trip.id ? 'selected' : ''}`}
                    onClick={() => setSelectedTripId(selectedTripId === trip.id ? null : trip.id)}
                  >
                    <strong>{trip.neighborName}</strong>
                    <span>{trip.purpose || 'Neighbor transport'}</span>
                    <small>Pickup: {formatDateTime(trip.pickupTime)}</small>
                    <small>{trip.pickupAddress}</small>
                  </button>
                ))}
              </div>
            )}

          {selectedTrip && (
            <>
              <h3 className="dispatch-section-label">On-duty drivers</h3>
              {dispatchStatus && <p className="notes" aria-live="polite">{dispatchStatus}</p>}
              {onDutyDrivers.length === 0
                ? <p className="notes">No drivers on duty. Ask a driver to toggle On Duty in their Account tab.</p>
                : (
                  <div className="dispatch-driver-list">
                    {onDutyDrivers.map((driver) => (
                      <div key={driver.id || driver.uid} className="dispatch-driver-card">
                        <div className="dispatch-driver-info">
                          <span className="on-duty-dot">●</span>
                          <div>
                            <strong>{driver.displayName || 'Driver'}</strong>
                            <span>{[driver.vehicleYear, driver.vehicleMake, driver.vehicleModel].filter(Boolean).join(' ') || driver.vehicleDescription || 'Vehicle not set'}</span>
                            <span>{driver.vehicleColor}{driver.wheelchairAccessible ? ' · ♿ accessible' : ''}</span>
                            <small>{driver.serviceArea || 'Area not set'} · seats: {driver.vehicleSeats || '?'}</small>
                            {driver.phone && <small>📞 {driver.phone}</small>}
                            {driver.languagesSpoken && <small>🗣 {driver.languagesSpoken}</small>}
                          </div>
                        </div>
                        <div className="dispatch-driver-actions">
                          {driver.lat && driver.lng && (
                            <a href={mapsUrl(driver.lat, driver.lng)} target="_blank" rel="noopener noreferrer" className="map-link">Map →</a>
                          )}
                          <button
                            type="button"
                            onClick={() => { onAssignDriver(selectedTripId, driver); setSelectedTripId(null); }}
                          >
                            Assign
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </>
          )}
        </section>
      )}

      <section className="panel" aria-label="Assigned Trips">
        <div className="panel-heading">
          <p className="eyebrow">Status</p>
          <h2>Trip Assignments</h2>
        </div>
        <div className="mission-list">
          {trips.map((trip) => (
            <div key={trip.id} className="mission-card" style={{ display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
                <div>
                  <span className={`status ${trip.status}`}>{formatStatus(trip.status)}</span>
                  <strong style={{ display: 'block', marginTop: 4 }}>{trip.neighborName}</strong>
                  <span>{trip.purpose || 'Neighbor transport'}</span>
                  <small style={{ display: 'block' }}>{formatDateTime(trip.pickupTime)}</small>
                </div>
                {trip.assignedDriverName && (
                  <div className="assigned-driver-badge">
                    <span>🚗 {trip.assignedDriverName}</span>
                    {trip.assignedDriverPhone && <small>{trip.assignedDriverPhone}</small>}
                    {trip.assignedDriverVehicle && <small>{trip.assignedDriverVehicle}</small>}
                    {isDispatcher && (
                      <button type="button" className="secondary" style={{ fontSize: '0.72rem', padding: '4px 10px' }} onClick={() => onUnassignDriver(trip.id)}>
                        Unassign
                      </button>
                    )}
                  </div>
                )}
                {!trip.assignedDriverName && (
                  <span className="no-driver-badge">No driver</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel" aria-label="Neighborhood Driver Map">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Roster</p>
            <h2>All Neighborhood Drivers</h2>
          </div>
        </div>
        <p className="notes">All drivers opted into the neighborhood map.</p>
        <div className="button-row">
          <button type="button" className="secondary" disabled={!authUser} onClick={loadNeighborhoodMap}>
            Load Roster
          </button>
        </div>
        {neighborhoodDrivers.length > 0 && (
          <div className="dispatch-driver-list" style={{ marginTop: 12 }}>
            {neighborhoodDrivers.map((driver) => (
              <div key={driver.id || driver.uid} className="dispatch-driver-card">
                <div className="dispatch-driver-info">
                  <div>
                    <strong>{driver.displayName || 'Driver'}</strong>
                    <span>{[driver.vehicleYear, driver.vehicleMake, driver.vehicleModel].filter(Boolean).join(' ') || driver.vehicleDescription || 'Vehicle not set'}</span>
                    <small>{driver.serviceArea || 'Area not set'} · {driver.availability || 'Availability not set'}</small>
                    {driver.phone && <small>📞 {driver.phone}</small>}
                    {driver.wheelchairAccessible && <small>♿ Wheelchair accessible</small>}
                    {driver.hasInsurance && driver.insuranceShareForRate && <small>✓ Insurance on file — lower rate eligible</small>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AdminTab({ allProfiles, adminBusy, onLoad, onUpdateRole, onUpdateStatus }) {
  const roleCounts = allProfiles.reduce((acc, p) => {
    acc[p.role || 'member'] = (acc[p.role || 'member'] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="tab-view">
      <section className="panel" aria-label="Admin Panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Admin</p>
            <h2>User Management</h2>
          </div>
          <button type="button" className="secondary" onClick={onLoad} disabled={adminBusy}>
            {adminBusy ? 'Loading…' : 'Load All Users'}
          </button>
        </div>

        {allProfiles.length > 0 && (
          <>
            <div className="admin-summary">
              {Object.entries(roleCounts).map(([role, count]) => (
                <span key={role} className="admin-role-chip">
                  {count} {role}{count !== 1 ? 's' : ''}
                </span>
              ))}
            </div>

            <div className="admin-user-list">
              {allProfiles.map((profile) => (
                <div key={profile.uid || profile.id} className="admin-user-row">
                  <div className="admin-user-info">
                    <strong>{profile.displayName || 'No name'}</strong>
                    <span>{profile.email}</span>
                    {profile.phone && <small>{profile.phone}</small>}
                    {profile.serviceArea && <small>📍 {profile.serviceArea}</small>}
                    {profile.vehicleYear && <small>🚗 {[profile.vehicleYear, profile.vehicleMake, profile.vehicleModel].filter(Boolean).join(' ')}</small>}
                    {profile.hasInsurance && <small>✓ Insurance on file</small>}
                    {profile.dlNumber && <small>License on file</small>}
                    {profile.dlCopyName && <small>License doc: {profile.dlCopyName}</small>}
                    {profile.insuranceCopyName && <small>Insurance doc: {profile.insuranceCopyName}</small>}
                    {profile.emergencyContactName && <small>Emergency: {profile.emergencyContactName} {profile.emergencyContactPhone}</small>}
                  </div>
                  <div className="admin-role-controls">
                    <label className="admin-role-select">
                      <span>Role</span>
                      <select
                        value={profile.role || 'member'}
                        onChange={(e) => onUpdateRole(profile.uid || profile.id, e.target.value)}
                      >
                        <option value="member">Member</option>
                        <option value="driver">Driver</option>
                        <option value="dispatcher">Dispatcher</option>
                        <option value="admin">Admin</option>
                      </select>
                    </label>
                    <label className="admin-role-select">
                      <span>Status</span>
                      <select
                        value={profile.membershipStatus || profile.approvalStatus || 'approved'}
                        onChange={(e) => onUpdateStatus(profile.uid || profile.id, e.target.value)}
                      >
                        <option value="approved">Approved</option>
                        <option value="pending">Pending</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {allProfiles.length === 0 && !adminBusy && (
          <p className="notes">Click "Load All Users" to see all registered members and manage their roles.</p>
        )}
      </section>
    </div>
  );
}

function AccountTab({ authUser, userProfile, isApprovedDriver, isOnDuty, driverLocation, locationError, onDutyToggle, onSignOut }) {
  const isDriver = userProfile?.role === 'driver';

  return (
    <div className="tab-view">
      <section className="panel" aria-label="Account">
        <div className="panel-heading">
          <p className="eyebrow">Signed in</p>
          <h2>{userProfile?.displayName || authUser?.displayName || authUser?.email}</h2>
        </div>
        <div className="profile-meta">
          {userProfile?.email && <span>{userProfile.email}</span>}
          {userProfile?.phone && <span>{userProfile.phone}</span>}
          <span className="role-tag">{userProfile?.role === 'driver' ? '🚗 Driver' : '🏡 Member'}</span>
        </div>
        <div className="button-row">
          <button type="button" className="secondary" onClick={onSignOut}>Sign Out</button>
        </div>
      </section>

      {isDriver && (
        <section className="panel" aria-label="On Duty">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Location sharing</p>
              <h2>On Duty</h2>
            </div>
            <button
              type="button"
              className={isOnDuty ? 'duty-btn on' : 'duty-btn'}
              onClick={onDutyToggle}
              disabled={!isApprovedDriver && !isOnDuty}
            >
              {isOnDuty ? '● On Duty' : '○ Off Duty'}
            </button>
          </div>
          <p className="notes">
            {isOnDuty
              ? 'Your location is being shared with dispatchers. Turn off when done driving.'
              : isApprovedDriver
                ? 'Toggle On Duty to share your GPS location with dispatchers so they can route trips to the nearest driver.'
                : 'Your driver account must be approved before location sharing is enabled.'}
          </p>
          {isOnDuty && driverLocation && (
            <div className="location-readout">
              <strong>GPS active</strong>
              <span>{driverLocation.lat.toFixed(5)}, {driverLocation.lng.toFixed(5)}</span>
              <a href={mapsUrl(driverLocation.lat, driverLocation.lng)} target="_blank" rel="noopener noreferrer" className="map-link">
                View your location →
              </a>
            </div>
          )}
          {isOnDuty && !driverLocation && !locationError && (
            <p className="notes">Acquiring GPS signal…</p>
          )}
          {locationError && <p className="notes error">{locationError}</p>}
        </section>
      )}

      {isDriver && userProfile?.vehicleDescription && (
        <section className="panel">
          <div className="panel-heading">
            <p className="eyebrow">Driver profile</p>
            <h2>My Details</h2>
          </div>
          <div className="profile-details">
            <ProfileRow label="Vehicle" value={userProfile.vehicleDescription} />
            <ProfileRow label="Service area" value={userProfile.serviceArea} />
            <ProfileRow label="Availability" value={userProfile.availability} />
            {userProfile.dlNumber && <ProfileRow label="License #" value={userProfile.dlNumber} />}
            {userProfile.hasInsurance && (
              <>
                <ProfileRow label="Insurance" value={userProfile.insuranceProvider || 'On file'} />
                {userProfile.insuranceCost && <ProfileRow label="Annual premium" value={`$${userProfile.insuranceCost}`} />}
                {userProfile.insuranceShareForRate && <ProfileRow label="Rate status" value="Lower rate — insurance on file" />}
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Shared UI components ─────────────────────────────────────────────────────

function Input({ label, value, onChange, type = 'text', placeholder = '', disabled = false }) {
  return (
    <label>
      {label}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        min={type === 'number' ? '0' : undefined}
        step={type === 'number' ? '0.01' : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Stat({ label, value }) {
  return (
    <article className="stat-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function ProfileRow({ label, value }) {
  return (
    <div className="profile-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58Z"/>
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(value) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatStatus(status) {
  return status.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
}

function formToProfile(form) {
  return {
    role: form.role || 'member',
    emergencyContactName: form.emergencyContactName || '',
    emergencyContactPhone: form.emergencyContactPhone || '',
    vehicleYear: form.vehicleYear || '',
    vehicleMake: form.vehicleMake || '',
    vehicleModel: form.vehicleModel || '',
    vehicleColor: form.vehicleColor || '',
    vehiclePlate: form.vehiclePlate || '',
    vehicleSeats: form.vehicleSeats || '',
    wheelchairAccessible: Boolean(form.wheelchairAccessible),
    vehicleDescription: form.vehicleDescription || '',
    serviceArea: form.serviceArea || '',
    availability: form.availability || '',
    languagesSpoken: form.languagesSpoken || '',
    specialCapabilities: form.specialCapabilities || '',
    dlNumber: form.dlNumber || '',
    dlExpiry: form.dlExpiry || '',
    dlCopyName: form.dlCopyName || '',
    dlCopyFile: form.dlCopyFile || null,
    dlCopyUrl: form.dlCopyUrl || '',
    hasInsurance: Boolean(form.hasInsurance),
    insuranceProvider: form.insuranceProvider || '',
    insurancePolicyNumber: form.insurancePolicyNumber || '',
    insuranceCost: form.insuranceCost || '',
    insuranceCopyName: form.insuranceCopyName || '',
    insuranceCopyFile: form.insuranceCopyFile || null,
    insuranceCopyUrl: form.insuranceCopyUrl || '',
    insuranceShareForRate: Boolean(form.insuranceShareForRate),
    mapOptIn: Boolean(form.mapOptIn),
  };
}

function getAuthErrorMessage(error) {
  if (!error?.code) return error?.message || 'Sign-in did not complete. Please try again.';
  const messages = {
    'auth/email-already-in-use': 'That email is already signed up. Use Sign In instead.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/invalid-credential': 'Email or password was not accepted.',
    'auth/missing-password': 'Enter a password.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/operation-not-allowed': 'Email/password sign-in is not enabled. Please use Sign In with Google.',
    'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
    'auth/network-request-failed': 'Network error. Check your connection and try again.',
  };
  return messages[error.code] || `Error: ${error.code}`;
}

export default App;
