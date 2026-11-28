import { acceptBlocker, hashInvitationToken, invitationState, licenceState, maskEmail, newInvitationToken, toCsv } from './organization';
import { renderInvitationEmail } from './invitation-email';

const now = new Date('2026-11-28T12:00:00Z');
const day = 86_400_000;

describe('licences par siège', () => {
  it('état de la licence', () => {
    expect(licenceState(null, new Date(now.getTime() + day), now)).toBe('active');
    expect(licenceState(new Date(now.getTime() + day), new Date(now.getTime() + 2 * day), now)).toBe('not_started');
    expect(licenceState(null, now, now)).toBe('expired');
    expect(licenceState(null, null, now)).toBe('expired');
  });

  it('jeton : aléatoire, seul le condensé est gardé', () => {
    const a = newInvitationToken();
    const b = newInvitationToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashInvitationToken(a.token).equals(a.hash)).toBe(true);
  });

  it('adresse masquée', () => {
    expect(maskEmail('alice.martin@exemple.fr')).toBe('a•••@exemple.fr');
    expect(maskEmail('sans-arobase')).toBe('•••');
  });

  it('état et acceptation d’une invitation', () => {
    expect(invitationState({ acceptedAt: null, revokedAt: null, expiresAt: new Date(now.getTime() - 1) }, now)).toBe('expired');
    const ok = { state: 'pending' as const, licence: 'active' as const, invitedEmail: 'A@x.fr', userEmail: 'a@x.fr', emailVerified: true, alreadyMember: false };
    expect(acceptBlocker(ok)).toBeNull();
    expect(acceptBlocker({ ...ok, emailVerified: false })).toContain('autre adresse');
    expect(acceptBlocker({ ...ok, userEmail: 'b@x.fr' })).toContain('autre adresse');
    expect(acceptBlocker({ ...ok, licence: 'expired' })).toContain('licence');
    expect(acceptBlocker({ ...ok, alreadyMember: true })).toContain('déjà membre');
    expect(acceptBlocker({ ...ok, state: 'accepted' })).toContain('déjà été utilisée');
  });

  it('CSV : « ; », guillemets, pas de formule exécutable', () => {
    const csv = toCsv([['Nom', 'XP'], ['=HYPERLINK("x")', 3], ['Dupont; Jean', null]]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")";3`);
    expect(csv).toContain('"Dupont; Jean";');
  });

  it('e-mail d’invitation : échappé, dit ce que voit l’organisation', () => {
    const m = renderInvitationEmail({ organization: 'École <b>', inviter: 'Nadia', role: 'member', link: 'https://sysmaster.example/organisation/invitation?token=abc', expiresAt: '2026-12-12T10:00:00Z' });
    expect(m.subject).toBe('Invitation à rejoindre École <b> sur SysMaster');
    expect(m.html).toContain('École &lt;b&gt;');
    expect(m.text).toContain('jamais vos conversations avec l’assistant');
    expect(m.text).toContain('12 décembre 2026');
    expect(m.html).not.toMatch(/<img/);
  });
});
