import type { Metadata } from 'next';
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
          <footer className="mx-auto max-w-6xl px-4 py-10 text-sm text-muted-foreground print:hidden">
            SysMaster AI Platform. Comprendre avant d&apos;exécuter.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
