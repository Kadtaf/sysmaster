'use client';

import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useState, useTransition } from 'react';
import { CONTENT_KINDS, type ContentKind, type QuizDraftDto, type RevisionDto } from '@sysmaster/contracts';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { apiRequest } from '@/lib/client-api';
import { contentKindMeta } from '@/lib/labels';

export function NewRevision() {
  const { data: session } = useSession();
  const router = useRouter();
  const [slug, setSlug] = useState('');
  const [kind, setKind] = useState<ContentKind>('command');
  const meta = contentKindMeta[kind];
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const draftQuiz = () =>
    startTransition(async () => {
      setError(null);
      try {
        const r = await apiRequest<QuizDraftDto>('POST', '/editorial/quiz-drafts', session?.accessToken, { commandSlug: slug.trim(), count: 5 });
        router.push(`/editorial/${r.revisionId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Brouillon impossible');
      }
    });

  const create = (fromSlug?: string) =>
    startTransition(async () => {
      setError(null);
      try {
        const r = await apiRequest<RevisionDto>('POST', '/editorial/revisions', session?.accessToken, { kind, ...(fromSlug ? { from: fromSlug } : {}) });
        router.push(`/editorial/${r.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Création impossible');
      }
    });

  return (
    <Card className="space-y-4">
      <CardTitle>Contribuer</CardTitle>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-muted-foreground">Type de contenu</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as ContentKind)} className="mt-1 rounded-md border bg-background px-3 py-2 text-sm">
            {CONTENT_KINDS.map((k) => <option key={k} value={k}>{contentKindMeta[k].label}</option>)}
          </select>
        </label>
        <Button disabled={pending} onClick={() => create()}>{meta.newLabel}</Button>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (slug.trim()) create(slug.trim());
          }}
        >
          <label className="text-sm">
            <span className="block text-muted-foreground">ou modifier l’existant</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder={meta.placeholder}
              className="mt-1 w-56 rounded-md border bg-background px-3 py-2 font-mono text-sm"
            />
          </label>
          <Button type="submit" variant="outline" disabled={pending || !slug.trim()}>Proposer une modification</Button>
        </form>
        {kind === 'quiz' && (
          <Button variant="outline" disabled={pending || !slug.trim()} onClick={draftQuiz} title="Identifiant d’une fiche publiée, ex. linux-df">
            <Sparkles className="size-4" aria-hidden /> Brouillon par l’IA depuis la fiche
          </Button>
        )}
      </div>
      <CardDescription>
        L&apos;identifiant est la fin de l&apos;adresse (par exemple {meta.href(meta.placeholder)}) ; pour une cause de diagnostic, c&apos;est son code.
      </CardDescription>
      {kind === 'quiz' && (
        <CardDescription>
          Brouillon par l’IA : saisissez l’identifiant d’une fiche publiée (ex. linux-df). L’IA propose cinq questions, que vous corrigez puis
          soumettez à la relecture ; rien n’est publié sans un second regard. Compte dans votre quota IA quotidien.
        </CardDescription>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </Card>
  );
}
