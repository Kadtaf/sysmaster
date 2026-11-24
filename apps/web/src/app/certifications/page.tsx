import type { Metadata } from 'next';
import Link from 'next/link';
import type { CertificationDto } from '@sysmaster/contracts';
import { ApiUnavailable } from '@/components/api-unavailable';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { apiGet, ApiUnavailableError } from '@/lib/api';
import { difficultyLabel } from '@/lib/labels';
import { serverAccessToken } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Certifications' };

export default async function CertificationsPage() {
  const token = await serverAccessToken();
  let certs: CertificationDto[] | null;
  try {
    certs = await apiGet<CertificationDto[]>('/certifications', token);
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  return (
    <>
      <h1 className="text-3xl font-bold">Certifications</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Une certification prouve que vous savez faire, pas seulement réciter : un examen chronométré tiré au sort, et des
        labs pratiques à réussir avant. Chaque certificat porte un numéro et une signature que n’importe qui peut vérifier.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {(certs ?? []).map((c) => (
          <Link key={c.code} href={`/certifications/${c.code}`} className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Card className="h-full transition-colors hover:bg-muted/50">
              <div className="flex flex-wrap gap-2">
                <Badge>{difficultyLabel[c.level]}</Badge>
                {c.me?.certificate?.status === 'valid' && <Badge>Obtenue</Badge>}
                {!c.exam.available && <Badge>Bientôt</Badge>}
              </div>
              <CardTitle className="mt-3">{c.title}</CardTitle>
              <CardDescription>{c.description}</CardDescription>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
