---
paths:
  - "app/middleware/auth.global.ts"
  - "server/middleware/family-only.ts"
  - "app/pages/login.vue"
  - "public/robots.txt"
  - "test/e2e/anonymous.spec.ts"
  - "test/e2e/family*.spec.ts"
---

# Family-only access

- The app is for the family: sign-ups are closed (`enable_signup = false` in `config.toml`, "Allow new users to sign up" off in the hosted dashboard) and accounts are created by hand in the dashboard, already confirmed. Their username starts as `user_…` (`handle_new_user`) until they change it in the settings.
- Pages: `auth.global.ts` sends anyone without a session to `/login?redirect=…`, except the sign-in pages listed in it. On the client it lets pages through when `navigator.onLine` is false, so a route prepared offline (follow mode) still opens when the session can't be refreshed.
- API: `server/middleware/family-only.ts` answers 401 to every `/api/` request without a session, reads included. New open endpoints go in its `OPEN_API` list. Policies only grant reads `to authenticated` ("public" means "visible to the family"); the anon role gets nothing.
- Link previews: chat app bots have no session, so a shared route link lands on `/login`, which sets `og:image` to `/api/routes/:id/og.png` (open endpoint, service role, routes visible to the family only). `robots.txt` forbids everything but those two; pages say `noindex`.
- e2e: `anonymous.spec.ts` covers the redirects and 401s; the visitor flows run as another member (`FAMILY_USER`, `family*.spec.ts`), who doesn't own the seeded routes. Requests as that member or without a session from a signed-in test: `familyRequest` / `signedOutRequest` (`fixtures.ts`).
