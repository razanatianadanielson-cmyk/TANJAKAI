# TANJAKAI — Backend (API REST)

Node.js · Express · PostgreSQL — Plateforme de Suivi et de Notation Pondérée des Pôles.

## Démarrage

```bash
npm install
cp .env.example .env          # puis renseigner JWT_SECRET (>= 32 caractères)
docker compose up -d          # PostgreSQL 16 de développement (ou une base existante)
npm run migrate               # applique db/migrations/*.sql
npm run seed                  # (dev) 4 comptes de test + 1 pôle
npm run dev                   # http://localhost:4000
npm test
```

Comptes de test (mot de passe = `SEED_PASSWORD`) : `responsable@`, `controle@`, `direction@`,
`admin@tanjakai.local`. Direction et administrateur exigent le second facteur ; en développement
uniquement, `DEV_SKIP_2FA=true` permet de les connecter sans lui.

Essai rapide :

```bash
curl localhost:4000/health
curl localhost:4000/api/v1/health/ready
curl -X POST localhost:4000/api/v1/auth/login -H 'Content-Type: application/json' \
     -d '{"email":"controle@tanjakai.local","password":"ChangeMe!2026Tj"}'
curl localhost:4000/api/v1/poles -H "Authorization: Bearer <accessToken>"
```

## Architecture

```
src/
  server.js            démarrage + arrêt propre
  app.js               middlewares globaux, versionnement /api/v1
  config/              env.js (validation zod), db.js (pool pg, transactions + audit)
  middlewares/         auth (JWT + rôles), validate (zod), errorHandler, requestId, logger
  modules/<module>/    routes -> controller -> service -> repository (+ schemas zod)
  routes/index.js      montage des modules
  db/                  migrate.js, seed.js
db/migrations/         001_schema.sql (schéma PostgreSQL)
tests/                 jest + supertest (base mockée)
```

Règle de dépendance : `routes → controller → service → repository → db`. Le SQL n'existe que
dans les repositories, toujours paramétré (`$1, $2…`).

## Conventions

- **Format d'erreur unique** : `{ "error": { "code", "message", "details?", "requestId" } }`.
- **Erreurs PostgreSQL traduites** : unicité 409, règle métier (trigger) 422, droits 403…
  Les messages des `RAISE EXCEPTION` du schéma sont renvoyés tels quels.
- **Habilitations côté serveur** sur chaque route : `authenticate` puis `requireRole(...)`.
  Cloisonnement des pôles dans les services (un responsable ne voit que ses pôles, 404 sinon).
- **Audit** : toute écriture passe par `db.withTransaction({ userId, motif }, fn)`, qui alimente
  `journal_audit` via les triggers.
- **Pagination** : `?page=1&limit=20` -> `{ data, pagination: { page, limit, total } }`.

## Ajouter un module (exemple : `campagnes`)

1. Créer `src/modules/campagnes/` avec `campagnes.{schemas,repository,service,controller,routes}.js`
   en copiant le module `poles` (référence complète).
2. Le monter dans `src/routes/index.js`.
3. Écrire les tests dans `tests/`.

## Référentiel, grilles, cibles et campagnes

| Méthode | Route | Rôles |
|---|---|---|
| GET / POST | `/api/v1/familles` | lecture : tous · création : contrôle de gestion, admin |
| GET | `/api/v1/axes` | tous (3 axes fixes) |
| GET / POST / PATCH | `/api/v1/criteres`, `/criteres/:id` | lecture : tous · écriture : contrôle de gestion, admin (PATCH seulement avant validation) |
| POST | `/api/v1/criteres/:id/valider` | **contrôle de gestion** (définition validée avant activation) |
| GET | `/api/v1/grilles`, `/grilles/:id` | contrôle de gestion, direction, admin |
| POST | `/api/v1/grilles` | nouvelle version (copie de la dernière validée ; `motif` obligatoire dès la v2 ; un seul brouillon à la fois) |
| PUT | `/api/v1/grilles/:id/ponderations-axes` · `/ponderations-criteres` | remplace les pondérations et barèmes d'un **brouillon** |
| POST | `/api/v1/grilles/:id/valider` | **contrôle de gestion** : somme = 100 % (axes, puis critères par axe), barèmes présents, puis gel |
| DELETE | `/api/v1/grilles/:id` | supprime un brouillon |
| GET | `/api/v1/cibles` | tous (responsable : ses pôles) |
| PUT | `/api/v1/cibles` | contrôle de gestion, admin : propose une cible (annule sa validation) |
| POST | `/api/v1/cibles/:id/valider` · `/cibles/valider-lot` | **direction générale** |
| POST | `/api/v1/campagnes` | **contrôle de gestion** : `fn_ouvrir_campagne` (gèle grille, périmètre, cibles) + notifications |
| GET | `/api/v1/campagnes/:id` | tous (avec l'historique des réouvertures) |
| POST | `/api/v1/campagnes/:id/rouvrir` | contrôle de gestion, admin : motif obligatoire, tracé, notifié |
| GET / POST | `/api/v1/poles/:id/suspensions` | lecture : cloisonnée · création : contrôle de gestion, admin |

Pondération par famille d'activité : `familleId` + `motif` obligatoires (la pondération de la famille l'emporte sur celle par défaut).
Plancher et plafond du barème sont des taux d'atteinte (ex. 0.5 et 1).
Migration `003_notifications_campagne.sql` : rattache les notifications à une campagne.

