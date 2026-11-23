'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import type { CauseContent, CommandContent, ContentIssue, CourseContent, PathContent, RevisionDto } from '@sysmaster/contracts';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { ApiError, apiRequest } from '@/lib/client-api';
import { contentKindMeta, revisionActionLabel, revisionStatusMeta } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { CauseForm, SimulationPanel } from './cause-form';
import { CommandForm } from './command-form';
import { CourseForm } from './course-form';
import { inputClass, type FormProps } from './form-kit';
import { PathForm } from './path-form';

export function RevisionEditor({ initial }: { initial: RevisionDto }) {
  const { data: session } = useSession();
  const [rev, setRev] = useState(initial);
  const [c, setC] = useState<Record<string, unknown>>(initial.content as unknown as Record<string, unknown>);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string; issues?: ContentIssue[] } | null>(null);
  const [comment, setComment] = useState('');
  const [pending, startTransition] = useTransition();
  const ro = !rev.can.edit;
  // Un champ est signalé si une règle le vise, lui ou l'un de ses sous-éléments (« modules » couvre « modules.0.lessons »).
  const flagged = (field: string) => rev.issues.some((i) => i.field === field || i.field.startsWith(`${field}.`));
  const formProps = <C,>(): FormProps<C> => ({
    c: c as C,
    set: (key, value) => {
      setC((prev) => ({ ...prev, [key as string]: value }));
      setDirty(true);
    },
    ro,
    flagged,
    isNew: rev.isNew,
  });

  const run = (fn: () => Promise<RevisionDto>, ok: string) =>
    startTransition(async () => {
      setMessage(null);
      try {
        const next = await fn();
        setRev(next);
        setC(next.content as unknown as Record<string, unknown>);
        setDirty(false);
        setMessage({ kind: 'ok', text: ok });
      } catch (e) {
        const body = e instanceof ApiError ? e.body : {};
        setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Échec', issues: body.issues as ContentIssue[] | undefined });
      }
    });

  const token = session?.accessToken;
  const save = () => apiRequest<RevisionDto>('PUT', `/editorial/revisions/${rev.id}`, token, c);
  const status = revisionStatusMeta[rev.status];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">{rev.title || `${contentKindMeta[rev.kind].newLabel}`}</h1>
        <span className={cn('rounded px-2 py-0.5 text-xs font-medium', status?.className)}>{status?.label ?? rev.status}</span>
        <span className="text-sm text-muted-foreground">
          {contentKindMeta[rev.kind].label} · {rev.isNew ? 'création' : <>modification de <Link className="text-primary hover:underline" href={contentKindMeta[rev.kind].href(rev.key)}>{contentKindMeta[rev.kind].href(rev.key)}</Link></>} · par {rev.author}
        </span>
      </div>

      {rev.reviewComment && rev.status === 'changes_requested' && (
        <Card className="border-orange-300 dark:border-orange-800">
          <CardTitle>Retour du relecteur{rev.reviewer ? ` (${rev.reviewer})` : ''}</CardTitle>
          <p className="mt-2 whitespace-pre-wrap text-sm">{rev.reviewComment}</p>
        </Card>
      )}

      <Card className={cn(rev.issues.length ? 'border-orange-300 dark:border-orange-800' : 'border-emerald-300 dark:border-emerald-800')}>
        {rev.issues.length ? (
          <>
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="size-5 text-orange-600" aria-hidden /> Avant de soumettre ({rev.issues.length})</CardTitle>
            <CardDescription>{contentKindMeta[rev.kind].rule} (calculé au dernier enregistrement).</CardDescription>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{rev.issues.map((i, k) => <li key={k}>{i.message}</li>)}</ul>
          </>
        ) : (
          <CardTitle className="flex items-center gap-2"><CheckCircle2 className="size-5 text-emerald-600" aria-hidden /> Contenu complet : il peut être soumis à la relecture.</CardTitle>
        )}
      </Card>

      {rev.kind === 'command' && <CommandForm {...formProps<CommandContent>()} />}
      {rev.kind === 'course' && <CourseForm {...formProps<CourseContent>()} />}
      {rev.kind === 'path' && <PathForm {...formProps<PathContent>()} />}
      {rev.kind === 'diagnostic_cause' && (
        <>
          <CauseForm {...formProps<CauseContent>()} />
          <SimulationPanel revisionId={rev.id} savedAt={rev.updatedAt} />
        </>
      )}

      {message && (
        <div role={message.kind === 'error' ? 'alert' : 'status'} className={cn('rounded-md border p-3 text-sm', message.kind === 'error' ? 'border-red-300 text-red-700 dark:text-red-300' : 'border-emerald-300 text-emerald-700 dark:text-emerald-300')}>
          {message.text}
          {message.issues && (
            <ul className="mt-2 list-disc pl-5">{message.issues.map((i, k) => (
                // Le champ technique n'est utile que pour une donnée mal formée (400) ; sinon le message suffit.
                <li key={k}>{message.text === 'Données invalides' && i.field ? `${i.field} : ` : ''}{i.message}</li>
              ))}</ul>
          )}
        </div>
      )}

      {(rev.can.edit || rev.can.submit || rev.can.withdraw) && (
        <div className="sticky bottom-0 flex flex-wrap gap-2 border-t bg-background/90 py-3 backdrop-blur">
          {rev.can.edit && (
            <Button disabled={pending || !dirty} onClick={() => run(save, 'Brouillon enregistré.')}>Enregistrer</Button>
          )}
          {rev.can.submit && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  if (dirty) await save();
                  return apiRequest<RevisionDto>('POST', `/editorial/revisions/${rev.id}/submit`, token);
                }, 'Soumise à la relecture.')
              }
            >
              Soumettre à la relecture
            </Button>
          )}
          {rev.can.withdraw && (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (window.confirm('Retirer cette révision ? Elle ne pourra plus être modifiée ni publiée.')) {
                  run(() => apiRequest<RevisionDto>('POST', `/editorial/revisions/${rev.id}/withdraw`, token), 'Révision retirée.');
                }
              }}
            >
              Retirer
            </Button>
          )}
        </div>
      )}

      {rev.can.review && (
        <Card className="space-y-3">
          <CardTitle>Relecture</CardTitle>
          <CardDescription>
            Approuver publie immédiatement le contenu{rev.isNew ? '' : ' et remplace la version en ligne'}. Pour demander des changements, expliquez quoi et pourquoi.
          </CardDescription>
          <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} className={inputClass} aria-label="Commentaire de relecture" placeholder="Commentaire (obligatoire pour demander des changements)" />
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending}
              onClick={() => run(() => apiRequest<RevisionDto>('POST', `/editorial/revisions/${rev.id}/review`, token, { decision: 'approve', comment }), 'Fiche publiée.')}
            >
              Approuver et publier
            </Button>
            <Button
              variant="outline"
              disabled={pending || !comment.trim()}
              onClick={() => run(() => apiRequest<RevisionDto>('POST', `/editorial/revisions/${rev.id}/review`, token, { decision: 'request_changes', comment }), 'Changements demandés à l’auteur.')}
            >
              Demander des changements
            </Button>
          </div>
        </Card>
      )}

      {rev.status === 'published' && (
        <p className="text-sm">
          <Link href={contentKindMeta[rev.kind].href(rev.key)} className="text-primary hover:underline">Voir en ligne</Link>
        </p>
      )}

      <Card>
        <CardTitle>Historique</CardTitle>
        <ol className="mt-3 space-y-2 text-sm">
          {rev.history.map((h, k) => (
            <li key={k}>
              <span className="text-muted-foreground">{new Date(h.at).toLocaleString('fr-FR')}</span> · {h.actor} {revisionActionLabel[h.action] ?? h.action}
              {h.comment && <p className="mt-1 whitespace-pre-wrap border-l-2 pl-3 text-muted-foreground">{h.comment}</p>}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
