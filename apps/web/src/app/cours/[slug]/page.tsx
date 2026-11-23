import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { CourseDetail } from '@sysmaster/contracts';
import { ApiUnavailable } from '@/components/api-unavailable';
import { LessonStatusIcon } from '@/components/lesson-status-icon';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { apiGet, ApiUnavailableError } from '@/lib/api';
import { difficultyLabel, lessonTypeLabel } from '@/lib/labels';
import { serverAccessToken } from '@/lib/session';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await params).slug };
}

export default async function CoursePage({ params }: Props) {
  const { slug } = await params;
  const token = await serverAccessToken();
  let course: CourseDetail | null;
  try {
    course = await apiGet<CourseDetail>(`/learning/courses/${encodeURIComponent(slug)}`, token);
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  if (!course) notFound();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold">{course.title}</h1>
        <p className="mt-2 max-w-3xl text-lg text-muted-foreground">{course.summary}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge>{course.platform}</Badge>
          <Badge>{difficultyLabel[course.difficulty]}</Badge>
        </div>
        {!token && (
          <p className="mt-4 text-sm text-muted-foreground">
            Connectez-vous pour enregistrer votre progression. Chaque leçon se valide après la précédente, car elle s&apos;appuie dessus.
          </p>
        )}
      </header>

      {course.modules.map((m, mi) => (
        <section key={m.title} aria-labelledby={`module-${mi}`}>
          <h2 id={`module-${mi}`} className="text-xl font-semibold">Module {mi + 1} · {m.title}</h2>
          <Card className="mt-3 p-0">
            <ol className="divide-y">
              {m.lessons.map((l) => (
                <li key={l.slug}>
                  <Link href={`/cours/${course.slug}/${l.slug}`} className="flex items-center gap-3 p-4 hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <LessonStatusIcon status={l.status} />
                    <span className={`flex-1 ${l.status === 'locked' ? 'text-muted-foreground' : ''}`}>{l.title}</span>
                    <Badge>{lessonTypeLabel[l.type] ?? l.type}</Badge>
                    {l.estMinutes && <span className="text-xs text-muted-foreground">{l.estMinutes} min</span>}
                  </Link>
                </li>
              ))}
            </ol>
          </Card>
        </section>
      ))}
    </div>
  );
}
