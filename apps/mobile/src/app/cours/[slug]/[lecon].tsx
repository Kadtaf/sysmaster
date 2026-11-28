import type { CompleteLessonResult, LessonDetail } from '@sysmaster/contracts';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Markdown } from '../../../components/markdown';
import { Badge, Body, Button, Card, ErrorView, Loading, OfflineBanner, Row, Screen, Title } from '../../../components/ui';
import { ApiError, OfflineError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth/auth-context';
import { lessonTypeLabel } from '../../../lib/labels';
import { useApi } from '../../../lib/use-api';

export default function LessonScreen() {
  const { slug, lecon } = useLocalSearchParams<{ slug: string; lecon: string }>();
  const router = useRouter();
  const { api, status } = useAuth();
  const q = useApi<LessonDetail>(`/learning/courses/${encodeURIComponent(slug)}/lessons/${encodeURIComponent(lecon)}`);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<CompleteLessonResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (q.loading && !q.data) return <Screen><Loading /></Screen>;
  if (q.error || !q.data) return <Screen><ErrorView error={q.error ?? new Error()} onRetry={q.reload} /></Screen>;
  const lesson = q.data;
  const completed = Boolean(done) || lesson.status === 'completed';
  const next = done?.next ?? lesson.next;

  const complete = async () => {
    setBusy(true);
    setMessage(null);
    try {
      setDone(await api.post<CompleteLessonResult>(`/learning/lessons/${lesson.id}/complete`));
    } catch (e) {
      setMessage(
        e instanceof OfflineError ? 'Pas de connexion : la leçon sera à valider une fois en ligne.'
          : e instanceof ApiError && e.status === 409 ? 'Validez d’abord la leçon précédente.'
            : 'La validation n’a pas abouti. Réessayez.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: lesson.title }} />
      <OfflineBanner since={q.offlineSince} />
      <Body muted>{lesson.courseTitle} · {lesson.moduleTitle}</Body>
      <Title>{lesson.title}</Title>
      <Row>
        <Badge>{lessonTypeLabel[lesson.type] ?? lesson.type}</Badge>
        {lesson.estMinutes ? <Badge>{lesson.estMinutes} min</Badge> : null}
      </Row>
      {lesson.objectives.length > 0 && (
        <Card>
          <Body style={{ fontWeight: '700' }}>À la fin de cette leçon, vous saurez :</Body>
          {lesson.objectives.map((o) => <Body key={o}>• {o}</Body>)}
        </Card>
      )}
      <Markdown source={lesson.contentMd} />

      <Card>
        {completed ? (
          <Body accessibilityLiveRegion="polite">Leçon validée.</Body>
        ) : status !== 'signedIn' ? (
          <Body muted>Connectez-vous pour enregistrer votre progression.</Body>
        ) : lesson.blockedBy ? (
          <Body>Validez d’abord « {lesson.blockedBy.title} » : cette leçon s’appuie dessus.</Body>
        ) : (
          <Button title="J’ai compris, valider la leçon" onPress={() => void complete()} busy={busy} />
        )}
        {message && <Body accessibilityRole="alert">{message}</Body>}
      </Card>
      {next && (
        <Button title={`Leçon suivante : ${next.title}`} variant={completed ? 'primary' : 'secondary'} onPress={() => router.replace(`/cours/${lesson.courseSlug}/${next.slug}`)} />
      )}
      {lesson.previous && (
        <Button title={`Leçon précédente : ${lesson.previous.title}`} variant="secondary" onPress={() => router.replace(`/cours/${lesson.courseSlug}/${lesson.previous?.slug}`)} />
      )}
    </Screen>
  );
}
