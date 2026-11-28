'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useEffect, useState, useTransition } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { RISK_LEVELS, SCRIPT_LANGUAGES, type CommunityCategoryDto, type RiskLevel, type ScriptLanguage, type SimilarThreadDto, type ThreadKind } from '@sysmaster/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { publicApiBase } from '@/lib/api';
import { ApiError, apiRequest } from '@/lib/client-api';
import { riskMeta, scriptLanguageLabel, threadKindLabel } from '@/lib/labels';

const field = 'mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm';

const KINDS: ThreadKind[] = ['question', 'discussion', 'script_share', 'lab_share'];

export function NewThreadForm({ categories, initialCategory, initialKind, labs }: {
  categories: CommunityCategoryDto[];
  initialCategory?: string;
  initialKind?: ThreadKind;
  labs: { slug: string; title: string }[];
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const [categorySlug, setCategory] = useState(categories.some((c) => c.slug === initialCategory) ? initialCategory! : categories[0]?.slug ?? '');
  const [kind, setKind] = useState<ThreadKind>(initialKind ?? 'question');
  const [labSlug, setLabSlug] = useState(labs[0]?.slug ?? '');
  const [script, setScript] = useState<{ language: ScriptLanguage; code: string; explanation: string; riskLevel: RiskLevel }>({
    language: 'bash', code: '', explanation: '', riskLevel: 'low',
  });
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
          ...(kind === 'script_share' ? { script } : {}),
          ...(kind === 'lab_share' ? { labSlug } : {}),
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
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {KINDS.map((k) => (
              <label key={k} className="flex items-center gap-2"><input type="radio" checked={kind === k} onChange={() => setKind(k)} /> {threadKindLabel[k]}</label>
            ))}
          </div>
        </fieldset>
      </div>

      <label className="block text-sm font-medium">
        Titre
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} className={field}
          placeholder="Ex. : nginx refuse de démarrer après un changement de configuration" aria-invalid={!!issue('title')} />
        {issue('title') && <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{issue('title')}</span>}
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

      {kind === 'lab_share' && (
        <label className="block text-sm font-medium">
          Lab
          <select value={labSlug} onChange={(e) => setLabSlug(e.target.value)} className={field}>
            {labs.map((l) => <option key={l.slug} value={l.slug}>{l.title}</option>)}
          </select>
          <span className="mt-1 block text-xs font-normal text-muted-foreground">
            Vous ne pouvez partager que la démarche d’un lab que vous avez résolu. Elle ne sera visible que de ceux qui l’ont résolu aussi.
          </span>
          {issue('labSlug') && <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{issue('labSlug')}</span>}
        </label>
      )}

      <label className="block text-sm font-medium">
        {kind === 'script_share' ? 'Contexte' : kind === 'lab_share' ? 'Votre démarche' : 'Détails'}
        <textarea rows={10} value={bodyMd} onChange={(e) => setBody(e.target.value)} className={`${field} font-mono`} aria-invalid={!!issue('bodyMd')}
          placeholder={'Système et version, ce qui se passe, ce que vous avez déjà essayé, le message d’erreur exact (dans un bloc ```).'} />
        {issue('bodyMd') && <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{issue('bodyMd')}</span>}
      </label>

      {kind === 'script_share' && (
        <fieldset className="space-y-4 rounded-lg border p-4">
          <legend className="px-1 text-sm font-medium">Script</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Langage
              <select value={script.language} onChange={(e) => setScript({ ...script, language: e.target.value as ScriptLanguage })} className={field}>
                {SCRIPT_LANGUAGES.map((l) => <option key={l} value={l}>{scriptLanguageLabel[l]}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">
              Niveau de risque
              <select value={script.riskLevel} onChange={(e) => setScript({ ...script, riskLevel: e.target.value as RiskLevel })} className={field}>
                {RISK_LEVELS.map((r) => <option key={r} value={r}>{riskMeta[r].label}</option>)}
              </select>
            </label>
          </div>
          <label className="block text-sm font-medium">
            Code
            <textarea rows={12} value={script.code} onChange={(e) => setScript({ ...script, code: e.target.value })} spellCheck={false}
              className={`${field} font-mono`} aria-invalid={!!issue('script.code')} />
          </label>
          <label className="block text-sm font-medium">
            Explication <span className="font-normal text-muted-foreground">(obligatoire : ce qu’il fait, quand l’utiliser, ses limites)</span>
            <textarea rows={5} value={script.explanation} onChange={(e) => setScript({ ...script, explanation: e.target.value })}
              className={field} aria-invalid={!!issue('script.explanation')} />
            {issue('script.explanation') && <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{issue('script.explanation')}</span>}
          </label>
          <p className="text-xs text-muted-foreground">
            Si le code contient une commande plus risquée que le niveau choisi (suppression récursive, formatage, script téléchargé puis exécuté…),
            le niveau est relevé automatiquement. Le script est mis en avant une fois relu.
          </p>
        </fieldset>
      )}

      <label className="block text-sm font-medium">
        Étiquettes <span className="font-normal text-muted-foreground">(facultatif, séparées par des virgules, 5 au plus)</span>
        <input value={tags} onChange={(e) => setTags(e.target.value)} className={field} placeholder="nginx, systemd" />
      </label>

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <Button type="submit" disabled={pending}>Publier</Button>
    </form>
  );
}
