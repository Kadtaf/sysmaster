import type { OrganizationRole } from '@sysmaster/contracts';

const ROLE_LABEL: Record<OrganizationRole, string> = {
  org_owner: 'propriétaire', org_admin: 'gestionnaire', instructor: 'formateur ou formatrice', member: 'membre',
};

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * E-mail d'invitation à une organisation : texte et HTML, sans image ni pisteur. Il dit ce que
 * l'organisation verra (la progression, jamais les conversations avec l'assistant).
 */
export function renderInvitationEmail(i: { organization: string; inviter: string | null; role: OrganizationRole; link: string; expiresAt: string }) {
  const until = new Date(i.expiresAt).toLocaleDateString('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' });
  const who = i.inviter ? `${i.inviter} vous invite` : 'Vous êtes invité·e';
  const intro = `${who} à rejoindre ${i.organization} sur SysMaster en tant que ${ROLE_LABEL[i.role]}.`;
  const seat = 'Votre organisation vous offre un accès Pro (assistant, labs, remise sur les certifications).';
  const sees = 'Elle verra votre progression (niveau, leçons, labs, parcours, certifications), jamais vos conversations avec l’assistant ni vos diagnostics.';
  const text = [intro, '', seat, sees, '', `Accepter l’invitation (valable jusqu’au ${until}) : ${i.link}`, '', 'Si vous ne connaissez pas cette organisation, ignorez cet e-mail.'].join('\n');
  const html = `<!doctype html><html lang="fr"><body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:560px;margin:0 auto;padding:24px">
<p style="font-size:12px;letter-spacing:.2em;color:#64748b">SYSMASTER</p>
<h1 style="font-size:20px">Invitation : ${escape(i.organization)}</h1>
<p>${escape(intro)}</p>
<p>${escape(seat)}</p>
<p>${escape(sees)}</p>
<p><a href="${escape(i.link)}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Accepter l’invitation</a></p>
<p style="font-size:12px;color:#64748b">Lien valable jusqu’au ${escape(until)}. Si vous ne connaissez pas cette organisation, ignorez cet e-mail.</p>
</body></html>`;
  return { subject: `Invitation à rejoindre ${i.organization} sur SysMaster`, text, html };
}
