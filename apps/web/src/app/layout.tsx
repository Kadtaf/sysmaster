import type { Metadata } from 'next';
import Link from 'next/link';
import { Providers } from '@/components/providers';
import { SiteHeader } from '@/components/site-header';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'SysMaster — apprendre, comprendre, diagnostiquer', template: '%s · SysMaster' },
  description: 'Académie, laboratoire, assistant IA, diagnostic et certifications pour les métiers de l’informatique.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen font-sans antialiased">
        <Providers>
          <SiteHeader />
          <main className="mx-auto max-w-6xl px-4 py-10">{children}</main>
          <footer className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-4 py-10 text-sm text-muted-foreground print:hidden">
            <span>SysMaster AI Platform. Comprendre avant d&apos;exécuter.</span>
            <Link href="/confidentialite" className="hover:underline">Confidentialité et données personnelles</Link>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
