'use client';

import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useState, useTransition } from 'react';
import type { StudyGroupDetailDto } from '@sysmaster/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { ApiError, apiRequest } from '@/lib/client-api';

const field = 'mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm';
const message = (e: unknown) =>
  e instanceof ApiError && Array.isArray(e.body.issues) && e.body.issues.length
    ? (e.body.issues as { message: string }[]).map((i) => i.message).join(' ')
    : e instanceof Error ? e.message : 'Action impossible';

/** Créer un groupe, ou en rejoindre un privé avec son code. */
export function GroupActions() {
  const { data: session } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', goal: '', description: '', isPublic: true, maxMembers: 20 });
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(null);
      try {
        const { id } = await apiRequest<{ id: string }>('POST', '/community/groups', session?.accessToken, { ...form, goal: form.goal || undefined });
        router.push(`/communaute/groupes/${id}`);
      } catch (err) {
        setError(message(err));
      }
    });
  };
  const join = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(null);
      try {
        const g = await apiRequest<StudyGroupDetailDto>('POST', '/community/groups/join', session?.accessToken, { code });
        router.push(`/communaute/groupes/${g.id}`);
      } catch (err) {
        setError(message(err));
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <Button onClick={() => setOpen((o) => !o)} variant={open ? 'outline' : 'default'}>{open ? 'Annuler' : 'Créer un groupe'}</Button>
        <form onSubmit={join} className="flex items-end gap-2">
          <label className="text-sm font-medium">
            Code d’invitation
            <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={8} placeholder="ex. K7M3QX9A" className={`${field} w-36 font-mono uppercase`} />
          </label>
          <Button type="submit" variant="outline" disabled={pending || code.trim().length !== 8}>Rejoindre</Button>
        </form>
      </div>
      {open && (
        <Card>
          <CardTitle className="text-base">Nouveau groupe</CardTitle>
          <form onSubmit={create} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium sm:col-span-2">
              Nom
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} required className={field} />
            </label>
            <label className="text-sm font-medium sm:col-span-2">
              Objectif <span className="font-normal text-muted-foreground">(facultatif)</span>
              <input value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} maxLength={200} placeholder="Ex. : obtenir Linux Administrator avant mars" className={field} />
            </label>
            <label className="text-sm font-medium sm:col-span-2">
              Description
              <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={1000} className={field} />
            </label>
            <label className="text-sm font-medium">
              Places
              <input type="number" min={2} max={50} value={form.maxMembers} onChange={(e) => setForm({ ...form, maxMembers: Number(e.target.value) })} className={field} />
            </label>
            <fieldset className="text-sm">
              <legend className="font-medium">Accès</legend>
              <div className="mt-2 flex gap-4">
                <label className="flex items-center gap-2"><input type="radio" checked={form.isPublic} onChange={() => setForm({ ...form, isPublic: true })} /> Public</label>
                <label className="flex items-center gap-2"><input type="radio" checked={!form.isPublic} onChange={() => setForm({ ...form, isPublic: false })} /> Sur invitation</label>
              </div>
            </fieldset>
            <div className="sm:col-span-2"><Button type="submit" disabled={pending}>Créer le groupe</Button></div>
          </form>
        </Card>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
