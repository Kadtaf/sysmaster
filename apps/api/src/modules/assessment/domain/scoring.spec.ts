import { score } from './scoring';

const qs = [
  { id: 'q1', answer: ['a'], explanation: 'e1' },
  { id: 'q2', answer: ['b', 'c'], explanation: 'e2' },
];

describe('correction d’un quiz', () => {
  it('compte une question multiple juste seulement si l’ensemble coché est exact', () => {
    expect(score(qs, { q1: ['a'], q2: ['c', 'b'] }, 70)).toMatchObject({ score: 100, passed: true, correctCount: 2 });
    expect(score(qs, { q1: ['a'], q2: ['b', 'c', 'd'] }, 70)).toMatchObject({ score: 50, passed: false, correctCount: 1 });
  });

  it('une question sans réponse est fausse, et la correction révèle la bonne réponse', () => {
    const r = score(qs, {}, 70);
    expect(r.score).toBe(0);
    expect(r.results[1]).toEqual({ questionId: 'q2', correct: false, given: [], answer: ['b', 'c'], explanation: 'e2' });
  });
});
