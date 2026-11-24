import { Injectable, Logger } from '@nestjs/common';
import { createHash, createPrivateKey, createPublicKey, KeyObject, sign, verify } from 'node:crypto';
import { CertificateSigner } from '../application/certification-ports';

/** En-tête PKCS#8 d'une clé Ed25519 brute de 32 octets. */
const PKCS8_ED25519 = Buffer.from('302e020100300506032b657004220420', 'hex');

/**
 * Signature Ed25519 des certificats. Clé privée : CERT_SIGNING_KEY (PEM PKCS#8, « \n » accepté).
 * Hors production (ou avec CERT_ALLOW_DEV_KEY=true, pile docker compose locale), une clé de
 * développement dérivée d'une phrase fixe est utilisée : elle n'a aucune valeur. En production sans
 * clé, l'API démarre mais n'ouvre aucun examen : on ne fait pas passer un examen qu'on ne pourrait pas certifier.
 */
@Injectable()
export class Ed25519Signer extends CertificateSigner {
  private readonly logger = new Logger(Ed25519Signer.name);
  private readonly privateKey: KeyObject | null = null;
  private readonly publicKey: KeyObject | null = null;

  constructor() {
    super();
    const pem = process.env.CERT_SIGNING_KEY?.replace(/\\n/g, '\n').trim();
    if (pem) {
      this.privateKey = createPrivateKey(pem);
      if (this.privateKey.asymmetricKeyType !== 'ed25519') throw new Error('CERT_SIGNING_KEY doit être une clé Ed25519.');
    } else if (process.env.NODE_ENV !== 'production' || process.env.CERT_ALLOW_DEV_KEY === 'true') {
      this.logger.warn('CERT_SIGNING_KEY absente : clé de DÉVELOPPEMENT utilisée pour signer les certificats.');
      const seed = createHash('sha256').update('sysmaster-dev-only-certificate-key').digest();
      this.privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, seed]), format: 'der', type: 'pkcs8' });
    } else {
      this.logger.error('CERT_SIGNING_KEY absente : aucun examen de certification ne sera ouvert.');
    }
    if (this.privateKey) this.publicKey = createPublicKey(this.privateKey);
  }

  get ready(): boolean {
    return this.privateKey !== null;
  }

  sign(payload: string): string {
    if (!this.privateKey) throw new Error('clé de signature des certificats absente');
    return sign(null, Buffer.from(payload, 'utf8'), this.privateKey).toString('base64url');
  }

  verify(payload: string, signature: string): boolean {
    if (!this.publicKey) return false;
    try {
      return verify(null, Buffer.from(payload, 'utf8'), this.publicKey, Buffer.from(signature, 'base64url'));
    } catch {
      return false;
    }
  }

  publicKeyPem(): string {
    return this.publicKey?.export({ type: 'spki', format: 'pem' }).toString() ?? '';
  }
}
