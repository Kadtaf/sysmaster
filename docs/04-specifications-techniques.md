# 04 — Spécifications techniques

## 1. Pile technique

| Couche | Choix | Version | Pourquoi |
|---|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | pnpm 10 | Installation rapide, cache de build, tâches parallèles |
| Frontend | Next.js (App Router), React, TypeScript | 15 / 19 / 5 | SSR/ISR pour le SEO du contenu pédagogique, Server Components |
| UI | Tailwind CSS, shadcn/ui, Framer Motion, lucide-react | 4 | Composants accessibles (Radix) possédés par le projet, pas de dépendance figée |
| Backend cœur | NestJS (Node 22) | 11 | Modules, DI, CQRS, GraphQL, WebSocket, transports microservices natifs |
| Accès données | `pg` + SQL versionné | — | Contrôle total du schéma (voir ADR-011) |
| Validation | `zod` (contrats partagés) | 3 | Mêmes schémas côté web et API |
| Service IA | Python 3.12, FastAPI, Pydantic | Phase 3 | Écosystème RAG/LLM |
| Bus | NATS JetStream | Phase 2 | Simple, performant, persistance |
| Base | PostgreSQL | 16 | |
| Cache | Redis | 7 | |
| Recherche | OpenSearch / Elasticsearch | Phase 2 | |
| Vecteurs | Qdrant | 1.x | Voir ADR-007 |
| Identité | Keycloak (OIDC, WebAuthn, SAML) | Phase 2 | |
| Paiement | Stripe Billing, Tax, Connect | Phase 5 | |
| Conteneurs | Docker, Kubernetes, Helm | | |
| IaC | Terraform | Phase 7 | |
| CI/CD | GitHub Actions | | |
| Observabilité | OpenTelemetry, Prometheus, Grafana, Loki, Tempo | Phase 2 | |

## 2. Structure du monorepo

```
sysmaster/
├── apps/
│   ├── web/                 # Next.js : académie, KB, diagnostic, tableaux de bord
│   └── api/                 # NestJS : monolithe modulaire (DDD + hexagonal)
│       └── src/modules/
│           ├── diagnostic/  # domain / application / infrastructure / interface
│           ├── knowledge/
│           ├── learning/
│           └── health/
├── packages/
│   └── contracts/           # Types et schémas zod partagés (DTO, événements)
├── services/
│   └── ai/                  # FastAPI (Phase 3) — README de conception uniquement
├── db/
│   ├── migrations/          # SQL versionné
│   └── seeds/               # données de démo
├── infra/
│   ├── docker/              # Dockerfiles
│   └── scripts/             # migrate, seed, deploy
├── docs/                    # cette documentation
├── docker-compose.yml
└── .github/workflows/ci.yml
```

## 3. API REST (Phase 1)

Préfixe `/api/v1`. Documentation OpenAPI générée sur `/api/docs`. Authentification : `Authorization: Bearer <jeton Keycloak>` (voir [06-authentification.md](06-authentification.md)).

