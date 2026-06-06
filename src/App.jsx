import { useMemo, useState } from 'react';
import {
  calculateMissionMiles,
  calculateMissionMinutes,
  calculateNeighborSavings,
  calculateSuggestedDonation,
  calculateTaxiFare,
  formatTripReceipt,
  getNextMissionAction,
  summarizeMissions,
} from './missionLogic';
import { hasFirebaseConfig } from './firebase';
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

const defaultDonationSettings = {
  mileageRate: 0.7,
  hourlyServiceRate: 10,
  waitingHours: 1,
  taxiBaseFare: 4.5,
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
  const [tripLog, setTripLog] = useState({ startTime: '', endTime: '', startOdometer: '', endOdometer: '', donationAmount: '' });
  const [donationSettings, setDonationSettings] = useState(defaultDonationSettings);

  const selectedMission = missions.find((mission) => mission.id === selectedId) ?? missions[0];
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
    baseFare: donationSettings.taxiBaseFare,
    mileageRate: donationSettings.taxiMileageRate,
    hourlyWaitRate: donationSettings.taxiHourlyWaitRate,
    extraFees: donationSettings.extraFees,
  });
  const estimatedSavings = calculateNeighborSavings(estimatedTaxiFare.total, suggestedDonation.total);
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
            <Input label="EMD member name" value="Isaac Weaver" onChange={() => {}} />
            <Input label="Phone" value="(555) 010-1842" onChange={() => {}} />
          </div>
          <label className="checkbox-row">
            <input type="checkbox" defaultChecked />
            I serve as an ekklēsia Ministry Driver member
          </label>
          <div className="button-row">
            <button type="button">Sign Up</button>
            <button type="button" className="secondary">Sign In</button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <p className="eyebrow">Driver record</p>
            <h2>Complete Driver Portfolio</h2>
          </div>
          <p className="notes">Vehicle, service area, availability, contact notes, and coordinator permissions belong here.</p>
          <label className="checkbox-row">
            <input type="checkbox" defaultChecked />
            Add me to the member-only driver map
          </label>
          <p className="notes">Only available to EMD members. Coordinators can use this to find a neighborhood driver when dispatching a trip.</p>
        </div>
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
          <p className="notes">Basic taxi-style formula: miles × mileage rate + waiting/service time × hourly rate + optional extra fees.</p>
          <p className="notes">Suggested defaults are filled in, but each EMD may set their own suggested amounts. Donations are voluntary.</p>
          <div className="form-grid two">
            <Input label="Mileage rate" type="number" value={donationSettings.mileageRate} onChange={(value) => setDonationSettings({ ...donationSettings, mileageRate: Number(value) })} />
            <Input label="1 hour waiting/service time" type="number" value={donationSettings.hourlyServiceRate} onChange={(value) => setDonationSettings({ ...donationSettings, hourlyServiceRate: Number(value) })} />
            <Input label="Waiting/service hours" type="number" value={donationSettings.waitingHours} onChange={(value) => setDonationSettings({ ...donationSettings, waitingHours: Number(value) })} />
            <Input label="Taxi base fare" type="number" value={donationSettings.taxiBaseFare} onChange={(value) => setDonationSettings({ ...donationSettings, taxiBaseFare: Number(value) })} />
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
          <div className="savings-card" aria-label="Taxi fare savings estimate">
            <span>Estimated taxi fare</span>
            <strong>${estimatedTaxiFare.total.toFixed(2)}</strong>
            <span>Neighbor savings</span>
            <strong>${estimatedSavings.toFixed(2)}</strong>
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

function Input({ label, value, onChange, type = 'text', placeholder = '' }) {
  return (
    <label>
      {label}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
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

export default App;
