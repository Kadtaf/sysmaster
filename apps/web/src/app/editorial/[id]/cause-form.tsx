'use client';

import { PLATFORMS, type CauseContent, type SimulationDto } from '@sysmaster/contracts';
import { useSession } from 'next-auth/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { publicApiBase } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Field, FormProps, inputClass, LinesInput, ListEditor, RiskSelect } from './form-kit';

type Step = CauseContent['actionPlan'][number];
type Rule = CauseContent['rules'][number];
type Pattern = CauseContent['evidencePatterns'][number];
type NewSymptom = CauseContent['newSymptoms'][number];
const SOURCES: Pattern['source'][] = ['windows_event', 'syslog', 'journald', 'docker', 'postgresql', 'nginx', 'apache', 'macos_log', 'screenshot_ocr'];

const pct = (p: number) => `${Math.round(p * 100)} %`;

/** Formulaire d'une cause de diagnostic. Les probabilités sont montrées en pourcentage. */
export function CauseForm({ c, set, ro, flagged, isNew }: FormProps<CauseContent>) {
  return (
    <>
      <Card className="space-y-4">
        <CardTitle>Cause</CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Libellé" issue={flagged('label')}><input value={c.label} disabled={ro} onChange={(e) => set('label', e.target.value)} className={inputClass} /></Field>
          <Field label="Code" hint={isNew ? 'ex. failing_psu' : 'fixe pour une cause publiée'} issue={flagged('code')}>
            <input value={c.code} disabled={ro || !isNew} onChange={(e) => set('code', e.target.value)} className={cn(inputClass, 'font-mono')} />
          </Field>
          <Field label="Plateforme">
            <select value={c.platform} disabled={ro} onChange={(e) => set('platform', e.target.value as CauseContent['platform'])} className={inputClass}>
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label={`Probabilité a priori : ${pct(c.prior)}`} hint="Fréquence de cette cause parmi les pannes de la plateforme, avant toute observation.">
            <input type="range" min={0.01} max={0.9} step={0.01} value={c.prior} disabled={ro} onChange={(e) => set('prior', Number(e.target.value))} className="mt-2 w-full" />
          </Field>
        </div>
        <Field label="Explication" hint="Pourquoi cette cause produit ces symptômes. Montrée à l’utilisateur." issue={flagged('explanation')}>
          <textarea rows={3} value={c.explanation} disabled={ro} onChange={(e) => set('explanation', e.target.value)} className={inputClass} />
        </Field>
      </Card>

      <Card className="space-y-5">
        <ListEditor<Step>
          title="Plan d’action" hint="Dans l’ordre. Jamais d’action à risque élevé en premier : on vérifie avant d’agir." issue={flagged('actionPlan')} reorder
          items={c.actionPlan} disabled={ro} empty={{ step: '', why: '', risk: 'none', commandSlug: null }} onChange={(v) => set('actionPlan', v)}
          render={(s, upd, i) => (
            <>
              <input aria-label={`Étape ${i + 1}`} placeholder="Ce qu’il faut faire" value={s.step} disabled={ro} onChange={(e) => upd({ ...s, step: e.target.value })} className={inputClass} />
              <input aria-label={`Pourquoi l’étape ${i + 1}`} placeholder="Pourquoi" value={s.why} disabled={ro} onChange={(e) => upd({ ...s, why: e.target.value })} className={inputClass} />
              <div className="grid gap-2 sm:grid-cols-2">
                <RiskSelect value={s.risk} disabled={ro} onChange={(risk) => upd({ ...s, risk })} label={`Risque de l’étape ${i + 1}`} />
                <input aria-label={`Fiche liée à l’étape ${i + 1}`} placeholder="Fiche liée (facultatif)" value={s.commandSlug ?? ''} disabled={ro}
                  onChange={(e) => upd({ ...s, commandSlug: e.target.value || null })} className={cn(inputClass, 'font-mono')} />
              </div>
            </>
          )}
        />
        <ListEditor<Rule>
          title="Règles : probabilité du symptôme si la cause est la bonne"
          hint="90 % : presque toujours présent. 10 % : rare. La justification est citée à l’utilisateur." issue={flagged('rules')}
          items={c.rules} disabled={ro} empty={{ symptom: '', likelihood: 0.5, rationale: '' }} onChange={(v) => set('rules', v)}
          render={(r, upd, i) => (
            <>
              <div className="grid gap-2 sm:grid-cols-[14rem_1fr]">
                <input aria-label={`Symptôme de la règle ${i + 1}`} placeholder="code_du_symptome" value={r.symptom} disabled={ro} onChange={(e) => upd({ ...r, symptom: e.target.value })} className={cn(inputClass, 'font-mono')} />
                <label className="flex items-center gap-2 text-sm">
                  <input aria-label={`Probabilité de la règle ${i + 1}`} type="range" min={0.01} max={0.99} step={0.01} value={r.likelihood} disabled={ro}
                    onChange={(e) => upd({ ...r, likelihood: Number(e.target.value) })} className="flex-1" />
                  <span className="w-12 text-right font-mono">{pct(r.likelihood)}</span>
                </label>
              </div>
              <input aria-label={`Justification de la règle ${i + 1}`} placeholder="Pourquoi ce symptôme accompagne cette cause" value={r.rationale} disabled={ro}
                onChange={(e) => upd({ ...r, rationale: e.target.value })} className={inputClass} />
            </>
          )}
        />
        <ListEditor<NewSymptom>
          title="Nouveaux symptômes" hint="Créés à la publication. Les synonymes (un par ligne) servent à les reconnaître dans une description libre." issue={flagged('newSymptoms')}
          items={c.newSymptoms} disabled={ro} empty={{ code: '', label: '', synonyms: [] }} onChange={(v) => set('newSymptoms', v)}
          render={(s, upd, i) => (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <input aria-label={`Code du nouveau symptôme ${i + 1}`} placeholder="code_du_symptome" value={s.code} disabled={ro} onChange={(e) => upd({ ...s, code: e.target.value })} className={cn(inputClass, 'font-mono')} />
                <input aria-label={`Libellé du nouveau symptôme ${i + 1}`} placeholder="Libellé" value={s.label} disabled={ro} onChange={(e) => upd({ ...s, label: e.target.value })} className={inputClass} />
              </div>
              <LinesInput label={`Synonymes du nouveau symptôme ${i + 1}`} value={s.synonyms} disabled={ro} onChange={(synonyms) => upd({ ...s, synonyms })} rows={2} />
            </>
          )}
        />
        <ListEditor<Pattern>
          title="Indices dans les journaux" hint="Expression régulière (insensible à la casse) et poids multiplicatif : ×3 triple la vraisemblance." issue={flagged('evidencePatterns')}
          items={c.evidencePatterns} disabled={ro} empty={{ name: '', source: 'windows_event', pattern: '', boost: 2 }} onChange={(v) => set('evidencePatterns', v)}
          render={(p, upd, i) => (
            <div className="grid gap-2 sm:grid-cols-[1fr_10rem_1fr_6rem]">
              <input aria-label={`Nom de l’indice ${i + 1}`} placeholder="Nom" value={p.name} disabled={ro} onChange={(e) => upd({ ...p, name: e.target.value })} className={inputClass} />
              <select aria-label={`Source de l’indice ${i + 1}`} value={p.source} disabled={ro} onChange={(e) => upd({ ...p, source: e.target.value as Pattern['source'] })} className={inputClass}>
                {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input aria-label={`Motif de l’indice ${i + 1}`} placeholder="Kernel-Power|Event ID 41" value={p.pattern} disabled={ro} onChange={(e) => upd({ ...p, pattern: e.target.value })} className={cn(inputClass, 'font-mono')} />
              <input aria-label={`Poids de l’indice ${i + 1}`} type="number" min={0.1} max={50} step={0.1} value={p.boost} disabled={ro} onChange={(e) => upd({ ...p, boost: Number(e.target.value) })} className={inputClass} />
            </div>
          )}
        />
      </Card>
    </>
  );
}

/** Rejoue les cas de référence avec la version enregistrée du brouillon. */
export function SimulationPanel({ revisionId, savedAt }: { revisionId: string; savedAt: string }) {
  const { data: session } = useSession();
  const [sim, setSim] = useState<SimulationDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${publicApiBase}/editorial/revisions/${revisionId}/simulation`, {
        headers: session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : undefined,
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      setSim(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Simulation impossible');
    } finally {
      setLoading(false);
    }
  };
  const rank = (r: number | null) => (r === null ? 'absente' : r === 1 ? '1re' : `${r}e`);
  return (
    <Card className="space-y-3">
      <CardTitle>Simulation sur les cas de référence</CardTitle>
      <CardDescription>
        Chaque cas est une panne réelle dont on connaît la cause. La simulation compare le classement actuel et celui qu’on obtiendrait avec
        ce brouillon (version enregistrée le {new Date(savedAt).toLocaleString('fr-FR')}). Une régression : la bonne cause était en tête et ne l’est plus.
      </CardDescription>
      <Button type="button" variant="outline" onClick={() => void run()} disabled={loading}>{loading ? 'Simulation…' : 'Lancer la simulation'}</Button>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {sim && (
        <>
          <p className={cn('text-sm font-medium', sim.regressions ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300')}>
            {sim.regressions} régression(s), {sim.improvements} amélioration(s) sur {sim.cases.length} cas.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr><th className="py-1 pr-3">Cas</th><th className="pr-3">Cause attendue</th><th className="pr-3">Avant</th><th>Après</th></tr>
              </thead>
              <tbody>
                {sim.cases.map((r) => (
                  <tr key={r.name} className={cn('border-t', r.regression && 'bg-red-50 dark:bg-red-950/40', r.improvement && 'bg-emerald-50 dark:bg-emerald-950/40')}>
                    <td className="py-1 pr-3">{r.name}</td>
                    <td className="pr-3">{r.expected.label}</td>
                    <td className="pr-3 font-mono">{rank(r.before.expectedRank)} · {pct(r.before.expectedProbability)}</td>
                    <td className="font-mono">{rank(r.after.expectedRank)} · {pct(r.after.expectedProbability)}{r.regression ? ' ⚠' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
