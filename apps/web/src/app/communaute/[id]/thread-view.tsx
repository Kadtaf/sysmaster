'use client';

import Link from 'next/link';
import { signIn, useSession } from 'next-auth/react';
import { useState, useTransition } from 'react';
import { ArrowBigDown, ArrowBigUp, CheckCircle2, EyeOff, Flag, Lock, Pencil } from 'lucide-react';
import type { PostDto, ThreadDto, VoteTarget } from '@sysmaster/contracts';
import { Markdown } from '@/components/markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ApiError, apiRequest } from '@/lib/client-api';
import { since, threadKindLabel } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { SharedScript } from './shared-script';

const textarea = 'mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm';
const errorText = (e: unknown) =>
  e instanceof ApiError && Array.isArray(e.body.issues) && e.body.issues.length
    ? (e.body.issues as { message: string }[]).map((i) => i.message).join(' ')
    : e instanceof Error ? e.message : 'Action impossible';

function Votes({ score, myVote, onVote, disabled, label }: { score: number; myVote: -1 | 0 | 1; onVote: (v: -1 | 0 | 1) => void; disabled: boolean; label: string }) {
  return (
    <div className="flex w-10 shrink-0 flex-col items-center text-sm" aria-label={`Votes ${label}`}>
      <button type="button" disabled={disabled} onClick={() => onVote(myVote === 1 ? 0 : 1)} aria-pressed={myVote === 1} aria-label="Utile"
        className={cn('rounded p-1 hover:bg-muted disabled:opacity-40', myVote === 1 && 'text-primary')}>
        <ArrowBigUp className="size-6" aria-hidden fill={myVote === 1 ? 'currentColor' : 'none'} />
      </button>
      <span className="font-semibold" aria-live="polite">{score}</span>
      <button type="button" disabled={disabled} onClick={() => onVote(myVote === -1 ? 0 : -1)} aria-pressed={myVote === -1} aria-label="Pas utile"
        className={cn('rounded p-1 hover:bg-muted disabled:opacity-40', myVote === -1 && 'text-red-600')}>
        <ArrowBigDown className="size-6" aria-hidden fill={myVote === -1 ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
}

function HiddenNotice({ reason }: { reason: string | null }) {
  return (
    <p className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <EyeOff className="size-4 shrink-0" aria-hidden /> Masqué par la modération{reason ? ` : ${reason}` : '.'}
    </p>
  );
}

/** Formulaire de signalement replié derrière un bouton. */
function ReportButton({ onReport }: { onReport: (reason: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [done, setDone] = useState(false);
  if (done) return <span className="text-xs text-muted-foreground">Signalement envoyé, merci.</span>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <Flag className="size-3" aria-hidden /> Signaler
      </button>
    );
  }
  return (
    <form className="flex w-full flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); await onReport(reason); setDone(true); }}>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ce qui pose problème (spam, propos blessants, commande dangereuse…)"
        aria-label="Motif du signalement" className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-xs" minLength={5} required />
      <Button size="sm" variant="outline" type="submit">Envoyer</Button>
      <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>Annuler</Button>
    </form>
  );
}

export function ThreadView({ initial }: { initial: ThreadDto }) {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [t, setT] = useState(initial);
  const [reply, setReply] = useState('');
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError(errorText(e));
      }
    });

  const vote = (type: VoteTarget, id: string, value: -1 | 0 | 1) =>
    run(async () => {
      if (!session) return void signIn('keycloak');
      const r = await apiRequest<{ score: number; myVote: -1 | 0 | 1 }>('PUT', `/community/${type === 'thread' ? 'threads' : 'posts'}/${id}/vote`, token, { value });
      setT((cur) => type === 'thread'
        ? { ...cur, score: r.score, myVote: r.myVote }
        : { ...cur, posts: cur.posts.map((p) => (p.id === id ? { ...p, score: r.score, myVote: r.myVote } : p)) });
    });

  const report = (targetType: VoteTarget, targetId: string) => async (reason: string) => {
    await apiRequest('POST', '/community/reports', token, { targetType, targetId, reason });
  };

  const accept = (postId: string | null) => run(async () => setT(await apiRequest<ThreadDto>('PUT', `/community/threads/${t.id}/accepted`, token, { postId })));
  const review = (reviewed: boolean) => run(async () => setT(await apiRequest<ThreadDto>('PUT', `/community/threads/${t.id}/script-review`, token, { reviewed })));
  const lock = () => run(async () => {
    const r = await apiRequest<{ locked: boolean }>('PUT', `/community/threads/${t.id}/lock`, token, { locked: !t.isLocked });
    setT((cur) => ({ ...cur, isLocked: r.locked, replyBlocker: r.locked ? 'Ce sujet est verrouillé : il n’accepte plus de réponses.' : null }));
  });
  const send = () => run(async () => {
    setT(await apiRequest<ThreadDto>('POST', `/community/threads/${t.id}/posts`, token, { bodyMd: reply }));
    setReply('');
  });
  const saveEdit = () => run(async () => {
    if (!editing) return;
    setT(await apiRequest<ThreadDto>('PUT', `/community/posts/${editing.id}`, token, { bodyMd: editing.body }));
    setEditing(null);
  });

  const canVoteOn = (mine: boolean, hidden: boolean) => !mine && !hidden && !pending;

  const postCard = (p: PostDto) => (
    <li key={p.id}>
      <Card className={cn('flex gap-3', p.accepted && 'border-emerald-600 dark:border-emerald-500')}>
        <Votes score={p.score} myVote={p.myVote} disabled={!canVoteOn(p.mine, !!p.hidden)} onVote={(v) => vote('post', p.id, v)} label="de la réponse" />
        <div className="min-w-0 flex-1 space-y-3">
          {p.accepted && (
            <p className="flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-4" aria-hidden /> Réponse acceptée par l’auteur de la question
            </p>
          )}
          {p.hidden && <HiddenNotice reason={p.hidden.reason} />}
          {editing?.id === p.id ? (
            <div className="space-y-2">
              <textarea rows={8} value={editing.body} onChange={(e) => setEditing({ id: p.id, body: e.target.value })} className={textarea} aria-label="Modifier la réponse" />
              <div className="flex gap-2">
                <Button size="sm" onClick={saveEdit} disabled={pending}>Enregistrer</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Annuler</Button>
              </div>
            </div>
          ) : (
            p.bodyMd && <Markdown ugc>{p.bodyMd}</Markdown>
          )}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>{p.author.displayName} · niv. {p.author.level} · {since(p.createdAt)}{p.editedAt && ' · modifiée'}</span>
            {p.mine && !p.hidden && editing?.id !== p.id && (
              <button type="button" onClick={() => setEditing({ id: p.id, body: p.bodyMd })} className="inline-flex items-center gap-1 hover:text-foreground">
                <Pencil className="size-3" aria-hidden /> Modifier
              </button>
            )}
            {t.can.accept && !p.hidden && (
              <button type="button" disabled={pending} onClick={() => accept(p.accepted ? null : p.id)} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                {p.accepted ? 'Retirer l’acceptation' : 'Accepter cette réponse'}
              </button>
            )}
            {session && !p.mine && !p.hidden && <ReportButton onReport={report('post', p.id)} />}
          </div>
        </div>
      </Card>
    </li>
  );

  return (
    <article className="space-y-6">
      <Card className="flex gap-3">
        <Votes score={t.score} myVote={t.myVote} disabled={!canVoteOn(t.mine, !!t.hidden)} onVote={(v) => vote('thread', t.id, v)} label="du sujet" />
        <div className="min-w-0 flex-1 space-y-3">
          <h1 className="text-2xl font-bold">
            {t.isLocked && <Lock className="mr-2 inline size-5" aria-label="Verrouillé" />}
            {t.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge>{threadKindLabel[t.kind]}</Badge>
            {t.lab && <Link href={`/labs/${t.lab.slug}`} className="rounded bg-muted px-1.5 py-0.5 hover:underline">Lab : {t.lab.title}</Link>}
            {t.answered && <Badge className="bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100">Résolue</Badge>}
            {t.tags.map((tag) => <Link key={tag} href={`/communaute?tag=${encodeURIComponent(tag)}`} className="rounded bg-muted px-1.5 py-0.5 hover:underline">#{tag}</Link>)}
            <span>{t.author.displayName} · niv. {t.author.level} · {since(t.createdAt)}</span>
          </div>
          {t.hidden && <HiddenNotice reason={t.hidden.reason} />}
          {t.spoilerLocked ? (
            <p className="rounded-md border border-dashed p-4 text-sm">
              Cette démarche dévoile la solution du lab <Link href={`/labs/${t.lab?.slug}`} className="font-medium underline">{t.lab?.title}</Link>.
              Elle s’affiche, avec les réponses, une fois que vous l’avez résolu vous-même : c’est en cherchant qu’on apprend.
            </p>
          ) : (
            <Markdown ugc>{t.bodyMd}</Markdown>
          )}
          {t.scriptDetail && <SharedScript script={t.scriptDetail} canReview={t.can.reviewScript} onReview={review} pending={pending} />}
          <div className="flex flex-wrap gap-3">
            {session && !t.mine && !t.hidden && <ReportButton onReport={report('thread', t.id)} />}
            {t.can.moderate && (
              <button type="button" onClick={lock} disabled={pending} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <Lock className="size-3" aria-hidden /> {t.isLocked ? 'Rouvrir le sujet' : 'Verrouiller le sujet'}
              </button>
            )}
          </div>
        </div>
      </Card>

      <section aria-label="Réponses" className="space-y-3">
        <h2 className="text-lg font-semibold">{t.postCount} réponse{t.postCount > 1 ? 's' : ''}{t.spoilerLocked && t.postCount > 0 && ' (visibles une fois le lab résolu)'}</h2>
        {t.can.accept && !t.answered && t.posts.length > 0 && (
          <p className="text-sm text-muted-foreground">Une réponse vous a débloqué ? Acceptez-la : elle remonte en tête et son auteur gagne de l’XP d’entraide.</p>
        )}
        <ul className="space-y-3">{t.posts.map(postCard)}</ul>
      </section>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <section aria-label="Répondre">
        {!session ? (
          <Card>
            <p className="text-sm">
              <button type="button" onClick={() => signIn('keycloak')} className="font-medium underline">Connectez-vous</button> pour répondre.
            </p>
          </Card>
        ) : t.can.reply ? (
          <Card className="space-y-3">
            <label className="block text-sm font-medium">
              Votre réponse
              <textarea rows={7} value={reply} onChange={(e) => setReply(e.target.value)} className={textarea}
                placeholder={'Expliquez quoi vérifier et pourquoi. Les blocs de code (```) sont les bienvenus.'} />
            </label>
            <p className="text-xs text-muted-foreground">Une commande risquée mérite un avertissement : dites ce qu’elle fait avant de la proposer.</p>
            <Button onClick={send} disabled={pending || reply.trim().length < 20}>Publier la réponse</Button>
          </Card>
        ) : (
          t.replyBlocker && <p className="text-sm text-muted-foreground">{t.replyBlocker}</p>
        )}
      </section>
    </article>
  );
}
