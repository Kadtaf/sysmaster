'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { useState, useTransition } from 'react';
import { CheckCircle2, Lock } from 'lucide-react';
import type { CompleteLessonResult, LessonStatus } from '@sysmaster/contracts';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ApiError, apiPost } from '@/lib/client-api';

type Ref = { slug: string; title: string } | null;

export function CompleteLesson(props: {
  lessonId: string;
  courseSlug: string;
  status: LessonStatus | null;
  blockedBy: Ref;
  next: Ref;
  signedIn: boolean;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ message: string; blockedBy?: Ref } | null>(null);
  const nextLink = (ref: Ref) =>
    ref && (
      <Link href={`/cours/${props.courseSlug}/${ref.slug}`} className={buttonVariants({ variant: 'outline' })}>
        Leçon suivante : {ref.title}
      </Link>
    );

  if (!props.signedIn) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">Connectez-vous pour valider cette leçon et suivre votre progression.</p>
        <Button variant="outline" onClick={() => signIn('keycloak')}>Se connecter</Button>
      </Card>
    );
  }

  if (props.status === 'completed') {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-4 border-emerald-300 dark:border-emerald-800">
        <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="size-5" aria-hidden /> Leçon validée
        </p>
        {nextLink(props.next)}
      </Card>
    );
  }

  const blockedBy = error?.blockedBy ?? (props.status === 'locked' ? props.blockedBy : null);
  if (blockedBy) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <p className="flex items-center gap-2 text-sm">
          <Lock className="size-4" aria-hidden />
          Pour valider cette leçon, validez d&apos;abord « {blockedBy.title} » : celle-ci s&apos;appuie dessus.
        </p>
        <Link href={`/cours/${props.courseSlug}/${blockedBy.slug}`} className={buttonVariants({ variant: 'outline' })}>
          Aller à « {blockedBy.title} »
        </Link>
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Avant de valider : pourriez-vous expliquer à quelqu&apos;un <strong>pourquoi</strong> on procède ainsi, et quel est le principal risque ?
      </p>
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              await apiPost<CompleteLessonResult>(`/learning/lessons/${props.lessonId}/complete`, session?.accessToken);
              router.refresh();
            } catch (e) {
              if (e instanceof ApiError && e.status === 409) {
                setError({ message: e.message, blockedBy: e.body.blockedBy as Ref });
              } else {
                setError({ message: e instanceof Error ? e.message : 'Validation impossible' });
              }
            }
          })
        }
      >
        <CheckCircle2 className="size-4" aria-hidden /> J&apos;ai compris, valider la leçon
      </Button>
      {error && !error.blockedBy && <p role="alert" className="text-sm text-red-600">{error.message}</p>}
    </Card>
  );
}
