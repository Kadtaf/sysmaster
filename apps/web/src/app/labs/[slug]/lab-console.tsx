'use client';

import type { LabCheckResultDto, LabCommandResultDto, LabInstanceDto, LabTranscriptEntry } from '@sysmaster/contracts';
import { CheckCircle2, Lightbulb, RotateCcw, XCircle } from 'lucide-react';
import { signIn, useSession } from 'next-auth/react';
import { useEffect, useRef, useState } from 'react';
import { Markdown } from '@/components/markdown';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { apiPost } from '@/lib/client-api';

export function LabConsole({ slug, signedIn }: { slug: string; signedIn: boolean }) {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [instance, setInstance] = useState<LabInstanceDto | null>(null);
  const [checks, setChecks] = useState<LabCheckResultDto['checks'] | null>(null);
  const [line, setLine] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const screen = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    screen.current?.scrollTo({ top: screen.current.scrollHeight });
  }, [instance?.transcript.length]);

  if (!signedIn) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">Connectez-vous pour recevoir votre machine : votre progression et vos indices sont gardés.</p>
        <Button onClick={() => signIn('keycloak', { callbackUrl: `/labs/${slug}` })}>Se connecter pour démarrer</Button>
      </Card>
    );
  }

  async function act<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action impossible');
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  const start = (fresh = false) =>
    act(async () => {
      const i = await apiPost<LabInstanceDto>(`/labs/${slug}/instances${fresh ? '?fresh=true' : ''}`, token);
      setInstance(i);
      setChecks(null);
      setTimeout(() => input.current?.focus(), 0);
    });

  if (!instance) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Rien ne s&apos;exécute réellement : chaque commande transforme une machine simulée. Tapez <code>help</code> pour la liste des commandes.
        </p>
        <Button disabled={busy} onClick={() => start()}>Démarrer le lab</Button>
        {error && <p role="alert" className="w-full text-sm text-red-600">{error}</p>}
      </Card>
    );
  }

  const current = instance;
  const running = current.status === 'running';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const command = line.trim();
    if (!command || busy) return;
    if (command === 'clear') {
      setLine('');
      setInstance({ ...current, transcript: [] });
      return;
    }
    void act(async () => {
      const r = await apiPost<LabCommandResultDto>(`/lab-instances/${current.id}/commands`, token, { command });
      const entry: LabTranscriptEntry = { command: r.command, output: r.output, exitCode: r.exitCode, warning: r.warning };
      setInstance((i) => (i ? { ...i, prompt: r.prompt, transcript: [...i.transcript, entry] } : i));
      setHistory((h) => [...h, command]);
      setCursor(null);
      setLine('');
      setTimeout(() => input.current?.focus(), 0);
    });
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    if (!history.length) return;
    const next = e.key === 'ArrowUp' ? Math.max(0, (cursor ?? history.length) - 1) : Math.min(history.length, (cursor ?? history.length) + 1);
    setCursor(next);
    setLine(history[next] ?? '');
  };

  const hint = () =>
    act(async () => setInstance(await apiPost<LabInstanceDto>(`/lab-instances/${current.id}/hints`, token)));

  const check = () =>
    act(async () => {
      const r = await apiPost<LabCheckResultDto>(`/lab-instances/${current.id}/check`, token);
      setChecks(r.checks);
      setInstance(r.instance);
    });

  return (
    <section className="space-y-4" aria-label="Terminal du lab">
      <div
        ref={screen}
        className="h-96 overflow-y-auto rounded-lg bg-slate-950 p-4 font-mono text-sm text-slate-100"
        onClick={() => input.current?.focus()}
      >
        <p className="text-slate-400">Machine simulée prête. Tapez help pour commencer.</p>
        {current.transcript.map((t, i) => (
          <div key={i} className="mt-2">
            <p><span className="text-emerald-400">$</span> {t.command}</p>
            {t.output && <pre className={`whitespace-pre-wrap ${t.exitCode === 0 ? 'text-slate-200' : 'text-red-300'}`}>{t.output}</pre>}
            {t.warning && <p className="mt-1 rounded bg-amber-900/50 p-2 text-amber-100">⚠ {t.warning}</p>}
          </div>
        ))}
        {running && (
          <form onSubmit={submit} className="mt-2 flex items-center gap-2">
            <label htmlFor="lab-command" className="shrink-0 text-emerald-400">{current.prompt}</label>
            <input
              id="lab-command"
              ref={input}
              value={line}
              onChange={(e) => setLine(e.target.value)}
              onKeyDown={onKey}
              disabled={busy}
              maxLength={500}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent outline-none"
            />
          </form>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-3">
        {running && (
          <>
            <Button onClick={check} disabled={busy}>Vérifier ma réparation</Button>
            <Button variant="outline" onClick={hint} disabled={busy || current.hints.length >= current.hintCount}>
              <Lightbulb className="mr-2 size-4" aria-hidden />
              Indice ({current.hints.length}/{current.hintCount}) : coûte des points
            </Button>
          </>
        )}
        <Button variant="ghost" onClick={() => start(true)} disabled={busy}>
          <RotateCcw className="mr-2 size-4" aria-hidden />
          Recommencer avec une machine neuve
        </Button>
      </div>

      {current.hints.length > 0 && (
        <Card>
          <h2 className="font-semibold">Indices</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{current.hints.map((h) => <li key={h}>{h}</li>)}</ol>
        </Card>
      )}

      {checks && (
        <Card>
          <h2 className="font-semibold">{current.status === 'solved' ? 'Machine réparée' : 'Pas encore'}</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {checks.map((c) => (
              <li key={c.description} className="flex items-center gap-2">
                {c.passed ? <CheckCircle2 className="size-4 text-emerald-600" aria-hidden /> : <XCircle className="size-4 text-red-600" aria-hidden />}
                <span>{c.description}</span>
                <span className="sr-only">{c.passed ? 'vérifié' : 'pas encore'}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {current.status === 'solved' && current.solutionMd && (
        <Card>
          <h2 className="text-lg font-semibold">Bravo : score {current.score}/100</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {current.hints.length === 0 ? 'Résolu sans indice : c’est ce qui rapporte le plus d’XP.' : `Résolu avec ${current.hints.length} indice${current.hints.length > 1 ? 's' : ''}.`}
          </p>
          <div className="mt-4"><Markdown>{current.solutionMd}</Markdown></div>
        </Card>
      )}
      {current.status === 'expired' && <Card>Cette session a expiré. Recommencez avec une machine neuve.</Card>}
    </section>
  );
}
