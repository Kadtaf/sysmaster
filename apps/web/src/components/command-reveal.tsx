'use client';

import { useState } from 'react';
import { Check, Copy, Eye, ShieldAlert } from 'lucide-react';
import type { RiskItem, RiskLevel } from '@sysmaster/contracts';
import { RiskBadge } from '@/components/risk-badge';
import { Button } from '@/components/ui/button';

/**
 * Bloc « commande » appliquant la règle P-2 :
 *  - risque élevé/critique : commande masquée jusqu'à ce que les risques aient été dépliés ;
 *  - risque critique : pas de bouton copier.
 */
export function CommandReveal(props: {
  syntax: string;
  riskLevel: RiskLevel;
  risks: RiskItem[];
  masked: boolean;
  copyAllowed: boolean;
}) {
  const [risksRead, setRisksRead] = useState(!props.masked);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(props.syntax);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-3">
      {props.risks.length > 0 && (
        <details
          className="rounded-lg border p-4"
          open={!props.masked}
          onToggle={(e) => e.currentTarget.open && setRisksRead(true)}
        >
          <summary className="flex cursor-pointer items-center gap-2 font-medium">
            <ShieldAlert className="size-4" aria-hidden /> Risques à connaître <RiskBadge level={props.riskLevel} />
          </summary>
          <ul className="mt-3 list-disc space-y-1 pl-6 text-sm">
            {props.risks.map((r, i) => (
              <li key={i}>{r.text}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="relative rounded-lg bg-slate-950 p-4 font-mono text-sm text-slate-100">
        {risksRead ? (
          <pre className="overflow-x-auto whitespace-pre-wrap pr-10">{props.syntax}</pre>
        ) : (
          <div className="flex flex-wrap items-center gap-3 text-slate-300">
            <Eye className="size-4" aria-hidden />
            Lisez les risques ci-dessus pour afficher la commande.
          </div>
        )}
        {risksRead && props.copyAllowed && (
          <Button
            variant="ghost"
            size="sm"
            onClick={copy}
            className="absolute right-2 top-2 text-slate-300 hover:bg-slate-800"
            aria-label="Copier la syntaxe"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
        )}
      </div>
      {risksRead && !props.copyAllowed && (
        <p className="text-xs text-muted-foreground">
          Copie désactivée : pour une commande critique, tapez-la vous-même en vérifiant chaque argument.
        </p>
      )}
    </div>
  );
}
