'use client';

import { DIFFICULTIES, type PathContent } from '@sysmaster/contracts';
import { Card, CardTitle } from '@/components/ui/card';
import { difficultyLabel } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { Field, FormProps, inputClass, ListEditor } from './form-kit';

/** Formulaire d'un parcours : présentation et suite ordonnée de cours publiés. */
export function PathForm({ c, set, ro, flagged, isNew }: FormProps<PathContent>) {
  return (
    <>
      <Card className="space-y-4">
        <CardTitle>Présentation</CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Titre" issue={flagged('title')}><input value={c.title} disabled={ro} onChange={(e) => set('title', e.target.value)} className={inputClass} /></Field>
          <Field label="Identifiant d’URL" hint={isNew ? 'ex. administrateur-linux' : 'fixe pour un parcours publié'} issue={flagged('slug')}>
            <input value={c.slug} disabled={ro || !isNew} onChange={(e) => set('slug', e.target.value)} className={cn(inputClass, 'font-mono')} />
          </Field>
          <Field label="Métier visé" hint="Code : it_technician, sysadmin, systems_engineer, cloud, cybersecurity, devops" issue={flagged('career')}>
            <input value={c.career ?? ''} disabled={ro} onChange={(e) => set('career', e.target.value || null)} className={cn(inputClass, 'font-mono')} />
          </Field>
          <Field label="Niveau">
            <select value={c.difficulty} disabled={ro} onChange={(e) => set('difficulty', e.target.value as PathContent['difficulty'])} className={inputClass}>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{difficultyLabel[d]}</option>)}
            </select>
          </Field>
          <Field label="Durée estimée (heures)">
            <input type="number" min={1} value={c.estHours ?? ''} disabled={ro} onChange={(e) => set('estHours', e.target.value ? Number(e.target.value) : null)} className={inputClass} />
          </Field>
        </div>
        <Field label="Résumé" hint="À quel métier mène ce parcours, et pour qui." issue={flagged('summary')}>
          <textarea rows={3} value={c.summary} disabled={ro} onChange={(e) => set('summary', e.target.value)} className={inputClass} />
        </Field>
      </Card>
      <Card className="space-y-4">
        <ListEditor<string>
          title="Cours" hint="Identifiants de cours publiés, dans l’ordre du parcours." issue={flagged('courses')} reorder addLabel="Ajouter un cours"
          items={c.courses} disabled={ro} empty="" onChange={(v) => set('courses', v)}
          render={(slug, upd, i) => (
            <input aria-label={`Cours ${i + 1}`} placeholder="linux-systemd" value={slug} disabled={ro} onChange={(e) => upd(e.target.value)} className={cn(inputClass, 'font-mono')} />
          )}
        />
      </Card>
    </>
  );
}
