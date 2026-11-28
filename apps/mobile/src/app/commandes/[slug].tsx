import type { CommandDetail } from '@sysmaster/contracts';
import { Stack, useLocalSearchParams } from 'expo-router';
import { CommandView } from '../../components/command-view';
import { ErrorView, Loading, OfflineBanner, Screen } from '../../components/ui';
import { useApi } from '../../lib/use-api';

export default function CommandScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const q = useApi<CommandDetail>(`/kb/commands/${encodeURIComponent(slug)}`);
  if (q.loading && !q.data) return <Screen><Loading /></Screen>;
  if (q.error || !q.data) return <Screen><ErrorView error={q.error ?? new Error()} onRetry={q.reload} /></Screen>;
  return (
    <Screen>
      <Stack.Screen options={{ title: q.data.name }} />
      <OfflineBanner since={q.offlineSince} />
      <CommandView command={q.data} />
    </Screen>
  );
}
