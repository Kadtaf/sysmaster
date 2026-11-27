import { excerpt, notificationFor, safeHref } from './notifications';

describe('notificationFor', () => {
  it('réponse : l’auteur du sujet est prévenu, pas celui qui répond à son propre sujet', () => {
    const p = { threadId: 't1', postId: 'p1', authorId: 'b', threadAuthorId: 'a', threadTitle: 'Mon   serveur\nne démarre pas' };
    expect(notificationFor('community.reply.posted.v1', p)).toEqual({
      userId: 'a', type: 'community_reply', title: 'Nouvelle réponse à votre sujet', body: '« Mon serveur ne démarre pas »', href: '/communaute/t1#post-p1',
    });
    expect(notificationFor('community.reply.posted.v1', { ...p, authorId: 'a' })).toBeNull();
  });

  it('mentorat : la personne prévenue est toujours l’autre', () => {
    const base = { mentorshipId: 'm1', mentorId: 'mentor', menteeId: 'eleve', topic: 'Réseau' };
    expect(notificationFor('community.mentorship.changed.v1', { ...base, status: 'requested', actorId: 'eleve' })).toMatchObject({ userId: 'mentor', title: 'Nouvelle demande de mentorat' });
    expect(notificationFor('community.mentorship.changed.v1', { ...base, status: 'active', actorId: 'mentor' })).toMatchObject({ userId: 'eleve', href: '/communaute/mentorat/m1' });
    expect(notificationFor('community.mentorship.changed.v1', { ...base, status: 'ended', actorId: 'eleve' })).toMatchObject({ userId: 'mentor' });
  });

  it('certificat, réponse acceptée, relecture', () => {
    expect(notificationFor('assessment.certificate.issued.v1', { certificateId: 'c', serial: 'SM-1', certificationCode: 'LINUX-ADMIN', userId: 'u', score: 88 }))
      .toMatchObject({ userId: 'u', type: 'certificate_issued', href: '/verify/SM-1' });
    expect(notificationFor('community.answer.accepted.v1', { threadId: 't', postId: 'p', userId: 'u', acceptedBy: 'v' })).toMatchObject({ userId: 'u', type: 'answer_accepted' });
    expect(notificationFor('editorial.revision.reviewed.v1', { revisionId: 'r', kind: 'course', authorId: 'u', reviewerId: 'v', decision: 'changes_requested' }))
      .toMatchObject({ userId: 'u', type: 'editorial_review', href: '/editorial/r' });
    expect(notificationFor('editorial.revision.reviewed.v1', { revisionId: 'r', kind: 'course', authorId: 'u', reviewerId: 'u', decision: 'approved' })).toBeNull();
    expect(notificationFor('labs.lab.solved.v1', {})).toBeNull();
  });

  it('extrait court et liens internes seulement', () => {
    expect(excerpt('a'.repeat(100), 10)).toBe(`${'a'.repeat(9)}…`);
    expect(safeHref('/communaute/1')).toBe('/communaute/1');
    for (const bad of ['//evil.test', 'https://evil.test', 'javascript:alert(1)', '/\\evil', 42, null]) expect(safeHref(bad)).toBeNull();
  });
});
