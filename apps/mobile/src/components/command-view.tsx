import type { CommandDetail } from '@sysmaster/contracts';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { difficultyLabel, platformLabel, riskLabel } from '../lib/labels';
import { useTheme } from '../lib/theme';
import { Badge, Body, Button, Card, Row, Title } from './ui';

function Code({ children }: { children: string }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.code, borderRadius: 8, padding: 12 }}>
      <Text selectable style={{ fontFamily: 'monospace', color: t.text, fontSize: 14, lineHeight: 20 }}>{children}</Text>
    </View>
  );
}

/**
 * Fiche commande. Règle P-2 : une commande dangereuse reste masquée tant que l'utilisateur n'a pas
 * confirmé avoir lu ses risques ; l'application ne propose pas de copie (l'utilisateur tape la commande).
 */
export function CommandView({ command }: { command: CommandDetail }) {
  const [risksRead, setRisksRead] = useState(!command.maskedUntilRisksRead);
  return (
    <View style={{ gap: 14 }}>
      <Title>{command.name}</Title>
      <Row>
        <Badge>{platformLabel[command.platform] ?? command.platform}</Badge>
        <Badge>{difficultyLabel[command.difficulty]}</Badge>
        <Badge>{riskLabel[command.riskLevel]}</Badge>
        {command.requiresAdmin && <Badge>Droits administrateur</Badge>}
      </Row>
      <Body>{command.summary}</Body>

      <Title level={2}>Pourquoi</Title>
      <Body>{command.why}</Body>
      <Title level={2}>Quand l’utiliser</Title>
      <Body>{command.whenToUse}</Body>

      {command.risks.length > 0 && (
        <>
          <Title level={2}>Risques</Title>
          {command.risks.map((r) => (
            <Card key={r.text}>
              <Body style={{ fontWeight: '700' }}>{riskLabel[r.level]}</Body>
              <Body>{r.text}</Body>
            </Card>
          ))}
        </>
      )}

      {risksRead ? (
        <>
          <Title level={2}>Syntaxe</Title>
          <Code>{command.syntax}</Code>
          {command.examples.length > 0 && <Title level={2}>Exemples</Title>}
          {command.examples.map((e) => (
            <Card key={e.title}>
              <Body style={{ fontWeight: '700' }}>{e.title}</Body>
              <Code>{e.code}</Code>
              <Body muted>{e.explanation}</Body>
            </Card>
          ))}
        </>
      ) : (
        <Card>
          <Body>Cette commande peut endommager le système. Lisez les risques ci-dessus avant d’afficher la syntaxe et les exemples.</Body>
          <Button title="J’ai lu les risques, afficher la commande" onPress={() => setRisksRead(true)} />
        </Card>
      )}

      {command.commonErrors.length > 0 && <Title level={2}>Erreurs fréquentes</Title>}
      {command.commonErrors.map((e) => (
        <Card key={e.error}>
          <Body style={{ fontWeight: '700' }}>{e.error}</Body>
          <Body>Cause : {e.cause}</Body>
          <Body>Solution : {e.fix}</Body>
        </Card>
      ))}

      {command.bestPractices.length > 0 && <Title level={2}>Bonnes pratiques</Title>}
      {command.bestPractices.map((p) => <Body key={p}>• {p}</Body>)}

      {command.sources.length > 0 && <Title level={2}>Sources</Title>}
      {command.sources.map((s) => <Body key={s.url} muted>{s.publisher} · {s.title}</Body>)}
    </View>
  );
}
