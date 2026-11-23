'use client';

import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';

export function SignInButton({ callbackUrl }: { callbackUrl: string }) {
  return (
    <Button size="lg" onClick={() => signIn('keycloak', { callbackUrl })}>
      Continuer vers la connexion sécurisée
    </Button>
  );
}
