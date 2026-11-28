'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { useState, useTransition } from 'react';
import type { MentorDto, MentorshipDto } from '@sysmaster/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { ApiError, apiRequest } from '@/lib/client-api';
import { mentorshipStatusLabel as statusLabel, since } from '@/lib/labels';

const field = 'mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm';
const message = (e: unknown) =>
  e instanceof ApiError && Array.isArray(e.body.issues) && e.body.issues.length
    ? (e.body.issues as { message: string }[]).map((i) => i.message).join(' ')
    : e instanceof Error ? e.message : 'Action impossible';

export function MentorCard({ mentor: m, signedIn, self, busy }: { mentor: MentorDto; signedIn: boolean; self: boolean; busy: boolean }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const full = !m.accepting || m.activeMentees >= m.maxMentees;

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(null);
      try {
        await apiRequest('POST', '/community/mentorships', session?.accessToken, { mentorUserId: m.userId, topic, message: text });
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(message(err));
      }
    });
  };

  return (
    <Card className="h-full space-y-3">
      <div className="flex items-start justify-between gap-2">
        <CardTitle className="text-lg">{m.displayName}</CardTitle>
        <span className="text-sm text-muted-foreground">niv. {m.level}</span>
      </div>
      <div className="flex flex-wrap gap-1">{m.topics.map((t) => <Badge key={t}>{t}</Badge>)}</div>
      <CardDescription className="whitespace-pre-line">{m.bio}</CardDescription>
      <p className="text-xs text-muted-foreground">{full ? 'Complet pour le moment' : `Disponible : suit ${m.activeMentees} apprenant(s) sur ${m.maxMentees}`}</p>
      {self ? null : !signedIn ? (
        <button type="button" onClick={() => signIn('keycloak')} className="text-sm underline">Connectez-vous pour demander un mentorat</button>
      ) : busy ? (
        <p className="text-sm text-muted-foreground">Une demande ou un mentorat est en cours avec ce mentor.</p>
      ) : !open ? (
        <Button size="sm" onClick={() => setOpen(true)} disabled={full}>Demander un mentorat</Button>
      ) : (
        <form onSubmit={send} className="space-y-2">
          <label className="block text-sm font-medium">
            Sujet
            <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={120} placeholder="Ex. : préparer Linux Administrator" className={field} />
          </label>
          <label className="block text-sm font-medium">
            Message
            <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} className={field}
              placeholder="Où vous en êtes, ce qui vous bloque, ce que vous attendez, vos disponibilités." />
          </label>
          <div className="flex gap-2">
            <Button size="sm" type="submit" disabled={pending}>Envoyer la demande</Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
          </div>
        </form>
      )}
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </Card>
  );
}

export function MyMentorships({ items }: { items: MentorshipDto[] }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (items.length === 0) return null;

  const act = (id: string, action: 'accept' | 'decline' | 'end', confirmText?: string) =>
    start(async () => {
      if (confirmText && !window.confirm(confirmText)) return;
      setError(null);
      try {
        await apiRequest('POST', `/community/mentorships/${id}/action`, session?.accessToken, { action });
        router.refresh();
      } catch (e) {
        setError(message(e));
      }
    });

  return (
    <section className="space-y-3" aria-label="Mes mentorats">
      <h2 className="text-xl font-semibold">Mes mentorats</h2>
      <ul className="space-y-3">
        {items.map((m) => (
          <li key={m.id}>
            <Card className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge>{statusLabel[m.status]}</Badge>
                <span className="font-medium">{m.role === 'mentor' ? `Vous accompagnez ${m.other.displayName}` : `Avec ${m.other.displayName}`}</span>
                <span className="text-muted-foreground">· {m.topic} · {since(m.createdAt)}</span>
              </div>
              {m.status === 'requested' && <p className="whitespace-pre-line text-sm text-muted-foreground">{m.message}</p>}
              <div className="flex flex-wrap gap-2">
                {m.status !== 'declined' && m.status !== 'requested' && (
                  <Link href={`/communaute/mentorat/${m.id}`} className="text-sm font-medium underline">Échanges</Link>
                )}
                {m.status === 'requested' && m.role === 'mentor' && (
                  <>
                    <Button size="sm" onClick={() => act(m.id, 'accept')} disabled={pending}>Accepter</Button>
                    <Button size="sm" variant="outline" onClick={() => act(m.id, 'decline')} disabled={pending}>Refuser</Button>
                  </>
                )}
                {m.status === 'requested' && m.role === 'mentee' && (
                  <Button size="sm" variant="ghost" onClick={() => act(m.id, 'decline', 'Retirer votre demande ?')} disabled={pending}>Retirer la demande</Button>
                )}
                {m.status === 'active' && (
                  <Button size="sm" variant="ghost" onClick={() => act(m.id, 'end', 'Mettre fin à ce mentorat ? Les échanges resteront lisibles.')} disabled={pending}>Terminer</Button>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}

export function MentorProfileForm({ current }: { current: MentorDto | null }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(!current);
  const [bio, setBio] = useState(current?.bio ?? '');
  const [topics, setTopics] = useState(current?.topics.join(', ') ?? '');
  const [accepting, setAccepting] = useState(current?.accepting ?? true);
  const [maxMentees, setMax] = useState(current?.maxMentees ?? 3);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(null);
      setSaved(false);
      try {
        await apiRequest('PUT', '/community/mentors/me', session?.accessToken, {
          bio, accepting, maxMentees, topics: topics.split(',').map((t) => t.trim()).filter(Boolean),
        });
        setSaved(true);
        router.refresh();
      } catch (err) {
        setError(message(err));
      }
    });
  };

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <CardTitle className="text-base">Mon profil de mentor</CardTitle>
        {current && <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>{open ? 'Replier' : 'Modifier'}</Button>}
      </div>
      {!current && <CardDescription>Vous avez le rôle de mentor : présentez-vous pour apparaître dans la liste.</CardDescription>}
      {open && (
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium sm:col-span-2">
            Présentation
            <textarea rows={4} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={1000} className={field} />
          </label>
          <label className="text-sm font-medium sm:col-span-2">
            Sujets <span className="font-normal text-muted-foreground">(séparés par des virgules, 8 au plus)</span>
            <input value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="linux, réseau, docker" className={field} />
          </label>
          <label className="text-sm font-medium">
            Apprenants suivis au plus
            <input type="number" min={1} max={10} value={maxMentees} onChange={(e) => setMax(Number(e.target.value))} className={field} />
          </label>
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" checked={accepting} onChange={(e) => setAccepting(e.target.checked)} /> J’accepte de nouvelles demandes
          </label>
          <div className="sm:col-span-2 flex items-center gap-3">
            <Button type="submit" disabled={pending}>Enregistrer</Button>
            {saved && <span className="text-sm text-muted-foreground">Enregistré.</span>}
          </div>
        </form>
      )}
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </Card>
  );
}
