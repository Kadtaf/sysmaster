import { canMentor, inviteCode, joinBlocker, mentorshipAccess, nextOwner, requestBlocker, transition } from './social';

const mentor = { accepting: true, activeMentees: 1, maxMentees: 3 };
const ok = { self: false, mentor, openRequests: 0, alreadyOpen: false };

describe('Mentorat', () => {
  it('seuls les mentors (et les administrateurs) se déclarent', () => {
    expect(canMentor({ roles: ['mentor'] })).toBe(true);
    expect(canMentor({ roles: ['admin'] })).toBe(true);
    expect(canMentor({ roles: ['learner'] })).toBe(false);
  });

  it('demande : conditions', () => {
    expect(requestBlocker(ok)).toBeNull();
    expect(requestBlocker({ ...ok, mentor: null })).toContain('n’existe pas');
    expect(requestBlocker({ ...ok, self: true })).toContain('propre mentor');
    expect(requestBlocker({ ...ok, alreadyOpen: true })).toContain('déjà en cours');
    expect(requestBlocker({ ...ok, mentor: { ...mentor, accepting: false } })).toContain('ne prend pas');
    expect(requestBlocker({ ...ok, mentor: { ...mentor, activeMentees: 3 } })).toContain('autant d’apprenants');
    expect(requestBlocker({ ...ok, openRequests: 3 })).toContain('3 demandes');
  });

  it('transitions', () => {
    const cap = { activeMentees: 0, maxMentees: 2 };
    expect(transition('requested', 'accept', 'mentor', cap)).toEqual({ next: 'active' });
    expect(transition('requested', 'accept', 'mentee', cap)).toHaveProperty('error');
    expect(transition('requested', 'accept', 'mentor', { activeMentees: 2, maxMentees: 2 })).toHaveProperty('error');
    expect(transition('requested', 'decline', 'mentee', cap)).toEqual({ next: 'declined' });
    expect(transition('active', 'decline', 'mentor', cap)).toHaveProperty('error');
    expect(transition('active', 'end', 'mentee', cap)).toEqual({ next: 'ended' });
    expect(transition('requested', 'end', 'mentor', cap)).toHaveProperty('error');
  });

  it('messages : écrits pendant le mentorat, relus ensuite', () => {
    expect(mentorshipAccess('active')).toEqual({ read: true, write: true });
    expect(mentorshipAccess('ended')).toEqual({ read: true, write: false });
    expect(mentorshipAccess('requested')).toEqual({ read: true, write: false });
    expect(mentorshipAccess('declined')).toEqual({ read: false, write: false });
  });
});

describe('Groupes d’étude', () => {
  const g = { isPublic: true, memberCount: 3, maxMembers: 5, isMember: false };
  it('rejoindre', () => {
    expect(joinBlocker(g, false)).toBeNull();
    expect(joinBlocker({ ...g, isMember: true }, false)).toContain('déjà partie');
    expect(joinBlocker({ ...g, isPublic: false }, false)).toContain('privé');
    expect(joinBlocker({ ...g, isPublic: false }, true)).toBeNull();
    expect(joinBlocker({ ...g, memberCount: 5 }, false)).toContain('complet');
  });

  it('le membre le plus ancien reprend le groupe', () => {
    const members = [
      { userId: 'owner', role: 'owner' as const, joinedAt: new Date('2026-01-01') },
      { userId: 'late', role: 'member' as const, joinedAt: new Date('2026-03-01') },
      { userId: 'early', role: 'member' as const, joinedAt: new Date('2026-02-01') },
    ];
    expect(nextOwner(members, 'owner')).toBe('early');
    expect(nextOwner(members.slice(0, 1), 'owner')).toBeNull();
  });

  it('code d’invitation lisible', () => {
    const code = inviteCode(new Uint8Array([0, 1, 2, 3, 31, 32, 200, 255]));
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
  });
});
