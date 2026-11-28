import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { useTheme } from '../../lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
const icon = (name: IconName) => function TabIcon({ color, size }: { color: ColorValue; size: number }) {
  return <Ionicons name={name} color={typeof color === 'string' ? color : undefined} size={size} accessibilityElementsHidden importantForAccessibility="no" />;
};

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: t.background },
        headerTitleStyle: { color: t.text },
        tabBarStyle: { backgroundColor: t.background, borderTopColor: t.border },
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.muted,
        sceneStyle: { backgroundColor: t.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Accueil', tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen name="academie" options={{ title: 'Académie', tabBarIcon: icon('school-outline') }} />
      <Tabs.Screen name="commandes" options={{ title: 'Commandes', tabBarIcon: icon('terminal-outline') }} />
      <Tabs.Screen name="compte" options={{ title: 'Compte', tabBarIcon: icon('person-circle-outline') }} />
    </Tabs>
  );
}
