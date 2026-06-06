import { useEffect, useMemo, useState } from 'react';
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
import { registerMember, signInMember, signInWithGoogle, signOutMember, subscribeAuthState } from './authService';
import { loadNeighborhoodDrivers, saveDriverProfile } from './driverProfileService';
import './App.css';

const initialMissions = [
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

const blankMission = {
  neighborName: '',
  purpose: '',
  pickupAddress: '',
  appointmentAddress: '',
  pickupTime: '',
  appointmentTime: '',
  reminderMinutes: 30,
  returnNeeded: true,
  notes: '',
};

const blankDriverProfile = {
  vehicleDescription: '',
  serviceArea: '',
  availability: '',
  coordinatorNotes: '',
  mapOptIn: true,
};

const defaultDonationSettings = {
  mileageRate: 0.7,
  hourlyServiceRate: 10,
  waitingHours: 1,
  taxiMileageRate: 3.25,
  taxiHourlyWaitRate: 30,
  extraFees: {
    airportPickup: 0,
    nightService: 0,
    extraPassengers: 0,
    luggage: 0,
    tolls: 0,
    cleaning: 0,
    bookingDispatch: 0,
    creditCard: 0,
  },
};

const extraFeeLabels = {
  airportPickup: 'Airport pickup',
  nightService: 'Night service',
  extraPassengers: 'Extra passengers',
  luggage: 'Luggage',
  tolls: 'Tolls',
  cleaning: 'Cleaning',
  bookingDispatch: 'Booking/dispatch fee',
  creditCard: 'Credit card fee',
};

function App() {
  const [missions, setMissions] = useState(initialMissions);
  const [selectedId, setSelectedId] = useState(initialMissions[0].id);
  const [newMission, setNewMission] = useState(blankMission);
  const [memberForm, setMemberForm] = useState({
    displayName: 'Isaac Weaver',
    phone: '(555) 010-1842',
    email: '',
    password: '',
    privateInvitationCode: '',
    memberRole: 'driver',
    membershipAgreementAccepted: false,
    memberDriver: true,
  });
  const [driverProfile, setDriverProfile] = useState(blankDriverProfile);
  const [savedDriverProfile, setSavedDriverProfile] = useState(null);
  const [neighborhoodDrivers, setNeighborhoodDrivers] = useState([]);
  const [adminStatus, setAdminStatus] = useState('Admin tools are only for signed-in EMD members.');
  const [authUser, setAuthUser] = useState(null);
  const [authStatus, setAuthStatus] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [tripLog, setTripLog] = useState({ startTime: '', endTime: '', startOdometer: '', endOdometer: '', donationAmount: '' });
  const [donationSettings, setDonationSettings] = useState(defaultDonationSettings);

  const selectedMission = missions.find((mission) => mission.id === selectedId) ?? missions[0];
  const signedInLabel = authUser ? authUser.displayName || authUser.email || 'EMD member' : '';

  useEffect(() => subscribeAuthState((user) => {
    setAuthUser(user);
    if (user) {
      setAuthStatus(`Signed in as ${user.displayName || user.email || 'EMD member'}`);
    }
  }), []);

  const report = useMemo(() => summarizeMissions(missions), [missions]);
  const action = selectedMission ? getNextMissionAction(selectedMission.status, selectedMission.returnNeeded) : null;
  const previewMiles = selectedMission?.miles || 20;
  const suggestedDonation = calculateSuggestedDonation({
    miles: previewMiles,
    waitingHours: donationSettings.waitingHours,
    mileageRate: donationSettings.mileageRate,
    hourlyServiceRate: donationSettings.hourlyServiceRate,
    extraFees: donationSettings.extraFees,
  });
  const estimatedTaxiFare = calculateTaxiFare({
    miles: previewMiles,
    waitingHours: donationSettings.waitingHours,
    mileageRate: donationSettings.taxiMileageRate,
    hourlyWaitRate: donationSettings.taxiHourlyWaitRate,
    extraFees: donationSettings.extraFees,
  });
  const receiptText = formatTripReceipt({
    neighborName: selectedMission?.neighborName,
    purpose: selectedMission?.purpose,
    miles: previewMiles,
    waitingHours: donationSettings.waitingHours,
    donationAmount: suggestedDonation.total,
    extraFees: donationSettings.extraFees,
    taxiFare: estimatedTaxiFare.total,
  });

  function addMission(event) {
    event.preventDefault();
    if (!newMission.neighborName || !newMission.pickupTime || !newMission.appointmentTime) return;

    const mission = {
      ...newMission,
      id: Date.now(),
      status: 'scheduled',
      miles: 0,
      minutes: 0,
      donationAmount: 0,
    };

    setMissions((current) => [mission, ...current]);
    setSelectedId(mission.id);
    setNewMission(blankMission);
  }

  function advanceMission() {
    if (!selectedMission || !action) return;

    setMissions((current) => current.map((mission) => {
      if (mission.id !== selectedMission.id) return mission;

      if (action.nextStatus === 'active') {
        return { ...mission, status: 'active', actualStartTime: new Date().toISOString() };
      }

      return { ...mission, status: action.nextStatus };
    }));
  }

  function completeWithTripLog(event) {
    event.preventDefault();
    if (!selectedMission) return;

    const miles = calculateMissionMiles(tripLog.startOdometer, tripLog.endOdometer);
    const minutes = calculateMissionMinutes(tripLog.startTime, tripLog.endTime);

    setMissions((current) => current.map((mission) => (
      mission.id === selectedMission.id
        ? {
            ...mission,
            status: 'completed',
            miles,
            minutes,
            donationAmount: Number(tripLog.donationAmount) || 0,
            actualStartTime: tripLog.startTime,
            actualEndTime: tripLog.endTime,
          }
        : mission
    )));
    setTripLog({ startTime: '', endTime: '', startOdometer: '', endOdometer: '', donationAmount: '' });
  }

  function updateExtraFee(key, value) {
    setDonationSettings({
      ...donationSettings,
      extraFees: { ...donationSettings.extraFees, [key]: Number(value) },
    });
  }

  async function refreshNeighborhoodDrivers() {
    try {
      const drivers = await loadNeighborhoodDrivers();
      setNeighborhoodDrivers(drivers);
      setAdminStatus('Shared dispatcher map lookup is ready.');
    } catch {
      setAdminStatus('Sign in as an EMD member to load shared driver profiles.');
    }
  }

  async function handleMemberSignUp() {
    setAuthBusy(true);
    setAuthError('');
    if (!memberForm.membershipAgreementAccepted) {
      setAuthError('Accept the private membership agreement before Sign Up.');
      setAuthBusy(false);
      return;
    }

    try {
      const user = await registerMember({
        displayName: memberForm.displayName,
        email: memberForm.email,
        password: memberForm.password,
        phone: memberForm.phone,
      });
      setAuthUser(user);
      if (memberForm.memberDriver) {
        const portfolio = {
          ...driverProfile,
          memberDriver: memberForm.memberDriver,
          memberRole: memberForm.memberRole,
          membershipAgreementAccepted: memberForm.membershipAgreementAccepted,
          membershipStatus: 'pending-admin-approval',
          privateInvitationCode: memberForm.privateInvitationCode,
        };
        await saveDriverProfile({
          uid: user.uid,
          displayName: memberForm.displayName,
          email: memberForm.email,
          phone: memberForm.phone,
          driverProfile: portfolio,
        });
        setSavedDriverProfile({
          ...driverProfile,
          displayName: memberForm.displayName,
          phone: memberForm.phone,
          email: memberForm.email,
        });
        await refreshNeighborhoodDrivers();
      }
      setAuthStatus(`Signed in as ${user.displayName || user.email || 'EMD member'}`);
    } catch (error) {
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleMemberSignIn() {
    setAuthBusy(true);
    setAuthError('');
    try {
      const user = await signInMember({
        email: memberForm.email,
        password: memberForm.password,
      });
      setAuthUser(user);
      setAuthStatus(`Signed in as ${user.displayName || user.email || 'EMD member'}`);
      await refreshNeighborhoodDrivers();
    } catch (error) {
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleGoogleSignIn() {
    setAuthBusy(true);
    setAuthError('');
    try {
      const user = await signInWithGoogle();
      if (!user) {
        setAuthStatus('Opening Google sign-in in this tab...');
        return;
      }
      setAuthUser(user);
      setAuthStatus(`Signed in as ${user.displayName || user.email || 'EMD member'}`);
      await refreshNeighborhoodDrivers();
    } catch (error) {
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleMemberSignOut() {
    setAuthBusy(true);
    setAuthError('');
    try {
      await signOutMember();
      setAuthUser(null);
      setNeighborhoodDrivers([]);
      setAdminStatus('Admin tools are only for signed-in EMD members.');
      setAuthStatus('Signed out.');
    } catch (error) {
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">ἐκκλησία • called-out assembly</p>
          <h1>ekklēsia Ministry Driver</h1>
          <p className="hero-copy">
            A quiet, mobile-first command center for drivers who take neighbors to appointments, errands, and community care stops.
          </p>
          <p className="notes">Firebase project: {hasFirebaseConfig ? 'ekklesiamind connected' : 'local demo mode'}</p>
        </div>
        <div className="hero-actions">
          <button onClick={() => document.getElementById('new-mission')?.scrollIntoView({ behavior: 'smooth' })}>
            Schedule Apt
          </button>
          <button className="secondary" onClick={() => document.getElementById('active-mission')?.scrollIntoView({ behavior: 'smooth' })}>
            Start Trip
          </button>
        </div>
      </section>

      <section className="stats-grid" aria-label="Monthly stewardship report">
        <Stat label="Completed Trips" value={report.completed} />
        <Stat label="Service Miles" value={report.miles} />
        <Stat label="Service Hours" value={report.hours} />
        <Stat label="Donations Recorded" value={`$${report.donations}`} />
      </section>

      <section className="layout-grid">
        <div className="panel">
          <div className="panel-heading">
            <p className="eyebrow">Members only</p>
            <h2>EMD Member Sign-Up</h2>
          </div>
          <p className="notes">EMD means ekklēsia Ministry Drivers. Member sign-up protects the driver map, trip dispatching, and neighbor information.</p>
          <div className="form-grid two">
            <Input label="EMD member name" value={memberForm.displayName} onChange={(value) => setMemberForm({ ...memberForm, displayName: value })} />
            <Input label="Phone" value={memberForm.phone} onChange={(value) => setMemberForm({ ...memberForm, phone: value })} />
            <Input label="Email" type="email" value={memberForm.email} onChange={(value) => setMemberForm({ ...memberForm, email: value })} />
            <Input label="Password" type="password" value={memberForm.password} onChange={(value) => setMemberForm({ ...memberForm, password: value })} />
          </div>
          <label className="checkbox-row">
            <input type="checkbox" checked={memberForm.memberDriver} onChange={(event) => setMemberForm({ ...memberForm, memberDriver: event.target.checked })} />
            I serve as an ekklēsia Ministry Driver member
          </label>
          <div className="pma-box">
            <h3>Private Membership Association</h3>
            <p className="notes">This EMD association is private and not open to the public. Membership requests stay pending until an admin approves them.</p>
            <div className="form-grid two">
              <Input label="Private invitation code" value={memberForm.privateInvitationCode} onChange={(value) => setMemberForm({ ...memberForm, privateInvitationCode: value })} placeholder="Provided by EMD admin" />
              <label>
                Requested member role
                <select value={memberForm.memberRole} onChange={(event) => setMemberForm({ ...memberForm, memberRole: event.target.value })}>
                  <option value="member">Member</option>
                  <option value="driver">Driver</option>
                  <option value="dispatcher">Dispatcher/Admin</option>
                </select>
              </label>
            </div>
            <label className="checkbox-row">
              <input type="checkbox" checked={memberForm.membershipAgreementAccepted} onChange={(event) => setMemberForm({ ...memberForm, membershipAgreementAccepted: event.target.checked })} />
              I agree to join the private membership association and follow the EMD member agreement.
            </label>
            <p className="notes">Membership status: pending admin approval</p>
          </div>
          {authStatus && <p className="notes success" aria-live="polite">{authStatus}</p>}
          {authError && <p className="notes error" role="alert">{authError}</p>}
          <div className="button-row">
            <button type="button" onClick={handleMemberSignUp} disabled={authBusy || !hasFirebaseConfig}>Sign Up</button>
            <button type="button" className="secondary" onClick={handleMemberSignIn} disabled={authBusy || !hasFirebaseConfig}>Sign In</button>
            <button type="button" className="secondary" onClick={handleGoogleSignIn} disabled={authBusy || !hasFirebaseConfig}>Sign In with Google</button>
            {authUser && <button type="button" className="secondary" onClick={handleMemberSignOut} disabled={authBusy}>Sign Out</button>}
          </div>
          <p className="notes">{hasFirebaseConfig ? `Firebase Auth email/password and Google sign-in are connected${signedInLabel ? ` for ${signedInLabel}` : ''}.` : 'Firebase Auth needs app config before sign-in works.'}</p>
        </div>

        <div className="panel member-only-panel">
          <div className="panel-heading">
            <p className="eyebrow">Driver record</p>
            <h2>Complete Driver Portfolio</h2>
          </div>
          <p className="notes">Capture the driver details dispatchers need before assigning a Trip.</p>
          <div className="form-grid two">
            <Input label="Vehicle description" value={driverProfile.vehicleDescription} onChange={(value) => setDriverProfile({ ...driverProfile, vehicleDescription: value })} disabled={!memberForm.memberDriver} placeholder="Blue van, 4 seats, wheelchair room..." />
            <Input label="Neighborhood/service area" value={driverProfile.serviceArea} onChange={(value) => setDriverProfile({ ...driverProfile, serviceArea: value })} disabled={!memberForm.memberDriver} placeholder="North Settlement, Plainview..." />
            <Input label="Availability" value={driverProfile.availability} onChange={(value) => setDriverProfile({ ...driverProfile, availability: value })} disabled={!memberForm.memberDriver} placeholder="Weekday mornings, evenings..." />
            <label>
              Coordinator notes
              <textarea
                value={driverProfile.coordinatorNotes}
                onChange={(event) => setDriverProfile({ ...driverProfile, coordinatorNotes: event.target.value })}
                disabled={!memberForm.memberDriver}
                placeholder="Trip limits, accessibility notes, call preferences..."
              />
            </label>
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={driverProfile.mapOptIn && memberForm.memberDriver}
              disabled={!memberForm.memberDriver}
              onChange={(event) => setDriverProfile({ ...driverProfile, mapOptIn: event.target.checked })}
            />
            Add me to the member-only neighborhood driver map
          </label>
          <p className="notes">Only available to EMD members.</p>
          <p className="notes">Dispatchers can use this map opt-in to find a neighborhood Driver when dispatching a Trip.</p>
          {savedDriverProfile?.mapOptIn && (
            <div className="map-preview" aria-label="Captured neighborhood driver">
              <strong>Driver portfolio submitted for admin approval</strong>
              <span>{savedDriverProfile.displayName || 'EMD member'}</span>
              <span>{savedDriverProfile.serviceArea || 'Service area not set'}</span>
              <span>{savedDriverProfile.vehicleDescription || 'Vehicle not set'}</span>
            </div>
          )}
          {!memberForm.memberDriver && <p className="notes error">Complete Driver Portfolio is locked until the EMD member box is checked.</p>}
        </div>
      </section>

      <section className="panel admin-panel" aria-label="Admin Center">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Admin</p>
            <h2>Admin Center</h2>
          </div>
          <span className="status active">Members only</span>
        </div>
        <p className="notes">Admin tools are only for signed-in EMD members. The map lookup shows approved PMA members who opted in.</p>
        <div className="button-row">
          <button type="button" className="secondary" disabled={!authUser} onClick={refreshNeighborhoodDrivers}>Review Driver Portfolios</button>
          <button type="button" className="secondary" disabled={!authUser} onClick={refreshNeighborhoodDrivers}>Open Neighborhood Driver Map</button>
          <button type="button" className="secondary" disabled={!authUser}>Manage Trip Dispatch</button>
        </div>
        <p className="notes success" aria-live="polite">{adminStatus}</p>
        {neighborhoodDrivers.length > 0 ? (
          <div className="driver-map-list" aria-label="Shared dispatcher map lookup">
            <strong>Shared dispatcher map lookup</strong>
            {neighborhoodDrivers.map((driver) => (
              <article key={driver.id || driver.uid} className="driver-map-card">
                <span>{driver.displayName || 'EMD member'}</span>
                <strong>{driver.serviceArea || 'Service area not set'}</strong>
                <small>{driver.vehicleDescription || 'Vehicle not set'} • {driver.availability || 'Availability not set'}</small>
              </article>
            ))}
          </div>
        ) : (
          <p className="notes">Saved map opt-ins will appear here after an EMD member signs in.</p>
        )}
      </section>

      <section className="layout-grid">
        <div className="panel">
          <div className="panel-heading">
            <p className="eyebrow">Today</p>
            <h2>Trip Schedule</h2>
          </div>
          <div className="mission-list">
            {missions.map((mission) => (
              <button
                key={mission.id}
                className={`mission-card ${mission.id === selectedId ? 'selected' : ''}`}
                onClick={() => setSelectedId(mission.id)}
              >
                <span className={`status ${mission.status}`}>{formatStatus(mission.status)}</span>
                <strong>{mission.neighborName}</strong>
                <span>{mission.purpose || 'Neighbor transport'}</span>
                <small>{formatDateTime(mission.pickupTime)} pickup</small>
              </button>
            ))}
          </div>
        </div>

        <div className="panel active-panel" id="active-mission" role="region" aria-label="Active trip">
          <div className="panel-heading">
            <p className="eyebrow">Current</p>
            <h2>Active Trip</h2>
          </div>
          {selectedMission && (
            <>
              <div className="route-card">
                <span className={`status ${selectedMission.status}`}>{formatStatus(selectedMission.status)}</span>
                <h3>{selectedMission.neighborName}</h3>
                <p>{selectedMission.purpose}</p>
                <div className="route-line">
                  <span>Pickup</span>
                  <strong>{selectedMission.pickupAddress}</strong>
                  <small>{formatDateTime(selectedMission.pickupTime)}</small>
                </div>
                <div className="route-line">
                  <span>Appointment</span>
                  <strong>{selectedMission.appointmentAddress}</strong>
                  <small>{formatDateTime(selectedMission.appointmentTime)}</small>
                </div>
                <p className="notes">Reminder: {selectedMission.reminderMinutes} minutes before pickup</p>
                <p className="notes">Notes: {selectedMission.notes || 'No notes yet.'}</p>
              </div>

              {selectedMission.status !== 'completed' && (
                <button className="primary-action" onClick={advanceMission}>{action.label}</button>
              )}

              <form className="trip-log" onSubmit={completeWithTripLog}>
                <h3>Complete Trip Record</h3>
                <div className="form-grid two">
                  <Input label="Start time" type="datetime-local" value={tripLog.startTime} onChange={(value) => setTripLog({ ...tripLog, startTime: value })} />
                  <Input label="End time" type="datetime-local" value={tripLog.endTime} onChange={(value) => setTripLog({ ...tripLog, endTime: value })} />
                  <Input label="Start odometer" type="number" value={tripLog.startOdometer} onChange={(value) => setTripLog({ ...tripLog, startOdometer: value })} />
                  <Input label="End odometer" type="number" value={tripLog.endOdometer} onChange={(value) => setTripLog({ ...tripLog, endOdometer: value })} />
                  <Input label="Donation / gift" type="number" value={tripLog.donationAmount} onChange={(value) => setTripLog({ ...tripLog, donationAmount: value })} />
                </div>
                <button className="secondary full" type="submit">Save Completed Trip</button>
              </form>
            </>
          )}
        </div>
      </section>

      <section className="panel" id="new-mission">
        <div className="panel-heading">
          <p className="eyebrow">Intake</p>
          <h2>Schedule Apt</h2>
        </div>
        <form onSubmit={addMission} className="form-grid" aria-label="Schedule Apt">
          <Input label="Neighbor name" value={newMission.neighborName} onChange={(value) => setNewMission({ ...newMission, neighborName: value })} />
          <Input label="Purpose" value={newMission.purpose} placeholder="Clinic appointment, store pickup..." onChange={(value) => setNewMission({ ...newMission, purpose: value })} />
          <Input label="Pickup address" value={newMission.pickupAddress} onChange={(value) => setNewMission({ ...newMission, pickupAddress: value })} />
          <Input label="Appointment address" value={newMission.appointmentAddress} onChange={(value) => setNewMission({ ...newMission, appointmentAddress: value })} />
          <Input label="Pickup time" type="datetime-local" value={newMission.pickupTime} onChange={(value) => setNewMission({ ...newMission, pickupTime: value })} />
          <Input label="Appointment time" type="datetime-local" value={newMission.appointmentTime} onChange={(value) => setNewMission({ ...newMission, appointmentTime: value })} />
          <Input label="Reminder minutes" type="number" value={newMission.reminderMinutes} onChange={(value) => setNewMission({ ...newMission, reminderMinutes: Number(value) })} />
          <label className="checkbox-row">
            <input type="checkbox" checked={newMission.returnNeeded} onChange={(event) => setNewMission({ ...newMission, returnNeeded: event.target.checked })} />
            Return trip needed
          </label>
          <label className="wide-field">
            Notes
            <textarea value={newMission.notes} onChange={(event) => setNewMission({ ...newMission, notes: event.target.value })} placeholder="Wheelchair, wait during appointment, call ahead..." />
          </label>
          <button type="submit" className="full">Add to Schedule</button>
        </form>
      </section>

      <section className="layout-grid">
        <div className="panel">
          <div className="panel-heading">
            <p className="eyebrow">Driver dashboard</p>
            <h2>Suggested Donation Settings</h2>
          </div>
          <p className="notes">National-average taxi estimate: miles × mileage rate + waiting/service time × hourly rate + optional extra fees.</p>
          <p className="notes">Suggested defaults are filled in, but each EMD may set their own suggested amounts. Donations are voluntary.</p>
          <div className="form-grid two">
            <Input label="Mileage rate" type="number" value={donationSettings.mileageRate} onChange={(value) => setDonationSettings({ ...donationSettings, mileageRate: Number(value) })} />
            <Input label="1 hour waiting/service time" type="number" value={donationSettings.hourlyServiceRate} onChange={(value) => setDonationSettings({ ...donationSettings, hourlyServiceRate: Number(value) })} />
            <Input label="Waiting/service hours" type="number" value={donationSettings.waitingHours} onChange={(value) => setDonationSettings({ ...donationSettings, waitingHours: Number(value) })} />
            <Input label="Taxi mileage rate" type="number" value={donationSettings.taxiMileageRate} onChange={(value) => setDonationSettings({ ...donationSettings, taxiMileageRate: Number(value) })} />
            <Input label="Taxi hourly wait rate" type="number" value={donationSettings.taxiHourlyWaitRate} onChange={(value) => setDonationSettings({ ...donationSettings, taxiHourlyWaitRate: Number(value) })} />
          </div>
          <h3>Optional extra fees</h3>
          <div className="fee-grid">
            {Object.entries(extraFeeLabels).map(([key, label]) => (
              <Input key={key} label={label} type="number" value={donationSettings.extraFees[key]} onChange={(value) => updateExtraFee(key, value)} />
            ))}
          </div>
        </div>

        <div className="panel receipt-panel">
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
          <p className="notes">Taxi estimate: base ${estimatedTaxiFare.baseAmount.toFixed(2)} • mileage ${estimatedTaxiFare.mileageAmount.toFixed(2)} • waiting ${estimatedTaxiFare.waitingAmount.toFixed(2)} • extra fees ${estimatedTaxiFare.extraFeeAmount.toFixed(2)}</p>
          <p className="notes">Suggested donation: mileage ${suggestedDonation.mileageAmount.toFixed(2)} • waiting/service ${suggestedDonation.serviceAmount.toFixed(2)} • extra fees ${suggestedDonation.extraFeeAmount.toFixed(2)}</p>
          <pre className="receipt-preview">{receiptText}</pre>
          <button type="button" className="secondary full" onClick={() => window.print()}>Print Trip Receipt</button>
        </div>
      </section>

      <section className="wording-panel">
        <div>
          <p className="eyebrow">Tone</p>
          <h2>Service-first wording</h2>
          <p>Use ministry words instead of commercial taxi words:</p>
        </div>
        <div className="word-grid">
          <Wording bad="Ride" good="Apt Trip" />
          <Wording bad="Customer" good="Neighbor" />
          <Wording bad="Fare" good="Donation / Gift" />
          <Wording bad="Driver" good="Ministry Driver" />
        </div>
      </section>
    </main>
  );
}

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
        onChange={(event) => onChange(event.target.value)}
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

function Wording({ bad, good }) {
  return (
    <article>
      <span>{bad}</span>
      <strong>{good}</strong>
    </article>
  );
}

function formatDateTime(value) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatStatus(status) {
  return status.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
}

function getAuthErrorMessage(error) {
  if (!error?.code) return 'Authentication did not complete. Please try again.';

  const messages = {
    'auth/email-already-in-use': 'That email is already signed up. Use Sign In instead.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/invalid-credential': 'Email or password was not accepted.',
    'auth/missing-password': 'Enter a password.',
    'auth/weak-password': 'Use a password with at least 6 characters.',
  };

  return messages[error.code] || 'Authentication did not complete. Please try again.';
}

export default App;
