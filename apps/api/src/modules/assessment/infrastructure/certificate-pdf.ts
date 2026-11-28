import { readFile } from 'node:fs/promises';
import fontkit from '@pdf-lib/fontkit';
import type { CertificateDto, Difficulty } from '@sysmaster/contracts';
import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import qrcode from 'qrcode-generator';
import { Injectable } from '@nestjs/common';
import { CertificateRenderer } from '../application/certification-ports';

const LEVELS: Record<Difficulty, string> = { beginner: 'débutant', intermediate: 'intermédiaire', advanced: 'avancé', expert: 'expert' };
const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.39, 0.45, 0.55);
const FRAME = rgb(0.8, 0.84, 0.88);

/** DejaVu : couvre les alphabets latins, grec et cyrillique, pour écrire tous les noms tels quels. */
let fonts: Promise<{ regular: Buffer; bold: Buffer }> | null = null;
function loadFonts() {
  fonts ??= Promise.all([
    readFile(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf')),
    readFile(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf')),
  ]).then(([regular, bold]) => ({ regular, bold }));
  return fonts;
}

const day = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { dateStyle: 'long', timeZone: 'UTC' });

/**
 * Remplace ce que la police ne sait pas dessiner : lettre sans accent si possible, sinon « ? ».
 * Un nom ne s'affiche jamais en carrés vides.
 */
export function printable(text: string, has: (codePoint: number) => boolean): string {
  return [...text.normalize('NFC')]
    .map((ch) => {
      if (has(ch.codePointAt(0)!)) return ch;
      const plain = ch.normalize('NFD').replace(/\p{M}/gu, '');
      return plain && [...plain].every((c) => has(c.codePointAt(0)!)) ? plain : '?';
    })
    .join('');
}

/**
 * Certificat au format PDF (A4 paysage), avec le même contenu que la page de vérification et un
 * QR code vectoriel vers elle. Le PDF n'est qu'une copie : la page /verify fait foi.
 */
export async function renderCertificatePdf(c: CertificateDto, verifyUrl: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const { regular, bold } = await loadFonts();
  const [font, strong] = await Promise.all([doc.embedFont(regular, { subset: true }), doc.embedFont(bold, { subset: true })]);
  const glyphs = new Set(font.getCharacterSet());
  const t = (s: string) => printable(s, (cp) => glyphs.has(cp));

  const issued = new Date(c.issuedAt);
  doc.setTitle(t(`Certificat ${c.certification.title} — ${c.holderName}`));
  doc.setAuthor('SysMaster');
  doc.setSubject(`Certificat ${c.serial}`);
  doc.setKeywords([c.serial, c.certification.code]);
  doc.setProducer('SysMaster');
  doc.setCreator('SysMaster');
  doc.setCreationDate(issued);
  doc.setModificationDate(issued);

  const page = doc.addPage([841.89, 595.28]);
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 24, y: 24, width: width - 48, height: height - 48, borderColor: FRAME, borderWidth: 3 });
  page.drawRectangle({ x: 32, y: 32, width: width - 64, height: height - 64, borderColor: FRAME, borderWidth: 1 });

  const centered = (text: string, y: number, size: number, f: PDFFont, color = INK, maxWidth = width - 140) => {
    let s = size;
    while (s > 10 && f.widthOfTextAtSize(text, s) > maxWidth) s -= 1;
    page.drawText(text, { x: (width - f.widthOfTextAtSize(text, s)) / 2, y, size: s, font: f, color });
  };

  centered('SYSMASTER  ·  CERTIFICAT', height - 90, 11, font, MUTED);
  centered(t(c.certification.title), height - 150, 30, strong);
  centered(t(`Niveau ${LEVELS[c.certification.level]} · ${c.certification.code}`), height - 175, 11, font, MUTED);
  centered('décerné à', height - 225, 13, font, MUTED);
  centered(t(c.holderName), height - 270, 34, font);
  centered('pour avoir réussi l’examen théorique de la certification et les labs pratiques exigés,', height - 310, 11, font, MUTED);
  centered('sur des pannes réelles simulées.', height - 326, 11, font, MUTED);

  const lines: [string, string][] = [
    ['Délivré le ', day(c.issuedAt)],
    [c.expiresAt ? 'Valable jusqu’au ' : 'Validité ', c.expiresAt ? day(c.expiresAt) : 'sans limite'],
    ['Numéro ', c.serial],
  ];
  let y = 150;
  for (const [label, value] of lines) {
    page.drawText(label, { x: 70, y, size: 11, font, color: MUTED });
    page.drawText(t(value), { x: 70 + font.widthOfTextAtSize(label, 11), y, size: 11, font: strong, color: INK });
    y -= 18;
  }
  page.drawText(t(`Vérification : ${verifyUrl}`), { x: 70, y: y - 4, size: 9, font, color: MUTED, maxWidth: 520 });
  page.drawText('Ce document est une copie. Seule la page de vérification fait foi : elle contrôle le statut et la', { x: 70, y: 72, size: 8, font, color: MUTED });
  page.drawText('signature numérique Ed25519 du certificat à chaque consultation.', { x: 70, y: 61, size: 8, font, color: MUTED });

  drawQr(page, verifyUrl, width - 70 - 110, 60, 110);
  return doc.save();
}

/** QR code dessiné en carrés (vectoriel, net à toute taille), avec sa marge blanche. */
function drawQr(page: PDFPage, data: string, x: number, y: number, size: number) {
  const qr = qrcode(0, 'M');
  qr.addData(data);
  qr.make();
  const n = qr.getModuleCount();
  const cell = size / (n + 4);
  page.drawRectangle({ x, y, width: size, height: size, color: rgb(1, 1, 1) });
  for (let r = 0; r < n; r++) {
    for (let col = 0; col < n; col++) {
      if (qr.isDark(r, col)) page.drawRectangle({ x: x + (col + 2) * cell, y: y + size - (r + 3) * cell, width: cell, height: cell, color: INK });
    }
  }
}

@Injectable()
export class PdfLibCertificateRenderer extends CertificateRenderer {
  pdf(certificate: CertificateDto, verifyUrl: string): Promise<Uint8Array> {
    return renderCertificatePdf(certificate, verifyUrl);
  }
}
