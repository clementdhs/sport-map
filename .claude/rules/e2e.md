---
paths:
  - "test/e2e/**"
  - "playwright.config.ts"
---

# End-to-end tests (Playwright)

- One spec per feature in `test/e2e/specs/` (`editor`, `search`, `live`…); `*.en.spec.ts` replay the main flows in the `en` project (browser in `en-GB`), the others run in the `fr` project. A feature runs alone with `npx playwright test test/e2e/specs/<feature>.spec.ts` (after `npm run build`, with `E2E_SKIP_BUILD=1`).
- 2 workers locally, 1 on CI (`playwright.config.ts`: its 2-core runners got slower and timed out with more, #81): spec files run in parallel, the tests of a file in order (`fullyParallel: false`). Locally the suite takes 1.6 min instead of 2.7. Keep tests that depend on each other (e.g. the marked routes' elevation cache in `discover.spec.ts`) in the same file.
- Users: the global setup creates, for each worker (`parallelIndex`), a test account (`users.account`, which owns `ACCOUNT_ROUTE_NAME`, id `accountRouteId`) and a team member (`users.family`), from `workerUsers()`. Shared by all workers: `SEED_OWNER` and its two seeded routes (`E2E_ROUTE_ID`, `E2E_LOOP_ID`), the neighbors, `RESET_USER`. Every test user has an address ending in `@sport-map.test`: the global setup deletes them all first.
- Who a page is signed in as: `test.use({ role: 'account' | 'family' })` per file or `describe`; no session by default. Each worker signs both users in through `/login` before its first test (`authFiles`, files in `test/e2e/.auth`, kept for the other project), without the language cookie. API calls as another user or signed out: `requestAs('family' | 'account' | null)`, disposed after the test.
- Routes visible to the team that tests create go to New Zealand (`FAR_AWAY`, `moveEditorFarAway` in the editor), with names that don't contain the search tests' words (lac, traversée, crêtes, bout, tests): `search.spec.ts` counts every route visible to the team in France while other files run. Private routes can go anywhere.
- The home search starts on "Mes parcours", and the team member owns none of the seeded routes: home tests looking for them set `test.use({ searchScope: 'all' })` (fixture option, written to localStorage before the first pick only, so a reload keeps the test's own pick; the page then saves it to the account like a value kept before #145). Private routes a team member creates in France must be deleted by their test, or they join the counts under "Tous".
- Preferences follow the account (`preferences.md`): the auto fixture `freshPreferences` empties the worker users' preferences before each test, so a basemap, 3D view or filter never leaks into the next test. `newDevice(role)` opens another device of a user.
- Home results are counted in `getByTestId('route-results')`, not `aside li a`: the "… est en sortie" banner also holds links.
- Every member sees every position share: tests that share a position all live in `live.spec.ts`, so two never run at the same time.
