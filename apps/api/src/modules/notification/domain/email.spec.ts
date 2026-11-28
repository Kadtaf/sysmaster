import { emailByDefault, nextAttemptAt, readUnsubscribeToken, renderEmail, unsubscribeToken } from './email';

const SECRET = 'x'.repeat(32);
const USER = '0b6f0c1e-1d2a-4c3b-9e8f-0123456789ab';

describe('e-mails de notification', () => {
  it('par défaut : ce qui compte par e-mail, le forum dans l’application', () => {
    expect(emailByDefault('mentorship')).toBe(true);
    expect(emailByDefault('certificate_issued')).toBe(true);
    expect(emailByDefault('community_reply')).toBe(false);
  });

  it('essais espacés puis abandon', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(nextAttemptAt(1, now)?.toISOString()).toBe('2026-01-01T00:01:00.000Z');
    expect(nextAttemptAt(4, now)?.toISOString()).toBe('2026-01-01T02:00:00.000Z');
    expect(nextAttemptAt(5, now)).toBeNull();
  });

  it('jeton de désabonnement : signé, lié à la personne et au type, refusé s’il est modifié', () => {
    const t = unsubscribeToken(USER, 'mentorship', SECRET);
    expect(readUnsubscribeToken(t, SECRET)).toEqual({ userId: USER, type: 'mentorship' });
    expect(readUnsubscribeToken(t, 'y'.repeat(32))).toBeNull();
    const forged = `${Buffer.from(`${USER}.community_reply`).toString('base64url')}.${t.split('.')[1]}`;
    expect(readUnsubscribeToken(forged, SECRET)).toBeNull();
    expect(readUnsubscribeToken('nimporte.quoi', SECRET)).toBeNull();
    expect(readUnsubscribeToken('', SECRET)).toBeNull();
  });

  it('contenu échappé, lien vers le site et lien de désabonnement', () => {
    const m = renderEmail({ title: 'Nouvelle réponse à votre sujet', body: '« <script>alert(1)</script> »', href: '/communaute/1' },
      { site: 'https://sysmaster.test', unsubscribe: 'https://sysmaster.test/notifications/desabonnement?token=abc' });
    expect(m.subject).toBe('SysMaster : Nouvelle réponse à votre sujet');
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;');
    expect(m.text).toContain('https://sysmaster.test/communaute/1');
    expect(m.text).toContain('desabonnement?token=abc');
  });
});
