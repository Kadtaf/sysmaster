'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { apiRequest } from '@/lib/client-api';

const REFRESH_MS = 60_000;

/** Cloche de l'en-tête : nombre de notifications non lues, rafraîchi chaque minute et à chaque page. */
export function NotificationBell() {
  const { data: session } = useSession();
  const token = session?.error ? undefined : session?.accessToken;
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!token) return;
    let stopped = false;
    const load = () => {
      if (document.visibilityState !== 'visible') return;
      apiRequest<{ unread: number }>('GET', '/me/notifications/unread', token)
        .then((r) => !stopped && setUnread(r.unread))
        .catch(() => undefined); // API indisponible : la pastille garde sa dernière valeur
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    document.addEventListener('visibilitychange', load);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
    };
  }, [token, pathname]);

  if (!token) return null;
  const label = unread ? `Notifications (${unread} non lue${unread > 1 ? 's' : ''})` : 'Notifications';
  return (
    <Link href="/notifications" className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'relative' })} aria-label={label} title={label}>
      <Bell className="size-4" aria-hidden />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-4 text-white" aria-hidden>
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
