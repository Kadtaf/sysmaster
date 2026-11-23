'use client';

import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useState, useTransition } from 'react';
import type { RevisionDto } from '@sysmaster/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { apiRequest } from '@/lib/client-api';

export function NewRevision() {
  const { data: session } = useSession();
  const router = useRouter();
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const create = (fromSlug?: string) =>
    startTransition(async () => {
      setError(null);
      try {
        const r = await apiRequest<RevisionDto>('POST', '/editorial/revisions', session?.accessToken, fromSlug ? { fromSlug } : {});
        router.push(`/editorial/${r.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Création impossible');
      }
    });

  return (
    <Card className="space-y-4">
      <CardTitle>Contribuer</CardTitle>
      <div className="flex flex-wrap items-end gap-3">
        <Button disabled={pending} onClick={() => create()}>Nouvelle fiche</Button>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (slug.trim()) create(slug.trim());
          }}
        >
          <label className="text-sm">
            <span className="block text-muted-foreground">ou modifier la fiche</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="linux-systemctl"
              className="mt-1 w-56 rounded-md border bg-background px-3 py-2 font-mono text-sm"
            />
          </label>
          <Button type="submit" variant="outline" disabled={pending || !slug.trim()}>Proposer une modification</Button>
        </form>
      </div>
      <CardDescription>L&apos;identifiant est la fin de l&apos;adresse de la fiche : /commandes/<strong>linux-systemctl</strong>.</CardDescription>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </Card>
  );
}