| Méthode | Route | Description |
|---|---|---|
| GET | `/health` | État de l'API et de la base |
| GET | `/learning/paths` | Liste des parcours publiés |
| GET | `/learning/paths/:slug` | Parcours, cours et, si connecté, progression et inscription |
| POST | `/learning/paths/:slug/enroll` | Inscription (connecté, idempotent) |
| GET | `/learning/courses/:slug` | Plan du cours ; si connecté, état de chaque leçon (`completed`, `available`, `locked`) |
| GET | `/learning/courses/:course/lessons/:lesson` | Contenu Markdown, objectifs, leçons voisines, blocage éventuel |
| POST | `/learning/lessons/:id/complete` | Valide une leçon (connecté). **409** avec `blockedBy` si la précédente n'est pas validée. Publie `learning.lesson.completed.v1` |
| GET | `/me/learning` | Parcours suivis et progression |
| GET | `/kb/commands?q=&platform=` | Recherche de fiches commandes |
| GET | `/kb/commands/:slug` | Fiche complète (paramètres, exemples, alternatives, sources) |
| GET | `/diagnostic/symptoms?platform=` | Symptômes connus |
| POST | `/diagnostic/analyze` | Analyse : `{ platform, description?, symptoms?, evidence? }` → hypothèses classées. Anonyme ou connecté (la session rejoint alors l'historique) |
| GET | `/me` | Profil, rôles et droits de l'utilisateur connecté (jeton requis) |
| GET | `/me/dashboard` | Tableau de bord : XP, niveau, série, badges, parcours, compétences, points forts et faibles, recommandations |
| GET | `/gamification/leaderboard?limit=` | Classement (noms abrégés) ; si connecté, `me` donne votre rang |
| PUT | `/me/leaderboard-visibility` | `{ visible: boolean }` : apparaître ou non dans le classement (204) |
| GET | `/editorial/revisions?status=&kind=` | Révisions (rôles `author`, `reviewer`, `admin`) : toutes pour un relecteur, les siennes pour un auteur. `kind` : `command`, `course`, `path`, `diagnostic_cause` |
| POST | `/editorial/revisions` | `{ kind, from? }` : nouveau contenu, ou modification du contenu publié d'identifiant `from` (slug ou code). `fromSlug` reste accepté pour les fiches. **409** si une révision est déjà ouverte |
| GET | `/editorial/revisions/:id` | Contenu, écarts aux règles du type (`issues`), actions permises (`can`), historique |
| GET | `/editorial/revisions/:id/simulation` | Causes de diagnostic seulement : rejoue les cas de référence avant et après la modification (`cases`, `regressions`, `improvements`) |
| PUT | `/editorial/revisions/:id` | Enregistre le brouillon (auteur). **400** si mal formé ; incomplet accepté |
| POST | `/editorial/revisions/:id/submit` | Soumet ; **422** avec `issues` si la fiche ne respecte pas P-1 |
| POST | `/editorial/revisions/:id/review` | `{ decision: approve \| request_changes, comment }` ; approuver publie. **403** sur sa propre révision ; **422** si une cause provoque des régressions et que le commentaire ne les justifie pas |
| POST | `/editorial/revisions/:id/withdraw` | Retire une révision non publiée (auteur ou admin) |
| GET | `/admin/users` | Liste des utilisateurs (rôles `admin` ou `support`) |

Exemple de réponse `POST /diagnostic/analyze` :

```json
{
  "sessionId": "c1f…",
  "detectedSymptoms": ["unexpected_reboot", "reboot_under_load", "loud_fans"],
  "confidence": 0.71,
  "hypotheses": [
    {
      "cause": "overheating",
      "label": "Surchauffe",
      "probability": 0.78,
      "explanation": "Le processeur ou la carte graphique dépasse…",
      "reasoning": ["« Redémarre en jeu » est 2,4× plus probable si la cause est une surchauffe…"],
      "actionPlan": [{ "step": "Mesurer les températures…", "why": "…", "risk": "none" }]
    }
  ],
  "clarifyingQuestions": ["Voyez-vous un écran bleu avant le redémarrage ?"]
}
```

Conventions : erreurs au format RFC 9457 (`application/problem+json`), pagination par curseur, `Idempotency-Key` sur les POST sensibles (paiement, examen), limitation de débit par utilisateur et par IP (Redis).

## 4. Moteur de déduction v1 (implémenté)

Modèle **bayésien naïf avec terme de fuite** :

```
score(c) = P(c) × Π_{s ∈ observés} P(s|c) × Π_{e ∈ preuves} boost(e,c)
P(s|c) = likelihood(s,c) si règle connue, sinon ε = 0,02 (fuite)
probabilité(c) = score(c) / Σ score
confiance = p1 × (1 − p2/p1) pondérée par le nombre de symptômes (saturation à 3)
```

- **Extraction de symptômes** v1 : correspondance de synonymes normalisés (accents, casse). Remplacée en Phase 3 par l'agent LLM (extraction structurée), le moteur restant identique.
- **Questions de clarification** : le moteur choisit les symptômes non observés qui séparent le mieux les deux meilleures hypothèses (différence de vraisemblance maximale).
- **Explications** : pour chaque cause, les facteurs qui ont le plus pesé, en langage naturel.
- Code : `apps/api/src/modules/diagnostic/domain/deduction-engine.ts`, testé unitairement.

## 4 bis. Gamification (implémentée)

Règles dans `apps/api/src/modules/gamification/domain/rules.ts`, testées unitairement, appliquées par le consommateur d'événements (jamais par l'action de l'utilisateur elle-même) :

| Activité | XP |
|---|---|
| Leçon validée | 10 + durée estimée en minutes, plafonné à 50 |
| Diagnostic mené à terme (connecté) | 15 |
| Parcours terminé | 200 |

- **Niveaux** : table `gamification.levels` (Curieux 0 XP → Maître système 12 000 XP).
- **Série** : jours consécutifs d'activité, calculés à la date du fuseau de l'utilisateur ; record conservé.
- **Badges** : critères déclaratifs en JSON (`lessons_completed`, `diagnostics_completed`, `paths_completed`, `streak_days`). Un badge à critère inconnu n'est jamais attribué (il attend sa fonctionnalité, par exemple les labs).
- **Classement** : vue `gamification.leaderboard`, nom abrégé (« Alice M. »), retrait possible sans perte d'XP.
- La vitesse ne rapporte rien : aucune règle ne dépend du temps passé ou de la rapidité.

## 5. Sécurité applicative

| Sujet | Mesure |
|---|---|
| Authentification | OIDC (Keycloak), jetons d'accès courts (5 min), refresh rotatif, cookies `HttpOnly; Secure; SameSite=Lax` pour le web |
| Autorisation | Guards NestJS (RBAC) + politiques par ressource (ABAC) |
| Entrées | Validation zod/class-validator sur chaque DTO, limites de taille (logs ≤ 10 Mo) |
| En-têtes | Helmet, CSP stricte, HSTS |
| Fichiers | Analyse antivirus (ClamAV), type MIME vérifié, stockage S3 privé, URLs signées |
| Secrets | Jamais dans le dépôt ; `.env.example` uniquement ; coffre en production |
| IA | Contenu utilisateur et RAG = données ; outils en liste blanche ; validateur de sortie ; journalisation des refus |
| Labs | Isolation microVM, pas d'accès au réseau interne, egress filtré, TTL |
| Dépendances | Dependabot, `pnpm audit`, analyse d'images (Trivy) en CI |

## 6. Performance et scalabilité

- API sans état ; sessions dans Redis ; montée en charge horizontale.
- Pages de contenu en ISR (revalidation à la publication) servies par CDN.
- Budgets : LCP < 2,5 s sur mobile 4G, API p95 < 300 ms (hors IA), JS initial < 200 Ko.
- Tests de charge k6 avant chaque phase majeure (objectif Phase 7 : 50 000 utilisateurs simultanés).

## 7. Qualité

- TypeScript strict, ESLint, Prettier.
- Tests : unitaires (domaine, Jest/Vitest), intégration (Testcontainers PostgreSQL), end-to-end (Playwright), contrats d'API.
- Le domaine ne dépend d'aucun framework : il est testé sans base de données.
- CI : lint → typecheck → tests → build → image Docker (sur `main`).

## 8. Environnements

| Environnement | Usage | Déploiement |
|---|---|---|
| local | développement | `docker compose up` |
| preview | une instance par pull request | Phase 2 (Vercel pour le web + namespace Kubernetes éphémère) |
| staging | recette | automatique sur `main` |
| production | utilisateurs | manuel (tag), déploiement progressif (canary) |

## 9. Variables d'environnement

Voir [`.env.example`](../.env.example). Principales : `DATABASE_URL`, `REDIS_URL`, `QDRANT_URL`, `API_PORT`, `NEXT_PUBLIC_API_URL`, `CORS_ORIGINS`, et pour l'identité `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `KEYCLOAK_ISSUER`, `KEYCLOAK_INTERNAL_ISSUER`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`.
