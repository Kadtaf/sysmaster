import { salesContact } from '@/lib/sales';

/** Lien vers le contact commercial, ou mention à compléter tant qu'il n'est pas configuré. */
export function SalesContact({ subject = 'Demande de devis SysMaster' }: { subject?: string }) {
  if (!salesContact) return <span>[adresse de contact commercial à renseigner]</span>;
  return (
    <a href={`mailto:${salesContact}?subject=${encodeURIComponent(subject)}`} className="link">
      {salesContact}
    </a>
  );
}
