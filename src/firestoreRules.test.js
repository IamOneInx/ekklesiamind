import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const rules = readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8');

describe('firestore trip rules', () => {
  it('allows the mission status vocabulary used by trip progression', () => {
    expect(rules).toContain("'pickup-arrived'");
    expect(rules).toContain("'appointment-arrived'");
    expect(rules).toContain('function allowedTripStatuses()');
    expect(rules).toContain('request.resource.data.status in allowedTripStatuses()');
  });

  it('validates trip create shape and enum fields', () => {
    expect(rules).toContain("data.callerRelationship in ['church_member', 'plain_neighbor', 'other']");
    expect(rules).toContain("data.urgency in ['scheduled', 'immediate']");
    expect(rules).toContain("data.createdByRole in ['driver', 'dispatcher', 'admin']");
    expect(rules).toContain('validTripStrings(data)');
    expect(rules).toContain('validTripNumbers(data)');
    expect(rules).toContain('data.returnNeeded is bool');
  });

  it('keeps assignment fields dispatcher/admin controlled', () => {
    expect(rules).toContain('function assignmentKeys()');
    expect(rules).toContain('isApprovedDispatcherOrAdmin() && validAssignedDriverFields(request.resource.data)');
    expect(rules).toContain("approvedProfileRole(data.assignedDriverUid, ['driver'])");
  });
});
