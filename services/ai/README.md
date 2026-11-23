# services/ai — Assistant IA (Phase 3)

Service **FastAPI** (Python 3.12) qui répond aux questions de l'assistant SysMaster. Il est **interne** : seule l'API cœur l'appelle, après avoir authentifié l'utilisateur et appliqué son quota. Conception : [`docs/01-architecture.md` §8](../../docs/01-architecture.md#8-architecture-ia-multi-agents).

## Démarrer

```bash
cd services/ai
uv sync                                   # dépendances figées par uv.lock
uv run uvicorn app.main:app --reload      # http://localhost:8000/health
uv run pytest -q && uv run ruff check .   # tests (aucune clé, aucun appel réseau) et lint
```

Par défaut `AI_LLM=fake` : réponses factices mais complètes (étapes, risques, sources), pour développer sans clé ni coût. Pour le vrai modèle :

```bash
export AI_LLM=claude ANTHROPIC_API_KEY=…   # clé créée sur console.anthropic.com, jamais dans Git
```

| Variable | Défaut | Rôle |
|---|---|---|
| `AI_LLM` | `fake` | `claude` en production |
| `AI_MODEL` | `claude-opus-5-5` | modèle principal ; le repli côté serveur prend le relais en cas de surcharge |
| `AI_EFFORT` | `medium` | profondeur de raisonnement (`low` à `max`) : à mesurer avec les golden sets avant de changer |
| `AI_MAX_TOKENS` | `8000` | plafond de sortie |
| `CORE_API_URL` | `http://localhost:4000/api/v1` | API cœur, lue pour la base de connaissances |
| `AI_SERVICE_TOKEN` | `dev-only-ai-token` | jeton partagé avec l'API cœur (`openssl rand -hex 32` en production) |

## Contrat

| Endpoint | Rôle |
|---|---|
| `GET /health` | état et mode (`fake` ou `claude`) |
| `POST /v1/ask` | en-tête `x-ai-token` ; `{ question, platform?, level, history[≤6] }` → `{ answer, agent, domain, model, usage, latencyMs, outcome }` |

Prévus : `POST /v1/diagnostic/extract` (texte libre ou journaux → symptômes pour le moteur de déduction), `POST /v1/quiz/generate` (relu avant publication), streaming.

## Chemin d'une question

1. **Routage** (`app/agents/router.py`) : panne → *diagnosticien*, sinon *tuteur* ; domaine déduit de la plateforme ou du vocabulaire.
2. **Recherche** (`app/rag/retriever.py`) : mots significatifs de la question → `GET /kb/commands?q=…` puis fiches complètes, numérotées `[1]`, `[2]`…
3. **Génération** (`app/llm/claude.py`) : prompt système du profil (mis en cache), documents, sortie au schéma `DraftAnswer`.
4. **Garde-fous** (`app/guardrails/`) :
   - le risque d'une commande est le maximum entre l'avis du modèle et les motifs destructifs reconnus ; le modèle ne peut pas l'abaisser ;
   - `high` ou `critical` → commande masquée tant que les risques ne sont pas lus ; `critical` → pas de copie ;
   - une étape avec commande mais sans « pourquoi » perd sa commande ;
   - une citation vers un document non fourni est retirée ; sans source, la réponse est « non vérifiée ».

## Structure

```
app/
├── agents/      routeur et profils (prompts système)
├── guardrails/  motifs destructifs, validation de sortie
├── llm/         port, client Claude, modèle factice
├── rag/         recherche dans la base de connaissances
├── orchestrator.py
└── main.py
tests/           garde-fous, routeur, API, client Claude (SDK simulé)
```
