import { PDFDocument } from 'pdf-lib';
import type { CertificateDto } from '@sysmaster/contracts';
import { printable, renderCertificatePdf } from './certificate-pdf';

const cert: CertificateDto = {
  serial: 'SM-2026-ABCD-1234',
  holderName: 'Zoë Łukasiewicz-Ñúñez',
  certification: { code: 'LINUX-ADMIN', title: 'Linux Administrator', level: 'intermediate' },
  issuedAt: '2026-11-20T10:00:00.000Z',
  expiresAt: '2029-11-20T10:00:00.000Z',
  status: 'valid',
  revokedAt: null,
  revokeReason: null,
  signatureValid: true,
};

describe('certificat PDF', () => {
  it('une page A4 paysage, métadonnées du certificat, dates fixes', async () => {
    const bytes = await renderCertificatePdf(cert, 'https://sysmaster.test/verify/SM-2026-ABCD-1234');
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(842);
    expect(Math.round(height)).toBe(595);
    expect(doc.getTitle()).toBe('Certificat Linux Administrator — Zoë Łukasiewicz-Ñúñez');
    expect(doc.getSubject()).toBe('Certificat SM-2026-ABCD-1234');
    expect(doc.getCreationDate()?.toISOString()).toBe(cert.issuedAt);
    // Polices réduites aux caractères utilisés : le fichier reste léger.
    expect(bytes.length).toBeLessThan(120_000);
  });

  it('caractères absents de la police : sans accent si possible, sinon « ? »', () => {
    const latinOnly = (cp: number) => cp < 0x80;
    expect(printable('Zoë Núñez', latinOnly)).toBe('Zoe Nunez');
    expect(printable('李 Lee', latinOnly)).toBe('? Lee');
    expect(printable('Zoë', () => true)).toBe('Zoë');
  });
});
