'use client';

import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useState, useTransition } from 'react';
import { CONTENT_KINDS, DIFFICULTIES, LAB_CATEGORIES, type ContentKind, type LabCategory, type LabDraftDto, type QuizDraftDto, type RevisionDto } from '@sysmaster/contracts';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { ApiError, apiRequest } from '@/lib/client-api';
import { contentKindMeta, difficultyLabel, labCategoryLabel } from '@/lib/labels';

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
      {kind === 'lab' && <LabDraftForm />}
    </Card>
  );
}

/**
 * Brouillon de lab par l'IA : l'auteur décrit l'incident, l'IA propose le lab complet. L'API rejoue
 * la démarche proposée sur le simulateur (une passe de correction au plus) avant d'ouvrir la révision.
 */
function LabDraftForm() {
  const { data: session } = useSession();
  const router = useRouter();
  const [topic, setTopic] = useState('');
  const [category, setCategory] = useState<LabCategory>('linux');
  const [difficulty, setDifficulty] = useState<(typeof DIFFICULTIES)[number]>('beginner');
  const [error, setError] = useState<{ message: string; issues: string[] } | null>(null);
  const [pending, startTransition] = useTransition();
  const field = 'mt-1 rounded-md border bg-background px-3 py-2 text-sm';

  const submit = () =>
    startTransition(async () => {
      setError(null);
      try {
        const r = await apiRequest<LabDraftDto>('POST', '/editorial/lab-drafts', session?.accessToken, { topic: topic.trim(), category, difficulty });
        router.push(`/editorial/${r.revisionId}`);
      } catch (e) {
        const issues = e instanceof ApiError && Array.isArray(e.body.issues) ? (e.body.issues as string[]) : [];
        setError({ message: e instanceof Error ? e.message : 'Brouillon impossible', issues });
      }
    });

  return (
    <form
      className="space-y-3 border-t pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (topic.trim().length >= 10) submit();
      }}
    >
      <label className="block text-sm">
        <span className="block text-muted-foreground">Ou faites rédiger un brouillon par l’IA : décrivez l’incident à mettre en scène</span>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Ex. : après une mise à jour, PostgreSQL refuse les connexions car pg_hba.conf a été remplacé ; l’apprenant doit retrouver la ligne manquante sans tout ouvrir."
          className={`${field} w-full`}
        />
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-muted-foreground">Catégorie</span>
          <select value={category} onChange={(e) => setCategory(e.target.value as LabCategory)} className={field}>
            {LAB_CATEGORIES.map((c) => <option key={c} value={c}>{labCategoryLabel[c]}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-muted-foreground">Difficulté</span>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as (typeof DIFFICULTIES)[number])} className={field}>
            {DIFFICULTIES.map((d) => <option key={d} value={d}>{difficultyLabel[d]}</option>)}
          </select>
        </label>
        <Button type="submit" variant="outline" disabled={pending || topic.trim().length < 10}>
          <Sparkles className="size-4" aria-hidden /> {pending ? 'Rédaction et vérification en cours…' : 'Brouillon de lab par l’IA'}
        </Button>
      </div>
      <CardDescription>
        L’IA propose l’énoncé, la machine en panne, les vérifications, la démarche, les indices et la solution. La démarche est rejouée sur le
        simulateur ; s’il reste un problème, il lui est renvoyé une fois pour correction. Vous relisez et complétez ensuite le brouillon, puis une autre
        personne le relit : rien n’est publié sans un second regard. Compte dans votre quota IA quotidien et peut prendre une à deux minutes.
      </CardDescription>
      {error && (
        <div role="alert" className="text-sm text-red-600">
          <p>{error.message}</p>
          {error.issues.length > 0 && <ul className="mt-1 list-disc pl-5">{error.issues.slice(0, 8).map((i) => <li key={i}>{i}</li>)}</ul>}
        </div>
      )}
    </form>
  );
}
