---
name: ship-issue
description: Finish a sport-map GitHub issue — verify it, summarise it to Clem in French, and once Clem gives the go ("commite avec Closes #N et pousse"), push migrations, regenerate DB types, commit, push and check CI. Use when an issue's implementation is done or when Clem approves a commit.
---

# Ship an issue

Clem validates every issue before it is committed. Talk to Clem in French; code, comments and commit messages stay in English.

## 1. Before asking for the go

1. `npm run typecheck`, keeping only the errors: `npm run typecheck 2>&1 | Select-String 'error TS'`.
2. `npm test` (Vitest); show only the summary lines.
3. **Migrations, only when `git status --porcelain supabase/migrations/` or `git diff --name-only origin/main -- supabase/migrations/` lists something.** Apply them locally if Docker is up (`npx supabase migration up --local`), then delegate the review to the `migration-reviewer` agent (Agent tool, in the foreground), telling it which issue the migration serves. Fix every blocker, then run it again until the verdict isn't `BLOCKING`. Mention the remaining remarks in the summary to Clem. Skip this step when no migration changed.
4. **e2e, only when a user-facing flow changed.** Delegate to the `e2e-runner` agent (Agent tool, in the foreground): it checks Docker and the local Supabase, builds, runs Playwright and returns the failures with their likely cause. Give it a scope (spec file or project) when the change is clearly local, the whole suite otherwise. Fix the app bugs and outdated tests it reports, then run it again on the failing specs. If it reports that Docker is down, ask Clem to start Docker Desktop. Don't run e2e and the browser check at the same time: the e2e setup recreates the test users and data.
5. Check the change in the browser pane with the `sport-map-local-db` launch config (local Supabase). Sign in with the e2e test user from `test/e2e/fixtures.ts` (local only; don't repeat the credentials in chat). Prefer `read_page`/`get_page_text`; take screenshots only for visual checks, scaled down.
6. If the feature has a non-obvious rule, add or update a file in `.claude/rules/` (with `paths:`), not `CLAUDE.md`.
7. Summarise in French: what was done, tests run, what was left out. Then ask for the go. Never commit or push without it.
8. Notify Clem's phone with `PushNotification` (load it with ToolSearch): "Issue #N prête : j'attends ton go", plus the issue title. Clem often walks away during the checks.

## 2. After the go

1. **Schema changes first.** If `supabase/migrations/` has new files: `npm run db:push`, before pushing any code that needs them. Then regenerate the types from the hosted project, without the BOM PowerShell adds:
   ```powershell
   $out = npx supabase gen types typescript --linked 2>$null | Out-String
   [System.IO.File]::WriteAllText("$PWD\shared\types\database.types.ts", $out.TrimStart([char]0xFEFF), (New-Object System.Text.UTF8Encoding $false))
   ```
   Then rerun `npm run typecheck`.
2. **Commit.** Write the message to a file in the scratchpad and run `git commit -F <file>`; piping a here-string to `git commit -F -` fails in PowerShell. The message has a short title, a body explaining the why, `Closes #N`, then the attribution line.
3. **Push.** `git push`. For global or risky changes (service worker, Sentry, CI workflow, build config), push a branch first, wait for a green CI, then fast-forward `main`.
4. **CI.** Find the run with `gh run list --limit 2`, wait with `gh run watch <id> --exit-status`, and check that the issue is closed with `gh issue view N --json state`.
5. **Memory.** Add the issue and its commit to the sport-map project memory, with anything Clem still has to do by hand (dashboard settings, field tests).
6. **Wrap up in French.** Give the commit, the CI result and the remaining open issues. Suggest starting a new session (or `/clear`) before the next issue: everything needed is in `CLAUDE.md`, `.claude/rules/`, the issues and memory.
7. **Notify.** `PushNotification`: "Issue #N livrée, CI verte" (or "CI en échec : <job>" when it failed).

Push notifications only reach the phone when the session has Remote Control on, the "Notifications de code" account setting and "Push when Claude decides" in `/config` are enabled, and Clem isn't active in the session window (the tool then skips it). Keep messages to the issue number and title, one line.
