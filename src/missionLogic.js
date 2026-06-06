export function calculateMissionMiles(startOdometer, endOdometer) {
  if (startOdometer === null || startOdometer === undefined || endOdometer === null || endOdometer === undefined) {
    return 0;
  }

  const start = Number(startOdometer);
  const end = Number(endOdometer);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }

  return roundToOne(end - start);
}

export function calculateMissionMinutes(startTime, endTime) {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }

  return Math.round((end - start) / 60000);
}

export function getNextMissionAction(status, returnNeeded = false) {
  const actionMap = {
    scheduled: { nextStatus: 'active', label: 'Start Trip' },
    active: { nextStatus: 'pickup-arrived', label: 'Arrived at Pickup' },
    'pickup-arrived': { nextStatus: 'appointment-arrived', label: 'Arrived at Appointment' },
    returning: { nextStatus: 'completed', label: 'Complete Trip' },
  };

  if (status === 'appointment-arrived') {
    return returnNeeded
      ? { nextStatus: 'returning', label: 'Start Return' }
      : { nextStatus: 'completed', label: 'Complete Trip' };
  }

  return actionMap[status] ?? { nextStatus: 'completed', label: 'Complete Trip' };
}

export function summarizeMissions(missions) {
  const completedMissions = missions.filter((mission) => mission.status === 'completed');

  const totals = completedMissions.reduce(
    (summary, mission) => ({
      miles: summary.miles + safeNumber(mission.miles),
      minutes: summary.minutes + safeNumber(mission.minutes),
      donations: summary.donations + safeNumber(mission.donationAmount),
    }),
    { miles: 0, minutes: 0, donations: 0 },
  );

  return {
    completed: completedMissions.length,
    miles: roundToOne(totals.miles),
    hours: roundToOne(totals.minutes / 60),
    donations: roundToTwo(totals.donations),
  };
}

export function calculateSuggestedDonation({ miles = 0, waitingHours = 0, mileageRate = 0, hourlyServiceRate = 0, extraFees = {} }) {
  const mileageAmount = roundToTwo(nonNegativeNumber(miles) * nonNegativeNumber(mileageRate));
  const serviceAmount = roundToTwo(nonNegativeNumber(waitingHours) * nonNegativeNumber(hourlyServiceRate));
  const extraFeeAmount = roundToTwo(Object.values(extraFees).reduce((total, fee) => total + nonNegativeNumber(fee), 0));

  return {
    mileageAmount,
    serviceAmount,
    extraFeeAmount,
    total: roundToTwo(mileageAmount + serviceAmount + extraFeeAmount),
  };
}

export function calculateTaxiFare({ miles = 0, waitingHours = 0, baseFare = 4.5, mileageRate = 3.25, hourlyWaitRate = 30, extraFees = {} }) {
  const baseAmount = roundToTwo(nonNegativeNumber(baseFare));
  const mileageAmount = roundToTwo(nonNegativeNumber(miles) * nonNegativeNumber(mileageRate));
  const waitingAmount = roundToTwo(nonNegativeNumber(waitingHours) * nonNegativeNumber(hourlyWaitRate));
  const extraFeeAmount = roundToTwo(Object.values(extraFees).reduce((total, fee) => total + nonNegativeNumber(fee), 0));

  return {
    baseAmount,
    mileageAmount,
    waitingAmount,
    extraFeeAmount,
    total: roundToTwo(baseAmount + mileageAmount + waitingAmount + extraFeeAmount),
  };
}

export function calculateNeighborSavings(taxiFare = 0, donationAmount = 0) {
  return roundToTwo(Math.max(nonNegativeNumber(taxiFare) - nonNegativeNumber(donationAmount), 0));
}

export function formatTripReceipt({ neighborName = 'Neighbor', purpose = 'Trip', miles = 0, waitingHours = 0, donationAmount = 0, extraFees = {}, taxiFare = 0 }) {
  const extraFeeAmount = roundToTwo(Object.values(extraFees).reduce((total, fee) => total + nonNegativeNumber(fee), 0));
  const taxiFareAmount = roundToTwo(nonNegativeNumber(taxiFare));
  const savingsAmount = calculateNeighborSavings(taxiFareAmount, donationAmount);

  return [
    `Trip receipt for ${neighborName}`,
    `Purpose: ${purpose}`,
    `Miles: ${safeNumber(miles)}`,
    `Waiting/service hours: ${safeNumber(waitingHours)}`,
    `Extra fees: $${extraFeeAmount.toFixed(2)}`,
    `Estimated taxi fare: $${taxiFareAmount.toFixed(2)}`,
    `Suggested donation: $${safeNumber(donationAmount).toFixed(2)}`,
    `Estimated savings: $${savingsAmount.toFixed(2)}`,
    'Donations are voluntary.',
  ].join('\n');
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function nonNegativeNumber(value) {
  return Math.max(safeNumber(value), 0);
}

function roundToOne(value) {
  return Math.round(value * 10) / 10;
}

function roundToTwo(value) {
  return Math.round(value * 100) / 100;
}
