import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type TextProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NotFoundError, OfflineError, SignInRequiredError } from '../lib/api';
import { useTheme } from '../lib/theme';

/** Écran défilant ; la taille du texte suit le réglage du téléphone (Dynamic Type, police Android). */
export function Screen({ children, onRefresh, refreshing = false }: { children: ReactNode; onRefresh?: () => void; refreshing?: boolean }) {
  const t = useTheme();
  return (
    <SafeAreaView edges={['left', 'right']} style={{ flex: 1, backgroundColor: t.background }}>
      <ScrollView
        contentContainerStyle={styles.screen}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} accessibilityLabel="Actualiser" /> : undefined}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Title({ children, level = 1 }: { children: ReactNode; level?: 1 | 2 | 3 }) {
  const t = useTheme();
  const size = level === 1 ? 26 : level === 2 ? 20 : 17;
  return (
    <Text accessibilityRole="header" style={{ color: t.text, fontSize: size, fontWeight: '700', marginTop: level === 1 ? 0 : 12 }}>
      {children}
    </Text>
  );
}

export function Body({ children, muted, style, ...rest }: TextProps & { muted?: boolean }) {
  const t = useTheme();
  return (
    <Text {...rest} style={[{ color: muted ? t.muted : t.text, fontSize: 16, lineHeight: 24 }, style]}>
      {children}
    </Text>
  );
}

export function Card({ children, onPress, label, hint }: { children: ReactNode; onPress?: () => void; label?: string; hint?: string }) {
  const t = useTheme();
  const style = { backgroundColor: t.surface, borderColor: t.border, borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: 12, padding: 16, gap: 6 };
  if (!onPress) return <View style={style}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={({ pressed }) => [style, { opacity: pressed ? 0.85 : 1, minHeight: 48 }]}
    >
      {children}
    </Pressable>
  );
}

export function Button({ title, onPress, disabled, variant = 'primary', busy }: {
  title: string; onPress: () => void; disabled?: boolean; variant?: 'primary' | 'secondary'; busy?: boolean;
}) {
  const t = useTheme();
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || busy), busy: Boolean(busy) }}
      style={({ pressed }) => ({
        minHeight: 48,
        paddingHorizontal: 18,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: primary ? t.primary : 'transparent',
        borderWidth: primary ? 0 : 2,
        borderColor: t.primary,
        opacity: disabled ? 0.55 : pressed ? 0.85 : 1,
      })}
    >
      {busy ? <ActivityIndicator color={primary ? t.onPrimary : t.primary} /> : (
        <Text style={{ color: primary ? t.onPrimary : t.primary, fontSize: 16, fontWeight: '600' }}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ borderColor: t.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <Text style={{ color: t.text, fontSize: 13 }}>{children}</Text>
    </View>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const t = useTheme();
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: pct, text: `${pct} %` }}
      style={{ gap: 4 }}
    >
      <Body muted>{label} · {pct} %</Body>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: t.code, borderWidth: 1, borderColor: t.border, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: t.primary }} />
      </View>
    </View>
  );
}

export function Loading() {
  const t = useTheme();
  return (
    <View style={{ padding: 32, alignItems: 'center' }} accessible accessibilityLabel="Chargement en cours">
      <ActivityIndicator size="large" color={t.primary} />
    </View>
  );
}

/** Message d'erreur annoncé par le lecteur d'écran, avec une action pour réessayer. */
export function ErrorView({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const message = error instanceof OfflineError
    ? 'Pas de connexion, et ce contenu n’a pas encore été consulté sur ce téléphone.'
    : error instanceof NotFoundError
      ? 'Ce contenu n’existe pas ou n’est plus publié.'
      : error instanceof SignInRequiredError
        ? 'Connectez-vous depuis l’onglet Compte pour voir ce contenu.'
        : 'Une erreur est survenue. Réessayez dans un instant.';
  return (
    <View style={{ gap: 12 }} accessibilityLiveRegion="polite">
      <Body accessibilityRole="alert">{message}</Body>
      {onRetry && !(error instanceof NotFoundError) && <Button title="Réessayer" variant="secondary" onPress={onRetry} />}
    </View>
  );
}

export function OfflineBanner({ since }: { since: string | null }) {
  const t = useTheme();
  if (!since) return null;
  const date = new Date(since).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  return (
    <View style={{ backgroundColor: t.warningBg, borderRadius: 8, padding: 12 }} accessibilityLiveRegion="polite">
      <Text style={{ color: t.warningText, fontSize: 15 }}>Hors connexion : version enregistrée le {date}.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 14, paddingBottom: 48 },
});
