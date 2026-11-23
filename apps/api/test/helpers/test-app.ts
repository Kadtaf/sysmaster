import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { TokenVerifier } from '../../src/modules/iam/application/ports';
import { JoseTokenVerifier } from '../../src/modules/iam/infrastructure/jose-token-verifier';

const ISSUER = 'http://test-idp/realms/sysmaster';

/** Application de test avec un émetteur de jetons local (pas besoin de Keycloak). */
export async function createTestApp() {
  const keys = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(keys.publicKey)), kid: 'test', alg: 'RS256', use: 'sig' };
  const verifier = new JoseTokenVerifier(createLocalJWKSet({ keys: [jwk] }), { issuer: ISSUER, audience: 'sysmaster-api' });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TokenVerifier)
    .useValue(verifier)
    .compile();
  const app: INestApplication = configureApp(moduleRef.createNestApplication());
  await app.init();

  /** Jeton pour un nouvel utilisateur unique (ou celui passé en paramètre). */
  const tokenFor = (identity = newIdentity(), roles = ['learner']) =>
    new SignJWT({ ...identity, email_verified: true, realm_access: { roles } })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer(ISSUER)
      .setAudience('sysmaster-api')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(keys.privateKey);

  return { app, tokenFor };
}

export function newIdentity() {
  const id = randomUUID();
  return { sub: id, email: `user-${id}@test.local`, name: 'Test Utilisateur' };
}
