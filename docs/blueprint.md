# ekklēsia Ministry Driver Blueprint

## Purpose

A simple app for Anabaptist Ministry Drivers who serve neighbors and church/community members with transportation. The app keeps appointment trip details, reminders, trip time, miles, locations, donation/gift notes, and stewardship reports without making the service feel like a commercial taxi business.

## First product name

Recommended: ekklēsia Ministry Driver

Other good names:
- ekklēsia Trip Organizer
- ekklēsia Trip Miles
- ekklēsia Neighbor Transport

## Service-first wording

Use words that fit service, ministry, stewardship, and neighbor care.

| Avoid commercial wording | Use instead |
| --- | --- |
| Taxi ride | Apt trip / service trip |
| Customer | Neighbor / passenger / community member |
| Fare | Donation / gift / contribution |
| Driver | Ministry Driver / EMD member |
| Dispatch | Coordinator / trip assignment |
| Job | Trip / service request |

## Main users

### Ministry Driver / EMD

The person serving by driving. EMD means ekklēsia Ministry Drivers. Needs a simple mobile-first screen, large buttons, reminders, time, miles, and records.

### EMD member

EMD member sign-up is required before a driver can be visible in the member-only map system or receive member-only dispatching features.

### Coordinator

Receives requests, enters trips, assigns trips to Ministry Drivers, uses the member-only driver map to find neighborhood drivers, and reviews reports.

### Admin

Manages church/community settings, EMD members, driver portfolios, exports, and privacy rules.

## Member-only driver map and portfolio

Drivers should have a complete driver portfolio:
- EMD member name
- Contact information
- Vehicle information
- Service area / neighborhood
- Availability
- Notes for coordinators
- Whether they opt in to the member-only driver map

The map system should be members-only. Coordinators/dispatchers can use it to find a neighborhood driver when dispatching a trip, but it should not expose driver or neighbor information publicly.

## First version screens

### 1. Today’s Trips

Shows scheduled, active, and completed trips for the day.

Each trip card shows:
- Neighbor name
- Purpose
- Pickup time
- Appointment time
- Current status

### 2. Schedule Apt

Fields:
- Neighbor name
- Purpose
- Pickup address
- Appointment address
- Pickup time
- Appointment time
- Reminder minutes
- Return trip needed
- Notes

### 3. Active Trip

Large status buttons:
- Start Trip
- Arrived at Pickup
- Arrived at Appointment
- Start Return
- Complete Trip

Display:
- Neighbor name
- Purpose
- Pickup address and time
- Appointment address and time
- Reminder
- Notes

### 4. Complete Trip Record

Fields:
- Start time
- End time
- Start odometer
- End odometer
- Donation/gift amount

Calculated:
- Miles
- Service minutes/hours

### 5. Reports

Shows:
- Completed trips
- Service miles
- Service hours
- Donations recorded

### 6. Suggested Donation Settings

Each EMD can set their own suggested donation settings. The app may provide respectful default suggestions, but the driver can change them.

Basic taxi-style formula:

```text
Suggested donation = miles × mileage rate + waiting/service hours × hourly service rate + optional extra fees
```

Possible optional extra fees:
- Airport pickup
- Night service
- Extra passengers
- Luggage
- Tolls
- Cleaning
- Booking/dispatch fee
- Credit card fee

The app should label these as suggested and voluntary, not as a required fare.

### 7. Trip Receipt

Drivers should be able to print a trip receipt for the neighbor. The same trip total can be shown on a phone screen or future dashboard device screen as the “Device total.” Receipt wording should say “Suggested donation” and “Donations are voluntary.”

## Trip statuses

- scheduled
- active
- pickup-arrived
- appointment-arrived
- returning
- completed
- cancelled

## Data model draft

```js
trip = {
  id,
  driverId,
  neighborName,
  neighborPhone,
  purpose,
  pickupAddress,
  appointmentAddress,
  pickupTime,
  appointmentTime,
  reminderMinutes,
  returnNeeded,
  status,
  actualStartTime,
  actualEndTime,
  startOdometer,
  endOdometer,
  miles,
  minutes,
  donationAmount,
  suggestedDonationAmount,
  mileageRate,
  hourlyServiceRate,
  waitingHours,
  extraFees,
  notes,
  createdAt,
  updatedAt
}

emdMember = {
  id,
  displayName,
  phone,
  churchOrDistrict,
  membershipStatus,
  canUseMemberMap,
  createdAt,
  updatedAt
}

driverPortfolio = {
  driverId,
  vehicleDescription,
  serviceArea,
  neighborhood,
  availability,
  coordinatorNotes,
  mapOptIn,
  mapVisibilityMembersOnly
}
```

## Recommended build phases

### Phase 1: Working app prototype

- React mobile-first app
- Schedule trip
- Start/advance/complete trip
- Manual odometer tracking
- Service report summary
- EMD member sign-up concept
- Driver portfolio and member-only map opt-in concept
- Suggested donation dashboard and printable receipt concept
- Local/demo data

### Phase 2: Firebase app

- Firebase Auth
- Firestore trips collection
- EMD member profiles
- Driver portfolios
- Save real trip records
- Host on Firebase Hosting

### Phase 3: Reminders and better trip tracking

- Browser/mobile notifications
- Calendar-style schedule
- GPS distance option
- Offline mode
- Export printable reports

### Phase 4: Church/group support

- Coordinator role
- Assign trips to drivers
- Shared schedule
- Group reports
- Driver permissions
- Member-only neighborhood driver map

### Phase 5: ESP32 dashboard device

Build after the phone app is stable.

Device should be an accessory:
- ESP32 screen in vehicle
- Bluetooth Low Energy sync from phone
- Big physical buttons
- Displays current trip, next stop, appointment time, elapsed time, reminder, and suggested donation/device total

The phone remains the brain because it has GPS, storage, maps, notifications, account login, and internet.

## Faith-friendly mission statement

Built for those called to serve — helping Ministry Drivers organize neighbor transportation, remember appointments, and steward time and miles faithfully.
