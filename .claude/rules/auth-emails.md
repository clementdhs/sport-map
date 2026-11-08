---
paths:
  - "app/pages/login.vue"
  - "app/components/AuthScreen.vue"
  - "app/components/AuthCard.vue"
  - "app/pages/register.vue"
  - "app/pages/confirm.vue"
  - "app/pages/forgot-password.vue"
  - "app/pages/reset-password.vue"
  - "app/components/NewPasswordForm.vue"
  - "app/plugins/account-locale.client.ts"
  - "supabase/templates/**"
  - "supabase/config.toml"
  - "test/e2e/mail.ts"
---

# Auth emails

Password reset: the recovery email (`supabase/templates/recovery.html`, set in `config.toml` locally and by hand in the hosted project's email templates) links to `/reset-password?token_hash=…&type=recovery`, verified with `verifyOtp`, so the link works in any browser (the default PKCE link only works where it was asked for). `NewPasswordForm` sets the password, there and in the profile. Locally, emails land in Mailpit (`npm run db:start` starts it); e2e tests read them through its API (`test/e2e/mail.ts`).

Look (#237): a table layout with inline styles only (mail clients drop `<style>`), in the topo colours: cream paper, surface card with a sand border, the wordmark and title in Barlow Condensed (with fallbacks), a forest green button (the default accent: mails can't follow a device's choice) and a dotted rust rule over the closing note.

Language: the recovery email (body and subject) is written in the account's language, `user_metadata.locale` (read as `.Data.locale`; French when missing). It is set at sign-up and kept in sync by `app/plugins/account-locale.client.ts` (picking a language saves it; signing in switches to it). Any change to the template or the subject in `config.toml` must be pasted by hand in the hosted project (subject included), and needs `npx supabase stop` / `start` locally.
