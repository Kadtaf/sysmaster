import type { LearningPathSummary } from '@sysmaster/contracts';
import { useRouter } from 'expo-router';
import { Badge, Body, Card, ErrorView, Loading, OfflineBanner, Row, Screen, Title } from '../../components/ui';
import { difficultyLabel } from '../../lib/labels';
import { useApi } from '../../lib/use-api';

export default function Academy() {
  const router = useRouter();
  const q = useApi<LearningPathSummary[]>('/learning/paths');
  return (
    <Screen onRefresh={q.reload} refreshing={q.loading && Boolean(q.data)}>
      <Title>Parcours</Title>
      <OfflineBanner since={q.offlineSince} />
      {q.loading && !q.data && <Loading />}
      {q.error && <ErrorView error={q.error} onRetry={q.reload} />}
      {q.data?.map((p) => (
        <Card key={p.slug} onPress={() => router.navigate(`/parcours/${p.slug}`)} label={p.title} hint={p.summary}>
          <Body style={{ fontWeight: '700' }}>{p.title}</Body>
          <Body muted numberOfLines={3}>{p.summary}</Body>
          <Row>
            <Badge>{difficultyLabel[p.difficulty]}</Badge>
            <Badge>{p.courseCount} cours</Badge>
            {p.estHours ? <Badge>{p.estHours} h</Badge> : null}
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
