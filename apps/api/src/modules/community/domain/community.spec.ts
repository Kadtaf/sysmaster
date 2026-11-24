import {
  autoHides, canAccept, excerpt, canSee, canVote, isModerator, normalizeTags, replyBlocker, rewardsAcceptance, scoreDelta, type ThreadFacts,
} from './community';

const question: ThreadFacts = { authorId: 'alice', kind: 'question', isLocked: false, hidden: false, acceptRewarded: false };
const learner = (id: string) => ({ id, roles: ['learner' as const] });
const moderator = { id: 'mod', roles: ['moderator' as const] };

describe('Communauté : règles', () => {
  it('seul l’auteur d’une question accepte une réponse', () => {
    expect(canAccept(question, learner('alice'))).toBe(true);
    expect(canAccept(question, learner('bob'))).toBe(false);
    expect(canAccept(question, null)).toBe(false);
    expect(canAccept({ ...question, kind: 'discussion' }, learner('alice'))).toBe(false);
  });

  it('on ne vote pas pour soi', () => {
    expect(canVote('alice', learner('alice'))).toBe(false);
    expect(canVote('alice', learner('bob'))).toBe(true);
    expect(canVote('alice', null)).toBe(false);
  });

  it('un contenu masqué reste visible pour son auteur et les modérateurs', () => {
    expect(canSee(true, 'alice', learner('alice'))).toBe(true);
    expect(canSee(true, 'alice', learner('bob'))).toBe(false);
    expect(canSee(true, 'alice', moderator)).toBe(true);
    expect(canSee(true, 'alice', null)).toBe(false);
    expect(canSee(false, 'alice', null)).toBe(true);
    expect(isModerator({ roles: ['admin'] })).toBe(true);
    expect(isModerator({ roles: ['super_admin'] })).toBe(true);
  });

  it('un sujet verrouillé ou masqué n’accepte plus de réponse', () => {
    expect(replyBlocker(question)).toBeNull();
    expect(replyBlocker({ ...question, isLocked: true })).toContain('verrouillé');
    expect(replyBlocker({ ...question, hidden: true })).toContain('masqué');
  });

  it('XP d’entraide : une fois par sujet, jamais pour sa propre réponse', () => {
    expect(rewardsAcceptance(question, 'bob')).toBe(true);
    expect(rewardsAcceptance(question, 'alice')).toBe(false);
    expect(rewardsAcceptance({ ...question, acceptRewarded: true }, 'bob')).toBe(false);
  });

  it('trois signalements masquent en attendant un modérateur', () => {
    expect(autoHides(2)).toBe(false);
    expect(autoHides(3)).toBe(true);
  });

  it('étiquettes normalisées', () => {
    expect(normalizeTags([' Systemd ', 'systemd', 'Mise à jour', '', 'a', 'b', 'c', 'd'])).toEqual(['systemd', 'mise-à-jour', 'a', 'b', 'c']);
  });

  it('variation de score d’un vote', () => {
    expect(scoreDelta(0, 1)).toBe(1);
    expect(scoreDelta(1, -1)).toBe(-2);
    expect(scoreDelta(-1, 0)).toBe(1);
  });

  it('aperçu en texte brut', () => {
    expect(excerpt('Après `systemctl restart` :\n\n```\nJob failed\n```\n\nVoir [la doc](https://x.org) **vite**.')).toBe('Après systemctl restart : … Voir la doc vite.');
    expect(excerpt('a'.repeat(300))).toHaveLength(200);
  });
});
