import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { ExternalLink } from 'lucide-react';
import { ApiUnavailable } from '@/components/api-unavailable';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { ApiUnavailableError, apiGet } from '@/lib/api';
import { accountSecurityUrl, authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Mon compte' };

interface Me {
  id: string;
  email: string;
  displayName: string;
  locale: string;
  createdAt: string;
  roles: string[];
  entitlements: { feature: string; value: unknown; source: string }[];
}

const roleLabels: Record<string, string> = {
  learner: 'Apprenant', mentor: 'Mentor', author: 'Auteur', reviewer: 'Relecteur',
  moderator: 'Modérateur', support: 'Support', admin: 'Administrateur', super_admin: 'Super administrateur',
};

export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) redirect('/connexion?callbackUrl=/compte');

  let me: Me | null;
  try {
    me = await apiGet<Me>('/me', session.accessToken);
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  if (!me) redirect('/connexion?callbackUrl=/compte');

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Mon compte</h1>
      <Card>
        <CardTitle>{me.displayName}</CardTitle>
        <CardDescription>{me.email}</CardDescription>
        <div className="mt-4 flex flex-wrap gap-2">
          {me.roles.map((r) => <Badge key={r}>{roleLabels[r] ?? r}</Badge>)}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Membre depuis le {new Date(me.createdAt).toLocaleDateString('fr-FR', { dateStyle: 'long' })}
        </p>
      </Card>

      <Card>
        <CardTitle>Sécurité</CardTitle>
        <CardDescription>
          Mot de passe, double authentification (TOTP) et passkeys se gèrent dans l&apos;espace sécurité. Une passkey
          remplace le mot de passe : elle ne peut pas être hameçonnée, car elle ne fonctionne que sur le vrai site.
        </CardDescription>
        <a href={accountSecurityUrl} className={`${buttonVariants({ variant: 'outline' })} mt-4`} target="_blank" rel="noopener noreferrer">
          Gérer la sécurité du compte <ExternalLink className="size-4" aria-hidden />
        </a>
      </Card>

      <Card>
        <CardTitle>Droits de l&apos;offre</CardTitle>
        {me.entitlements.length === 0 ? (
          <CardDescription>Offre gratuite. Les offres Premium et Pro arriveront avec le module de paiement.</CardDescription>
        ) : (
          <ul className="mt-3 space-y-1 text-sm">
            {me.entitlements.map((e) => (
              <li key={e.feature}><code className="font-mono">{e.feature}</code> : {JSON.stringify(e.value)}</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
