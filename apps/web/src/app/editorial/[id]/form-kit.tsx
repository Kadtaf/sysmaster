'use client';

import { RISK_LEVELS, type RiskLevel } from '@sysmaster/contracts';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { riskMeta } from '@/lib/labels';
import { cn } from '@/lib/utils';

export const inputClass = 'mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-70';

/** Ce que reçoit chaque formulaire de contenu. */
export interface FormProps<C> {
  c: C;
  set: <K extends keyof C>(key: K, value: C[K]) => void;
  ro: boolean;
  /** Champs signalés par les règles de publication (préfixes : « modules.0 » signale aussi « modules »). */
  flagged: (field: string) => boolean;
  isNew: boolean;
}

export function Field({ label, hint, issue, children }: { label: string; hint?: string; issue?: boolean; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className={cn('font-medium', issue && 'text-orange-700 dark:text-orange-300')}>{label}</span>
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      {children}
    </label>
  );
}

/** Liste éditable générique : chaque élément est un petit formulaire. */
export function ListEditor<T>({
  title, hint, items, disabled, issue, empty, render, onChange, addLabel = 'Ajouter', reorder = false,
}: {
  title: string; hint: string; items: T[]; disabled: boolean; issue?: boolean; empty: T; addLabel?: string; reorder?: boolean;
  render: (item: T, set: (v: T) => void, index: number) => React.ReactNode; onChange: (items: T[]) => void;
}) {
  const move = (i: number, d: number) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <fieldset className="space-y-3">
      <legend className={cn('font-medium', issue && 'text-orange-700 dark:text-orange-300')}>{title}</legend>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {items.map((item, i) => (
        <div key={i} className="flex gap-2 rounded-md border p-3">
          <div className="min-w-0 flex-1 space-y-2">{render(item, (v) => onChange(items.map((x, j) => (j === i ? v : x))), i)}</div>
          {!disabled && (
            <div className="flex flex-col gap-1">
              {reorder && i > 0 && (
                <Button type="button" variant="ghost" size="sm" aria-label={`Monter l’élément ${i + 1}`} onClick={() => move(i, -1)}>↑</Button>
              )}
              {reorder && i < items.length - 1 && (
                <Button type="button" variant="ghost" size="sm" aria-label={`Descendre l’élément ${i + 1}`} onClick={() => move(i, 1)}>↓</Button>
              )}
              <Button type="button" variant="ghost" size="sm" aria-label={`Supprimer l’élément ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
          )}
        </div>
      ))}
      {!disabled && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, structuredClone(empty)])}>
          <Plus className="size-4" aria-hidden /> {addLabel}
        </Button>
      )}
    </fieldset>
  );
}

export function RiskSelect({ value, onChange, disabled, label = 'Niveau de risque' }: { value: RiskLevel; onChange: (v: RiskLevel) => void; disabled: boolean; label?: string }) {
  return (
    <select aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as RiskLevel)} className={inputClass}>
      {RISK_LEVELS.map((r) => <option key={r} value={r}>{riskMeta[r].label}</option>)}
    </select>
  );
}

/** Saisie d'une liste de textes, un par ligne (objectifs, synonymes…). Les lignes vides sont ignorées. */
export function LinesInput({ value, onChange, disabled, label, rows = 3 }: { value: string[]; onChange: (v: string[]) => void; disabled: boolean; label: string; rows?: number }) {
  const [text, setText] = useState(value.join('\n'));
  return (
    <textarea
      aria-label={label}
      rows={rows}
      value={text}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value);
        onChange(e.target.value.split('\n').map((l) => l.trim()).filter(Boolean));
      }}
      className={inputClass}
    />
  );
}
