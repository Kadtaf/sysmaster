import type { CourseDetail } from '@sysmaster/contracts';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, Body, Card, ErrorView, Loading, OfflineBanner, Row, Screen, Title } from '../../../components/ui';
import { difficultyLabel, lessonStatusLabel, lessonTypeLabel, platformLabel } from '../../../lib/labels';
import { useApi } from '../../../lib/use-api';

export default function CourseScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const q = useApi<CourseDetail>(`/learning/courses/${encodeURIComponent(slug)}`);
  if (q.loading && !q.data) return <Screen><Loading /></Screen>;
  if (q.error || !q.data) return <Screen><ErrorView error={q.error ?? new Error()} onRetry={q.reload} /></Screen>;
  const course = q.data;
  return (
    <Screen onRefresh={q.reload} refreshing={q.loading}>
      <Stack.Screen options={{ title: course.title }} />
      <OfflineBanner since={q.offlineSince} />
      <Title>{course.title}</Title>
      <Body>{course.summary}</Body>
      <Row>
        <Badge>{platformLabel[course.platform] ?? course.platform}</Badge>
        <Badge>{difficultyLabel[course.difficulty]}</Badge>
      </Row>
      {course.modules.map((m, mi) => (
        <Card key={m.title}>
          <Title level={2}>Module {mi + 1} · {m.title}</Title>
          {m.lessons.map((l) => {
            const status = l.status ? lessonStatusLabel[l.status] : null;
            return (
              <Card
                key={l.slug}
                onPress={() => router.navigate(`/cours/${course.slug}/${l.slug}`)}
                label={[l.title, lessonTypeLabel[l.type] ?? l.type, status].filter(Boolean).join(', ')}
              >
                <Body style={{ fontWeight: '600' }}>{l.title}</Body>
                <Row>
                  <Badge>{lessonTypeLabel[l.type] ?? l.type}</Badge>
                  {l.estMinutes ? <Badge>{l.estMinutes} min</Badge> : null}
                  {status && <Badge>{status}</Badge>}
                </Row>
              </Card>
            );
          })}
        </Card>
      ))}
    </Screen>
  );
}
