import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Body, Button, Card, Screen, Title } from '../../components/ui';
import { useAuth } from '../../lib/auth/auth-context';
import { config } from '../../lib/config';

export default function Account() {
  const { status, profile, signIn, signOut, error, cache } = useAuth();
  const [cleared, setCleared] = useState(false);
  const openWeb = (path: string) => void WebBrowser.openBrowserAsync(`${config.webUrl}${path}`);

  return (
    <Screen>
      <Title>Compte</Title>
      {status === 'signedIn' ? (
        <Card>
          <Body style={{ fontWeight: '700' }}>{profile?.displayName ?? 'Connecté'}</Body>
          {profile && <Body muted>{profile.email}</Body>}
          <Button title="Se déconnecter" variant="secondary" onPress={() => void signOut()} />
        </Card>
      ) : (
        <Card>
          <Body>Connectez-vous pour suivre votre progression, valider vos leçons et retrouver votre tableau de bord.</Body>
          <Button title="Se connecter" onPress={() => void signIn()} />
          {error && <Body accessibilityRole="alert">{error}</Body>}
        </Card>
      )}

      <Title level={2}>Hors connexion</Title>
      <Body muted>
        Les parcours, cours, leçons et fiches consultés restent lisibles sans réseau. Ils sont stockés sur ce téléphone seulement et effacés à la déconnexion.
      </Body>
      <Button
        title={cleared ? 'Contenus effacés' : 'Effacer les contenus enregistrés'}
        variant="secondary"
        onPress={() => void cache.clear().then(() => setCleared(true))}
      />

      <Title level={2}>Vos données</Title>
      <Body muted>Export, suppression du compte et préférences se gèrent sur le site, avec la même connexion.</Body>
      <Button title="Confidentialité et données" variant="secondary" onPress={() => openWeb('/compte')} />
      <Button title="Politique de confidentialité" variant="secondary" onPress={() => openWeb('/confidentialite')} />
    </Screen>
  );
}
