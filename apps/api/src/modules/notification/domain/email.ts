import { createHmac, timingSafeEqual } from 'node:crypto';
import { NOTIFICATION_TYPES, NotificationType } from '@sysmaster/contracts';

/**
 * E-mail activé par défaut seulement pour ce qui attend une action ou un résultat important ;
 * les réponses du forum, plus nombreuses, restent dans l'application tant qu'on ne les demande pas.
 */
export function emailByDefault(type: NotificationType): boolean {
  return type === 'mentorship' || type === 'certificate_issued' || type === 'editorial_review';
}

/** Essais d'envoi, puis abandon : 1 min, 5 min, 30 min, 2 h. */
export const MAX_EMAIL_ATTEMPTS = 5;
const DELAYS_S = [60, 300, 1800, 7200];
export function nextAttemptAt(attempts: number, now: Date): Date | null {
  if (attempts >= MAX_EMAIL_ATTEMPTS) return null;
  return new Date(now.getTime() + DELAYS_S[Math.min(attempts - 1, DELAYS_S.length - 1)] * 1000);
}

const b64 = (b: Buffer) => b.toString('base64url');
const mac = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest();

/** Jeton du lien de désabonnement : qui, et de quel type d'e-mail. Signé, sans date d'expiration. */
export function unsubscribeToken(userId: string, type: NotificationType, secret: string): string {
  const data = `${userId}.${type}`;
  return `${b64(Buffer.from(data))}.${b64(mac(secret, data))}`;
}

export function readUnsubscribeToken(token: string, secret: string): { userId: string; type: NotificationType } | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const data = Buffer.from(payload, 'base64url').toString();
  const expected = mac(secret, data);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const [userId, type] = data.split('.');
  if (!/^[0-9a-f-]{36}$/i.test(userId ?? '') || !(NOTIFICATION_TYPES as readonly string[]).includes(type)) return null;
  return { userId, type: type as NotificationType };
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Message court, texte et HTML, sans image ni pisteur. Le titre fixe sert d'objet. */
export function renderEmail(n: { title: string; body: string | null; href: string | null }, links: { site: string; unsubscribe: string }) {
  const url = n.href ? `${links.site}${n.href}` : `${links.site}/notifications`;
  const text = [
    n.title,
    n.body ?? '',
    '',
    `Voir sur SysMaster : ${url}`,
    '',
    '—',
    'Vous recevez cet e-mail parce que ce type de notification est activé dans votre compte SysMaster.',
    `Ne plus recevoir ce type d'e-mail : ${links.unsubscribe}`,
    `Régler toutes vos notifications : ${links.site}/notifications`,
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
  const html = `<!doctype html><html lang="fr"><body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:560px;margin:0 auto;padding:24px">
<p style="font-size:12px;letter-spacing:.2em;color:#64748b">SYSMASTER</p>
<h1 style="font-size:20px">${escape(n.title)}</h1>
${n.body ? `<p>${escape(n.body)}</p>` : ''}
<p><a href="${escape(url)}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Voir sur SysMaster</a></p>
<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
<p style="font-size:12px;color:#64748b">Vous recevez cet e-mail parce que ce type de notification est activé dans votre compte SysMaster.
<a href="${escape(links.unsubscribe)}" style="color:#64748b">Ne plus recevoir ce type d'e-mail</a> ·
<a href="${escape(`${links.site}/notifications`)}" style="color:#64748b">Régler mes notifications</a></p>
</body></html>`;
  return { subject: `SysMaster : ${n.title}`, text, html };
}
