import { KeycloakAdmin } from './keycloak-admin';

const SUB = '3f1c2a8e-1b2c-4d5e-8f90-1234567890ab';
const config = { issuer: 'http://kc:8080/realms/sysmaster', clientId: 'sysmaster-admin', clientSecret: 's3cret' };

function fakeFetch(deleteStatus: number) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const http = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith('/token')) return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
    return new Response(null, { status: deleteStatus });
  }) as unknown as typeof fetch;
  return { http, calls };
}

describe('KeycloakAdmin', () => {
  it('sans client d’administration : ne fait rien et le signale', async () => {
    expect(await new KeycloakAdmin(null).deleteUser(SUB)).toBe(false);
    expect(KeycloakAdmin.fromEnv({ OIDC_ISSUER: config.issuer })).toBeInstanceOf(KeycloakAdmin);
  });

  it('obtient un jeton puis supprime le compte du royaume', async () => {
    const { http, calls } = fakeFetch(204);
    expect(await new KeycloakAdmin(config, http).deleteUser(SUB)).toBe(true);
    expect(calls[0].url).toBe('http://kc:8080/realms/sysmaster/protocol/openid-connect/token');
    expect(String(calls[0].init?.body)).toContain('grant_type=client_credentials');
    expect(calls[1]).toMatchObject({ url: `http://kc:8080/admin/realms/sysmaster/users/${SUB}`, init: { method: 'DELETE' } });
  });

  it('déjà supprimé : succès ; autre refus : erreur', async () => {
    expect(await new KeycloakAdmin(config, fakeFetch(404).http).deleteUser(SUB)).toBe(true);
    await expect(new KeycloakAdmin(config, fakeFetch(403).http).deleteUser(SUB)).rejects.toThrow('403');
  });

  it('refuse un identifiant qui pourrait détourner l’URL', async () => {
    await expect(new KeycloakAdmin(config, fakeFetch(204).http).deleteUser('../../roles')).rejects.toThrow('invalide');
    expect(() => KeycloakAdmin.split('http://kc/autre')).toThrow();
  });
});
