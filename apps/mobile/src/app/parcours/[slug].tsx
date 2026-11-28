import type { EnrollmentDto, LearningPathDetail } from '@sysmaster/contracts';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Badge, Body, Button, Card, ErrorView, Loading, OfflineBanner, ProgressBar, Row, Screen, Title } from '../../components/ui';
import { useAuth } from '../../lib/auth/auth-context';
import { difficultyLabel } from '../../lib/labels';
import { useApi } from '../../lib/use-api';

export default function PathScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { api, status, signIn } = useAuth();
  const q = useApi<LearningPathDetail>(`/learning/paths/${encodeURIComponent(slug)}`);
  const [busy, setBusy] = useState(false);
  const [enrollment, setEnrollment] = useState<EnrollmentDto | null>(null);
  const [failed, setFailed] = useState(false);

  if (q.loading && !q.data) return <Screen><Loading /></Screen>;
  if (q.error || !q.data) return <Screen><ErrorView error={q.error ?? new Error()} onRetry={q.reload} /></Screen>;
  const path = q.data;
  const current = enrollment ?? path.enrollment;

  const enroll = async () => {
    setBusy(true);
    setFailed(false);
    try {
      setEnrollment(await api.post<EnrollmentDto>(`/learning/paths/${encodeURIComponent(path.slug)}/enroll`));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen onRefresh={q.reload} refreshing={q.loading}>
      <Stack.Screen options={{ title: path.title }} />
      <OfflineBanner since={q.offlineSince} />
      <Title>{path.title}</Title>
      <Body>{path.summary}</Body>
      <Row>
        <Badge>{difficultyLabel[path.difficulty]}</Badge>
        {path.estHours ? <Badge>{path.estHours} h</Badge> : null}
        {path.career ? <Badge>{path.career}</Badge> : null}
      </Row>
      <Card>
        {current ? (
          <ProgressBar value={current.progressPct} label={current.completedAt ? 'Parcours terminé' : 'Votre progression'} />
        ) : status === 'signedIn' ? (
          <Button title="Suivre ce parcours" onPress={() => void enroll()} busy={busy} />
        ) : (
          <>
            <Body muted>Connectez-vous pour suivre votre progression. Les leçons restent lisibles sans compte.</Body>
            <Button title="Se connecter" variant="secondary" onPress={() => void signIn()} />
          </>
        )}
        {failed && <Body accessibilityRole="alert">L’inscription n’a pas abouti. Réessayez.</Body>}
      </Card>
      <Title level={2}>Cours, dans l’ordre conseillé</Title>
      {path.courses.map((c, i) => (
        <Card key={c.slug} onPress={() => router.navigate(`/cours/${c.slug}`)} label={`${i + 1}. ${c.title}`} hint={c.summary}>
          <Body style={{ fontWeight: '700' }}>{i + 1}. {c.title}</Body>
          <Body muted numberOfLines={3}>{c.summary}</Body>
          {c.isPremium && <Badge>Premium</Badge>}
        </Card>
      ))}
    </Screen>
  );
}
