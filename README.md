# sport-map

[![CI](https://github.com/clementdhs/sport-map/actions/workflows/ci.yml/badge.svg)](https://github.com/clementdhs/sport-map/actions/workflows/ci.yml)

Crée, partage et découvre des parcours de course à pied, randonnée et vélo sur une carte — application web installable (PWA).

**Stack** : Nuxt 4 · Nuxt UI · Pinia · Supabase (Postgres + PostGIS, Auth, Storage) · MapLibre GL + MapTiler · OpenRouteService

## Installation

Prérequis : Node.js 22+.

```bash
npm install
cp .env.example .env
```

### 1. Clés à renseigner dans `.env`

| Variable | Où la trouver |
| --- | --- |
| `NUXT_PUBLIC_SUPABASE_URL`, `NUXT_PUBLIC_SUPABASE_KEY` | [Supabase](https://supabase.com) → projet → *Project Settings > API Keys* (clé *publishable*) |
| `NUXT_PUBLIC_MAPTILER_KEY` | [MapTiler Cloud](https://cloud.maptiler.com/account/keys/) — restreins la clé à tes domaines |
| `NUXT_OPENROUTESERVICE_KEY` | [OpenRouteService](https://openrouteservice.org/dev/) (nécessaire à partir de l'éditeur « suivre les routes ») |

Sans clé MapTiler, la carte utilise les tuiles de démonstration MapLibre (très peu détaillées).

### 2. Base de données

```bash
npx supabase login
npx supabase link --project-ref <ref-du-projet>
npm run db:push     # applique supabase/migrations
npm run db:types    # régénère shared/types/database.types.ts
```

Dans Supabase → *Authentication > URL Configuration* : Site URL `http://localhost:3000` et ajoute `http://localhost:3000/confirm` aux Redirect URLs (plus l'URL de production le moment venu).

### 3. Lancer

```bash
npm run dev
```

Puis ouvre http://localhost:3000.

## Scripts

| Commande | Rôle |
| --- | --- |
| `npm run dev` | serveur de développement, sur le Supabase en ligne |
| `npm run dev:local` | serveur de développement, sur le Supabase local (après `npm run db:start`) |
| `npm run build` / `npm run preview` | build de production / prévisualisation |
| `npm run typecheck` | vérification TypeScript |
| `npm test` | tests unitaires et du store (Vitest), sans réseau |
| `npm run db:start` / `npm run db:stop` | démarre / arrête Supabase en local (Docker) |
| `npm run test:e2e` | tests de bout en bout (Playwright), sur Supabase local |
| `npm run db:push` | applique les migrations au projet Supabase lié |
| `npm run db:types` | régénère les types de la base |

## Tests

- **Unitaires et store** (`test/unit`, `test/nuxt`) : `npm test`. Aucun réseau ni base de données ; les appels d'API sont simulés.
- **De bout en bout** (`test/e2e`) : nécessite [Docker Desktop](https://www.docker.com/products/docker-desktop/) démarré.

  ```bash
  npm run db:start      # Supabase local, avec les migrations du repo
  npm run test:e2e      # build de production + navigateur Chromium
  ```

  Tous ces tests tournent aussi automatiquement sur GitHub Actions à chaque push (`.github/workflows/ci.yml`), sans aucun secret.

  Les tests visent uniquement le Supabase local (jamais le projet en ligne). Ils recréent à chaque lancement un compte et un parcours de test, et simulent le fond de carte et le calcul d'itinéraire : aucun quota MapTiler ou OpenRouteService n'est consommé. Premier lancement : `npx playwright install chromium`.

## Garder Supabase actif

Un projet Supabase gratuit est mis en pause après 7 jours sans activité. Le workflow `.github/workflows/keep-supabase-awake.yml` lit la base une fois par jour pour l'en empêcher ; GitHub envoie un e-mail s'il échoue. Il a besoin, dans les réglages du dépôt (*Settings → Secrets and variables → Actions*) :

- la **variable** `SUPABASE_URL` : l'URL du projet (`https://<ref>.supabase.co`) ;
- le **secret** `SUPABASE_PUBLISHABLE_KEY` : la clé publishable du projet.

Pour le lancer à la main : onglet *Actions* → « Garder Supabase actif » → *Run workflow*.

## Structure

```
app/            pages, composants, layouts (Nuxt 4)
server/api/     routes API (Nitro)
shared/types/   types partagés app/serveur (dont types de la base)
supabase/       config CLI et migrations SQL
test/           unit (Vitest, Node), nuxt (Vitest, environnement Nuxt), e2e (Playwright)
```
