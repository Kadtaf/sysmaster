'use client';

import { useSession } from 'next-auth/react';
import { useState } from 'react';
import type { RedirectDto } from '@sysmaster/contracts';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiError, apiPost } from '@/lib/client-api';

/** Portail Stripe : carte, changement d'offre, résiliation, factures. */
export function ManageButton() {
  const { data: session } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setPending(true);
    setError(null);
    try {
      const { url } = await apiPost<RedirectDto>('/me/billing/portal', session?.accessToken);
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Portail indisponible pour le moment.');
      setPending(false);
    }
  };
  return (
    <div className="space-y-2">
      <Button variant="outline" onClick={go} disabled={pending || !session?.accessToken}>
        {pending ? 'Ouverture…' : 'Gérer mon abonnement'} <ExternalLink className="size-4" aria-hidden />
      </Button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
