import { generateKeyPairSync } from 'node:crypto';
import { canonical, expiry } from '../domain/certification';
import { Ed25519Signer } from './ed25519-signer';

const now = new Date('2026-11-24T12:00:00Z');

describe('Signature des certificats', () => {
  const signer = new Ed25519Signer();
  const c = { serial: 'SM-2026-LINADM-23456Z', code: 'LINUX-ADMIN', holderName: 'Ada Lovelace', issuedAt: now, expiresAt: expiry(now, 36) };

  it('signe et vérifie ; toute modification du contenu invalide la signature', () => {
    const sig = signer.sign(canonical(c));
    expect(signer.verify(canonical(c), sig)).toBe(true);
    expect(signer.verify(canonical({ ...c, holderName: 'Ada Lovelac3' }), sig)).toBe(false);
    expect(signer.verify(canonical({ ...c, expiresAt: null }), sig)).toBe(false);
    expect(signer.verify(canonical(c), 'pas-une-signature')).toBe(false);
  });

  it('clé publique PEM, stable pour la clé de développement', () => {
    expect(signer.publicKeyPem()).toContain('BEGIN PUBLIC KEY');
    expect(new Ed25519Signer().publicKeyPem()).toBe(signer.publicKeyPem());
  });

  it('en production sans clé : aucune signature possible, aucune vérification réussie', () => {
    const env = { ...process.env };
    process.env.NODE_ENV = 'production';
    delete process.env.CERT_SIGNING_KEY;
    delete process.env.CERT_ALLOW_DEV_KEY;
    try {
      const none = new Ed25519Signer();
      expect(none.ready).toBe(false);
      expect(() => none.sign('x')).toThrow();
      expect(none.verify(canonical(c), signer.sign(canonical(c)))).toBe(false);
      expect(none.publicKeyPem()).toBe('');
    } finally {
      process.env = env;
    }
  });

  it('une vraie clé PEM est utilisée telle quelle', () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const env = { ...process.env };
    process.env.CERT_SIGNING_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString().replace(/\n/g, '\\n');
    try {
      const real = new Ed25519Signer();
      expect(real.publicKeyPem()).not.toBe(signer.publicKeyPem());
      expect(real.verify('x', real.sign('x'))).toBe(true);
    } finally {
      process.env = env;
    }
  });
});
