import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Target } from 'lucide-react';
import type { LessonDetail } from '@sysmaster/contracts';
import { ApiUnavailable } from '@/components/api-unavailable';
import { Markdown } from '@/components/markdown';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { apiGet, ApiUnavailableError } from '@/lib/api';
import { lessonTypeLabel } from '@/lib/labels';
import { serverAccessToken } from '@/lib/session';
import { CompleteLesson } from './complete-lesson';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ slug: string; lecon: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await params).lecon };
}

export default async function LessonPage({ params }: Props) {
  const { slug, lecon } = await params;
  const token = await serverAccessToken();
  let lesson: LessonDetail | null;
  try {
    lesson = await apiGet<LessonDetail>(`/learning/courses/${encodeURIComponent(slug)}/lessons/${encodeURIComponent(lecon)}`, token);
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  if (!lesson) notFound();

  return (
    <article className="mx-auto max-w-3xl space-y-8">
      <header>
        <Link href={`/cours/${lesson.courseSlug}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← {lesson.courseTitle} · {lesson.moduleTitle}
        </Link>
        <h1 className="mt-2 text-3xl font-bold">{lesson.title}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge>{lessonTypeLabel[lesson.type] ?? lesson.type}</Badge>
          {lesson.estMinutes && <Badge>{lesson.estMinutes} min</Badge>}
        </div>
      </header>

      {lesson.objectives.length > 0 && (
        <Card className="bg-muted/40">
          <p className="flex items-center gap-2 font-medium"><Target className="size-4 text-primary" aria-hidden /> À la fin de cette leçon, vous saurez :</p>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-sm">
            {lesson.objectives.map((o) => <li key={o}>{o}</li>)}
          </ul>
        </Card>
      )}

      <Markdown>{lesson.contentMd}</Markdown>

      <CompleteLesson
        lessonId={lesson.id}
        courseSlug={lesson.courseSlug}
        status={lesson.status}
        blockedBy={lesson.blockedBy}
        next={lesson.next}
        signedIn={Boolean(token)}
      />

      <nav className="flex justify-between gap-4 border-t pt-6 text-sm" aria-label="Leçons voisines">
        {lesson.previous ? (
          <Link href={`/cours/${lesson.courseSlug}/${lesson.previous.slug}`} className="hover:underline">← {lesson.previous.title}</Link>
        ) : <span />}
        {lesson.next && (
          <Link href={`/cours/${lesson.courseSlug}/${lesson.next.slug}`} className="text-right hover:underline">{lesson.next.title} →</Link>
        )}
      </nav>
    </article>
  );
}
