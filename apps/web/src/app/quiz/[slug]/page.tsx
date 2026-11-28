import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { PracticeQuizDto } from '@sysmaster/contracts';
import { ApiUnavailable } from '@/components/api-unavailable';
import { apiGet, ApiUnavailableError } from '@/lib/api';
import { QuizRunner } from './quiz-runner';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Quiz ${slug}` };
}

export default async function QuizPage({ params }: Props) {
  const { slug } = await params;
  let quiz: PracticeQuizDto | null;
  try {
    quiz = await apiGet<PracticeQuizDto>(`/quizzes/${encodeURIComponent(slug)}`);
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  if (!quiz) notFound();
  return (
    <article className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{quiz.title}</h1>
        <p className="text-sm text-muted-foreground">
          Entraînement : autant d’essais que vous voulez. Chaque réponse est expliquée après correction.
          {quiz.commandSlug && (
            <> Fiche liée : <Link href={`/commandes/${quiz.commandSlug}`} className="link">{quiz.commandSlug}</Link>.</>
          )}
        </p>
      </header>
      <QuizRunner quiz={quiz} />
    </article>
  );
}
