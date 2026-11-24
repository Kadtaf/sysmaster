import type { QuizContent, QuizQuestion } from '@sysmaster/contracts';
import { quizIssues } from './quiz-rules';

const question = (over: Partial<QuizQuestion> = {}): QuizQuestion => ({
  type: 'single', promptMd: 'Pourquoi lancer df avant de supprimer ?', choices: [{ id: 'a', text: 'Mesurer' }, { id: 'b', text: 'Effacer' }],
  answer: ['a'], explanation: 'On mesure avant d’agir.', difficulty: 'beginner', generatedByAi: true, ...over,
});
const quiz = (questions: QuizQuestion[], over: Partial<QuizContent> = {}): QuizContent => ({
  slug: 'quiz-linux-df', title: 'Quiz : df', platform: 'linux', commandSlug: 'linux-df', questions, ...over,
});
const ctx = { knownCommands: new Set(['linux-df']) };
const messages = (c: QuizContent) => quizIssues(c, ctx).map((i) => i.message);

describe('règles de publication d’un quiz', () => {
  it('accepte un quiz complet', () => {
    expect(quizIssues(quiz([question()]), ctx)).toEqual([]);
  });

  it('exige au moins une question et une fiche publiée', () => {
    expect(messages(quiz([], { commandSlug: 'inconnue' }))).toEqual([
      'La fiche « inconnue » n’est pas publiée.',
      'Le quiz ne contient aucune question.',
    ]);
  });

  it('refuse les questions qui ne vérifient rien ou n’expliquent rien', () => {
    expect(messages(quiz([question({ answer: ['a', 'b'] })]))).toEqual([
      'Question 1 : une seule bonne réponse pour une question à choix unique.',
      'Question 1 : tous les choix sont justes, la question ne vérifie rien.',
    ]);
    expect(messages(quiz([question({ explanation: ' ' })]))).toEqual(['Question 1 : expliquez pourquoi la bonne réponse est juste.']);
    expect(messages(quiz([question({ answer: ['c'] })]))).toEqual(['Question 1 : une bonne réponse ne correspond à aucun choix.']);
    expect(messages(quiz([question({ answer: [] })]))).toEqual(['Question 1 : aucune bonne réponse cochée.']);
    expect(messages(quiz([question({ choices: [{ id: 'a', text: 'x' }, { id: 'a', text: 'y' }] })]))).toContain('Question 1 : deux choix ont la même lettre.');
  });
});
