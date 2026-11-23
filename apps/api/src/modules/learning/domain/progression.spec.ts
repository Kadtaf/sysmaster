import { assertCanComplete, lessonStates, LessonLockedError, progressPct } from './progression';

const lessons = [
  { id: 'a', title: 'A' },
  { id: 'b', title: 'B' },
  { id: 'c', title: 'C' },
];

describe('progression', () => {
  it('seule la première leçon est disponible au départ', () => {
    expect(lessonStates(lessons, new Set()).map((s) => s.status)).toEqual(['available', 'locked', 'locked']);
  });

  it('valider une leçon débloque la suivante', () => {
    expect(lessonStates(lessons, new Set(['a'])).map((s) => s.status)).toEqual(['completed', 'available', 'locked']);
  });

  it('indique la première leçon manquante comme blocage', () => {
    const c = lessonStates(lessons, new Set())[2];
    expect(c.blockedBy).toEqual({ id: 'a', title: 'A' });
  });

  it('refuse de valider une leçon verrouillée, en expliquant pourquoi', () => {
    expect(() => assertCanComplete(lessons, new Set(), 'b')).toThrow(LessonLockedError);
    expect(() => assertCanComplete(lessons, new Set(), 'b')).toThrow('Validez d\'abord « A »');
  });

  it('accepte de revalider une leçon déjà validée (idempotent)', () => {
    expect(() => assertCanComplete(lessons, new Set(['a']), 'a')).not.toThrow();
  });

  it('calcule un pourcentage borné', () => {
    expect(progressPct(3, 1)).toBe(33.33);
    expect(progressPct(0, 0)).toBe(0);
    expect(progressPct(2, 5)).toBe(100);
  });
});
