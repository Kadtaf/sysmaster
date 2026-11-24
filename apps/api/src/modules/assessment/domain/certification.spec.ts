import { certificateStatus, eligibility, expiry, isLate, serialFor } from './certification';

const now = new Date('2026-11-24T12:00:00Z');
const base = {
  now, bankSize: 30, questionCount: 10, labs: [{ slug: 'l1', title: 'Disque plein', solved: true }],
  prerequisites: [{ code: 'P', title: 'Prérequis', held: true }], current: null, lastFailureAt: null, retryAfterHours: 24,
};

describe('Certifications : règles', () => {
  it('éligible quand tout est rempli', () => {
    expect(eligibility(base)).toEqual({ eligible: true, reasons: [], nextAttemptAt: null });
  });

  it('chaque condition manquante est expliquée', () => {
    const e = eligibility({
      ...base, bankSize: 3, labs: [{ slug: 'l1', title: 'Disque plein', solved: false }], prerequisites: [{ code: 'P', title: 'Linux Administrator', held: false }],
    });
    expect(e.eligible).toBe(false);
    expect(e.reasons.join(' ')).toContain('banque de questions');
    expect(e.reasons.join(' ')).toContain('« Linux Administrator »');
    expect(e.reasons.join(' ')).toContain('« Disque plein »');
  });

  it('délai après un échec, puis de nouveau possible', () => {
    const e = eligibility({ ...base, lastFailureAt: new Date('2026-11-24T02:00:00Z') });
    expect(e.eligible).toBe(false);
    expect(e.nextAttemptAt?.toISOString()).toBe('2026-11-25T02:00:00.000Z');
    expect(eligibility({ ...base, lastFailureAt: new Date('2026-11-23T11:00:00Z') }).eligible).toBe(true);
  });

  it('un certificat valide empêche de repasser ; expiré ou révoqué, non', () => {
    expect(eligibility({ ...base, current: { serial: 's', expiresAt: null, revokedAt: null } }).eligible).toBe(false);
    expect(eligibility({ ...base, current: { serial: 's', expiresAt: new Date('2026-01-01'), revokedAt: null } }).eligible).toBe(true);
    expect(certificateStatus({ serial: 's', expiresAt: null, revokedAt: now }, now)).toBe('revoked');
  });

  it('échéance avec délai de grâce, expiration en mois', () => {
    const deadline = new Date('2026-11-24T11:59:30Z');
    expect(isLate(deadline, now)).toBe(false);
    expect(isLate(new Date('2026-11-24T11:58:00Z'), now)).toBe(true);
    expect(expiry(now, 36)?.toISOString()).toBe('2029-11-24T12:00:00.000Z');
    expect(expiry(now, null)).toBeNull();
  });

  it('numéro lisible et sans caractères ambigus', () => {
    expect(serialFor('LINUX-ADMIN', now, new Uint8Array([0, 1, 2, 3, 4, 31]))).toBe('SM-2026-LINADM-23456Z');
  });
});
