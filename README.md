# SysMaster AI Platform

Apprendre, comprendre, diagnostiquer, réparer, pratiquer, se certifier, devenir autonome.
Windows, Linux, macOS, iOS, iPadOS, Android, réseaux, cloud, cybersécurité, DevOps, Docker, Kubernetes, PostgreSQL, MySQL, développement.

> **Phase 1 : architecture et socle.** Ce dépôt contient la conception complète et un socle qui fonctionne de bout en bout : base de connaissances, moteur de diagnostic v1 et catalogue des parcours. La suite est planifiée dans la [feuille de route](docs/05-feuille-de-route.md).

## Documentation

| Document | Contenu |
|---|---|
| [01 — Architecture](docs/01-architecture.md) | DDD, hexagonal, microservices, CQRS, événements, multi-agents IA, RAG, labs, sécurité, scalabilité, UML |
| [02 — Base de données](docs/02-base-de-donnees.md) | Principes, diagrammes ER, inventaire des 13 schémas |
| [03 — Spécifications fonctionnelles](docs/03-specifications-fonctionnelles.md) | Règles « comprendre avant d'exécuter », modules, parcours, principes UX/UI |
| [04 — Spécifications techniques](docs/04-specifications-techniques.md) | Pile, structure, API, moteur de déduction, sécurité, qualité |
| [05 — Feuille de route](docs/05-feuille-de-route.md) | 7 phases, état des 16 livrables, risques |
| [06 — Authentification](docs/06-authentification.md) | Keycloak, rôles, 2FA, passkeys, fournisseurs sociaux, mise en production |
| [07 — Guide utilisateur](docs/07-guide-utilisateur.md) | Parcours, fiches, diagnostic, tableau de bord, contribution |
| [08 — Guide administrateur](docs/08-guide-administrateur.md) | Rôles, workflow éditorial, événements, base de données, dépannage |

## Démarrage rapide

### Option A : tout dans Docker

```bash
cp .env.example .env
docker compose up --build
```

- Web : http://localhost:3000
- API : http://localhost:4000/api/v1, documentation OpenAPI : http://localhost:4000/api/docs
- Keycloak : http://localhost:8080/admin (`admin` / `admin`)

Le service `migrate` applique le schéma et charge les données de démonstration avant le démarrage de l'API.

### Option B : développement local

Prérequis : Node 22, pnpm 10 (`corepack enable`), Docker pour les bases.

```bash
cp .env.example .env
docker compose up -d postgres redis qdrant keycloak
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm dev            # API sur :4000, web sur :3000
```

### Commandes

| Commande | Effet |
|---|---|
| `pnpm build` / `lint` / `typecheck` / `test` | Sur tout le monorepo (Turborepo) |
| `pnpm db:migrate` | Applique les migrations SQL non encore appliquées |
| `pnpm db:seed` | Charge les données de démo (rejouable sans doublon) |
| `pnpm db:reset` | **Développement uniquement** : supprime les schémas et recrée tout |

Les tests de bout en bout de l'API (`apps/api/test`) s'exécutent quand `DATABASE_URL` est défini et que la base est migrée et alimentée. Sinon ils sont ignorés ; la CI les exécute toujours.

## À essayer

1. **Diagnostic** : `/diagnostic`, cliquez « Utiliser l'exemple », analysez. Ajoutez ensuite `Event ID 41 Kernel-Power` dans le journal : l'alimentation remonte (d'environ 12 % à 25 %) sans dépasser la surchauffe, car « il chauffe » reste un indice fort. Retirez « et il chauffe » de la description : l'alimentation passe alors en tête. L'explication de chaque cause dit pourquoi.
2. **Commande critique** : `/commandes/linux-rm-rf`. La commande reste masquée tant que les risques ne sont pas dépliés, et il n'y a pas de bouton copier.
3. **Fiche complète** : `/commandes/linux-systemctl` (paramètres, cas réel, erreurs fréquentes, alternatives, sources).
4. **Académie et gamification** : connectez-vous (`alice@sysmaster.local`), validez « systemctl : démarrer, arrêter, activer », puis ouvrez `/tableau-de-bord` : XP, badge « Premier pas », compétence en progression. `/classement` montre les noms abrégés et permet de s'en retirer.
5. **Rédaction** : connectez-vous en `mentor@sysmaster.local` (auteur et relecteur), ouvrez **Rédaction**, créez une fiche et soumettez-la : la liste de ce qui manque s'affiche. Une fois la fiche complète, un autre compte relecteur (`admin@sysmaster.local`) l'approuve et elle est publiée.

## Structure

```
apps/web        Next.js 15, React 19, Tailwind 4, shadcn/ui, Framer Motion
apps/api        NestJS 11, monolithe modulaire DDD/hexagonal, CQRS (@nestjs/cqrs), outbox
packages/contracts  Types et schémas zod partagés
services/ai     Service IA FastAPI (Phase 3, conception seulement)
db/             Migrations SQL et données de démo
infra/          Dockerfiles, script de migration
```

## Comptes de démonstration

`admin@sysmaster.local`, `alice@sysmaster.local` et `mentor@sysmaster.local`, mot de passe `Demo-SysMaster-2026!` (développement uniquement). Détails, fournisseurs sociaux, 2FA et passkeys : [docs/06-authentification.md](docs/06-authentification.md).

Les tests de l'authentification avec un vrai Keycloak s'exécutent si `KEYCLOAK_E2E_URL` est défini (`KEYCLOAK_E2E_URL=http://localhost:8080 pnpm test`).
