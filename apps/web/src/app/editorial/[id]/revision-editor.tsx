'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import {
  DIFFICULTIES, PLATFORMS, RISK_LEVELS,
  type CommandContent, type ContentIssue, type RevisionDto, type RiskLevel,
} from '@sysmaster/contracts';
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { ApiError, apiRequest } from '@/lib/client-api';
import { difficultyLabel, revisionActionLabel, revisionStatusMeta, riskMeta } from '@/lib/labels';
import { cn } from '@/lib/utils';

const inputClass = 'mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-70';

function Field({ label, hint, issue, children }: { label: string; hint?: string; issue?: boolean; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className={cn('font-medium', issue && 'text-orange-700 dark:text-orange-300')}>{label}</span>
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      {children}
    </label>
  );
}

/** Liste éditable générique : chaque élément est un petit formulaire. */
function ListEditor<T>({
  title, hint, items, disabled, issue, empty, make, render, onChange,
}: {
  title: string; hint: string; items: T[]; disabled: boolean; issue?: boolean; empty: T;
  make?: () => T; render: (item: T, set: (v: T) => void) => React.ReactNode; onChange: (items: T[]) => void;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className={cn('font-medium', issue && 'text-orange-700 dark:text-orange-300')}>{title}</legend>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {items.map((item, i) => (
        <div key={i} className="flex gap-2 rounded-md border p-3">
          <div className="flex-1 space-y-2">{render(item, (v) => onChange(items.map((x, j) => (j === i ? v : x))))}</div>
          {!disabled && (
            <Button type="button" variant="ghost" size="sm" aria-label={`Supprimer l’élément ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <Trash2 className="size-4" aria-hidden />
            </Button>
          )}
        </div>
      ))}
      {!disabled && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, make ? make() : structuredClone(empty)])}>
          <Plus className="size-4" aria-hidden /> Ajouter
        </Button>
      )}
    </fieldset>
  );
}

function RiskSelect({ value, onChange, disabled }: { value: RiskLevel; onChange: (v: RiskLevel) => void; disabled: boolean }) {
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as RiskLevel)} className={inputClass}>
      {RISK_LEVELS.map((r) => <option key={r} value={r}>{riskMeta[r].label}</option>)}
    </select>
  );
}

export function RevisionEditor({ initial }: { initial: RevisionDto }) {
  const { data: session } = useSession();
  const [rev, setRev] = useState(initial);
  const [c, setC] = useState<CommandContent>(initial.content);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string; issues?: ContentIssue[] } | null>(null);
  const [comment, setComment] = useState('');
  const [pending, startTransition] = useTransition();
  const ro = !rev.can.edit;
  const flagged = new Set(rev.issues.map((i) => i.field));

  const set = <K extends keyof CommandContent>(key: K, value: CommandContent[K]) => {
    setC((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };
  const text = (key: keyof CommandContent) => ({
    value: (c[key] as string | null) ?? '',
    disabled: ro,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, e.target.value as never),
    className: inputClass,
  });

  const run = (fn: () => Promise<RevisionDto>, ok: string) =>
    startTransition(async () => {
      setMessage(null);
      try {
        const next = await fn();
        setRev(next);
        setC(next.content);
        setDirty(false);
        setMessage({ kind: 'ok', text: ok });
      } catch (e) {
        const body = e instanceof ApiError ? e.body : {};
        setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Échec', issues: body.issues as ContentIssue[] | undefined });
      }
    });

  const token = session?.accessToken;
  const save = () => apiRequest<RevisionDto>('PUT', `/editorial/revisions/${rev.id}`, token, c);
  const status = revisionStatusMeta[rev.status];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">{c.name || 'Nouvelle fiche'}</h1>
        <span className={cn('rounded px-2 py-0.5 text-xs font-medium', status?.className)}>{status?.label ?? rev.status}</span>
        <span className="text-sm text-muted-foreground">
          {rev.isNew ? 'Nouvelle fiche' : <>Modification de <Link className="text-primary hover:underline" href={`/commandes/${c.slug}`}>/commandes/{c.slug}</Link></>} · par {rev.author}
        </span>
      </div>

      {rev.reviewComment && rev.status === 'changes_requested' && (
        <Card className="border-orange-300 dark:border-orange-800">
          <CardTitle>Retour du relecteur{rev.reviewer ? ` (${rev.reviewer})` : ''}</CardTitle>
          <p className="mt-2 whitespace-pre-wrap text-sm">{rev.reviewComment}</p>
        </Card>
      )}

      <Card className={cn(rev.issues.length ? 'border-orange-300 dark:border-orange-800' : 'border-emerald-300 dark:border-emerald-800')}>
        {rev.issues.length ? (
          <>
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="size-5 text-orange-600" aria-hidden /> Avant de soumettre ({rev.issues.length})</CardTitle>
            <CardDescription>Une fiche n&apos;est publiable que si le lecteur peut comprendre avant d&apos;exécuter (calculé au dernier enregistrement).</CardDescription>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{rev.issues.map((i, k) => <li key={k}>{i.message}</li>)}</ul>
          </>
        ) : (
          <CardTitle className="flex items-center gap-2"><CheckCircle2 className="size-5 text-emerald-600" aria-hidden /> Fiche complète : elle peut être soumise à la relecture.</CardTitle>
        )}
      </Card>

      <Card className="space-y-4">
        <CardTitle>Identité</CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom" issue={flagged.has('name')}><input {...text('name')} placeholder="systemctl" /></Field>
          <Field label="Identifiant d’URL" hint={rev.isNew ? 'minuscules et tirets, ex. linux-systemctl' : 'fixe pour une fiche publiée'} issue={flagged.has('slug')}>
            <input {...text('slug')} disabled={ro || !rev.isNew} className={cn(inputClass, 'font-mono')} />
          </Field>
          <Field label="Plateforme">
            <select value={c.platform} disabled={ro} onChange={(e) => set('platform', e.target.value as CommandContent['platform'])} className={inputClass}>
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Shell"><input {...text('shell')} placeholder="bash, cmd, powershell…" /></Field>
          <Field label="Niveau">
            <select value={c.difficulty} disabled={ro} onChange={(e) => set('difficulty', e.target.value as CommandContent['difficulty'])} className={inputClass}>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{difficultyLabel[d]}</option>)}
            </select>
          </Field>
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" checked={c.requiresAdmin} disabled={ro} onChange={(e) => set('requiresAdmin', e.target.checked)} />
            Exige des droits administrateur
          </label>
        </div>
        <Field label="Utilité" hint="À quoi sert la commande, en une phrase." issue={flagged.has('summary')}><input {...text('summary')} /></Field>
        <Field label="Syntaxe" issue={flagged.has('syntax')}><input {...text('syntax')} className={cn(inputClass, 'font-mono')} /></Field>
      </Card>

      <Card className="space-y-4">
        <CardTitle>Comprendre avant d&apos;exécuter</CardTitle>
        <Field label="Pourquoi" hint="Quel problème la commande résout." issue={flagged.has('why')}><textarea rows={3} {...text('why')} /></Field>
        <Field label="Quand" hint="Dans quelles situations l’utiliser, et quand ne pas l’utiliser." issue={flagged.has('whenToUse')}><textarea rows={3} {...text('whenToUse')} /></Field>
        <Field label="Contexte" hint="Prérequis, environnement, droits." issue={flagged.has('context')}><textarea rows={2} {...text('context')} /></Field>
        <Field label="Historique (facultatif)"><textarea rows={2} {...text('history')} /></Field>
        <Field label="Fonctionnement interne (facultatif)"><textarea rows={3} {...text('internals')} /></Field>
      </Card>

      <Card className="space-y-5">
        <CardTitle>Risques</CardTitle>
        <Field label="Niveau de risque de la fiche" hint="Élevé ou critique : la commande est masquée tant que les risques ne sont pas lus ; critique : pas de bouton copier." issue={flagged.has('riskLevel')}>
          <RiskSelect value={c.riskLevel} disabled={ro} onChange={(v) => set('riskLevel', v)} />
        </Field>
        <ListEditor
          title="Risques décrits" hint="Ce qui peut mal tourner. Même une commande sans danger en a un mot." issue={flagged.has('risks')}
          items={c.risks} disabled={ro} empty={{ level: 'none' as RiskLevel, text: '' }} onChange={(v) => set('risks', v)}
          render={(r, upd) => (
            <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
              <RiskSelect value={r.level} disabled={ro} onChange={(level) => upd({ ...r, level })} />
              <input aria-label="Description du risque" value={r.text} disabled={ro} onChange={(e) => upd({ ...r, text: e.target.value })} className={inputClass} />
            </div>
          )}
        />
        <ListEditor
          title="Erreurs fréquentes" hint="Message d’erreur, cause, correction. Obligatoire pour un risque élevé ou critique." issue={flagged.has('commonErrors')}
          items={c.commonErrors} disabled={ro} empty={{ error: '', cause: '', fix: '' }} onChange={(v) => set('commonErrors', v)}
          render={(e, upd) => (
            <>
              <input aria-label="Erreur" placeholder="Erreur" value={e.error} disabled={ro} onChange={(x) => upd({ ...e, error: x.target.value })} className={cn(inputClass, 'font-mono')} />
              <input aria-label="Cause" placeholder="Cause" value={e.cause} disabled={ro} onChange={(x) => upd({ ...e, cause: x.target.value })} className={inputClass} />
              <input aria-label="Correction" placeholder="Correction" value={e.fix} disabled={ro} onChange={(x) => upd({ ...e, fix: x.target.value })} className={inputClass} />
            </>
          )}
        />
        <ListEditor
          title="Bonnes pratiques" hint="Une par ligne." items={c.bestPractices} disabled={ro} empty="" onChange={(v) => set('bestPractices', v)}
          render={(b, upd) => <input aria-label="Bonne pratique" value={b} disabled={ro} onChange={(e) => upd(e.target.value)} className={inputClass} />}
        />
      </Card>

      <Card className="space-y-5">
        <CardTitle>Utilisation</CardTitle>
        <ListEditor
          title="Paramètres" hint="Chaque paramètre a son propre risque : la fiche ne peut pas être classée sous le plus risqué."
          items={c.parameters} disabled={ro} empty={{ flag: '', description: '', riskLevel: 'none' as RiskLevel }} onChange={(v) => set('parameters', v)}
          render={(p, upd) => (
            <div className="grid gap-2 sm:grid-cols-[8rem_1fr_10rem]">
              <input aria-label="Option" placeholder="--now" value={p.flag} disabled={ro} onChange={(e) => upd({ ...p, flag: e.target.value })} className={cn(inputClass, 'font-mono')} />
              <input aria-label="Description" value={p.description} disabled={ro} onChange={(e) => upd({ ...p, description: e.target.value })} className={inputClass} />
              <RiskSelect value={p.riskLevel} disabled={ro} onChange={(riskLevel) => upd({ ...p, riskLevel })} />
            </div>
          )}
        />
        <ListEditor
          title="Exemples" hint="Pas d’exemple sans explication." issue={flagged.has('examples')}
          items={c.examples} disabled={ro} empty={{ title: '', code: '', explanation: '', isRealCase: false }} onChange={(v) => set('examples', v)}
          render={(x, upd) => (
            <>
              <input aria-label="Titre de l’exemple" placeholder="Titre" value={x.title} disabled={ro} onChange={(e) => upd({ ...x, title: e.target.value })} className={inputClass} />
              <textarea aria-label="Code" rows={2} placeholder="Commande" value={x.code} disabled={ro} onChange={(e) => upd({ ...x, code: e.target.value })} className={cn(inputClass, 'font-mono')} />
              <textarea aria-label="Explication" rows={2} placeholder="Ce que fait l’exemple et pourquoi" value={x.explanation} disabled={ro} onChange={(e) => upd({ ...x, explanation: e.target.value })} className={inputClass} />
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={x.isRealCase} disabled={ro} onChange={(e) => upd({ ...x, isRealCase: e.target.checked })} /> Cas réel
              </label>
            </>
          )}
        />
        <ListEditor
          title="Alternatives" hint="Identifiant d’une fiche publiée, et quand la préférer." issue={flagged.has('alternatives')}
          items={c.alternatives} disabled={ro} empty={{ slug: '', note: '' }} onChange={(v) => set('alternatives', v)}
          render={(a, upd) => (
            <div className="grid gap-2 sm:grid-cols-[14rem_1fr]">
              <input aria-label="Identifiant de la fiche alternative" placeholder="linux-journalctl" value={a.slug} disabled={ro} onChange={(e) => upd({ ...a, slug: e.target.value })} className={cn(inputClass, 'font-mono')} />
              <input aria-label="Quand la préférer" value={a.note} disabled={ro} onChange={(e) => upd({ ...a, note: e.target.value })} className={inputClass} />
            </div>
          )}
        />
        <ListEditor
          title="Sources" hint="Documentation officielle de préférence (règle P-4)." issue={flagged.has('sources')}
          items={c.sources} disabled={ro} empty={{ title: '', url: '', publisher: '' }} onChange={(v) => set('sources', v)}
          render={(s, upd) => (
            <div className="grid gap-2 sm:grid-cols-3">
              <input aria-label="Titre" placeholder="Titre" value={s.title} disabled={ro} onChange={(e) => upd({ ...s, title: e.target.value })} className={inputClass} />
              <input aria-label="Adresse" placeholder="https://…" value={s.url} disabled={ro} onChange={(e) => upd({ ...s, url: e.target.value })} className={inputClass} />
              <input aria-label="Éditeur" placeholder="Microsoft, man7.org…" value={s.publisher} disabled={ro} onChange={(e) => upd({ ...s, publisher: e.target.value })} className={inputClass} />
            </div>
          )}
        />
      </Card>

      {message && (
        <div role={message.kind === 'error' ? 'alert' : 'status'} className={cn('rounded-md border p-3 text-sm', message.kind === 'error' ? 'border-red-300 text-red-700 dark:text-red-300' : 'border-emerald-300 text-emerald-700 dark:text-emerald-300')}>
          {message.text}
          {message.issues && (
            <ul className="mt-2 list-disc pl-5">{message.issues.map((i, k) => (
                // Le champ technique n'est utile que pour une donnée mal formée (400) ; sinon le message suffit.
                <li key={k}>{message.text === 'Données invalides' && i.field ? `${i.field} : ` : ''}{i.message}</li>
              ))}</ul>
          )}
        </div>
      )}

      {(rev.can.edit || rev.can.submit || rev.can.withdraw) && (
        <div className="sticky bottom-0 flex flex-wrap gap-2 border-t bg-background/90 py-3 backdrop-blur">
          {rev.can.edit && (
            <Button disabled={pending || !dirty} onClick={() => run(save, 'Brouillon enregistré.')}>Enregistrer</Button>
          )}
          {rev.can.submit && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  if (dirty) await save();
                  return apiRequest<RevisionDto>('POST', `/editorial/revisions/${rev.id}/submit`, token);
                }, 'Soumise à la relecture.')
              }
            >
              Soumettre à la relecture
            </Button>
          )}
          {rev.can.withdraw && (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (window.confirm('Retirer cette révision ? Elle ne pourra plus être modifiée ni publiée.')) {
                  run(() => apiRequest<RevisionDto>('POST', `/editorial/revisions/${rev.id}/withdraw`, token), 'Révision retirée.');
                }
              }}
            >
              Retirer
            </Button>
          )}
        </div>
      )}

      {rev.can.review && (
        <Card className="space-y-3">
          <CardTitle>Relecture</CardTitle>
          <CardDescription>
            Approuver publie immédiatement la fiche{rev.isNew ? '' : ' et remplace la version en ligne'}. Pour demander des changements, expliquez quoi et pourquoi.
          </CardDescription>
          <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} className={inputClass} aria-label="Commentaire de relecture" placeholder="Commentaire (obligatoire pour demander des changements)" />
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending}
              onClick={() => run(() => apiRequest<RevisionDto>('POST', `/editorial/revisions/${rev.id}/review`, token, { decision: 'approve', comment }), 'Fiche publiée.')}
            >
              Approuver et publier
            </Button>
            <Button
              variant="outline"
              disabled={pending || !comment.trim()}
              onClick={() => run(() => apiRequest<RevisionDto>('POST', `/editorial/revisions/${rev.id}/review`, token, { decision: 'request_changes', comment }), 'Changements demandés à l’auteur.')}
            >
              Demander des changements
            </Button>
          </div>
        </Card>
      )}

      {rev.status === 'published' && (
        <p className="text-sm">
          <Link href={`/commandes/${c.slug}`} className="text-primary hover:underline">Voir la fiche en ligne</Link>
        </p>
      )}

      <Card>
        <CardTitle>Historique</CardTitle>
        <ol className="mt-3 space-y-2 text-sm">
          {rev.history.map((h, k) => (
            <li key={k}>
              <span className="text-muted-foreground">{new Date(h.at).toLocaleString('fr-FR')}</span> · {h.actor} {revisionActionLabel[h.action] ?? h.action}
              {h.comment && <p className="mt-1 whitespace-pre-wrap border-l-2 pl-3 text-muted-foreground">{h.comment}</p>}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
