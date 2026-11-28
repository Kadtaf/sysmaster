'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSession } from 'next-auth/react';
import { Loader2 } from 'lucide-react';
import type { AnalyzeResponse, SymptomDto } from '@sysmaster/contracts';
import { RiskBadge } from '@/components/risk-badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { publicApiBase } from '@/lib/api';

const EXAMPLE = 'Mon PC redémarre seul, surtout quand je joue, et les ventilateurs font beaucoup de bruit.';

export function DiagnosticForm() {
  const { data: session } = useSession();
  const [description, setDescription] = useState('');
  const [evidence, setEvidence] = useState('');
  const [symptoms, setSymptoms] = useState<SymptomDto[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [useAi, setUseAi] = useState(false);
  const signedIn = Boolean(session?.accessToken);

  useEffect(() => {
    fetch(`${publicApiBase}/diagnostic/symptoms?platform=windows`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setSymptoms)
      .catch(() => setError('API injoignable : démarrez la pile (docker compose up).'));
  }, []);

  async function analyze(extraSymptoms: string[] = []) {
    setLoading(true);
    setError(null);
    const allSelected = [...new Set([...selected, ...extraSymptoms])];
    setSelected(allSelected);
    try {
      const res = await fetch(`${publicApiBase}/diagnostic/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Connecté : le diagnostic rejoint l'historique de l'utilisateur. Anonyme : il reste possible.
          ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
        },
        body: JSON.stringify({
          platform: 'windows', description, symptoms: allSelected, evidence: evidence || undefined, useAi: useAi && signedIn,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(Array.isArray(body.message) ? body.message.join(' ') : body.message);
      setResult(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }

  const toggle = (code: string) =>
    setSelected((s) => (s.includes(code) ? s.filter((c) => c !== code) : [...s, code]));

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[2fr_3fr]">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void analyze();
        }}
      >
        <div>
          <label htmlFor="desc" className="text-sm font-medium">Que se passe-t-il ?</label>
          <textarea
            id="desc"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={EXAMPLE}
            className="mt-1 w-full rounded-md border bg-card p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button type="button" className="mt-1 text-xs link" onClick={() => setDescription(EXAMPLE)}>
            Utiliser l&apos;exemple « Mon PC redémarre seul »
          </button>
        </div>

        {symptoms.length > 0 && (
          <fieldset>
            <legend className="text-sm font-medium">Symptômes constatés (Windows)</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {symptoms.map((s) => (
                <label
                  key={s.code}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-xs has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring ${selected.includes(s.code) ? 'border-primary bg-primary text-primary-foreground' : ''}`}
                >
                  <input type="checkbox" className="sr-only" checked={selected.includes(s.code)} onChange={() => toggle(s.code)} />
                  {s.label}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div>
          <label htmlFor="evidence" className="text-sm font-medium">Extrait de journal (facultatif)</label>
          <textarea
            id="evidence"
            rows={3}
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            placeholder="ex. Event ID 41, Kernel-Power, critique"
            className="mt-1 w-full rounded-md border bg-card p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="mt-1 text-xs text-muted-foreground">Ne collez pas de mots de passe ni de données personnelles.</p>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={useAi && signedIn}
            disabled={!signedIn}
            onChange={(e) => setUseAi(e.target.checked)}
          />
          <span>
            Repérer les symptômes avec l&apos;IA
            <span className="block text-xs text-muted-foreground">
              {signedIn
                ? 'L’IA lit votre description et le journal, et cite le passage qui justifie chaque symptôme. Les causes restent classées par le moteur de diagnostic. Compte dans votre quota quotidien.'
                : 'Connectez-vous pour utiliser l’IA. Sans elle, les symptômes sont repérés par mots-clés.'}
            </span>
          </span>
        </label>

        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="size-4 animate-spin" aria-hidden />} Analyser
        </Button>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </form>

      <div aria-live="polite">
        {result && (
          <div className="space-y-4">
            <Card>
              <CardTitle>Confiance : {Math.round(result.confidence * 100)} %</CardTitle>
              <CardDescription>
                Symptômes retenus : {result.detectedSymptoms.map((s) => s.label).join(', ') || 'aucun'}
                {result.extraction.method === 'ai' ? ' (repérés par l’IA)' : ''}.
                {result.matchedEvidence.length > 0 &&
                  ` Indices trouvés dans le journal : ${result.matchedEvidence.map((e) => e.name).join(', ')}.`}
              </CardDescription>
              {result.extraction.note && <p className="mt-2 text-xs text-amber-700">{result.extraction.note}</p>}
              {result.extraction.quotes.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm">
                  {result.extraction.quotes.map((q) => (
                    <li key={q.code}>
                      <span className="font-medium">{q.label}</span>
                      <span className="text-muted-foreground"> : « {q.quote} » ({q.source === 'evidence' ? 'journal' : 'votre description'})</span>
                    </li>
                  ))}
                </ul>
              )}
              {result.extraction.logFindings.length > 0 && (
                <details className="mt-3 text-sm" open>
                  <summary className="cursor-pointer font-medium">Lignes du journal relevées</summary>
                  <ul className="mt-2 space-y-2">
                    {result.extraction.logFindings.map((f) => (
                      <li key={f.quote}>
                        <code className="block rounded bg-muted px-2 py-1 font-mono text-xs">{f.quote}</code>
                        <span className="text-muted-foreground">{f.summary}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {result.clarifyingQuestions.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-medium">Pour affiner, répondez « oui » si c&apos;est le cas :</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {result.clarifyingQuestions.map((q) => (
                      <Button key={q.symptom} variant="outline" size="sm" onClick={() => analyze([q.symptom])}>
                        {q.question}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <AnimatePresence initial={false}>
              {result.hypotheses.map((h, i) => (
                <motion.div key={h.cause} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Card>
                    <div className="flex items-baseline justify-between gap-4">
                      <CardTitle>{i + 1}. {h.label}</CardTitle>
                      <span className="font-mono text-lg font-semibold">{Math.round(h.probability * 100)} %</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-muted" role="presentation">
                      <div className="h-2 rounded-full bg-primary" style={{ width: `${h.probability * 100}%` }} />
                    </div>
                    <p className="mt-3 text-sm">{h.explanation}</p>
                    <details className="mt-3 text-sm">
                      <summary className="cursor-pointer font-medium">Pourquoi ce classement ?</summary>
                      <ul className="mt-2 list-disc space-y-1 pl-6 text-muted-foreground">
                        {h.reasoning.map((r) => <li key={r}>{r}</li>)}
                      </ul>
                    </details>
                    {h.actionPlan.length > 0 && (
                      <ol className="mt-4 space-y-2 text-sm">
                        {h.actionPlan.map((s, n) => (
                          <li key={s.step} className="rounded-md border p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium">{n + 1}. {s.step}</span>
                              <RiskBadge level={s.risk} />
                            </div>
                            <p className="mt-1 text-muted-foreground">Pourquoi : {s.why}</p>
                          </li>
                        ))}
                      </ol>
                    )}
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
            {result.hypotheses.length === 0 && (
              <Card>
                <CardTitle>Aucun symptôme reconnu</CardTitle>
                <CardDescription>Sélectionnez des symptômes dans la liste ou reformulez la description.</CardDescription>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
