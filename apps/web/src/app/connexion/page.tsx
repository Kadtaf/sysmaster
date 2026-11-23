import type { Metadata } from 'next';
import { Fingerprint, KeyRound, ShieldCheck } from 'lucide-react';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { SignInButton } from './sign-in-button';

export const metadata: Metadata = { title: 'Connexion' };

const points = [
  { icon: Fingerprint, title: 'Passkeys', text: 'Connectez-vous avec l’empreinte, le visage ou le code de votre appareil, sans mot de passe.' },
  { icon: ShieldCheck, title: 'Double authentification', text: 'Ajoutez un code à usage unique (application TOTP) pour protéger votre compte.' },
  { icon: KeyRound, title: 'Comptes existants', text: 'E-mail, ou Google, Microsoft, GitHub et Apple quand l’administrateur les a activés.' },
];

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const { callbackUrl, error } = await searchParams;
  // N'accepter qu'un chemin interne, pour éviter une redirection ouverte vers un site tiers.
  const target = callbackUrl?.startsWith('/') && !callbackUrl.startsWith('//') ? callbackUrl : '/compte';
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-bold">Connexion</h1>
      <p className="mt-2 text-muted-foreground">
        La connexion passe par notre service d&apos;identité sécurisé. SysMaster ne voit jamais votre mot de passe.
      </p>
      {error && (
        <p role="alert" className="mt-4 rounded-md border border-red-300 p-3 text-sm text-red-700 dark:text-red-300">
          La connexion n&apos;a pas abouti. Réessayez ; si le problème persiste, contactez le support.
        </p>
      )}
      <div className="mt-6">
        <SignInButton callbackUrl={target} />
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {points.map(({ icon: Icon, title, text }) => (
          <Card key={title} className="p-5">
            <Icon className="size-5 text-primary" aria-hidden />
            <CardTitle className="mt-2 text-base">{title}</CardTitle>
            <CardDescription>{text}</CardDescription>
          </Card>
        ))}
      </div>
    </div>
  );
}
