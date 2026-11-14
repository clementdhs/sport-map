---
name: ship-issue
description: Take a sport-map GitHub issue from start to merge — branch `<N>-<slug>`, checks, code review, pull request with the impact analysis, then squash merge once Clem says "merge" (migrations pushed first). Use when starting an issue, when its implementation is done, and when Clem approves the merge.
---

# Ship an issue

One issue, one branch, one pull request. Claude pushes the branch and opens the PR without waiting for a go; Clem reads the PR and the go is the merge ("merge"). Talk to Clem in French; code, comments, commit messages and PR titles stay in English, PR bodies are in French.

## 0. Start

1. `git fetch -q`, then `git switch -c <N>-<slug> origin/main` (slug: 2 to 4 English words, kebab-case).
2. In a worktree created by the app (`.claude/worktrees/…`, branch `claude/…`) or when another session works in parallel, read [worktrees.md](worktrees.md) first: setup, shared local Supabase, ports.

## 0b. Tests first (before any implementation)

The tests are written from the issue, not from the code, so that they check what the code should do rather than what it does.

1. **Acceptance criteria.** If the issue has none, write 3 to 6 short, checkable criteria (in French) and post them as a comment on the issue (`gh issue comment N --body-file <file>`), then show them to Clem in one message; don't wait for an answer to continue, but adjust if Clem corrects them.
2. **Pure logic** (`shared/utils/`, `app/utils/`, business rules: coach, paces, stats, difficulty, durations…): write the unit tests in `test/unit/` first, one `it()` per rule, named after the expected behaviour. Run them and check they fail for the right reason (missing export or wrong value, not a typo), then commit them alone: `Add failing tests for <feature> (#N)`.
3. **Bug fix**: always a test that reproduces the bug first (unit test when the bug is in pure logic, else Nuxt or e2e), seen failing, committed before the fix.
4. **UI, map, layout**: no test first; iterate in the browser, then add the e2e or `test/nuxt` test that covers the acceptance criteria of the main flow.
5. Then implement until those tests pass, **without changing them**. If a test written in this step turns out to be wrong, fix it in its own commit and say why in the PR.

## 1. Checks

