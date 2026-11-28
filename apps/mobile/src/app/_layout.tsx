import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../lib/auth/auth-context';
import { useTheme } from '../lib/theme';

function Navigator() {
  const t = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: t.background },
        headerTintColor: t.primary,
        headerTitleStyle: { color: t.text },
        contentStyle: { backgroundColor: t.background },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Accueil' }} />
      <Stack.Screen name="parcours/[slug]" options={{ title: 'Parcours' }} />
      <Stack.Screen name="cours/[slug]/index" options={{ title: 'Cours' }} />
      <Stack.Screen name="cours/[slug]/[lecon]" options={{ title: 'Leçon' }} />
      <Stack.Screen name="commandes/[slug]" options={{ title: 'Fiche commande' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="auto" />
        <Navigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
