import type { CommandSummary } from '@sysmaster/contracts';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Badge, Body, Button, Card, ErrorView, Loading, Row, Screen, Title } from '../../components/ui';
import { platformLabel, riskLabel } from '../../lib/labels';
import { useTheme } from '../../lib/theme';
import { useApi } from '../../lib/use-api';

const PLATFORMS = [
  { value: '', label: 'Toutes' },
  { value: 'linux', label: 'Linux' },
  { value: 'windows', label: 'Windows' },
] as const;

export default function Commands() {
  const t = useTheme();
  const router = useRouter();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState('');

  // Recherche lancée 300 ms après la dernière frappe.
  useEffect(() => {
    const id = setTimeout(() => setQuery(text.trim()), 300);
    return () => clearTimeout(id);
  }, [text]);

  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (platform) params.set('platform', platform);
  const qs = params.toString();
  const q = useApi<CommandSummary[]>(`/kb/commands${qs ? `?${qs}` : ''}`);

  return (
    <Screen>
      <Title>Fiches commandes</Title>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Rechercher : ls, ipconfig, disque plein…"
        placeholderTextColor={t.muted}
        accessibilityLabel="Rechercher une commande"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={{ minHeight: 48, borderWidth: 2, borderColor: t.border, borderRadius: 10, paddingHorizontal: 12, color: t.text, fontSize: 16 }}
      />
      <View accessibilityRole="radiogroup" accessibilityLabel="Plateforme">
        <Row>
          {PLATFORMS.map((p) => (
            <Button key={p.value} title={p.label} variant={platform === p.value ? 'primary' : 'secondary'} onPress={() => setPlatform(p.value)} />
          ))}
        </Row>
      </View>
      {q.loading && !q.data && <Loading />}
      {q.error && <ErrorView error={q.error} onRetry={q.reload} />}
      {q.data && q.data.length === 0 && <Body muted>Aucune fiche ne correspond.</Body>}
      {q.data?.map((c) => (
        <Card key={c.slug} onPress={() => router.navigate(`/commandes/${c.slug}`)} label={`${c.name}, ${riskLabel[c.riskLevel]}`} hint={c.summary}>
          <Body style={{ fontWeight: '700', fontFamily: 'monospace' }}>{c.name}</Body>
          <Body muted numberOfLines={2}>{c.summary}</Body>
          <Row>
            <Badge>{platformLabel[c.platform] ?? c.platform}</Badge>
            <Badge>{riskLabel[c.riskLevel]}</Badge>
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
