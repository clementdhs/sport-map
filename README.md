# sport-map

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
| `npm run dev` | serveur de développement |
| `npm run build` / `npm run preview` | build de production / prévisualisation |
| `npm run typecheck` | vérification TypeScript |
| `npm run db:push` | applique les migrations au projet Supabase lié |
| `npm run db:types` | régénère les types de la base |

## Structure

```
app/            pages, composants, layouts (Nuxt 4)
server/api/     routes API (Nitro)
shared/types/   types partagés app/serveur (dont types de la base)
supabase/       config CLI et migrations SQL
```
