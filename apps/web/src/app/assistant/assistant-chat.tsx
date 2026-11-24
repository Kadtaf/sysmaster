'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { AlertTriangle, BookOpen, Loader2, MessageSquarePlus, ThumbsDown, ThumbsUp } from 'lucide-react';
import {
  ASSISTANT_LEVELS,
  type AssistantAnswer,
  type AssistantConversationSummary,
  type AssistantReplyDto,
  type AssistantTurnDto,
} from '@sysmaster/contracts';
import { CommandReveal } from '@/components/command-reveal';
import { RiskBadge } from '@/components/risk-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { publicApiBase } from '@/lib/api';
import { ApiError, apiPost, apiPut } from '@/lib/client-api';

const levelLabel: Record<(typeof ASSISTANT_LEVELS)[number], string> = {
  beginner: 'Débutant', intermediate: 'Intermédiaire', advanced: 'Avancé',
};
const PLATFORM_CHOICES = [
  ['', 'Indifférent'], ['linux', 'Linux'], ['windows', 'Windows'], ['macos', 'macOS'], ['network', 'Réseau'],
  ['docker', 'Docker'], ['kubernetes', 'Kubernetes'], ['postgresql', 'PostgreSQL'],
] as const;

interface Turn { messageId: string | null; question: string; reply: AssistantAnswer | null; agent: string | null }

