'use client';

import { DIFFICULTIES, PLATFORMS, type CommandContent, type RiskLevel } from '@sysmaster/contracts';
import { Card, CardTitle } from '@/components/ui/card';
import { difficultyLabel } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { Field, FormProps, inputClass, ListEditor, RiskSelect } from './form-kit';

/** Formulaire d'une fiche commande : l'ordre suit la règle « comprendre avant d'exécuter ». */
export function CommandForm({ c, set, ro, flagged, isNew }: FormProps<CommandContent>) {
  const text = (key: keyof CommandContent) => ({
    value: (c[key] as string | null) ?? '',
    disabled: ro,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, e.target.value as never),
    className: inputClass,
  });
  return (
    <>
      <Card className="space-y-4">
        <CardTitle>Identité</CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom" issue={flagged('name')}><input {...text('name')} placeholder="systemctl" /></Field>
          <Field label="Identifiant d’URL" hint={isNew ? 'minuscules et tirets, ex. linux-systemctl' : 'fixe pour une fiche publiée'} issue={flagged('slug')}>
            <input {...text('slug')} disabled={ro || !isNew} className={cn(inputClass, 'font-mono')} />
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
        <Field label="Utilité" hint="À quoi sert la commande, en une phrase." issue={flagged('summary')}><input {...text('summary')} /></Field>
        <Field label="Syntaxe" issue={flagged('syntax')}><input {...text('syntax')} className={cn(inputClass, 'font-mono')} /></Field>
      </Card>

      <Card className="space-y-4">
        <CardTitle>Comprendre avant d&apos;exécuter</CardTitle>
        <Field label="Pourquoi" hint="Quel problème la commande résout." issue={flagged('why')}><textarea rows={3} {...text('why')} /></Field>
        <Field label="Quand" hint="Dans quelles situations l’utiliser, et quand ne pas l’utiliser." issue={flagged('whenToUse')}><textarea rows={3} {...text('whenToUse')} /></Field>
        <Field label="Contexte" hint="Prérequis, environnement, droits." issue={flagged('context')}><textarea rows={2} {...text('context')} /></Field>
        <Field label="Historique (facultatif)"><textarea rows={2} {...text('history')} /></Field>
        <Field label="Fonctionnement interne (facultatif)"><textarea rows={3} {...text('internals')} /></Field>
      </Card>

      <Card className="space-y-5">
        <CardTitle>Risques</CardTitle>
        <Field label="Niveau de risque de la fiche" hint="Élevé ou critique : la commande est masquée tant que les risques ne sont pas lus ; critique : pas de bouton copier." issue={flagged('riskLevel')}>
          <RiskSelect value={c.riskLevel} disabled={ro} onChange={(v) => set('riskLevel', v)} />
        </Field>
        <ListEditor
          title="Risques décrits" hint="Ce qui peut mal tourner. Même une commande sans danger en a un mot." issue={flagged('risks')}
          items={c.risks} disabled={ro} empty={{ level: 'none' as RiskLevel, text: '' }} onChange={(v) => set('risks', v)}
          render={(r, upd) => (
            <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
              <RiskSelect value={r.level} disabled={ro} onChange={(level) => upd({ ...r, level })} />
              <input aria-label="Description du risque" value={r.text} disabled={ro} onChange={(e) => upd({ ...r, text: e.target.value })} className={inputClass} />
            </div>
          )}
        />
        <ListEditor
          title="Erreurs fréquentes" hint="Message d’erreur, cause, correction. Obligatoire pour un risque élevé ou critique." issue={flagged('commonErrors')}
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
          title="Exemples" hint="Pas d’exemple sans explication." issue={flagged('examples')}
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
          title="Alternatives" hint="Identifiant d’une fiche publiée, et quand la préférer." issue={flagged('alternatives')}
          items={c.alternatives} disabled={ro} empty={{ slug: '', note: '' }} onChange={(v) => set('alternatives', v)}
          render={(a, upd) => (
            <div className="grid gap-2 sm:grid-cols-[14rem_1fr]">
              <input aria-label="Identifiant de la fiche alternative" placeholder="linux-journalctl" value={a.slug} disabled={ro} onChange={(e) => upd({ ...a, slug: e.target.value })} className={cn(inputClass, 'font-mono')} />
              <input aria-label="Quand la préférer" value={a.note} disabled={ro} onChange={(e) => upd({ ...a, note: e.target.value })} className={inputClass} />
            </div>
          )}
        />
        <ListEditor
          title="Sources" hint="Documentation officielle de préférence (règle P-4)." issue={flagged('sources')}
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

    </>
  );
}
