import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/** Jeton d'accès de l'utilisateur connecté côté serveur, ou undefined pour un visiteur. */
export async function serverAccessToken(): Promise<string | undefined> {
  const session = await getServerSession(authOptions);
  return session?.error ? undefined : session?.accessToken;
}
