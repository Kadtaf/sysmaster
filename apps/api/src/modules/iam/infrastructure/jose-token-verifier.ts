import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { knownRoles, TokenClaims } from '../domain/identity';
import { InvalidTokenError, TokenVerifier } from '../application/ports';

export interface OidcSettings {
  /** Émetteur attendu (claim « iss »), ex. http://localhost:8080/realms/sysmaster */
  issuer: string;
  /** Audience attendue (claim « aud »), ajoutée par le mapper Keycloak. */
  audience: string;
}

/** Vérifie les jetons Keycloak avec les clés publiques du royaume (JWKS, mises en cache par jose). */
export class JoseTokenVerifier extends TokenVerifier {
  constructor(
    private readonly keys: JWTVerifyGetKey,
    private readonly settings: OidcSettings,
  ) {
    super();
  }

  /**
   * L'URL des clés peut différer de l'émetteur : dans Docker, l'API joint Keycloak par
   * http://keycloak:8080 alors que les jetons portent l'émetteur public http://localhost:8080.
   */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): JoseTokenVerifier {
    const issuer = env.OIDC_ISSUER ?? 'http://localhost:8080/realms/sysmaster';
    const jwks = env.OIDC_JWKS_URL ?? `${issuer}/protocol/openid-connect/certs`;
    return new JoseTokenVerifier(createRemoteJWKSet(new URL(jwks)), {
      issuer,
      audience: env.OIDC_AUDIENCE ?? 'sysmaster-api',
    });
  }

  async verify(token: string): Promise<TokenClaims> {
    try {
      const { payload } = await jwtVerify(token, this.keys, {
        issuer: this.settings.issuer,
        audience: this.settings.audience,
        algorithms: ['RS256', 'ES256', 'PS256'],
        clockTolerance: 5,
      });
      if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
        throw new InvalidTokenError('Jeton sans « sub » ou « email »');
      }
      const realmAccess = payload.realm_access as { roles?: unknown } | undefined;
      const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name : payload.email;
      return {
        subject: payload.sub,
        email: payload.email.toLowerCase(),
        emailVerified: payload.email_verified === true,
        displayName: name,
        locale: typeof payload.locale === 'string' ? payload.locale : null,
        roles: knownRoles(realmAccess?.roles),
      };
    } catch (err) {
      if (err instanceof InvalidTokenError) throw err;
      if (err instanceof errors.JOSEError) throw new InvalidTokenError(err.code);
      throw err; // panne réseau vers Keycloak, etc. : ce n'est pas un jeton invalide
    }
  }
}
