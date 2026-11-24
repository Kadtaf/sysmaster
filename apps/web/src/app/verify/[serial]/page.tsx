import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import qrcode from 'qrcode-generator';
import type { CertificateDto, CertificateStatus } from '@sysmaster/contracts';
import { BadgeCheck, ShieldAlert } from 'lucide-react';
import { ApiUnavailable } from '@/components/api-unavailable';
import { apiGet, ApiUnavailableError } from '@/lib/api';
import { difficultyLabel } from '@/lib/labels';
import { PrintButton } from './print-button';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ serial: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Vérification du certificat ${(await params).serial}`, robots: { index: false } };
}

const STATUS: Record<CertificateStatus, string> = { valid: 'Certificat valide', expired: 'Certificat expiré', revoked: 'Certificat révoqué' };
const day = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { dateStyle: 'long', timeZone: 'UTC' });

/** QR code (SVG) vers cette page de vérification : on scanne le papier, on lit la vérité ici. */
function qrSvg(url: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  return qr.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
}

/**
 * Vérification publique d'un certificat, et certificat imprimable. La page fait foi : statut
 * (valide, expiré, révoqué) et signature vérifiés par l'API au moment de la consultation.
 */
export default async function VerifyPage({ params }: Props) {
  const { serial } = await params;
  let c: CertificateDto | null;
  try {
    c = await apiGet<CertificateDto>(`/certificates/${encodeURIComponent(serial)}`);
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  if (!c) notFound();
  const site = (process.env.NEXTAUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const url = `${site}/verify/${c.serial}`;
  const trusted = c.status === 'valid' && c.signatureValid;

  return (
    <div className="space-y-8">
      <div
        role="status"
        className={`flex items-start gap-3 rounded-lg border p-4 print:hidden ${trusted ? 'border-green-600/40 bg-green-50 dark:bg-green-950/30' : 'border-red-600/40 bg-red-50 dark:bg-red-950/30'}`}
      >
        {trusted ? <BadgeCheck className="mt-0.5 size-5 text-green-700" aria-hidden /> : <ShieldAlert className="mt-0.5 size-5 text-red-700" aria-hidden />}
        <div>
          <p className="font-semibold">{c.signatureValid ? STATUS[c.status] : 'Signature invalide : ce certificat ne doit pas être considéré comme authentique'}</p>
          <p className="text-sm text-muted-foreground">
            {c.status === 'revoked' && `Révoqué le ${day(c.revokedAt!)} : ${c.revokeReason}. `}
            {c.status === 'expired' && `Arrivé à échéance le ${day(c.expiresAt!)}. `}
            Vérifié à l’instant auprès de SysMaster (numéro, titulaire, dates et signature numérique Ed25519).
          </p>
        </div>
      </div>

      <section
        aria-label="Certificat"
        className="mx-auto max-w-3xl rounded-xl border-4 border-double border-slate-300 bg-white p-10 text-center text-slate-900 shadow-sm print:border-slate-400 print:shadow-none"
      >
        <p className="text-sm uppercase tracking-[0.3em] text-slate-500">SysMaster · Certificat</p>
        <h1 className="mt-6 text-3xl font-bold">{c.certification.title}</h1>
        <p className="mt-1 text-sm text-slate-500">Niveau {difficultyLabel[c.certification.level].toLowerCase()} · {c.certification.code}</p>
        <p className="mt-8 text-slate-600">décerné à</p>
        <p className="mt-2 font-serif text-4xl">{c.holderName}</p>
        <p className="mx-auto mt-6 max-w-xl text-sm text-slate-600">
          pour avoir réussi l’examen théorique de la certification et les labs pratiques exigés, sur des pannes réelles simulées.
        </p>
        <div className="mt-10 flex flex-wrap items-end justify-between gap-6 text-left text-sm">
          <dl className="space-y-1">
            <div><dt className="inline text-slate-500">Délivré le </dt><dd className="inline">{day(c.issuedAt)}</dd></div>
            <div><dt className="inline text-slate-500">{c.expiresAt ? 'Valable jusqu’au ' : 'Validité '}</dt><dd className="inline">{c.expiresAt ? day(c.expiresAt) : 'sans limite'}</dd></div>
            <div><dt className="inline text-slate-500">Numéro </dt><dd className="inline font-mono">{c.serial}</dd></div>
            <div className="max-w-xs break-all text-xs text-slate-500">Vérification : {url}</div>
          </dl>
          <div className="w-28" aria-label="QR code vers la page de vérification" dangerouslySetInnerHTML={{ __html: qrSvg(url) }} />
        </div>
      </section>

      <div className="flex flex-wrap justify-center gap-3 print:hidden">
        <PrintButton />
        {trusted && (
        <a
          className="inline-flex items-center rounded-md border px-4 py-2 text-sm hover:bg-muted"
          href={`https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(c.certification.title)}&organizationName=SysMaster&certId=${encodeURIComponent(c.serial)}&certUrl=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Ajouter à LinkedIn
        </a>
        )}
      </div>
    </div>
  );
}
