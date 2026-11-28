'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/** Liens de l'en-tête : la rubrique courante est annoncée (aria-current) et marquée autrement que par la couleur. */
export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-wrap gap-4 text-sm text-muted-foreground">
      {links.map((l) => {
        const current = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={current ? 'page' : undefined}
              className={cn('hover:text-foreground', current && 'font-medium text-foreground underline underline-offset-4')}
            >
              {l.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
