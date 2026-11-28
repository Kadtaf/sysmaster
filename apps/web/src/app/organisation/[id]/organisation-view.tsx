'use client';

import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useState, useTransition } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { INVITABLE_ROLES } from '@sysmaster/contracts';
import type { OrganizationDetailDto, OrganizationInvitationDto, OrganizationProgressDto, OrganizationRole } from '@sysmaster/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { publicApiBase } from '@/lib/api';
import { apiRequest } from '@/lib/client-api';
import { licenceStateLabel, organizationKindLabel, organizationRoleLabel } from '@/lib/labels';

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { dateStyle: 'long' }) : '—');
const field = 'mt-1 w-full rounded-md border bg-card p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

function CopyLink({ link }: { link: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void navigator.clipboard.writeText(link).then(() => setDone(true))}
    >
      {done ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {done ? 'Lien copié' : 'Copier le lien'}
    </Button>
  );
}

export function OrganisationView({ org, progress, myId }: { org: OrganizationDetailDto; progress: OrganizationProgressDto | null; myId: string }) {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [emails, setEmails] = useState('');
  const [role, setRole] = useState<(typeof INVITABLE_ROLES)[number]>('member');
  const [sent, setSent] = useState<{ invitations: OrganizationInvitationDto[]; skipped: string[] } | null>(null);
  const free = org.seats - org.seatsUsed;

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      setError(null);
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Opération impossible');
      }
    });

  const invite = (e: React.FormEvent) => {
    e.preventDefault();
    const list = emails.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (!list.length) return;
    run(async () => {
      const res = await apiRequest<{ invitations: OrganizationInvitationDto[]; skipped: string[] }>('POST', `/organizations/${org.id}/invitations`, token, { emails: list, role });
      setSent(res);
      setEmails('');
    });
  };

  const downloadCsv = () =>
    run(async () => {
      const res = await fetch(`${publicApiBase}/organizations/${org.id}/progress.csv`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Export impossible');
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement('a'), { href: url, download: `progression-${org.slug}.csv` });
      a.click();
      URL.revokeObjectURL(url);
    });

  const leave = () => {
    if (!confirm(`Quitter ${org.name} ? Vous perdrez l’accès donné par sa licence.`)) return;
    run(async () => {
      await apiRequest('DELETE', `/organizations/${org.id}/members/${myId}`, token);
      router.push('/organisation');
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-bold">{org.name}</h1>
          <Badge>{organizationKindLabel[org.kind]}</Badge>
        </div>
        <p className="mt-2 text-muted-foreground">
          Votre rôle : {organizationRoleLabel[org.role]}. {licenceStateLabel[org.licence.state]}
          {org.licence.endsAt && ` (fin le ${date(org.licence.endsAt)})`}.
        </p>
      </div>

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <Card>
        <CardTitle>Sièges</CardTitle>
        <p className="mt-2 text-2xl font-semibold">{org.seatsUsed} / {org.seats}</p>
        <CardDescription>
          Chaque membre occupe un siège, et chaque invitation en attente en réserve un jusqu’à son expiration.
          Un siège donne l’accès Pro tant que la licence est en cours. Pour plus de sièges ou une prolongation, contactez SysMaster.
        </CardDescription>
      </Card>

      {org.canManage && (
        <Card className="space-y-4">
          <CardTitle>Inviter des membres</CardTitle>
          <form onSubmit={invite} className="space-y-3">
            <label className="block text-sm font-medium">
              Adresses e-mail (une par ligne, ou séparées par des virgules)
              <textarea rows={4} value={emails} onChange={(e) => setEmails(e.target.value)} className={field} autoComplete="off" />
            </label>
            <label className="block text-sm font-medium">
              Rôle
              <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className={field}>
                {INVITABLE_ROLES.map((r) => <option key={r} value={r}>{organizationRoleLabel[r]}</option>)}
              </select>
            </label>
            <p className="text-xs text-muted-foreground">
              {free > 0 ? `${free} siège(s) libre(s).` : 'Plus aucun siège libre.'} La personne doit se connecter avec l’adresse invitée.
              Le lien est valable 14 jours.
            </p>
            <Button type="submit" disabled={pending || free <= 0 || org.licence.state !== 'active'}>Inviter</Button>
          </form>
          {sent && (
            <div role="status" className="space-y-2 rounded-md border p-3 text-sm">
              <p className="font-medium">{sent.invitations.length} invitation(s) créée(s).</p>
              {sent.skipped.length > 0 && <p>Déjà membres ou déjà invités : {sent.skipped.join(', ')}.</p>}
              <ul className="space-y-2">
                {sent.invitations.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-2">
                    <span className="break-all">{i.email}</span>
                    {i.emailed ? <Badge>e-mail envoyé</Badge> : i.link && <CopyLink link={i.link} />}
                  </li>
                ))}
              </ul>
              {sent.invitations.some((i) => !i.emailed) && (
                <p className="text-xs text-muted-foreground">Les e-mails ne sont pas encore activés : transmettez vous-même ces liens. Ils ne seront plus affichés.</p>
              )}
            </div>
          )}
          {org.invitations.length > 0 && (
            <div>
              <h2 className="text-base font-semibold">Invitations en attente</h2>
              <ul className="mt-2 divide-y rounded-md border text-sm">
                {org.invitations.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <span className="break-all">{i.email} · {organizationRoleLabel[i.role]} · expire le {date(i.expiresAt)}</span>
                    <Button variant="outline" size="sm" disabled={pending}
                      onClick={() => run(() => apiRequest('DELETE', `/organizations/${org.id}/invitations/${i.id}`, token))}>
                      Annuler
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      <Card>
        <CardTitle>Membres ({org.members.length})</CardTitle>
        <ul className="mt-3 divide-y text-sm">
          {org.members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-medium">{m.displayName}</span>
                {m.email && <span className="text-muted-foreground"> · {m.email}</span>}
              </span>
              {org.canManage && m.role !== 'org_owner' && m.userId !== myId ? (
                <span className="flex items-center gap-2">
                  <label className="sr-only" htmlFor={`role-${m.userId}`}>Rôle de {m.displayName}</label>
                  <select id={`role-${m.userId}`} value={m.role} disabled={pending} className="rounded-md border bg-card p-1 text-sm"
                    onChange={(e) => run(() => apiRequest('PATCH', `/organizations/${org.id}/members/${m.userId}`, token, { role: e.target.value as OrganizationRole }))}>
                    {INVITABLE_ROLES.map((r) => <option key={r} value={r}>{organizationRoleLabel[r]}</option>)}
                  </select>
                  <Button variant="outline" size="sm" disabled={pending}
                    onClick={() => confirm(`Retirer ${m.displayName} ? Son siège sera libéré.`) && run(() => apiRequest('DELETE', `/organizations/${org.id}/members/${m.userId}`, token))}>
                    Retirer
                  </Button>
                </span>
              ) : (
                <Badge>{organizationRoleLabel[m.role]}</Badge>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {progress && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Progression des membres</CardTitle>
            <Button variant="outline" size="sm" onClick={downloadCsv} disabled={pending}>
              <Download className="size-4" aria-hidden /> Exporter en CSV
            </Button>
          </div>
          <CardDescription>
            Ce que vous voyez : niveau, XP, leçons, labs, parcours et certifications valides. Jamais les conversations avec l’assistant,
            les diagnostics ni les messages privés.
          </CardDescription>
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tableau de progression">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-medium">Nom</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Niveau</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Leçons</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Labs</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Parcours</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Certifications</th>
                  <th scope="col" className="py-2 font-medium">Dernière activité</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {progress.members.map((m) => (
                  <tr key={m.userId}>
                    <th scope="row" className="py-2 pr-3 font-medium">{m.displayName}</th>
                    <td className="py-2 pr-3">{m.level} ({m.totalXp} XP)</td>
                    <td className="py-2 pr-3">{m.lessonsCompleted}</td>
                    <td className="py-2 pr-3">{m.labsSolved}</td>
                    <td className="py-2 pr-3">{m.paths.map((p) => `${p.title} : ${p.completedAt ? 'terminé' : `${p.progressPct} %`}`).join(' · ') || '—'}</td>
                    <td className="py-2 pr-3">{m.certificates.map((c) => c.title).join(', ') || '—'}</td>
                    <td className="py-2">{m.lastActivity ? date(m.lastActivity) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {org.role !== 'org_owner' && (
        <Button variant="outline" onClick={leave} disabled={pending}>Quitter l’organisation</Button>
      )}
    </div>
  );
}
