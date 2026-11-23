import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { keycloakLogoutUrl } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  const home = process.env.NEXTAUTH_URL ?? new URL('/', req.url).origin;
  return NextResponse.json({ url: keycloakLogoutUrl(token?.idToken, home) });
}
