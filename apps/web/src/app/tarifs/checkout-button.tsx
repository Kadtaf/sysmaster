'use client';

import { signIn, useSession } from 'next-auth/react';
import { useState } from 'react';
import type { RedirectDto } from '@sysmaster/contracts';
import { Button } from '@/components/ui/button';
import { ApiError, apiPost } from '@/lib/client-api';

/** Ouvre la page de paiement Stripe (redirection complète : la carte n'est jamais saisie chez SysMaster). */
export function CheckoutButton({ plan, label }: { plan: string; label: string }) {
  const { data: session, status } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status !== 'loading' && !session?.accessToken) {
    return (
      <Button className="w-full" onClick={() => signIn('keycloak', { callbackUrl: '/tarifs' })}>
        Se connecter pour souscrire
      </Button>
    );
  }

  const go = async () => {
    setPending(true);
    setError(null);
    try {
      const { url } = await apiPost<RedirectDto>('/me/billing/checkout', session?.accessToken, { plan });
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Paiement indisponible pour le moment.');
      setPending(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button className="w-full" onClick={go} disabled={pending || status === 'loading'}>
        {pending ? 'Ouverture du paiement…' : label}
      </Button>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
