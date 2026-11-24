'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import type { PracticeQuizDto, QuizAttemptResultDto } from '@sysmaster/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { apiRequest } from '@/lib/client-api';
import { cn } from '@/lib/utils';

/** Répondre, faire corriger par le serveur, lire les explications, recommencer. */
export function QuizRunner({ quiz }: { quiz: PracticeQuizDto }) {
  const { data: session } = useSession();
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<QuizAttemptResultDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const byId = new Map(result?.results.map((r) => [r.questionId, r]));

  function toggle(qid: string, cid: string, single: boolean) {
    if (result) return;
    setAnswers((a) => {
      const cur = a[qid] ?? [];
      return { ...a, [qid]: single ? [cid] : cur.includes(cid) ? cur.filter((x) => x !== cid) : [...cur, cid] };
    });
  }

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      setResult(await apiRequest<QuizAttemptResultDto>('POST', `/quizzes/${quiz.slug}/attempts`, session?.accessToken, { answers }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Correction impossible');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {result && (
        <Card role="status" className={cn('space-y-1', result.passed ? 'border-emerald-300' : 'border-amber-300')}>
          <CardTitle>
            {result.correctCount} / {result.total} bonnes réponses ({result.score} %) {result.passed ? '— réussi' : `— seuil ${quiz.passScore} %`}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Lisez l’explication de chaque question, surtout celles que vous avez manquées.
            {!result.recorded && ' Connectez-vous pour garder une trace de vos essais.'}
          </p>
        </Card>
      )}
      <ol className="space-y-4">
        {quiz.questions.map((q, i) => {
          const r = byId.get(q.id);
          return (
            <li key={q.id}>
              <Card className="space-y-3">
                <p className="flex items-start gap-2 font-medium">
                  {r && (r.correct ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-label="Juste" /> : <XCircle className="mt-0.5 size-5 shrink-0 text-red-600" aria-label="Faux" />)}
                  <span>{i + 1}. {q.promptMd}</span>
                </p>
                {q.type === 'multiple' && <p className="text-xs text-muted-foreground">Plusieurs réponses possibles.</p>}
                <ul className="space-y-1">
                  {q.choices.map((c) => {
                    const checked = (answers[q.id] ?? []).includes(c.id);
                    const good = r?.answer.includes(c.id);
                    return (
                      <li key={c.id}>
                        <label className={cn('flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm', r && good && 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950', r && checked && !good && 'border-red-300 bg-red-50 dark:bg-red-950')}>
                          <input type={q.type === 'single' ? 'radio' : 'checkbox'} name={q.id} checked={checked} disabled={!!r} onChange={() => toggle(q.id, c.id, q.type === 'single')} />
                          {c.text}
                        </label>
                      </li>
                    );
                  })}
                </ul>
                {r && <p className="rounded-md bg-muted p-3 text-sm"><span className="font-medium">Pourquoi : </span>{r.explanation}</p>}
              </Card>
            </li>
          );
        })}
      </ol>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {result ? (
        <Button variant="outline" onClick={() => { setResult(null); setAnswers({}); }}>Recommencer</Button>
      ) : (
        <Button onClick={() => void submit()} disabled={loading}>
          {loading && <Loader2 className="size-4 animate-spin" aria-hidden />} Corriger
        </Button>
      )}
    </div>
  );
}
