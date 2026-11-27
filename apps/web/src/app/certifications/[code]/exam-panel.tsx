'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import type { CertificationDto, ExamResultDto, ExamSessionDto, RedirectDto } from '@sysmaster/contracts';
import { formatPrice } from '@/lib/billing';
import { Markdown } from '@/components/markdown';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { ApiError, apiRequest } from '@/lib/client-api';

const when = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

function Countdown({ deadline, onExpire }: { deadline: string; onExpire: () => void }) {
  const [left, setLeft] = useState(() => Date.parse(deadline) - Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      const l = Date.parse(deadline) - Date.now();
      setLeft(l);
      if (l <= 0) {
        clearInterval(t);
        onExpire();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [deadline, onExpire]);
  const s = Math.max(0, Math.floor(left / 1000));
  return (
    <span className={s < 120 ? 'font-semibold text-red-600' : 'font-semibold'} aria-live="off">
      {String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}
    </span>
  );
}

/** Examen : démarrage, questions, minuteur, remise. Les réponses ne sont corrigées que côté serveur. */
export function ExamPanel({ certification: c }: { certification: CertificationDto }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [exam, setExam] = useState<ExamSessionDto | null>(null);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<ExamResultDto | null>(null);
  const [error, setError] = useState<{ message: string; reasons: string[] } | null>(null);
  const [pending, startTransition] = useTransition();
  const integrity = useRef({ tabSwitches: 0, pastes: 0 });
  const submitted = useRef(false);

  useEffect(() => {
    if (!exam) return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') integrity.current.tabSwitches++;
    };
    const onPaste = () => {
      integrity.current.pastes++;
    };
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('paste', onPaste);
    };
  }, [exam]);

  const fail = (e: unknown) => {
    const reasons = e instanceof ApiError && Array.isArray(e.body.reasons) ? (e.body.reasons as string[]) : [];
    setError({ message: e instanceof Error ? e.message : 'Action impossible', reasons });
  };

  const start = () =>
    startTransition(async () => {
      setError(null);
      try {
        setExam(await apiRequest<ExamSessionDto>('POST', `/certifications/${c.code}/exam`, session?.accessToken));
      } catch (e) {
        fail(e);
      }
    });

  /** Paiement d'une tentative chez Stripe (redirection complète), puis retour sur cette page. */
  const pay = () =>
    startTransition(async () => {
      setError(null);
      try {
        const { url } = await apiRequest<RedirectDto>('POST', `/certifications/${c.code}/purchase`, session?.accessToken);
        window.location.assign(url);
      } catch (e) {
        fail(e);
      }
    });

  const submit = useCallback(() => {
    if (!exam || submitted.current) return;
    submitted.current = true;
    startTransition(async () => {
      try {
        setResult(await apiRequest<ExamResultDto>('POST', `/exam-sessions/${exam.id}/submit`, session?.accessToken, { answers, integrity: integrity.current }));
        setExam(null);
        router.refresh();
      } catch (e) {
        submitted.current = false;
        fail(e);
      }
    });
  }, [exam, answers, session?.accessToken, router]);

  const toggle = (qid: string, choice: string, multiple: boolean) =>
    setAnswers((a) => {
      const cur = a[qid] ?? [];
      const next = multiple ? (cur.includes(choice) ? cur.filter((x) => x !== choice) : [...cur, choice]) : [choice];
      return { ...a, [qid]: next };
    });

  if (result) {
    return (
      <Card className="space-y-3" role="status">
        <CardTitle>{result.passed ? 'Examen réussi' : 'Examen non réussi'}</CardTitle>
        <p>
          {result.correctCount} bonne(s) réponse(s) sur {result.total}, soit {result.score} % (seuil : {result.passScore} %).
          {result.late && ' Remis après l’échéance : les réponses n’ont pas été prises en compte.'}
        </p>
        {result.certificate && (
          <p>
            Votre certificat est émis : <Link href={`/verify/${result.certificate.serial}`} className="font-medium underline">{result.certificate.serial}</Link>.
          </p>
        )}
        {result.nextAttemptAt && (
          <CardDescription>
            Les bonnes réponses ne sont pas affichées : la banque de questions sert à tous les candidats. Révisez avec les quiz d’entraînement et
            les labs ; nouvelle tentative possible à partir du {when(result.nextAttemptAt)}.
          </CardDescription>
        )}
      </Card>
    );
  }

  if (exam) {
    const answered = exam.questions.filter((q) => (answers[q.id] ?? []).length > 0).length;
    return (
      <section className="space-y-6" aria-label="Examen en cours">
        <div className="sticky top-16 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3 text-sm">
          <span>Temps restant : <Countdown deadline={exam.deadlineAt} onExpire={submit} /></span>
          <span>{answered} / {exam.questions.length} questions répondues</span>
          <Button onClick={submit} disabled={pending}>Remettre l’examen</Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Les changements d’onglet et les collages sont notés : ils ne vous éliminent pas, mais un examen litigieux peut être relu.
          À l’échéance, l’examen est remis automatiquement.
        </p>
        <ol className="space-y-6">
          {exam.questions.map((q, i) => (
            <li key={q.id}>
              <Card className="space-y-3">
                <div className="text-sm text-muted-foreground">Question {i + 1}{q.type === 'multiple' ? ' · plusieurs réponses possibles' : ''}</div>
                <Markdown>{q.promptMd}</Markdown>
                <fieldset className="space-y-2">
                  <legend className="sr-only">Réponses</legend>
                  {q.choices.map((ch) => (
                    <label key={ch.id} className="flex items-start gap-2 text-sm">
                      <input
                        type={q.type === 'multiple' ? 'checkbox' : 'radio'}
                        name={q.id}
                        checked={(answers[q.id] ?? []).includes(ch.id)}
                        onChange={() => toggle(q.id, ch.id, q.type === 'multiple')}
                        className="mt-1"
                      />
                      <span>{ch.text}</span>
                    </label>
                  ))}
                </fieldset>
              </Card>
            </li>
          ))}
        </ol>
        {error && <p role="alert" className="text-sm text-red-600">{error.message}</p>}
      </section>
    );
  }

  const me = c.me!;
  if (me.certificate?.status === 'valid') {
    return (
      <Card>
        <CardTitle>Certification obtenue</CardTitle>
        <p className="mt-2">
          Certificat <Link href={`/verify/${me.certificate.serial}`} className="font-medium underline">{me.certificate.serial}</Link> : imprimable et vérifiable.
        </p>
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <CardTitle>Examen</CardTitle>
      {me.openSession ? (
        <CardDescription>Un examen est en cours : il se termine le {when(me.openSession.deadlineAt)}. Reprenez-le là où vous en étiez.</CardDescription>
      ) : me.reasons.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm">{me.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      ) : (
        <CardDescription>
          Le minuteur démarre dès que vous commencez et ne s’arrête pas si vous fermez la page. Prévoyez {Math.round(c.exam.timeLimitS / 60)} minutes au calme.
        </CardDescription>
      )}
      {!me.openSession && c.payment.required && !me.paid ? (
        <>
          <Button onClick={pay} disabled={pending || !me.eligible}>
            {pending ? 'Ouverture du paiement…' : `Payer l’examen (${formatPrice(c.payment.amountCents)})`}
          </Button>
          <p className="text-xs text-muted-foreground">
            Une tentative par paiement, à commencer quand vous voulez. Paiement par Stripe : SysMaster ne voit jamais votre carte.
          </p>
        </>
      ) : (
        <Button onClick={start} disabled={pending || (!me.eligible && !me.openSession)}>
          {me.openSession ? 'Reprendre l’examen' : 'Commencer l’examen'}
        </Button>
      )}
      {!me.openSession && me.paid && <p className="text-xs text-muted-foreground">Tentative payée : elle sera utilisée quand vous commencerez.</p>}
      {error && (
        <div role="alert" className="text-sm text-red-600">
          <p>{error.message}</p>
          {error.reasons.length > 0 && <ul className="mt-1 list-disc pl-5">{error.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
        </div>
      )}
    </Card>
  );
}
