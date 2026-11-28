import { Fragment, useMemo } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { parseMarkdown, plainText, type Block, type Inline } from '../lib/markdown';
import { useTheme, type Theme } from '../lib/theme';
import { config } from '../lib/config';

const MONO = { fontFamily: 'monospace' } as const;

function Inlines({ nodes, t }: { nodes: Inline[]; t: Theme }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.type) {
          case 'text': return <Fragment key={i}>{n.text}</Fragment>;
          case 'code': return <Text key={i} style={[MONO, { backgroundColor: t.code }]}>{n.text}</Text>;
          case 'strong': return <Text key={i} style={{ fontWeight: '700' }}><Inlines nodes={n.children} t={t} /></Text>;
          case 'em': return <Text key={i} style={{ fontStyle: 'italic' }}><Inlines nodes={n.children} t={t} /></Text>;
          case 'link': {
            const url = n.href.startsWith('/') ? `${config.webUrl}${n.href}` : n.href;
            return (
              <Text key={i} accessibilityRole="link" style={{ color: t.primary, textDecorationLine: 'underline' }} onPress={() => void Linking.openURL(url)}>
                <Inlines nodes={n.children} t={t} />
              </Text>
            );
          }
        }
      })}
    </>
  );
}

function BlockView({ block, t }: { block: Block; t: Theme }) {
  const text = { color: t.text, fontSize: 16, lineHeight: 24 };
  switch (block.type) {
    case 'heading':
      return (
        <Text accessibilityRole="header" style={{ ...text, fontSize: block.level <= 2 ? 20 : 17, fontWeight: '700', marginTop: 8 }}>
          <Inlines nodes={block.children} t={t} />
        </Text>
      );
    case 'paragraph':
      return <Text style={text}><Inlines nodes={block.children} t={t} /></Text>;
    case 'quote':
      return (
        <View style={{ borderLeftWidth: 4, borderLeftColor: t.border, paddingLeft: 12 }}>
          <Text style={{ ...text, color: t.muted }}><Inlines nodes={block.children} t={t} /></Text>
        </View>
      );
    case 'list':
      return (
        <View style={{ gap: 6 }} accessibilityRole="list">
          {block.items.map((item, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
              <Text style={text} importantForAccessibility="no" accessibilityElementsHidden>
                {block.ordered ? `${block.start + i}.` : '•'}
              </Text>
              <Text style={{ ...text, flex: 1 }} accessibilityLabel={`${block.ordered ? `${block.start + i}. ` : ''}${plainText(item)}`}>
                <Inlines nodes={item} t={t} />
              </Text>
            </View>
          ))}
        </View>
      );
    case 'code':
      return (
        <ScrollView horizontal style={{ backgroundColor: t.code, borderRadius: 8 }} contentContainerStyle={{ padding: 12 }} accessibilityLabel="Bloc de code">
          <Text selectable style={[MONO, { color: t.text, fontSize: 14, lineHeight: 20 }]}>{block.text}</Text>
        </ScrollView>
      );
    case 'table':
      // Sur un écran étroit, chaque ligne du tableau devient une fiche « en-tête : valeur » (pas de défilement horizontal).
      return (
        <View style={{ gap: 8 }}>
          {block.rows.map((row, r) => (
            <View key={r} style={{ borderWidth: 1, borderColor: t.border, borderRadius: 8, padding: 10, gap: 4 }}>
              {row.map((cell, c) => (
                <Text key={c} style={text}>
                  <Text style={{ fontWeight: '700' }}><Inlines nodes={block.header[c] ?? []} t={t} /> : </Text>
                  <Inlines nodes={cell} t={t} />
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
    case 'rule':
      return <View style={{ height: 1, backgroundColor: t.border, marginVertical: 8 }} />;
  }
}

export function Markdown({ source }: { source: string }) {
  const t = useTheme();
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return <View style={{ gap: 12 }}>{blocks.map((b, i) => <BlockView key={i} block={b} t={t} />)}</View>;
}
