/**
 * Correction d'un quiz d'entraînement. Pur : aucune base, aucun framework.
 * Une question à choix multiples n'est juste que si l'ensemble coché est exactement le bon :
 * cocher une mauvaise réponse « en plus » révèle une confusion qu'il faut corriger.
 */
export interface KeyedQuestion {
  id: string;
  answer: string[];
  explanation: string;
}

export function score(questions: KeyedQuestion[], given: Record<string, string[]>, passScore: number) {
  const results = questions.map((q) => {
    const g = [...new Set(given[q.id] ?? [])].sort();
    const a = [...q.answer].sort();
    return { questionId: q.id, correct: g.length === a.length && g.every((x, i) => x === a[i]), given: g, answer: a, explanation: q.explanation };
  });
  const correctCount = results.filter((r) => r.correct).length;
  const total = questions.length;
  const value = total ? Math.round((100 * correctCount) / total) : 0;
  return { score: value, passed: value >= passScore, correctCount, total, results };
}