1. `npm run typecheck`, keeping only the errors: `npm run typecheck 2>&1 | Select-String 'error TS'`.
2. `npm test` (Vitest); show only the summary lines.
3. **Migrations, only when `git diff --name-only origin/main -- supabase/migrations/` or `git status --porcelain supabase/migrations/` lists something.** Apply them locally if Docker is up (`npx supabase migration up --local`) and regenerate the types from the local DB, so the branch carries them before the hosted push (the snippet of section 3, step 2, with `--local` instead of `--linked`). Then delegate the review to the `migration-reviewer` agent (Agent tool, in the foreground), telling it which issue the migration serves. Fix every blocker and run it again until the verdict isn't `BLOCKING`. Report the remaining remarks in the PR.
4. **e2e, only when a user-facing flow changed.** Delegate to the `e2e-runner` agent (Agent tool, in the foreground): it checks Docker and the local Supabase, builds, runs Playwright and returns the failures with their likely cause. Give it a scope (spec file or project) when the change is clearly local, the whole suite otherwise. Fix the app bugs and outdated tests it reports, then run it again on the failing specs. If Docker is down, ask Clem to start Docker Desktop. Don't run e2e and the browser check at the same time: the e2e setup recreates the test users and data.
5. Check the change in the browser pane with the `sport-map-local-db` launch config (local Supabase). Sign in with the e2e test user from `test/e2e/fixtures.ts` (local only; don't repeat the credentials in chat). Prefer `read_page`/`get_page_text`; take screenshots only for visual checks, scaled down.
6. If the feature has a non-obvious rule, add or update a file in `.claude/rules/` (with `paths:`), not `CLAUDE.md`.
7. **Code review**, before committing. First `git add -N <new files>` (or `git add -N .`): the review reads `git diff HEAD`, which skips untracked files. `npm run pr:impact` gives the level: invoke the `code-review` skill with `high` when it lists auth or team access, API routes, the service worker and offline mode, GPS or recording; `medium` otherwise; optional for documentation only. Always pass the level: without one, the skill reuses the last level used. Fix the confirmed findings, rerun the checks they affect, and keep the dismissed ones with their reason for the PR.

## 2. Pull request (no go needed)

1. **Commit.** Write the message to a file in the scratchpad and run `git commit -F <file>`; piping a here-string to `git commit -F -` fails in PowerShell. Short title, a body explaining the why, `Closes #N`. No `Co-Authored-By` or other attribution line (Clem's choice, 2026-11-11: GitHub shows it as a co-author).
2. **Push.** `git push -u origin <branch>`.
3. **Open the PR.** Copy `.github/pull_request_template.md` to the scratchpad and fill every section from `npm run pr:impact` and the checks: short, « aucun » rather than a deleted section, no attribution line (no « Generated with Claude Code »). In the tests section, list the names of the new tests (Clem reviews what the system does through them) and flag every existing test whose expectation was changed or removed, with the reason. Then `gh pr create --base main --title "<English title>" --body-file <file>` (gh ignores the template when given a body file). Use the commit's title: depending on the repository's squash setting, main gets one or the other.
4. **Branch CI.** The push triggers it (the workflow has no `pull_request` trigger, which would double the runs). In the desktop app, bind the PR with the `ccd_pr` tools (`get_status`, then `bind_pr` if it doesn't report the PR) and wait for its CI events instead of polling. Elsewhere: `gh run list --branch <branch> --limit 1`, then `gh run watch <id> --exit-status`. The conclusion must be exactly `success` (`gh run view <id> --json conclusion`: `gh run view` exits 0 even on failure). On failure, fix, commit and push to the same branch.
5. **Summary in French**: the PR link, what changed, tests run, review findings, what was left out, what Clem has to do. Ask for the go to merge.
6. **Notify.** `PushNotification` (load it with ToolSearch): "PR #M prête (issue #N) : j'attends ton go pour merger", plus the issue title. Clem often walks away during the checks.

## 3. After Clem's go ("merge")

1. **Conflicts.** If `gh pr view <M> --json mergeable` reports `CONFLICTING` (main moved, e.g. a parallel session merged), bring the branch up to date as described in [worktrees.md](worktrees.md), rerun the checks, push and wait for a green CI. Without conflicts, merge directly: main's CI checks the types and unit tests of the combination.
2. **Schema changes first.** If the branch adds files to `supabase/migrations/`, ask Clem to run `npm run db:push` from this checkout (the auto mode classifier blocks it for Claude: it deploys to production) and wait for the confirmation. From then on the migration is frozen: a fix goes in a new file. Then regenerate the types from the hosted project, without the BOM PowerShell adds:
   ```powershell
   $out = npx supabase gen types typescript --linked 2>$null | Out-String
   [System.IO.File]::WriteAllText("$PWD\shared\types\database.types.ts", $out.TrimStart([char]0xFEFF), (New-Object System.Text.UTF8Encoding $false))
   ```
   If `git diff --stat shared/types/database.types.ts` shows a change, rerun `npm run typecheck`, commit and push it to the branch.
3. **Merge.** In the main folder: `gh pr merge <M> --squash --delete-branch`, then `git pull --ff-only` on main. In a worktree, drop `--delete-branch` (gh would check out main, which the main folder already has) and delete the remote branch with `git push origin --delete <branch>` unless the repository already deletes merged branches.
4. **Main CI.** `gh run list --branch main --limit 1` (its commit must be the squashed one), `gh run watch <id> --exit-status`, conclusion exactly `success` On main a push runs the whole CI, e2e tests included (#332). A pull request can only be merged once the « Lint, types et tests unitaires » check is green (ruleset « Protect main »). Check that the issue is closed with `gh issue view N --json state`.
5. **Memory.** Add the issue, its PR and the squashed commit to the sport-map project memory, with anything Clem still has to do by hand (dashboard settings, field tests).
6. **Wrap up in French.** Give the PR, the CI result and the remaining open issues. Suggest starting a new session (or `/clear`) before the next issue: everything needed is in `CLAUDE.md`, `.claude/rules/`, the issues and memory.
7. **Notify.** `PushNotification`: "PR #M mergée, CI verte" (or "CI en échec : <job>" when it failed).

`/security-review` and `/code-review ultra` (launched by Clem, billed) stay occasional, for large changes.

Push notifications only reach the phone when the session has Remote Control on, the "Notifications de code" account setting and "Push when Claude decides" in `/config` are enabled, and Clem isn't active in the session window (the tool then skips it). Keep messages to the PR and issue numbers and the title, one line.
