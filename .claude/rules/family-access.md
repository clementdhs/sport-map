---
paths:
  - "app/middleware/auth.global.ts"
  - "server/middleware/family-only.ts"
  - "app/pages/login.vue"
  - "app/pages/settings.vue"
  - "app/components/AccountMenu.vue"
  - "app/composables/useMyUsername.ts"
  - "server/api/auth/**"
  - "server/utils/loginAttempts.ts"
  - "public/robots.txt"
  - "test/e2e/specs/visitors.spec.ts"
  - "test/e2e/specs/login.spec.ts"
---

# Family-only access

- The app is for the family: sign-ups are closed (`enable_signup = false` in `config.toml`, "Allow new users to sign up" off in the hosted dashboard) and accounts are created by hand in the dashboard, already confirmed. Their username starts as `user_…` (`handle_new_user`): give each member a real one (`clem`, `lea`) right away, in the settings or the `profiles` table, since it is also their sign-in name.
- Sign-in (`/login`): one field takes a username or an e-mail (`isEmailLogin`: an `@` means an e-mail). E-mails go straight to Supabase from the page. Usernames go to `POST /api/auth/login` (open endpoint), which finds the e-mail with `login_email` (service role only, never sent to the browser), signs in with a client of its own and returns only the tokens, which the page hands to `supabase.auth.setSession`. Unknown username and wrong password answer the same 401. Usernames are case-insensitive (unique index on `lower(username)`).
- Every username sign-in reaches Supabase from Vercel's IPs, so `consumeLoginAttempt` (`server/utils/loginAttempts.ts`, table `login_attempts`) limits attempts per typed username (5) and per caller IP (30, from `x-forwarded-for`, which Vercel sets) over 10 minutes; a success clears the username's count. Someone who knows a username can lock its username sign-in for 10 minutes: accepted, the e-mail still works.
- The account menu shows the username, not the e-mail (#87). It isn't in the session (dashboard accounts have no `user_metadata.username`, and it changes in the settings): `useMyUsername` fetches it once per member (SSR included) and keeps it across pages; the settings page refreshes it after a change. Until then, or offline, the menu shows the e-mail. The e2e global setup empties the table, since every test signs in from the same IP.
- Pages: `auth.global.ts` sends anyone without a session to `/login?redirect=…`, except the sign-in pages listed in it. On the client it lets pages through when `navigator.onLine` is false, so a route prepared offline (follow mode) still opens when the session can't be refreshed.
- API: `server/middleware/family-only.ts` answers 401 to every `/api/` request without a session, reads included. New open endpoints go in its `OPEN_API` list. Policies only grant reads `to authenticated` ("public" means "visible to the family"); the anon role gets nothing.
- Link previews: chat app bots have no session, so a shared route link lands on `/login`, which sets `og:image` to `/api/routes/:id/og.png` (open endpoint, service role, routes visible to the family only). `robots.txt` forbids everything but those two; pages say `noindex`.
- Sign-in page look (#110): the background is the relief and contour lines of the Écrins, drawn once by `scripts/login-background.py` from IGN RGE ALTI (Licence Ouverte 2.0: the credit under the form names the source and the data's revision date) into `public/img/login-relief.webp` (luminance mask) and `login-contours.svg` (line art, far lighter as SVG than WebP), tinted with the accent through CSS masks, only where `mask-mode: luminance` is supported. Kept out of the service worker precache (`globIgnores`). Never name a `public/` folder like a page: the static server answers `/login` with a 301 to `/login/`, which the auth middleware then loops on. The hero's `h1` (logo, name, tagline) is bigger than the usual page title on purpose.
- e2e: `specs/visitors.spec.ts` covers the redirects and 401s; the visitor flows run as another member (`test.use({ role: 'family' })`), who doesn't own the seeded routes. Requests as that member or without a session from a test signed in as the test account: `requestAs('family')` / `requestAs(null)` (`fixtures.ts`, `.claude/rules/e2e.md`).
