import app from '../app.json';
import realmJson from '../../../infra/keycloak/sysmaster-realm.json';
import { resolveConfig } from '../src/lib/config';

describe('configuration', () => {
  it('valeurs locales en développement', () => {
    expect(resolveConfig({}, true)).toEqual({
      apiUrl: 'http://localhost:4000/api/v1',
      issuer: 'http://localhost:8080/realms/sysmaster',
      clientId: 'sysmaster-mobile',
      webUrl: 'http://localhost:3000',
    });
  });

  it('refuse une adresse non chiffrée dans une version publiée', () => {
    expect(() => resolveConfig({}, false)).toThrow(/HTTPS/);
    const prod = {
      EXPO_PUBLIC_API_URL: 'https://api.sysmaster.ai/api/v1/',
      EXPO_PUBLIC_OIDC_ISSUER: 'https://auth.sysmaster.ai/realms/sysmaster',
      EXPO_PUBLIC_WEB_URL: 'https://sysmaster.ai',
    };
    expect(resolveConfig(prod, false).apiUrl).toBe('https://api.sysmaster.ai/api/v1');
  });
});

describe('client Keycloak mobile (infra/keycloak/sysmaster-realm.json)', () => {
  const realm = realmJson as unknown as { clients: Record<string, unknown>[] };
  const client = realm.clients.find((c) => c.clientId === 'sysmaster-mobile');

  it('client public, code d’autorisation avec PKCE S256 uniquement', () => {
    expect(client).toMatchObject({
      publicClient: true,
      standardFlowEnabled: true,
      directAccessGrantsEnabled: false,
      implicitFlowEnabled: false,
      serviceAccountsEnabled: false,
      attributes: expect.objectContaining({ 'pkce.code.challenge.method': 'S256' }),
    });
    expect(client).not.toHaveProperty('secret');
  });

  it('une seule redirection, exacte, vers le schéma de l’application', () => {
    expect(client?.redirectUris).toEqual([`${app.expo.scheme}://auth`]);
  });

  it('jetons destinés à l’API (audience sysmaster-api)', () => {
    expect(JSON.stringify(client?.protocolMappers)).toContain('"included.custom.audience":"sysmaster-api"');
  });
});
