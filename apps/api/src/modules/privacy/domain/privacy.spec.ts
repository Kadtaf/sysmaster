import {
  anonymizedEmail, canCancelErasure, ERASURE_CONFIRMATION, ERASURE_GRACE_DAYS, ErasureState, erasureDueAt, erasureRequestBlocker,
  isDue, retentionCutoff,
} from './privacy';

const requestedAt = new Date('2026-11-01T10:00:00Z');
const scheduled: ErasureState = { status: 'scheduled', requestedAt, dueAt: erasureDueAt(requestedAt) };

describe('RGPD : effacement', () => {
  it('délai de grâce de 7 jours, bien en deçà du mois légal', () => {
    expect(ERASURE_GRACE_DAYS).toBeLessThanOrEqual(30);
    expect(erasureDueAt(requestedAt).toISOString()).toBe('2026-11-08T10:00:00.000Z');
  });

  it('confirmation explicite exigée, une seule demande à la fois', () => {
    expect(erasureRequestBlocker({ status: 'none' }, ERASURE_CONFIRMATION)).toBeNull();
    expect(erasureRequestBlocker({ status: 'none' }, ' SUPPRIMER ')).toBeNull();
    expect(erasureRequestBlocker({ status: 'none' }, 'supprimer')).toContain('saisissez');
    expect(erasureRequestBlocker({ status: 'none' }, undefined)).toContain('saisissez');
    expect(erasureRequestBlocker(scheduled, ERASURE_CONFIRMATION)).toContain('déjà en cours');
    expect(erasureRequestBlocker({ status: 'erased' }, ERASURE_CONFIRMATION)).toContain('déjà supprimé');
  });

  it('annulable pendant le délai, exécutée ensuite', () => {
    expect(canCancelErasure(scheduled, new Date('2026-11-07T10:00:00Z'))).toBe(true);
    expect(isDue(scheduled, new Date('2026-11-07T10:00:00Z'))).toBe(false);
    expect(canCancelErasure(scheduled, new Date('2026-11-08T10:00:00Z'))).toBe(false);
    expect(isDue(scheduled, new Date('2026-11-08T10:00:00Z'))).toBe(true);
    expect(isDue({ status: 'none' }, new Date())).toBe(false);
  });

  it('adresse anonymisée unique et non routable', () => {
    expect(anonymizedEmail('abc')).toBe('supprime-abc@invalid');
  });
});

describe('RGPD : conservation', () => {
  it('date limite', () => {
    expect(retentionCutoff(new Date('2026-11-26T00:00:00Z'), 365).toISOString()).toBe('2025-11-26T00:00:00.000Z');
  });
});
