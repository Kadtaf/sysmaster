import { Link } from 'expo-router';
import { Body, Screen, Title } from '../components/ui';

export default function NotFound() {
  return (
    <Screen>
      <Title>Page introuvable</Title>
      <Body>Ce lien ne correspond à aucun écran de l’application.</Body>
      <Link href="/" accessibilityRole="link"><Body style={{ textDecorationLine: 'underline' }}>Retour à l’accueil</Body></Link>
    </Screen>
  );
}
