import Link from 'next/link';
import { Cpu } from 'lucide-react';
import { AuthButton } from '@/components/auth-button';

const links = [
  { href: '/parcours', label: 'Parcours' },
  { href: '/commandes', label: 'Base de connaissances' },
  { href: '/diagnostic', label: 'Diagnostic' },
  { href: '/assistant', label: 'Assistant' },
  { href: '/classement', label: 'Classement' },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3" aria-label="Navigation principale">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Cpu className="size-5 text-primary" aria-hidden />
          SysMaster
        </Link>
        <ul className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="hover:text-foreground">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="ml-auto">
          <AuthButton />
        </div>
      </nav>
    </header>
  );
}
