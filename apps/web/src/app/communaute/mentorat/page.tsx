import type { Metadata } from 'next';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import type { MentorDto, MentorshipDto } from '@sysmaster/contracts';
import { ApiUnavailable } from '@/components/api-unavailable';
import { Card, CardDescription } from '@/components/ui/card';
import { apiGet, ApiUnavailableError } from '@/lib/api';
import { authOptions } from '@/lib/auth';
import { MentorCard, MentorProfileForm, MyMentorships } from './mentoring';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Mentorat' };

export default async function MentoringPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { topic } = await searchParams;
  const session = await getServerSession(authOptions);
  const token = session?.error ? undefined : session?.accessToken;
  const canMentor = (session?.user?.roles ?? []).some((r) => ['mentor', 'admin', 'super_admin'].includes(r));
  let mentors: MentorDto[] | null;
  let mine: { mentor: MentorDto | null; items: MentorshipDto[] } | null = null;
  try {
    [mentors, mine] = await Promise.all([
      apiGet<MentorDto[]>(`/community/mentors${topic ? `?topic=${encodeURIComponent(topic)}` : ''}`),
      token ? apiGet<{ mentor: MentorDto | null; items: MentorshipDto[] }>('/community/mentorships', token) : Promise.resolve(null),
    ]);
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  const busyWith = new Set((mine?.items ?? []).filter((m) => m.role === 'mentee' && ['requested', 'active'].includes(m.status)).map((m) => m.other.userId));

  return (
    <div className="space-y-8">
      <div>
        <Link href="/communaute" className="text-sm text-muted-foreground hover:text-foreground">← Communauté</Link>
        <h1 className="mt-2 text-3xl font-bold">Mentorat</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Un mentor vous aide à trouver votre méthode, pas à copier ses réponses. Expliquez où vous en êtes : il accepte s’il a le temps de bien
          vous suivre. Vos échanges ne sont lus que par vous deux.
        </p>
      </div>

      {mine && <MyMentorships items={mine.items} />}
      {canMentor && <MentorProfileForm current={mine?.mentor ?? null} />}

      <section className="space-y-4" aria-label="Mentors">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-xl font-semibold">Mentors</h2>
          <form action="/communaute/mentorat" className="flex gap-2">
            <input name="topic" defaultValue={topic} placeholder="Sujet (linux, réseau…)" aria-label="Filtrer par sujet" className="rounded-md border bg-background px-3 py-2 text-sm" />
            <button type="submit" className="rounded-md border px-3 py-2 text-sm hover:bg-muted">Filtrer</button>
          </form>
        </div>
        {(mentors ?? []).length === 0 ? (
          <Card><CardDescription>Aucun mentor {topic ? 'sur ce sujet ' : ''}pour le moment.</CardDescription></Card>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {(mentors ?? []).map((m) => (
              <li key={m.userId}>
                <MentorCard mentor={m} signedIn={!!token} self={mine?.mentor?.userId === m.userId} busy={busyWith.has(m.userId)} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
