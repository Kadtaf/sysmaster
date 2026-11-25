'use client';

import Link from 'next/link';
import { signIn, signOut, useSession } from 'next-auth/react';
import { useEffect } from 'react';
import { LayoutDashboard, LogIn, LogOut, PenLine, ShieldCheck, UserRound } from 'lucide-react';
import { EDITORIAL_ROLES, MODERATOR_ROLES } from '@/lib/labels';
import { Button, buttonVariants } from '@/components/ui/button';

export async function federatedSignOut() {
  const res = await fetch('/api/auth/federated-logout');
  const { url } = (await res.json()) as { url: string };
  await signOut({ redirect: false });
  window.location.href = url;
}

export function AuthButton() {
  const { data: session, status } = useSession();

  // Session Keycloak expirée ou révoquée : on repasse par la connexion plutôt que d'échouer en silence.
  useEffect(() => {
    if (session?.error === 'RefreshFailed') void signIn('keycloak');
  }, [session?.error]);

  if (status === 'loading') return <span className="h-8 w-24" aria-hidden />;
  if (!session) {
    return (
      <Button size="sm" onClick={() => signIn('keycloak')}>
        <LogIn className="size-4" aria-hidden /> Se connecter
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {session.user?.roles?.some((r) => EDITORIAL_ROLES.includes(r)) && (
        <Link href="/editorial" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <PenLine className="size-4" aria-hidden /> <span className="hidden sm:inline">Rédaction</span>
        </Link>
      )}
      {session.user?.roles?.some((r) => MODERATOR_ROLES.includes(r)) && (
        <Link href="/communaute/moderation" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <ShieldCheck className="size-4" aria-hidden /> <span className="hidden sm:inline">Modération</span>
        </Link>
      )}
      <Link href="/tableau-de-bord" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
        <LayoutDashboard className="size-4" aria-hidden /> <span className="hidden sm:inline">Tableau de bord</span>
      </Link>
      <Link href="/compte" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
        <UserRound className="size-4" aria-hidden /> {session.user?.name ?? 'Mon compte'}
      </Link>
      <Button variant="outline" size="sm" onClick={() => void federatedSignOut()} aria-label="Se déconnecter">
        <LogOut className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
