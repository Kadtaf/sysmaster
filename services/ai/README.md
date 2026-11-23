# services/ai — Plateforme IA (Phase 3)

Ce dossier accueillera le service **FastAPI** (Python 3.12) qui porte l'orchestrateur multi-agents et le RAG. Il est vide de code en Phase 1 : la conception est dans [`docs/01-architecture.md` §8](../../docs/01-architecture.md#8-architecture-ia-multi-agents).

## Contrat prévu avec le cœur NestJS

| Endpoint | Rôle |
|---|---|
| `POST /v1/chat` (SSE) | Conversation avec routage automatique vers l'agent adapté, réponse structurée et citée |
| `POST /v1/diagnostic/extract` | Texte libre, capture ou logs → codes de symptômes + preuves (alimente le moteur de déduction existant) |
| `POST /v1/quiz/generate` | Génère des questions à partir d'une leçon (relues avant publication) |
| `POST /v1/rag/search` | Recherche hybride citée, filtrée par éditeur, produit et version |

## Structure prévue

```
services/ai/
├── app/
│   ├── agents/        # profils (lus depuis ai.agent_profiles), routeur
│   ├── guardrails/    # validateur de sortie (pourquoi/comment/risques/sources), détection de commandes destructives
│   ├── rag/           # ingestion, découpage, embeddings, Qdrant, reranking
│   ├── tools/         # appels vers l'API cœur (KB, moteur de déduction)
│   └── main.py
├── evals/             # golden sets par domaine
└── pyproject.toml
```
