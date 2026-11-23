'use client';

import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { apiPut } from '@/lib/client-api';

/** Se retirer du classement (ou y revenir). L'XP et les badges restent comptés. */
export function VisibilityToggle({ visible }: { visible: boolean }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              await apiPut('/me/leaderboard-visibility', session?.accessToken, { visible: !visible });
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Modification impossible');
            }
          })
        }
      >
        {visible ? 'Me retirer du classement' : 'Apparaître dans le classement'}
      </Button>
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
