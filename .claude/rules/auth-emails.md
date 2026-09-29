---
paths:
  - "app/pages/login.vue"
  - "app/pages/register.vue"
  - "app/pages/confirm.vue"
  - "app/pages/forgot-password.vue"
  - "app/pages/reset-password.vue"
  - "app/components/NewPasswordForm.vue"
  - "supabase/templates/**"
  - "supabase/config.toml"
  - "test/e2e/mail.ts"
---

# Auth emails

Password reset: the recovery email (`supabase/templates/recovery.html`, set in `config.toml` locally and by hand in the hosted project's email templates) links to `/reset-password?token_hash=…&type=recovery`, verified with `verifyOtp`, so the link works in any browser (the default PKCE link only works where it was asked for). `NewPasswordForm` sets the password, there and in the profile. Locally, emails land in Mailpit (`npm run db:start` starts it); e2e tests read them through its API (`test/e2e/mail.ts`).
