# Parallel sessions and worktrees

At most two sessions at a time, each on its own issue: one in the main folder (`D:\Github\sport-map`) and one in a worktree, or two worktrees. The desktop app creates them under `.claude/worktrees/<name>` (gitignored) on a `claude/<name>` branch.

## Setting up a worktree

From the worktree's root, in PowerShell:

1. Rename the branch before the first push: `git branch -m <N>-<slug>`.
2. Copy what git doesn't track from the main folder: `.env`, and `supabase/.temp/` (link to the hosted project, needed by `npm run db:push` and `supabase gen types --linked`):
   ```powershell
   $main = (git worktree list --porcelain | Select-Object -First 1) -replace '^worktree ', ''
   Copy-Item "$main/.env" .env
   Copy-Item "$main/supabase/.temp" supabase/.temp -Recurse
   ```
3. `npm ci`: dependencies exactly as in the lockfile (a few minutes); its postinstall runs `nuxt prepare`.

A worktree session also loads the main folder's `CLAUDE.md` (a parent folder). When main has changed since, the branch's own files are the reference.

## One local Supabase for every checkout

Docker runs a single local Supabase, the same whichever folder starts it.

- **One issue with a migration at a time.** `npx supabase migration up --local` applies a branch's migrations to the shared database; the other checkout then meets a migration it doesn't have, and its own `migration up` refuses. That checkout merges main once the PR is merged. If the branch is abandoned instead, rebuild the database from main's migrations with `npx supabase db reset --local` from the main folder (local data is lost; the e2e setup recreates its own).
- **e2e in one checkout at a time**: the tests use port 3100 and recreate the test users. The other checkout relies on its branch CI.
- **Browser check**: `sport-map-local-db` (port 3000) in one session, `sport-map-local-db-3001` in the other. Supabase's email links (password reset) still point to port 3000. No browser check while e2e runs elsewhere, for the same reason as above.

## Conflicts

Files that both sessions often change (`npm run pr:impact` flags them): `i18n/locales/fr.json` and `en.json`, `test/e2e/signed-in.spec.ts`, `shared/types/database.types.ts`. The second PR to merge resolves them:

- in a worktree created by the app, with the `sync_with_base_branch` tool (the app fetches and merges on the host); then resolve what it reports, commit and push;
- in the main folder, `git fetch -q` and `git merge origin/main`.

Regenerate `database.types.ts` (SKILL.md, section 3, step 2) once both migrations are applied rather than merging it by hand.

## Cleaning up

After the merge, archive the session so the app removes its worktree. `git worktree list` shows leftovers; `git worktree remove <path>` removes one.