**Test de bout en bout sur base réelle** (base vierge migrée + `npm run seed`, API lancée avec `DEV_SKIP_2FA=true`) :
`API_URL=http://localhost:4000/api/v1 npm run test:e2e`

## Routes de saisie

| Méthode | Route | Accès |
|---|---|---|
| GET/POST/PATCH | `/api/v1/saisies`, `/api/v1/saisies/:id` | JWT (responsable écrit, autres rôles lisent) |
| POST | `/api/v1/saisies/:id/soumettre` | responsable |
| POST | `/api/v1/saisies/:id/valider` · `/renvoyer` | contrôle de gestion, direction, admin |
| GET/POST | `/api/v1/saisies/:saisieId/pieces` | JWT (dépôt : responsable) |
| POST | `/api/v1/service/saisies` | clé de service (`X-Service-Key`) + `Idempotency-Key` |

## Moteur de notation

Code : `src/modules/scoring/` — le calcul pur est dans `engine/` (aucun accès base, testable seul).

**Chaîne de calcul** (cahier § 2.1.4 et 2.3.1) :

1. *Critère* : taux d'atteinte = valeur / cible (critère à maximiser) ou cible / valeur (à minimiser),
   puis note = 100 × (taux − plancher) / (plafond − plancher), bornée à [0 ; 100].
   Plancher et plafond sont des **taux d'atteinte** (ex. 0,5 et 1,0 : sous 50 % de la cible la note est 0,
   à 100 % elle est de 100).
2. *Axe* : moyenne pondérée des notes de ses critères.
3. *Score consolidé* : moyenne pondérée des notes des axes.

**Règles** : aucune valeur n'est jamais estimée ; un critère non renseigné (ou dont la saisie n'est pas
validée) est exclu et sa pondération est redistribuée dans son axe ; un axe sans note est exclu et sa
pondération redistribuée entre les axes ; le score est alors marqué `partiel`. Le calcul est déterministe
(arithmétique entière sur les centièmes, arrondi moitié vers le haut).

**Historisation** : à la clôture, une version de score est écrite avec une COPIE des valeurs, cibles,
pondérations et barèmes (`score_pole`, `score_axe`, `score_critere`) puis figée (`fige = true`).
`GET /scores/:id/verification` recalcule le score à partir de ces seules copies : le résultat doit être identique.

**Routes**

| Méthode | Route | Rôles | Rôle |
|---|---|---|---|
| GET | `/api/v1/campagnes` | tous | liste des campagnes |
| POST | `/api/v1/campagnes/:id/simuler` | contrôle de gestion | calcul à blanc, rien n'est écrit |
| POST | `/api/v1/campagnes/:id/cloturer` | contrôle de gestion | clôture + calcul + historisation + gel |
| GET | `/api/v1/scores` | tous (responsable : ses pôles) | derniers scores, filtres `campagneId`, `poleId` |
| GET | `/api/v1/scores/:id` | tous (responsable : ses pôles) | score détaillé et explicable |
| GET | `/api/v1/scores/:id/verification` | contrôle, direction, admin | recalcul et comparaison |

### Essayer le moteur de bout en bout

```bash
npm run seed:demo     # grille v1, 6 critères, cibles, campagne T3 2026 et 6 saisies validées (score attendu : 76,00)
```

Puis, dans PowerShell (remplacer `<id>` par la campagne affichée) :

```powershell
$b = @{ email = "controle@tanjakai.local"; password = "ChangeMe!2026Tj" } | ConvertTo-Json
$r = Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/v1/auth/login -ContentType "application/json" -Body $b
$h = @{ Authorization = "Bearer $($r.accessToken)" }
Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/v1/campagnes/<id>/simuler -Headers $h | ConvertTo-Json -Depth 8
Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/v1/campagnes/<id>/cloturer -Headers $h | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri http://localhost:4000/api/v1/scores -Headers $h | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri http://localhost:4000/api/v1/scores/<scoreId>/verification -Headers $h
```

## Tests

`npm test` lance Jest (API, authentification, habilitations) puis `node --test` (moteur, assemblage,
orchestration). `npm run test:engine` ne lance que le moteur (aucune base nécessaire).
Le jeu de référence `tests/fixtures/reference.js` (score 76,00, variante partielle 72,80) sert de
test de non-régression : si un résultat change, le calcul a changé.

## Reste à faire (ordre du cahier des charges)

1. Authentification : second facteur (TOTP), jeton de rafraîchissement révocable, déconnexion, journal des connexions.
2. ~~Référentiel~~ (fait). Reste : modification d'un pôle, gestion des utilisateurs, rappel automatique avant l'échéance.
3. ~~Campagne : ouverture, réouverture~~ (fait). Reste : harmoniser les saisies (camelCase, audit, renvoi motivé dans `renvoi_correction`).
4. Alertes (règle des deux trimestres : vue `v_alerte_direction_a_declencher`), plans d'action, notifications.
5. Synthèses (OpenRouter appelé côté serveur uniquement), restitution de direction, export.
6. Spécification OpenAPI + console d'essai.
