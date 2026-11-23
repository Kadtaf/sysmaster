'use client';

import { useRouter } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { apiPost } from '@/lib/client-api';

export function EnrollButton({ slug, signedIn }: { slug: string; signedIn: boolean }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!signedIn) {
    return <Button onClick={() => signIn('keycloak', { callbackUrl: `/parcours/${slug}` })}>Se connecter pour s&apos;inscrire</Button>;
  }
  return (
    <div>
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              await apiPost(`/learning/paths/${slug}/enroll`, session?.accessToken);
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Inscription impossible');
            }
          })
        }
      >
        S&apos;inscrire au parcours
      </Button>
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
