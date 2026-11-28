import { Redirect } from 'expo-router';

/** Retour de Keycloak (sysmaster://auth) : la session d'authentification traite le code, on revient à l'accueil. */
export default function AuthRedirect() {
  return <Redirect href="/" />;
}
