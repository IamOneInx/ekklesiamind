import { describe, expect, it } from 'vitest';
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

describe('mission logic', () => {
  it('calculates miles from odometer readings', () => {
    expect(calculateMissionMiles(12100.2, 12147.9)).toBe(47.7);
  });

  it('never returns negative miles when readings are incomplete or reversed', () => {
    expect(calculateMissionMiles(200, 190)).toBe(0);
    expect(calculateMissionMiles(null, 190)).toBe(0);
  });

  it('calculates minutes between mission start and end times', () => {
    expect(calculateMissionMinutes('2026-06-01T08:15:00', '2026-06-01T10:45:00')).toBe(150);
  });

  it('chooses the next ministry-driving action from status', () => {
    expect(getNextMissionAction('scheduled')).toEqual({ nextStatus: 'active', label: 'Start Trip' });
    expect(getNextMissionAction('active')).toEqual({ nextStatus: 'pickup-arrived', label: 'Arrived at Pickup' });
    expect(getNextMissionAction('pickup-arrived')).toEqual({ nextStatus: 'appointment-arrived', label: 'Arrived at Appointment' });
    expect(getNextMissionAction('appointment-arrived', true)).toEqual({ nextStatus: 'returning', label: 'Start Return' });
    expect(getNextMissionAction('appointment-arrived', false)).toEqual({ nextStatus: 'completed', label: 'Complete Trip' });
  });

  it('summarizes completed trips for stewardship reports', () => {
    const missions = [
      { status: 'completed', miles: 12.5, minutes: 60, donationAmount: 20 },
      { status: 'completed', miles: 8, minutes: 30, donationAmount: '' },
      { status: 'scheduled', miles: 100, minutes: 100, donationAmount: 50 },
    ];

    expect(summarizeMissions(missions)).toEqual({
      completed: 2,
      miles: 20.5,
      hours: 1.5,
      donations: 20,
    });
  });

  it('calculates suggested donation from driver-set mileage, waiting/service, and extra-fee rates', () => {
    expect(calculateSuggestedDonation({
      miles: 20,
      waitingHours: 1,
      mileageRate: 0.7,
      hourlyServiceRate: 10,
      extraFees: {
        airportPickup: 5,
        nightService: 3,
        extraPassengers: 2,
        luggage: 1,
        tolls: 4,
        cleaning: 0,
        bookingDispatch: 2.5,
        creditCard: 1.5,
      },
    })).toEqual({
      mileageAmount: 14,
      serviceAmount: 10,
      extraFeeAmount: 19,
      total: 43,
    });
  });

  it('estimates regular taxi fare and neighbor savings from the suggested donation', () => {
    const taxiFare = calculateTaxiFare({
      miles: 20,
      waitingHours: 1,
      baseFare: 4.5,
      mileageRate: 3.25,
      hourlyWaitRate: 30,
      extraFees: { tolls: 4, bookingDispatch: 2.5 },
    });

    expect(taxiFare).toEqual({
      baseAmount: 4.5,
      mileageAmount: 65,
      waitingAmount: 30,
      extraFeeAmount: 6.5,
      total: 106,
    });
    expect(calculateNeighborSavings(taxiFare.total, 43)).toBe(63);
  });

  it('formats printable trip receipt text for the neighbor and dashboard device', () => {
    const receipt = formatTripReceipt({
      neighborName: 'Sarah Miller',
      purpose: 'Clinic appointment',
      miles: 20,
      waitingHours: 1,
      donationAmount: 43,
      extraFees: { tolls: 4, bookingDispatch: 2.5 },
      taxiFare: 106,
    });

    expect(receipt).toContain('Trip receipt for Sarah Miller');
    expect(receipt).toContain('Clinic appointment');
    expect(receipt).toContain('Suggested donation: $43.00');
    expect(receipt).toContain('Extra fees: $6.50');
    expect(receipt).toContain('Estimated taxi fare: $106.00');
    expect(receipt).not.toContain('Estimated savings:');
    expect(receipt).toContain('Donations are voluntary.');
  });
});
