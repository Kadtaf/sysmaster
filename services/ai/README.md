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
| `QDRANT_URL` | vide | index de la documentation officielle ; vide : fiches SysMaster seulement |
| `AI_EMBEDDER` | `hash` (`fastembed` dans l'image) | `fastembed` : modèle multilingue local ; `hash` : lexical, pour les tests |
| `EMBED_MODEL` | `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` | changer de modèle impose de réindexer |
| `RAG_MIN_SIMILARITY` | `0.3` | en dessous, un passage n'est pas proposé au modèle |
| `PROFILES_TTL_SECONDS` | `60` | délai maximal avant qu'un profil publié dans le back-office s'applique |

## Contrat

| Endpoint | Rôle |
|---|---|
| `GET /health` | état et mode (`fake` ou `claude`) |
| `POST /v1/ask` | en-tête `x-ai-token` ; `{ question, platform?, level, history[≤6] }` → `{ answer, agent, domain, model, usage, latencyMs, outcome }` |
| `POST /v1/quiz/generate` | en-tête `x-ai-token` ; `{ title, platform?, level, text, count≤10 }` → `{ questions[{type, promptMd, choices[{id,text}], answer[], explanation, difficulty}], notes, model, usage, latencyMs, outcome }`. Questions mal formées écartées (choix, réponse, explication), identifiants réécrits a, b, c… (`app/quiz.py`) ; une personne relit avant publication |
| `POST /v1/diagnostic/extract` | en-tête `x-ai-token` ; `{ platform, description, evidence, catalogue[{code,label}] }` → `{ symptoms[{code, quote, source}], logFindings[{summary, quote}], notes, model, usage, latencyMs, outcome }`. Codes hors catalogue et citations introuvables écartés (`app/diagnostic/extract.py`) |

Prévu : streaming.

## Chemin d'une question

1. **Routage** (`app/agents/router.py`) : panne → *diagnosticien*, sinon *tuteur* ; domaine déduit de la plateforme ou du vocabulaire.
   Le prompt système = socle de sécurité (`app/agents/profiles.py`, modifiable seulement en PR) + mission + domaine. Mission et domaine viennent des profils publiés dans le back-office (`GET /ai/profiles` de l'API cœur, cache `PROFILES_TTL_SECONDS`, `app/agents/store.py`) ; à défaut, des textes intégrés.
2. **Recherche** (`app/rag/retriever.py`) : d'abord les fiches SysMaster (`GET /kb/commands?q=…`, lues en direct, donc toujours à jour), puis les passages de documentation officielle (Qdrant, recherche hybride filtrée par plateforme). Le tout est numéroté `[1]`, `[2]`… Une source en panne n'empêche pas de répondre avec l'autre.
3. **Génération** (`app/llm/claude.py`) : prompt système du profil (mis en cache), documents, sortie au schéma `DraftAnswer`.
4. **Garde-fous** (`app/guardrails/`) :
   - le risque d'une commande est le maximum entre l'avis du modèle et les motifs destructifs reconnus ; le modèle ne peut pas l'abaisser ;
   - `high` ou `critical` → commande masquée tant que les risques ne sont pas lus ; `critical` → pas de copie ;
   - une étape avec commande mais sans « pourquoi » perd sa commande ;
   - une citation vers un document non fourni est retirée ; sans source, la réponse est « non vérifiée ».

## Documentation officielle (RAG)

```bash
docker compose up -d qdrant
export QDRANT_URL=http://localhost:6333
uv sync --extra fastembed && export AI_EMBEDDER=fastembed   # vrai modèle (≈ 220 Mo téléchargés une fois)
uv run python -m app.rag.ingest --source postgresql --max-pages 20
```

- Les sources sont dans [`sources.toml`](sources.toml) : préfixes autorisés, licence, attribution. Ajouter une source, c'est d'abord vérifier que sa licence permet la réutilisation avec attribution. Les pages de manuel (`man`) ne sont pas incluses : leur licence varie d'une page à l'autre.
- La collecte respecte `robots.txt` (et s'abstient s'il est inaccessible), attend une seconde entre deux pages et ne sort jamais des préfixes autorisés.
- Les pages sont découpées par titre ; chaque passage garde l'URL avec son ancre, le titre de section et l'attribution affichée sous la réponse.
- L'ingestion est idempotente : relancée, elle ne réencode que les pages modifiées.

## Évaluation

```bash
uv run python -m evals.run                        # modèle factice, instantané des fiches : gratuit, en CI
uv run python -m evals.run --llm claude           # vrai modèle (ANTHROPIC_API_KEY) : payant
uv run python -m evals.run --llm claude --judge   # + juge par modèle : environ deux fois plus cher
uv run python -m evals.run --core-url http://localhost:4000/api/v1   # vraie recherche de l'API
```

- `evals/golden/` : les questions et ce qu'on attend (agent, domaine, fiches, commandes interdites). On n'ajuste pas une attente pour faire passer un cas ; on corrige le système.
- `evals/thresholds.toml` : seuils par mode. Sous un seuil, la commande sort en erreur (la CI échoue en mode factice).
- `evals/reports/` (ignoré par git) : rapport JSON et Markdown, avec les cas à examiner.
- `evals/snapshot.py` régénère `evals/fixtures/kb.json` depuis une API locale quand les fiches changent.
- Le workflow GitHub « Évaluation IA » lance la version payante à la main (secret `ANTHROPIC_API_KEY`).

## Structure

```
app/
├── agents/      routeur et profils (prompts système)
├── guardrails/  motifs destructifs, validation de sortie
├── llm/         port, client Claude, modèle factice
├── rag/         fiches (API cœur), collecte, découpage, plongements, index Qdrant, ingestion
├── orchestrator.py
└── main.py
tests/           garde-fous, routeur, API, client Claude (SDK simulé), RAG (Qdrant en mémoire, HTTP simulé), banc d'évaluation
evals/           jeux de référence, seuils, juge, rapport
```
