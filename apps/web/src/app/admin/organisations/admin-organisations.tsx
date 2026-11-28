'use client';

import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useState, useTransition } from 'react';
import { ORGANIZATION_KINDS } from '@sysmaster/contracts';
import type { AdminOrganizationDto, OrganizationInvitationDto } from '@sysmaster/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { apiRequest } from '@/lib/client-api';
import { licenceStateLabel, organizationKindLabel } from '@/lib/labels';

const field = 'mt-1 w-full rounded-md border bg-card p-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-ring';
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
const endOfDay = (d: string) => new Date(`${d}T23:59:59`).toISOString();
const inOneYear = () => new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);

function EditRow({ org, onSave, pending }: { org: AdminOrganizationDto; onSave: (patch: { seats: number; licenceEndsAt: string }) => void; pending: boolean }) {
  const [seats, setSeats] = useState(String(org.seats));
  const [ends, setEnds] = useState(day(org.licence.endsAt));
  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ seats: Number(seats), licenceEndsAt: endOfDay(ends) });
      }}
    >
      <label className="text-sm font-medium">
        Sièges
        <input type="number" min={Math.max(1, org.seatsUsed)} value={seats} onChange={(e) => setSeats(e.target.value)} className={`${field} w-28`} />
      </label>
      <label className="text-sm font-medium">
        Fin de licence
        <input type="date" value={ends} onChange={(e) => setEnds(e.target.value)} className={field} required />
      </label>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>Enregistrer</Button>
    </form>
  );
}

type SeatPlan = { code: string; name: string; priceCents: number | null };

function SeatPrices({ plans, enabled, onSave, pending }: {
  plans: SeatPlan[]; enabled: boolean; onSave: (code: string, priceCents: number | null) => void; pending: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(plans.map((p) => [p.code, p.priceCents === null ? '' : (p.priceCents / 100).toFixed(2)])),
  );
  return (
    <Card>
      <CardTitle>Achat en ligne des sièges</CardTitle>
      <CardDescription>
        Prix TTC d’un siège pour 12 mois. Vide : ce type de licence reste sur devis. {enabled ? '' : 'Le paiement Stripe n’est pas encore configuré : rien n’est achetable tant que les clés manquent.'}
      </CardDescription>
      <ul className="mt-4 space-y-3">
        {plans.map((p) => (
          <li key={p.code}>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const raw = (values[p.code] ?? '').replace(',', '.').trim();
                onSave(p.code, raw === '' ? null : Math.round(Number(raw) * 100));
              }}
            >
              <label className="text-sm font-medium">
                {p.name} (€ par siège et par an)
                <input inputMode="decimal" value={values[p.code] ?? ''} onChange={(e) => setValues({ ...values, [p.code]: e.target.value })}
                  className={`${field} w-32`} placeholder="sur devis" pattern="[0-9]+([.,][0-9]{1,2})?" />
              </label>
              <Button type="submit" variant="outline" size="sm" disabled={pending}>Enregistrer</Button>
            </form>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function AdminOrganisations({ organizations, seatPlans, paymentEnabled }: {
  organizations: AdminOrganizationDto[]; seatPlans: SeatPlan[]; paymentEnabled: boolean;
}) {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<OrganizationInvitationDto | null>(null);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ name: '', slug: '', kind: 'company', seats: '10', ends: inOneYear(), ownerEmail: '' });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

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

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const res = await apiRequest<{ ownerInvitation: OrganizationInvitationDto }>('POST', '/admin/organizations', token, {
        name: form.name, slug: form.slug, kind: form.kind, seats: Number(form.seats), licenceEndsAt: endOfDay(form.ends), ownerEmail: form.ownerEmail,
      });
      setCreated(res.ownerInvitation);
      setForm({ ...form, name: '', slug: '', ownerEmail: '' });
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Licences des organisations</h1>
        <p className="mt-2 text-muted-foreground">Ouvrir une licence après devis, ajuster les sièges ou la date de fin. Chaque action est journalisée.</p>
      </div>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <SeatPrices
        plans={seatPlans}
        enabled={paymentEnabled}
        pending={pending}
        onSave={(code, priceCents) => run(() => apiRequest('PATCH', `/admin/organizations/seat-prices/${code}`, token, { priceCents }))}
      />

      <Card>
        <CardTitle>Nouvelle licence</CardTitle>
        <form onSubmit={create} className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">Nom<input value={form.name} onChange={set('name')} className={field} required minLength={2} /></label>
          <label className="text-sm font-medium">
            Identifiant (minuscules, chiffres, tirets)
            <input value={form.slug} onChange={set('slug')} className={field} required pattern="[a-z0-9](?:[a-z0-9\-]{0,58}[a-z0-9])?" />
          </label>
          <label className="text-sm font-medium">
            Type
            <select value={form.kind} onChange={set('kind')} className={field}>
              {ORGANIZATION_KINDS.map((k) => <option key={k} value={k}>{organizationKindLabel[k]}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Sièges<input type="number" min={1} value={form.seats} onChange={set('seats')} className={field} required /></label>
          <label className="text-sm font-medium">Fin de licence<input type="date" value={form.ends} onChange={set('ends')} className={field} required /></label>
          <label className="text-sm font-medium">
            E-mail du propriétaire (gestionnaire principal)
            <input type="email" value={form.ownerEmail} onChange={set('ownerEmail')} className={field} required autoComplete="off" />
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>Ouvrir la licence</Button>
          </div>
        </form>
        {created && (
          <div role="status" className="mt-4 space-y-1 rounded-md border p-3 text-sm">
            <p className="font-medium">Licence ouverte. Invitation du propriétaire ({created.email}) {created.emailed ? 'envoyée par e-mail' : 'à transmettre'}.</p>
            {!created.emailed && created.link && <p className="break-all font-mono text-xs">{created.link}</p>}
          </div>
        )}
      </Card>

      <ul className="space-y-3">
        {organizations.map((o) => (
          <li key={o.id}>
            <Card>
              <CardTitle>{o.name}</CardTitle>
              <CardDescription>
                {organizationKindLabel[o.kind]} · {o.slug} · {o.seatsUsed} / {o.seats} sièges · {licenceStateLabel[o.licence.state]}
                {o.licence.endsAt && ` (fin le ${new Date(o.licence.endsAt).toLocaleDateString('fr-FR', { dateStyle: 'long' })})`}
                {' · '}propriétaire : {o.owners.join(', ') || 'invitation en attente'}
              </CardDescription>
              <EditRow org={o} pending={pending} onSave={(patch) => run(() => apiRequest('PATCH', `/admin/organizations/${o.id}`, token, patch))} />
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