export function AssistantChat({ conversations: initial }: { conversations: AssistantConversationSummary[] }) {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [conversations, setConversations] = useState(initial);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [platform, setPlatform] = useState('');
  const [level, setLevel] = useState<(typeof ASSISTANT_LEVELS)[number]>('beginner');
  const [remaining, setRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open(id: string) {
    setError(null);
    const res = await fetch(`${publicApiBase}/assistant/conversations/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return setError('Conversation introuvable.');
    const body = (await res.json()) as AssistantTurnDto[];
    setConversationId(id);
    setTurns(body.map((t) => ({ messageId: t.reply ? t.messageId : null, question: t.question, reply: t.reply, agent: t.agent })));
  }

  async function ask() {
    setLoading(true);
    setError(null);
    const asked = question;
    try {
      const res = await apiPost<AssistantReplyDto>('/assistant/ask', token, {
        question: asked, level, platform: platform || undefined, conversationId,
      });
      setTurns((t) => [...t, { messageId: res.messageId, question: asked, reply: res.answer, agent: res.agent }]);
      setRemaining(res.remainingToday);
      setQuestion('');
      if (!conversationId) {
        setConversationId(res.conversationId);
        setConversations((c) => [{ id: res.conversationId, title: asked.slice(0, 80), createdAt: new Date().toISOString() }, ...c]);
      }
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_3fr]">
      <aside className="space-y-2">
        <Button variant="outline" size="sm" onClick={() => { setConversationId(undefined); setTurns([]); }}>
          <MessageSquarePlus className="size-4" aria-hidden /> Nouvelle conversation
        </Button>
        <ul className="space-y-1 text-sm">
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => void open(c.id)}
                className={`w-full truncate rounded-md px-2 py-1 text-left hover:bg-muted ${c.id === conversationId ? 'bg-muted font-medium' : ''}`}
              >
                {c.title}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="space-y-6">
        <div aria-live="polite" className="space-y-6">
          {turns.map((t, i) => (
            <div key={t.messageId ?? `q-${i}`} className="space-y-3">
              <p className="ml-auto max-w-xl rounded-lg bg-primary/10 p-3 text-sm">{t.question}</p>
              {t.reply ? (
                <AnswerView answer={t.reply} agent={t.agent} messageId={t.messageId} token={token} />
              ) : (
                <p className="text-sm text-muted-foreground">Pas de réponse : l&apos;assistant était indisponible. Reposez la question.</p>
              )}
            </div>
          ))}
        </div>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void ask();
          }}
        >
          <label htmlFor="question" className="text-sm font-medium">Votre question</label>
          <textarea
            id="question"
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="ex. Mon service nginx ne démarre plus après une mise à jour, comment trouver pourquoi ?"
            className="w-full rounded-md border bg-card p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              Plateforme
              <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="rounded-md border bg-card px-2 py-1">
                {PLATFORM_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2">
              Niveau
              <select value={level} onChange={(e) => setLevel(e.target.value as typeof level)} className="rounded-md border bg-card px-2 py-1">
                {ASSISTANT_LEVELS.map((l) => <option key={l} value={l}>{levelLabel[l]}</option>)}
              </select>
            </label>
            <Button type="submit" disabled={loading || question.trim().length < 3}>
              {loading && <Loader2 className="size-4 animate-spin" aria-hidden />} Demander
            </Button>
            {remaining !== null && <span className="text-xs text-muted-foreground">{remaining} question(s) restante(s) aujourd&apos;hui</span>}
          </div>
          <p className="text-xs text-muted-foreground">
            Ne collez pas de mots de passe, de clés ni de données personnelles. L&apos;assistant ne lance aucune commande : c&apos;est vous qui décidez.
          </p>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </form>
      </div>
    </div>
  );
}

function AnswerView({ answer, agent, messageId, token }: { answer: AssistantAnswer; agent: string | null; messageId: string | null; token?: string }) {
  const [rated, setRated] = useState<1 | -1 | null>(null);

  async function rate(rating: 1 | -1) {
    if (!messageId) return;
    await apiPut(`/assistant/messages/${messageId}/feedback`, token, { rating });
    setRated(rating);
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle>{answer.summary}</CardTitle>
        {agent && <Badge>{agent === 'diagnostician' ? 'Diagnostic' : 'Tuteur'}</Badge>}
        {!answer.verified && (
          <Badge className="bg-amber-100 text-amber-900">
            <AlertTriangle className="mr-1 size-3" aria-hidden /> Non vérifiée
          </Badge>
        )}
      </div>
      <CardDescription className="whitespace-pre-line">{answer.explanation}</CardDescription>
      {!answer.verified && (
        <p className="text-xs text-muted-foreground">
          Cette réponse ne s&apos;appuie sur aucune fiche de la base : vérifiez-la dans la documentation officielle avant d&apos;agir.
        </p>
      )}

      {answer.steps.length > 0 && (
        <ol className="space-y-4">
          {answer.steps.map((s, i) => (
            <li key={i} className="rounded-md border p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{i + 1}. {s.title}</span>
                <RiskBadge level={s.risk} />
              </div>
              <dl className="mt-2 grid gap-1 text-muted-foreground sm:grid-cols-[8rem_1fr]">
                <dt className="font-medium text-foreground">Pourquoi</dt><dd>{s.why}</dd>
                <dt className="font-medium text-foreground">Comment</dt><dd>{s.how}</dd>
                <dt className="font-medium text-foreground">Quand</dt><dd>{s.when}</dd>
                {s.alternatives.length > 0 && (<><dt className="font-medium text-foreground">Alternatives</dt><dd>{s.alternatives.join(' ; ')}</dd></>)}
              </dl>
              {s.command && (
                <div className="mt-3">
                  <CommandReveal
                    syntax={s.command}
                    riskLevel={s.risk}
                    risks={s.riskNote ? [{ level: s.risk, text: s.riskNote }] : []}
                    masked={s.maskedUntilRisksRead}
                    copyAllowed={s.copyAllowed}
                  />
                  {s.flaggedBy.length > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">Signalée par les garde-fous : {s.flaggedBy.join(', ')}.</p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {answer.checkQuestions.length > 0 && (
        <div className="text-sm">
          <p className="font-medium">Pour vérifier que vous avez compris</p>
          <ul className="mt-1 list-disc pl-6 text-muted-foreground">{answer.checkQuestions.map((q) => <li key={q}>{q}</li>)}</ul>
        </div>
      )}

      {answer.sources.length > 0 && (
        <div className="text-sm">
          <p className="flex items-center gap-2 font-medium"><BookOpen className="size-4" aria-hidden /> Sources</p>
          <ul className="mt-1 space-y-1">
            {answer.sources.map((s) => (
              <li key={s.ref}>
                [{s.ref}]{' '}
                {s.kind === 'official_doc' ? (
                  <>
                    <Badge className="mr-1 bg-sky-100 text-sky-900">Doc officielle</Badge>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{s.title}</a>
                    {s.attribution && <span className="block pl-6 text-xs text-muted-foreground">{s.attribution}</span>}
                  </>
                ) : (
                  <>
                    <Badge className="mr-1">Fiche SysMaster</Badge>
                    <a href={s.url} className="text-primary hover:underline">{s.title}</a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {answer.notes.length > 0 && <ul className="text-xs text-muted-foreground">{answer.notes.map((n) => <li key={n}>{n}</li>)}</ul>}

      {messageId && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          Cette réponse vous a-t-elle aidé ?
          <Button variant={rated === 1 ? 'default' : 'ghost'} size="sm" aria-label="Utile" onClick={() => void rate(1)}><ThumbsUp className="size-4" /></Button>
          <Button variant={rated === -1 ? 'default' : 'ghost'} size="sm" aria-label="Pas utile" onClick={() => void rate(-1)}><ThumbsDown className="size-4" /></Button>
        </div>
      )}
    </Card>
  );
}
