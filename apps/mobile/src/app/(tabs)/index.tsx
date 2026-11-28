import type { DashboardDto } from '@sysmaster/contracts';
import { useRouter, type Href } from 'expo-router';
import { Button, Body, Card, ErrorView, Loading, ProgressBar, Row, Badge, Screen, Title } from '../../components/ui';
import { appRouteFor } from '../../lib/api';
import { useAuth } from '../../lib/auth/auth-context';
import { useApi } from '../../lib/use-api';

function Welcome() {
  const { signIn, error } = useAuth();
  const router = useRouter();
  return (
    <Screen>
      <Title>Comprendre avant d’exécuter</Title>
      <Body>
        SysMaster explique chaque commande, chaque panne et chaque correction : pourquoi elle fonctionne, quand l’utiliser et ce qu’elle risque.
      </Body>
      <Button title="Se connecter" onPress={() => void signIn()} />
      {error && <Body accessibilityRole="alert">{error}</Body>}
      <Button title="Parcourir l’académie sans compte" variant="secondary" onPress={() => router.navigate('/academie')} />
    </Screen>
  );
}

function Dashboard() {
  const { profile } = useAuth();
  const router = useRouter();
  const q = useApi<DashboardDto>('/me/dashboard');
  if (q.loading && !q.data) return <Screen><Loading /></Screen>;
  if (q.error || !q.data) return <Screen><ErrorView error={q.error ?? new Error()} onRetry={q.reload} /></Screen>;
  const { gamification: g, enrollments, recommendations, weaknesses } = q.data;
  return (
    <Screen onRefresh={q.reload} refreshing={q.loading}>
      <Title>Bonjour{profile?.displayName ? ` ${profile.displayName}` : ''}</Title>
      <Card>
        <Body style={{ fontWeight: '700' }}>Niveau {g.level} · {g.levelTitle}</Body>
        <Body>{g.totalXp} XP · série de {g.streakDays} jour{g.streakDays > 1 ? 's' : ''}</Body>
        {g.nextLevel && (
          <ProgressBar
            label={`Vers le niveau ${g.nextLevel.level}`}
            value={((g.totalXp - g.currentLevelXp) / Math.max(1, g.nextLevel.minXp - g.currentLevelXp)) * 100}
          />
        )}
      </Card>

      {recommendations.length > 0 && <Title level={2}>À faire maintenant</Title>}
      {recommendations.map((r) => {
        const route = appRouteFor(r.href);
        return (
          <Card key={r.href} onPress={route ? () => router.navigate(route as Href) : undefined} label={r.text}>
            <Body>{r.text}</Body>
          </Card>
        );
      })}

      <Title level={2}>Mes parcours</Title>
      {enrollments.length === 0 && <Body muted>Aucun parcours suivi pour l’instant.</Body>}
      {enrollments.map((e) => (
        <Card key={e.pathSlug} onPress={() => router.navigate(`/parcours/${e.pathSlug}`)} label={`${e.pathTitle}, ${e.progressPct} % terminé`}>
          <Body style={{ fontWeight: '700' }}>{e.pathTitle}</Body>
          <ProgressBar value={e.progressPct} label={e.completedAt ? 'Parcours terminé' : 'Progression'} />
        </Card>
      ))}

      {weaknesses.length > 0 && (
        <>
          <Title level={2}>Compétences à renforcer</Title>
          <Row>{weaknesses.map((s) => <Badge key={s.code}>{s.name} · {s.pct} %</Badge>)}</Row>
        </>
      )}
    </Screen>
  );
}

export default function Home() {
  const { status } = useAuth();
  if (status === 'loading') return <Screen><Loading /></Screen>;
  return status === 'signedIn' ? <Dashboard /> : <Welcome />;
}
