import { useColorScheme } from 'react-native';

/** Couleurs contrastées (WCAG 2.2 AA : 4,5:1 pour le texte, 3:1 pour les contours), clair et sombre. */
const light = {
  background: '#ffffff',
  surface: '#f4f5f7',
  text: '#111827',
  muted: '#4b5563',
  border: '#6b7280',
  primary: '#1d4ed8',
  onPrimary: '#ffffff',
  danger: '#b91c1c',
  warningBg: '#fef3c7',
  warningText: '#78350f',
  code: '#e5e7eb',
};
const dark: typeof light = {
  background: '#0b0f17',
  surface: '#161b26',
  text: '#f3f4f6',
  muted: '#b6bcc8',
  border: '#6b7280',
  primary: '#93b4ff',
  onPrimary: '#0b0f17',
  danger: '#fca5a5',
  warningBg: '#422006',
  warningText: '#fde68a',
  code: '#1f2937',
};
export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const themes = { light, dark };
