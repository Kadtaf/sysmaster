'use client';

import { DIFFICULTIES, PLATFORMS, type QuizContent, type QuizQuestion } from '@sysmaster/contracts';
import { Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { difficultyLabel } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { Field, FormProps, inputClass, ListEditor } from './form-kit';

const LETTERS = 'abcdef';
const emptyQuestion: QuizQuestion = {
  type: 'single', promptMd: '', choices: [{ id: 'a', text: '' }, { id: 'b', text: '' }, { id: 'c', text: '' }], answer: [],
  explanation: '', difficulty: 'beginner', generatedByAi: false,
};

/** Formulaire d'un quiz : chaque question, ses choix, la ou les bonnes réponses et l'explication. */
export function QuizForm({ c, set, ro, flagged, isNew }: FormProps<QuizContent>) {
  return (
    <>
      <Card className="space-y-4">
        <CardTitle>Présentation</CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Titre" issue={flagged('title')}><input value={c.title} disabled={ro} onChange={(e) => set('title', e.target.value)} className={inputClass} /></Field>
          <Field label="Identifiant d’URL" hint={isNew ? 'ex. quiz-linux-df' : 'fixe pour un quiz publié'} issue={flagged('slug')}>
            <input value={c.slug} disabled={ro || !isNew} onChange={(e) => set('slug', e.target.value)} className={cn(inputClass, 'font-mono')} />
          </Field>
          <Field label="Plateforme">
            <select value={c.platform} disabled={ro} onChange={(e) => set('platform', e.target.value as QuizContent['platform'])} className={inputClass}>
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Fiche liée" hint="Le quiz vérifie la compréhension de cette fiche." issue={flagged('commandSlug')}>
            <input value={c.commandSlug ?? ''} disabled={ro} onChange={(e) => set('commandSlug', e.target.value || null)} className={cn(inputClass, 'font-mono')} />
          </Field>
        </div>
      </Card>
      <Card className="space-y-4">
        <CardDescription>
          Relisez chaque question proposée par l’IA : la bonne réponse doit se justifier par la fiche, les mauvais choix ressembler à de vraies
          erreurs, et l’explication dire pourquoi.
        </CardDescription>
        <ListEditor<QuizQuestion>
          title="Questions" hint="Comprendre avant d’exécuter : on interroge le pourquoi, le quand et les risques plutôt que la syntaxe."
          issue={flagged('questions')} reorder addLabel="Ajouter une question" items={c.questions} disabled={ro} empty={emptyQuestion}
          onChange={(v) => set('questions', v)}
          render={(q, upd, i) => (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">Question {i + 1}</span>
                {q.generatedByAi && <Badge className="bg-violet-100 text-violet-900"><Sparkles className="mr-1 size-3" aria-hidden /> Proposée par l’IA</Badge>}
                <select aria-label="Type" value={q.type} disabled={ro} onChange={(e) => upd({ ...q, type: e.target.value as QuizQuestion['type'], answer: q.answer.slice(0, 1) })} className="rounded-md border bg-background px-2 py-1 text-xs">
                  <option value="single">Une bonne réponse</option>
                  <option value="multiple">Plusieurs bonnes réponses</option>
                </select>
                <select aria-label="Difficulté" value={q.difficulty} disabled={ro} onChange={(e) => upd({ ...q, difficulty: e.target.value as QuizQuestion['difficulty'] })} className="rounded-md border bg-background px-2 py-1 text-xs">
                  {DIFFICULTIES.map((d) => <option key={d} value={d}>{difficultyLabel[d]}</option>)}
                </select>
              </div>
              <textarea aria-label={`Énoncé ${i + 1}`} rows={2} value={q.promptMd} disabled={ro} onChange={(e) => upd({ ...q, promptMd: e.target.value })} className={inputClass} placeholder="Énoncé" />
              <ul className="space-y-1">
                {q.choices.map((ch, j) => (
                  <li key={ch.id} className="flex items-center gap-2">
                    <input
                      type={q.type === 'single' ? 'radio' : 'checkbox'} name={`q${i}`} aria-label={`Choix ${ch.id} correct`} disabled={ro}
                      checked={q.answer.includes(ch.id)}
                      onChange={(e) => upd({ ...q, answer: q.type === 'single' ? [ch.id] : e.target.checked ? [...q.answer, ch.id].sort() : q.answer.filter((a) => a !== ch.id) })}
                    />
                    <span className="font-mono text-xs">{ch.id}</span>
                    <input aria-label={`Texte du choix ${ch.id}`} value={ch.text} disabled={ro} onChange={(e) => upd({ ...q, choices: q.choices.map((x, k) => (k === j ? { ...x, text: e.target.value } : x)) })} className={cn(inputClass, 'mt-0')} />
                  </li>
                ))}
              </ul>
              {!ro && q.choices.length < 6 && (
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => upd({ ...q, choices: [...q.choices, { id: LETTERS[q.choices.length], text: '' }] })}>
                  Ajouter un choix
                </button>
              )}
              <Field label="Explication" hint="Pourquoi la bonne réponse est juste, puis pourquoi chaque autre choix est faux.">
                <textarea rows={3} value={q.explanation} disabled={ro} onChange={(e) => upd({ ...q, explanation: e.target.value })} className={inputClass} />
              </Field>
            </div>
          )}
        />
      </Card>
    </>
  );
}
