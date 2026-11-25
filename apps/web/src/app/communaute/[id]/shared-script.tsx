'use client';

import { useState } from 'react';
import { AlertTriangle, BadgeCheck, Check, Copy, Eye } from 'lucide-react';
import type { SharedScriptDto } from '@sysmaster/contracts';
import { Markdown } from '@/components/markdown';
import { RiskBadge } from '@/components/risk-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { scriptLanguageLabel } from '@/lib/labels';

/**
 * Script partagé (P-5, P-2) : l'explication d'abord ; un script à risque élevé ou critique est replié
 * tant qu'on n'a pas lu ses risques ; pas de bouton copier sur un script critique ni sur un script non relu
 * à risque élevé.
 */
export function SharedScript({ script: s, canReview, onReview, pending }: {
  script: SharedScriptDto;
  canReview: boolean;
  onReview: (reviewed: boolean) => void;
  pending: boolean;
}) {
  const masked = s.riskLevel === 'high' || s.riskLevel === 'critical';
  const [shown, setShown] = useState(!masked);
  const [copied, setCopied] = useState(false);
  const copyAllowed = s.riskLevel !== 'critical' && (s.reviewed || s.riskLevel !== 'high');

  async function copy() {
    await navigator.clipboard.writeText(s.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label="Script partagé">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{scriptLanguageLabel[s.language] ?? s.language}</Badge>
        <RiskBadge level={s.riskLevel} />
        {s.reviewed ? (
          <Badge className="bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100"><BadgeCheck className="mr-1 size-3" aria-hidden />Relu</Badge>
        ) : (
          <Badge>Pas encore relu</Badge>
        )}
        {canReview && (
          <Button size="sm" variant="outline" className="ml-auto" disabled={pending} onClick={() => onReview(!s.reviewed)}>
            {s.reviewed ? 'Retirer la relecture' : 'Marquer comme relu'}
          </Button>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold">Ce que fait ce script</h2>
        <Markdown ugc>{s.explanation}</Markdown>
      </div>

      {s.warnings.length > 0 && (
        <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4" aria-hidden /> Points de vigilance repérés dans le code</p>
          <ul className="mt-1 list-disc pl-6">{s.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
      {!s.reviewed && <p className="text-xs text-muted-foreground">Ce script n’a pas encore été relu : lisez-le ligne à ligne et testez-le sur une machine de test avant toute utilisation réelle.</p>}

      {shown ? (
        <div className="relative">
          <pre className="max-h-[32rem] overflow-auto rounded-md bg-slate-950 p-4 text-sm text-slate-100"><code>{s.code}</code></pre>
          {copyAllowed && (
            <Button size="sm" variant="outline" className="absolute right-2 top-2 bg-background" onClick={copy}>
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              <span className="sr-only">Copier le script</span>
            </Button>
          )}
        </div>
      ) : (
        <Button variant="outline" onClick={() => setShown(true)}>
          <Eye className="size-4" aria-hidden /> J’ai lu l’explication et les risques : afficher le script
        </Button>
      )}
    </section>
  );
}
