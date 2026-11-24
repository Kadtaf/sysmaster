import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, EyeOff, Lock, MessageSquare } from 'lucide-react';
import type { CommunityCategoryDto, ThreadListDto } from '@sysmaster/contracts';
import { ApiUnavailable } from '@/components/api-unavailable';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { apiGet, ApiUnavailableError } from '@/lib/api';
import { since } from '@/lib/labels';
import { serverAccessToken } from '@/lib/session';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Communauté' };

type Search = { category?: string; q?: string; sort?: string; tag?: string; page?: string };
const SORTS = [
  { value: 'recent', label: 'Activité récente' },
  { value: 'unanswered', label: 'Sans réponse acceptée' },
  { value: 'top', label: 'Mieux notés' },
];

function href(base: Search, change: Search) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, page: undefined, ...change })) if (v) params.set(k, v);
  const qs = params.toString();
  return qs ? `/communaute?${qs}` : '/communaute';
}

export default async function CommunityPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const token = await serverAccessToken();
  const query = new URLSearchParams();
  for (const k of ['category', 'q', 'sort', 'tag', 'page'] as const) if (sp[k]) query.set(k, sp[k]!);
  let categories: CommunityCategoryDto[] | null;
  let list: ThreadListDto | null;
  try {
    [categories, list] = await Promise.all([
      apiGet<CommunityCategoryDto[]>('/community/categories'),
      apiGet<ThreadListDto>(`/community/threads?${query}`, token),
    ]);
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  const items = list?.items ?? [];
  const pages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;
  const page = list?.page ?? 1;
  const sort = sp.sort ?? 'recent';

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Communauté</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Posez vos questions, aidez les autres, expliquez le pourquoi. Une bonne réponse dit quoi vérifier et pourquoi, pas seulement quoi taper.
          </p>
        </div>
        <Link href="/communaute/nouveau" className={buttonVariants()}>Poser une question</Link>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="Catégories" className="space-y-1 text-sm">
          <Link href={href(sp, { category: undefined })} className={cn('block rounded-md px-3 py-2 hover:bg-muted', !sp.category && 'bg-muted font-medium')}>
            Toutes les catégories
          </Link>
          {(categories ?? []).map((c) => (
            <Link
              key={c.slug}
              href={href(sp, { category: c.slug })}
              title={c.description}
              className={cn('flex justify-between rounded-md px-3 py-2 hover:bg-muted', sp.category === c.slug && 'bg-muted font-medium')}
            >
              <span>{c.name}</span>
              <span className="text-muted-foreground">{c.threadCount}</span>
            </Link>
          ))}
        </nav>

        <section className="space-y-4" aria-label="Sujets">
          <form action="/communaute" className="flex flex-wrap gap-2">
            {sp.category && <input type="hidden" name="category" value={sp.category} />}
            <input
              type="search"
              name="q"
              defaultValue={sp.q}
              placeholder="Rechercher (accents facultatifs)"
              aria-label="Rechercher dans la communauté"
              className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
            />
            <select name="sort" defaultValue={sort} aria-label="Trier" className="rounded-md border bg-background px-3 py-2 text-sm">
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <button type="submit" className={buttonVariants({ variant: 'outline' })}>Filtrer</button>
          </form>
          {sp.tag && (
            <p className="text-sm">
              Étiquette <Badge>{sp.tag}</Badge> <Link href={href(sp, { tag: undefined })} className="ml-2 underline">retirer</Link>
            </p>
          )}

          {items.length === 0 ? (
            <Card><p className="text-sm text-muted-foreground">Aucun sujet ne correspond. Lancez la discussion !</p></Card>
          ) : (
            <ul className="space-y-3">
              {items.map((t) => (
                <li key={t.id}>
                  <Card className={cn('flex gap-4', t.hidden && 'opacity-70')}>
                    <div className="w-16 shrink-0 text-center text-sm text-muted-foreground">
                      <div className="text-lg font-semibold text-foreground">{t.score}</div>vote{Math.abs(t.score) > 1 ? 's' : ''}
                      <div className={cn('mt-2 flex items-center justify-center gap-1', t.answered && 'font-medium text-emerald-700 dark:text-emerald-400')}>
                        {t.answered ? <CheckCircle2 className="size-4" aria-hidden /> : <MessageSquare className="size-4" aria-hidden />}
                        {t.postCount}
                        <span className="sr-only">{t.answered ? 'réponses, dont une acceptée' : 'réponses'}</span>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link href={`/communaute/${t.id}`} className="font-semibold hover:underline">
                        {t.isLocked && <Lock className="mr-1 inline size-4" aria-label="Verrouillé" />}
                        {t.hidden && <EyeOff className="mr-1 inline size-4" aria-label="Masqué par la modération" />}
                        {t.title}
                      </Link>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{t.excerpt}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge>{t.category.name}</Badge>
                        {t.kind === 'discussion' && <Badge>Discussion</Badge>}
                        {t.tags.map((tag) => (
                          <Link key={tag} href={href(sp, { tag })} className="rounded bg-muted px-1.5 py-0.5 hover:underline">#{tag}</Link>
                        ))}
                        <span className="ml-auto">{t.author.displayName} · niv. {t.author.level} · {since(t.lastActivityAt)}</span>
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}

          {pages > 1 && (
            <nav aria-label="Pages" className="flex items-center justify-between text-sm">
              {page > 1 ? <Link href={href(sp, { page: String(page - 1) })} className="underline">← Précédents</Link> : <span />}
              <span className="text-muted-foreground">Page {page} sur {pages}</span>
              {page < pages ? <Link href={href(sp, { page: String(page + 1) })} className="underline">Suivants →</Link> : <span />}
            </nav>
          )}
        </section>
      </div>
    </>
  );
}
