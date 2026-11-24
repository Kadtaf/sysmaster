'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useEffect, useState, useTransition } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { CommunityCategoryDto, SimilarThreadDto, ThreadKind } from '@sysmaster/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { publicApiBase } from '@/lib/api';
import { ApiError, apiRequest } from '@/lib/client-api';

const field = 'mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm';

export function NewThreadForm({ categories, initialCategory }: { categories: CommunityCategoryDto[]; initialCategory?: string }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [categorySlug, setCategory] = useState(categories.some((c) => c.slug === initialCategory) ? initialCategory! : categories[0]?.slug ?? '');
  const [kind, setKind] = useState<ThreadKind>('question');
  const [title, setTitle] = useState('');
  const [bodyMd, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [similar, setSimilar] = useState<SimilarThreadDto[]>([]);
  const [issues, setIssues] = useState<{ field: string; message: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Questions proches du titre : souvent, la réponse existe déjà.
  useEffect(() => {
    if (title.trim().length < 8) return setSimilar([]);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`${publicApiBase}/community/similar?q=${encodeURIComponent(title)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then(setSimilar)
        .catch(() => undefined);
    }, 400);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [title]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(null);
      setIssues([]);
      try {
        const { id } = await apiRequest<{ id: string }>('POST', '/community/threads', session?.accessToken, {
          categorySlug, kind, title, bodyMd, tags: tags.split(',').map((s) => s.trim()).filter(Boolean),
        });
        router.push(`/communaute/${id}`);
      } catch (err) {
        if (err instanceof ApiError && Array.isArray(err.body.issues)) setIssues(err.body.issues as { field: string; message: string }[]);
        else setError(err instanceof Error ? err.message : 'Publication impossible');
      }
    });
  };
  const issue = (f: string) => issues.find((i) => i.field === f)?.message;

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Catégorie
          <select value={categorySlug} onChange={(e) => setCategory(e.target.value)} className={field}>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </label>
        <fieldset className="text-sm">
          <legend className="font-medium">Type</legend>
          <div className="mt-2 flex gap-4">
            <label className="flex items-center gap-2"><input type="radio" checked={kind === 'question'} onChange={() => setKind('question')} /> Question</label>
            <label className="flex items-center gap-2"><input type="radio" checked={kind === 'discussion'} onChange={() => setKind('discussion')} /> Discussion</label>
          </div>
        </fieldset>
      </div>

      <label className="block text-sm font-medium">
        Titre
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} className={field}
          placeholder="Ex. : nginx refuse de démarrer après un changement de configuration" aria-invalid={!!issue('title')} />
        {issue('title') && <span className="mt-1 block text-xs text-red-600">{issue('title')}</span>}
      </label>

      {similar.length > 0 && (
        <Card className="space-y-2" aria-live="polite">
          <CardTitle className="text-base">Ces sujets répondent peut-être déjà à votre question</CardTitle>
          <ul className="space-y-1 text-sm">
            {similar.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                {s.answered && <CheckCircle2 className="size-4 text-emerald-600" aria-label="Résolu" />}
                <Link href={`/communaute/${s.id}`} target="_blank" className="underline">{s.title}</Link>
                <span className="text-muted-foreground">({s.postCount} réponse{s.postCount > 1 ? 's' : ''})</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <label className="block text-sm font-medium">
        Détails
        <textarea rows={10} value={bodyMd} onChange={(e) => setBody(e.target.value)} className={`${field} font-mono`} aria-invalid={!!issue('bodyMd')}
          placeholder={'Système et version, ce qui se passe, ce que vous avez déjà essayé, le message d’erreur exact (dans un bloc ```).'} />
        {issue('bodyMd') && <span className="mt-1 block text-xs text-red-600">{issue('bodyMd')}</span>}
      </label>

      <label className="block text-sm font-medium">
        Étiquettes <span className="font-normal text-muted-foreground">(facultatif, séparées par des virgules, 5 au plus)</span>
        <input value={tags} onChange={(e) => setTags(e.target.value)} className={field} placeholder="nginx, systemd" />
      </label>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={pending}>Publier</Button>
    </form>
  );
}
