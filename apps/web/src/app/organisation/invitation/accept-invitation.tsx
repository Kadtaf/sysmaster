'use client';

import { useRouter } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { useEffect, useState, useTransition } from 'react';
import type { InvitationPreviewDto } from '@sysmaster/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { apiPost } from '@/lib/client-api';
import { organizationKindLabel, organizationRoleLabel } from '@/lib/labels';

const STATE_MESSAGE: Record<Exclude<InvitationPreviewDto['state'], 'pending'>, string> = {
  accepted: 'Cette invitation a déjà été utilisée.',
  revoked: 'Cette invitation a été annulée par l’organisation.',
  expired: 'Cette invitation a expiré : demandez-en une nouvelle à votre organisation.',
};

export function AcceptInvitation({ token, signedIn }: { token: string; signedIn: boolean }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [preview, setPreview] = useState<InvitationPreviewDto | null>(null);
  const [error, setError] = useState<string | null>(token.length < 20 ? 'Lien d’invitation incomplet.' : null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (token.length < 20) return;
    apiPost<InvitationPreviewDto>('/organizations/invitations/preview', undefined, { token })
      .then(setPreview)
      .catch(() => setError('Invitation introuvable. Vérifiez le lien reçu par e-mail.'));
  }, [token]);

  const accept = () =>
    startTransition(async () => {
      setError(null);
      try {
        const { organizationId } = await apiPost<{ organizationId: string }>('/organizations/invitations/accept', session?.accessToken, { token });
        router.push(`/organisation/${organizationId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Invitation impossible à accepter');
      }
    });

  if (error && !preview) return <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!preview) return <p className="text-sm text-muted-foreground">Chargement de l’invitation…</p>;

  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>{preview.organization}</CardTitle>
        <CardDescription>
          {organizationKindLabel[preview.kind]} · vous êtes invité·e en tant que {organizationRoleLabel[preview.role].toLowerCase()},
          à l’adresse {preview.emailHint}.
        </CardDescription>
      </div>
      {preview.state !== 'pending' ? (
        <p role="status" className="text-sm">{STATE_MESSAGE[preview.state]}</p>
      ) : (
        <>
          <div className="space-y-2 text-sm">
            <p>Votre organisation vous offre l’accès Pro tant que sa licence est en cours.</p>
            <p>
              Elle verra votre progression : niveau, XP, leçons, labs résolus, parcours et certifications valides.
              Elle ne verra jamais vos conversations avec l’assistant, vos diagnostics ni vos messages privés.
              Vous pourrez quitter l’organisation à tout moment.
            </p>
          </div>
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {signedIn ? (
            <Button onClick={accept} disabled={pending}>Accepter et rejoindre</Button>
          ) : (
            <Button onClick={() => signIn('keycloak', { callbackUrl: `/organisation/invitation?token=${encodeURIComponent(token)}` })}>
              Se connecter avec l’adresse invitée
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
