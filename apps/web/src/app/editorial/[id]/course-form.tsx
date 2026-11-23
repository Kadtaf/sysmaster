'use client';

import { DIFFICULTIES, PLATFORMS, type CourseContent } from '@sysmaster/contracts';
import { useState } from 'react';
import { Markdown } from '@/components/markdown';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { difficultyLabel, lessonTypeLabel } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { Field, FormProps, inputClass, LinesInput, ListEditor } from './form-kit';

type Module = CourseContent['modules'][number];
type Lesson = Module['lessons'][number];
const LESSON_TYPES: Lesson['type'][] = ['reading', 'video', 'interactive', 'lab', 'quiz', 'case_study'];
const emptyLesson: Lesson = { slug: '', title: '', type: 'reading', estMinutes: 15, objectives: [], contentMd: '## Pourquoi\n\n## Comment\n\n## Risques\n', skills: [] };

function LessonEditor({ l, upd, ro, issue }: { l: Lesson; upd: (v: Lesson) => void; ro: boolean; issue: (f: string) => boolean }) {
  const [preview, setPreview] = useState(false);
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
        <input aria-label="Titre de la leçon" placeholder="Titre" value={l.title} disabled={ro} onChange={(e) => upd({ ...l, title: e.target.value })} className={inputClass} />
        <input aria-label="Identifiant de la leçon" placeholder="identifiant-url" value={l.slug} disabled={ro} onChange={(e) => upd({ ...l, slug: e.target.value })} className={cn(inputClass, 'font-mono', issue('slug') && 'border-orange-400')} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <select aria-label="Type de leçon" value={l.type} disabled={ro} onChange={(e) => upd({ ...l, type: e.target.value as Lesson['type'] })} className={inputClass}>
          {LESSON_TYPES.map((t) => <option key={t} value={t}>{lessonTypeLabel[t] ?? t}</option>)}
        </select>
        <input aria-label="Durée estimée en minutes" type="number" min={1} max={600} placeholder="minutes" value={l.estMinutes ?? ''} disabled={ro}
          onChange={(e) => upd({ ...l, estMinutes: e.target.value ? Number(e.target.value) : null })} className={inputClass} />
      </div>
      <Field label="Objectifs" hint="Un par ligne : ce que l’apprenant saura faire." issue={issue('objectives')}>
        <LinesInput label="Objectifs de la leçon" value={l.objectives} disabled={ro} onChange={(objectives) => upd({ ...l, objectives })} rows={2} />
      </Field>
      <div className="flex items-center justify-between text-sm">
        <span className={cn('font-medium', issue('contentMd') && 'text-orange-700 dark:text-orange-300')}>Contenu (Markdown)</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => setPreview((p) => !p)}>{preview ? 'Modifier' : 'Aperçu'}</Button>
      </div>
      {preview ? (
        <div className="rounded-md border p-3"><Markdown>{l.contentMd || '_Vide_'}</Markdown></div>
      ) : (
        <textarea aria-label="Contenu de la leçon" rows={8} value={l.contentMd} disabled={ro} onChange={(e) => upd({ ...l, contentMd: e.target.value })} className={cn(inputClass, 'font-mono')} />
      )}
      <Field label="Compétences" hint="Codes du référentiel, un par ligne (ex. linux.systemd.units).">
        <LinesInput label="Compétences de la leçon" value={l.skills} disabled={ro} onChange={(skills) => upd({ ...l, skills })} rows={1} />
      </Field>
    </div>
  );
}

/** Formulaire d'un cours : présentation, puis modules et leçons (réordonnables). */
export function CourseForm({ c, set, ro, flagged, isNew }: FormProps<CourseContent>) {
  return (
    <>
      <Card className="space-y-4">
        <CardTitle>Présentation</CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Titre" issue={flagged('title')}><input value={c.title} disabled={ro} onChange={(e) => set('title', e.target.value)} className={inputClass} /></Field>
          <Field label="Identifiant d’URL" hint={isNew ? 'ex. linux-systemd' : 'fixe pour un cours publié'} issue={flagged('slug')}>
            <input value={c.slug} disabled={ro || !isNew} onChange={(e) => set('slug', e.target.value)} className={cn(inputClass, 'font-mono')} />
          </Field>
          <Field label="Plateforme">
            <select value={c.platform} disabled={ro} onChange={(e) => set('platform', e.target.value as CourseContent['platform'])} className={inputClass}>
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Niveau">
            <select value={c.difficulty} disabled={ro} onChange={(e) => set('difficulty', e.target.value as CourseContent['difficulty'])} className={inputClass}>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{difficultyLabel[d]}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Résumé" hint="Ce que l’apprenant saura faire à la fin du cours." issue={flagged('summary')}>
          <textarea rows={2} value={c.summary} disabled={ro} onChange={(e) => set('summary', e.target.value)} className={inputClass} />
        </Field>
      </Card>

      <Card className="space-y-4">
        <CardTitle>Plan</CardTitle>
        <CardDescription>
          Les leçons sont reconnues par leur identifiant : vous pouvez les renommer ou les déplacer sans perdre la progression des apprenants.
          Une leçon déjà validée par quelqu’un ne peut pas être supprimée.
        </CardDescription>
        <ListEditor<Module>
          title="Modules" hint="Dans l’ordre où l’apprenant les suit." issue={flagged('modules')} reorder addLabel="Ajouter un module"
          items={c.modules} disabled={ro} empty={{ title: '', lessons: [] }} onChange={(v) => set('modules', v)}
          render={(m, updModule, mi) => (
            <>
              <input aria-label={`Titre du module ${mi + 1}`} placeholder={`Module ${mi + 1}`} value={m.title} disabled={ro}
                onChange={(e) => updModule({ ...m, title: e.target.value })} className={cn(inputClass, 'font-medium')} />
              <ListEditor<Lesson>
                title="Leçons" hint="Elles se valident dans cet ordre." reorder addLabel="Ajouter une leçon"
                items={m.lessons} disabled={ro} empty={emptyLesson} onChange={(lessons) => updModule({ ...m, lessons })}
                render={(l, updLesson, li) => (
                  <LessonEditor l={l} upd={updLesson} ro={ro} issue={(f) => flagged(`modules.${mi}.lessons.${li}.${f}`)} />
                )}
              />
            </>
          )}
        />
      </Card>
    </>
  );
}
