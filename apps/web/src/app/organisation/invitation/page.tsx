import type { Metadata } from 'next';
import { serverAccessToken } from '@/lib/session';
import { AcceptInvitation } from './accept-invitation';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Invitation à une organisation', robots: { index: false } };

type Props = { searchParams: Promise<{ token?: string }> };

export default async function InvitationPage({ searchParams }: Props) {
  const { token } = await searchParams;
  const signedIn = Boolean(await serverAccessToken());
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-bold">Invitation</h1>
      <AcceptInvitation token={token ?? ''} signedIn={signedIn} />
    </div>
  );
}
