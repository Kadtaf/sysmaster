'use client';

import type { AgentProfileContent } from '@sysmaster/contracts';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Field, FormProps, inputClass } from './form-kit';

/** Formulaire d'un profil d'agent IA : mission ou domaine, ajoutés au socle de sécurité de l'assistant. */
export function AgentProfileForm({ c, set, ro, flagged, isNew }: FormProps<AgentProfileContent>) {
  return (
    <Card className="space-y-4">
      <CardTitle>Profil</CardTitle>
      <CardDescription>
        Ces consignes s’ajoutent, pour chaque question, au socle de l’assistant : comprendre avant d’exécuter, citer ses sources,
        classer honnêtement les risques. Ce socle ne se modifie pas ici. Publiées, elles s’appliquent en une minute environ.
      </CardDescription>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom" issue={flagged('name')}>
          <input value={c.name} disabled={ro} onChange={(e) => set('name', e.target.value)} className={inputClass} />
        </Field>
        <Field label="Code" hint={isNew ? 'tutor, diagnostician, windows_expert, linux_expert, devops_expert, network_expert' : 'fixe pour un profil publié'} issue={flagged('code')}>
          <input value={c.code} disabled={ro || !isNew} onChange={(e) => set('code', e.target.value)} className={cn(inputClass, 'font-mono')} />
        </Field>
      </div>
      <Field label="Rôle" hint="Ce que fait l’agent, en une phrase. Affiché seulement, jamais envoyé au modèle." issue={flagged('mission')}>
        <input value={c.mission} disabled={ro} onChange={(e) => set('mission', e.target.value)} className={inputClass} />
      </Field>
      <Field label="Consignes au modèle" hint="Ce qui change pour cette mission ou ce domaine. Évitez de répéter le socle." issue={flagged('systemPrompt')}>
        <textarea rows={8} value={c.systemPrompt} disabled={ro} onChange={(e) => set('systemPrompt', e.target.value)} className={cn(inputClass, 'font-mono')} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={c.enabled} disabled={ro} onChange={(e) => set('enabled', e.target.checked)} />
        Actif (désactivé : l’assistant revient aux consignes d’origine)
      </label>
    </Card>
  );
}
